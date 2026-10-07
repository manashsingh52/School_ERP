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
    return {
      data: {
        user,
        membership: current ? { ...current, permissions: ctx.permissions ?? {} } : null,
        memberships,
        platformRole: platformAdmin?.role ?? null,
      },
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
