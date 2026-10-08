import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import type { z } from 'zod';
import { changePasswordRequestSchema, type MeResponse, type SessionSummary } from '@schoolos/contracts';
import { Authenticated } from '../../core/auth/decorators.js';
import { RequestContextStore } from '../../core/context/request-context.js';
import { AppError } from '../../core/errors/app-error.js';
import { PlatformPrismaService } from '../../core/prisma/prisma.service.js';
import { ZodPipe } from '../../core/validation/zod.pipe.js';
import { AuthService } from '../auth/auth.service.js';
import { SessionService } from '../auth/session.service.js';

@Controller('me')
export class MeController {
  constructor(
    private readonly platform: PlatformPrismaService,
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

  @Get()
  @Authenticated()
  async me(): Promise<{ data: MeResponse }> {
    const ctx = RequestContextStore.get()!;
    const [user, memberships, platformAdmin] = await Promise.all([
      this.platform.user.findUniqueOrThrow({
        where: { id: ctx.userId },
        select: { id: true, name: true, phone: true, email: true },
      }),
      this.auth.memberships(ctx.userId!),
      this.platform.platformAdmin.findUnique({ where: { userId: ctx.userId } }),
    ]);
    const current = memberships.find((m) => m.membershipId === ctx.membershipId);
    const profile = current ? await this.profile(current.membershipId) : null;
    return {
      data: {
        user,
        membership: current && profile ? { ...current, permissions: ctx.permissions ?? {}, ...profile } : null,
        memberships,
        platformRole: platformAdmin?.role ?? null,
      },
    };
  }

  /** Teacher record and children of this membership (platform client: scoped by membership id). */
  private async profile(membershipId: string) {
    const [teacher, guardian] = await Promise.all([
      this.platform.teacher.findUnique({ where: { membershipId }, select: { id: true } }),
      this.platform.guardian.findUnique({
        where: { membershipId },
        select: {
          school: { select: { currentAcademicYearId: true } },
          children: {
            orderBy: { student: { firstName: 'asc' } },
            select: {
              student: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  status: true,
                  enrollments: { select: { academicYearId: true, section: { select: { id: true, name: true, class: { select: { name: true } } } } } },
                },
              },
            },
          },
        },
      }),
    ]);
    const yearId = guardian?.school.currentAcademicYearId;
    return {
      teacherId: teacher?.id ?? null,
      children: (guardian?.children ?? []).map(({ student: s }) => {
        const e = s.enrollments.find((x) => x.academicYearId === yearId);
        return {
          id: s.id,
          firstName: s.firstName,
          name: [s.firstName, s.lastName].filter(Boolean).join(' '),
          classLabel: e ? `${e.section.class.name.replace(/^Class\s+/i, '')}-${e.section.name}` : null,
          sectionId: e?.section.id ?? null,
        };
      }),
    };
  }

  @Get('sessions')
  @Authenticated()
  async listSessions(): Promise<{ data: SessionSummary[] }> {
    const ctx = RequestContextStore.get()!;
    const currentFamily = await this.familyOf(ctx.sessionId!);
    const rows = await this.sessions.listForUser(ctx.userId!);
    return {
      data: rows.map((s) => ({
        id: s.id,
        platform: s.platform,
        deviceName: s.deviceName,
        ip: s.ip,
        createdAt: s.createdAt.toISOString(),
        lastUsedAt: s.lastUsedAt.toISOString(),
        current: s.familyId === currentFamily,
      })),
    };
  }

  @Delete('sessions/:id')
  @HttpCode(200)
  @Authenticated()
  async revokeSession(@Param('id', new ParseUUIDPipe()) id: string) {
    const ctx = RequestContextStore.get()!;
    const session = await this.platform.session.findFirst({ where: { id, userId: ctx.userId } });
    if (!session) throw AppError.notFound('session');
    await this.sessions.revokeFamily(session.familyId, 'revoked_by_user');
    return { data: { ok: true } };
  }

  @Patch('password')
  @HttpCode(200)
  @Authenticated()
  async changePassword(@Body(new ZodPipe(changePasswordRequestSchema)) body: z.output<typeof changePasswordRequestSchema>) {
    const ctx = RequestContextStore.get()!;
    await this.auth.changePassword(ctx.userId!, (await this.familyOf(ctx.sessionId!))!, body.currentPassword, body.newPassword);
    return { data: { ok: true } };
  }

  private async familyOf(sessionId: string): Promise<string | undefined> {
    const row = await this.platform.session.findUnique({ where: { id: sessionId }, select: { familyId: true } });
    return row?.familyId;
  }
}
