import { Injectable } from '@nestjs/common';
import { ROLE_TEMPLATES, SYSTEM_ROLE_KEYS, type SystemRoleKey } from '@schoolos/permissions';
import { PasswordService } from '../../core/auth/password.service.js';
import { AppError } from '../../core/errors/app-error.js';
import { PlatformPrismaService } from '../../core/prisma/prisma.service.js';
import type { MembershipStatus } from '../../generated/prisma/client.js';

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;

/** Subdomains that can never be a school (docs/03 §5). */
export const RESERVED_SLUGS = new Set([
  'www', 'app', 'api', 'admin', 'status', 'docs', 'help', 'support', 'mail', 'static',
  'cdn', 'assets', 'staging', 'dev', 'test', 'schoolos', 'login', 'auth', 'billing',
]);

export interface CreateSchoolInput {
  slug: string;
  name: string;
  code?: string;
  board?: string;
  accentColor?: string;
  status?: 'ONBOARDING' | 'ACTIVE';
}

export interface AddMemberInput {
  schoolId: string;
  name: string;
  phone?: string;
  email?: string;
  password?: string;
  roleKeys: SystemRoleKey[];
  status?: MembershipStatus;
}

/**
 * Platform-level school provisioning (super admin, seeds, tests). Uses the platform client
 * because a school doesn't exist yet when it's being created.
 */
@Injectable()
export class SchoolsService {
  constructor(
    private readonly platform: PlatformPrismaService,
    private readonly passwords: PasswordService,
  ) {}

  async createSchool(input: CreateSchoolInput) {
    const slug = input.slug.trim().toLowerCase();
    if (!SLUG_PATTERN.test(slug) || RESERVED_SLUGS.has(slug)) {
      throw new AppError('INVALID_SLUG', 422, 'Choose a different web address for this school.', [
        { field: 'slug', message: 'Not available' },
      ]);
    }

    return this.platform.$transaction(async (tx) => {
      const school = await tx.school.create({
        data: {
          slug,
          code: (input.code ?? slug).toUpperCase(),
          name: input.name,
          board: input.board,
          accentColor: input.accentColor ?? '#2F6FEB',
          status: input.status ?? 'ONBOARDING',
        },
      });
      await tx.schoolSettings.create({ data: { schoolId: school.id } });

      // System roles are copied from the templates so each school can tune its own (docs/04 §1).
      for (const key of SYSTEM_ROLE_KEYS) {
        const template = ROLE_TEMPLATES[key];
        const role = await tx.role.create({
          data: {
            schoolId: school.id,
            key,
            name: template.name,
            description: template.description,
            isSystem: true,
          },
        });
        await tx.rolePermission.createMany({
          data: template.grants.map(([permission, scope]) => ({
            roleId: role.id,
            schoolId: school.id,
            permission,
            scope,
          })),
        });
      }
      return school;
    });
  }

  /** Creates (or reuses, matched by phone/email) a global user and gives them roles in a school. */
  async addMember(input: AddMemberInput) {
    if (!input.phone && !input.email) throw new Error('addMember needs a phone or email');
    const passwordHash = input.password ? await this.passwords.hash(input.password) : undefined;

    return this.platform.$transaction(async (tx) => {
      const existing = await tx.user.findFirst({
        where: { OR: [input.phone ? { phone: input.phone } : {}, input.email ? { email: input.email } : {}].filter(
          (c) => Object.keys(c).length,
        ) },
      });
      const user =
        existing ??
        (await tx.user.create({
          data: {
            name: input.name,
            phone: input.phone,
            email: input.email,
            passwordHash,
            status: passwordHash ? 'ACTIVE' : 'INVITED',
          },
        }));

      const status = input.status ?? 'ACTIVE';
      const membership = await tx.membership.upsert({
        where: { schoolId_userId: { schoolId: input.schoolId, userId: user.id } },
        create: {
          schoolId: input.schoolId,
          userId: user.id,
          status,
          invitedAt: new Date(),
          joinedAt: status === 'ACTIVE' ? new Date() : null,
        },
        update: {},
      });

      const roles = await tx.role.findMany({
        where: { schoolId: input.schoolId, key: { in: input.roleKeys } },
        select: { id: true },
      });
      await tx.membershipRole.createMany({
        data: roles.map((r) => ({ membershipId: membership.id, roleId: r.id, schoolId: input.schoolId })),
        skipDuplicates: true,
      });
      return { user, membership };
    });
  }
}
