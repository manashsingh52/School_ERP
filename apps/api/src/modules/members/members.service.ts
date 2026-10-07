import { Injectable } from '@nestjs/common';
import type { z } from 'zod';
import {
  isPermission,
  PERMISSIONS,
  SCOPE_RANK,
  type Permission,
  type PermissionScope,
} from '@schoolos/permissions';
import type {
  MemberItem,
  PageResponse,
  RoleItem,
  createRoleSchema,
  inviteMemberSchema,
  listMembersQuerySchema,
  setRolePermissionsSchema,
  updateMemberSchema,
  updateRoleSchema,
} from '@schoolos/contracts';
import { AccessService } from '../../core/auth/access.service.js';
import { AuditService } from '../../core/audit/audit.service.js';
import { AppError } from '../../core/errors/app-error.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { IdentityService } from '../schools/identity.service.js';

type In<T extends z.ZodType> = z.output<T>;

/** Permissions whose broadening to ALL needs explicit confirmation (docs/04 §5). */
const SENSITIVE_BROADEN: Permission[] = ['student.view', 'student.contact.view', 'guardian.view'];
const MANAGES_ROLES: Prisma.MembershipWhereInput = {
  status: 'ACTIVE',
  roles: { some: { role: { permissions: { some: { permission: 'role.manage' } } } } },
};
const LOCKOUT = () =>
  new AppError('LAST_ADMIN', 422, 'At least one active person must be able to manage roles. Give someone else that access first.');

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityService,
    private readonly access: AccessService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------- members

  async list(query: In<typeof listMembersQuerySchema>): Promise<PageResponse<MemberItem>> {
    const filters: Prisma.MembershipWhereInput[] = [{ status: query.status ?? { not: 'REMOVED' } }];
    if (query.roleId) filters.push({ roles: { some: { roleId: query.roleId } } });
    for (const word of (query.q ?? '').split(/\s+/).filter(Boolean).slice(0, 5)) {
      filters.push({
        user: {
          OR: [
            { name: { contains: word, mode: 'insensitive' } },
            { email: { contains: word, mode: 'insensitive' } },
            { phone: { contains: word.replace(/\D/g, '') || word } },
          ],
        },
      });
    }
    const where = { AND: filters };
    const [rows, total] = await Promise.all([
      this.prisma.db.membership.findMany({
        where,
        orderBy: { user: { name: 'asc' } },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { user: true, roles: { include: { role: true } } },
      }),
      this.prisma.db.membership.count({ where }),
    ]);
    return { data: rows.map(toMember), page: { page: query.page, pageSize: query.pageSize, total } };
  }

  async invite(input: In<typeof inviteMemberSchema>): Promise<MemberItem> {
    const { membershipId } = await this.identity.invite({ name: input.name, phone: input.phone, email: input.email, roleIds: input.roleIds });
    await this.prisma.tenantTx((tx) =>
      this.audit.record(tx, { action: 'member.invite', entityType: 'Membership', entityId: membershipId, after: { roleIds: input.roleIds } }),
    );
    return this.get(membershipId);
  }

  async get(id: string): Promise<MemberItem> {
    const m = await this.prisma.db.membership.findUnique({ where: { id }, include: { user: true, roles: { include: { role: true } } } });
    if (!m) throw AppError.notFound('member');
    return toMember(m);
  }

  async update(id: string, input: In<typeof updateMemberSchema>): Promise<MemberItem> {
    const before = await this.get(id);
    const wasManager = (await this.prisma.db.membership.count({ where: { id, ...MANAGES_ROLES } })) > 0;
    if (wasManager) {
      let stillManager = input.status !== 'SUSPENDED';
      if (stillManager && input.roleIds) {
        stillManager = (await this.prisma.db.role.count({ where: { id: { in: input.roleIds }, permissions: { some: { permission: 'role.manage' } } } })) > 0;
      }
      if (!stillManager && (await this.prisma.db.membership.count({ where: MANAGES_ROLES })) <= 1) throw LOCKOUT();
    }
    if (input.roleIds) await this.identity.setRoles(id, input.roleIds);
    if (input.status) await this.identity.setStatus(id, input.status);
    const after = await this.get(id);
    await this.prisma.tenantTx((tx) =>
      this.audit.record(tx, {
        action: 'member.update',
        entityType: 'Membership',
        entityId: id,
        before: { roles: before.roles.map((r) => r.key), status: before.status },
        after: { roles: after.roles.map((r) => r.key), status: after.status },
      }),
    );
    return after;
  }

  // ---------------------------------------------------------------- roles

  async listRoles(): Promise<RoleItem[]> {
    const roles = await this.prisma.db.role.findMany({
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
      include: { permissions: true, _count: { select: { members: { where: { membership: { status: { not: 'REMOVED' } } } } } } },
    });
    return roles.map(toRole);
  }

  async createRole(input: In<typeof createRoleSchema>): Promise<RoleItem> {
    const key = `custom_${input.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40)}`;
    if (await this.prisma.db.role.findFirst({ where: { OR: [{ key }, { name: { equals: input.name, mode: 'insensitive' } }] } })) {
      throw new AppError('CONFLICT', 409, 'A role with this name already exists.', [{ field: 'name', message: 'Already exists' }]);
    }
    const source = input.copyFromRoleId
      ? await this.prisma.db.role.findUnique({ where: { id: input.copyFromRoleId }, include: { permissions: true } })
      : null;
    if (input.copyFromRoleId && !source) throw AppError.invalidReference('copyFromRoleId', 'role');

    const id = await this.prisma.tenantTx(async (tx) => {
      const role = await tx.role.create({ data: { key, name: input.name, description: input.description } as Prisma.RoleUncheckedCreateInput });
      if (source?.permissions.length) {
        await tx.rolePermission.createMany({
          data: source.permissions.map((p) => ({ roleId: role.id, permission: p.permission, scope: p.scope })) as Prisma.RolePermissionCreateManyInput[],
        });
      }
      await this.audit.record(tx, { action: 'role.create', entityType: 'Role', entityId: role.id, after: { name: input.name, copiedFrom: source?.key ?? null } });
      return role.id;
    });
    return (await this.listRoles()).find((r) => r.id === id)!;
  }

  async updateRole(id: string, input: In<typeof updateRoleSchema>): Promise<RoleItem> {
    const role = await this.prisma.db.role.findUnique({ where: { id } });
    if (!role) throw AppError.notFound('role');
    await this.prisma.tenantTx(async (tx) => {
      await tx.role.update({ where: { id }, data: input });
      await this.audit.record(tx, { action: 'role.update', entityType: 'Role', entityId: id, before: { name: role.name }, after: input });
    });
    return (await this.listRoles()).find((r) => r.id === id)!;
  }

  async setPermissions(id: string, input: In<typeof setRolePermissionsSchema>): Promise<RoleItem> {
    const role = await this.prisma.db.role.findUnique({ where: { id }, include: { permissions: true } });
    if (!role) throw AppError.notFound('role');

    const next = new Map<Permission, PermissionScope>();
    for (const { permission, scope } of input.permissions) {
      if (!isPermission(permission)) throw new AppError('VALIDATION_FAILED', 422, `Unknown permission ${permission}.`, [{ field: 'permissions', message: permission }]);
      const allowed = PERMISSIONS[permission].scopes as readonly PermissionScope[];
      if (allowed.length ? !allowed.includes(scope) : scope !== 'ALL') {
        throw new AppError('VALIDATION_FAILED', 422, `${PERMISSIONS[permission].label} can't be limited to ${scope}.`, [{ field: 'permissions', message: permission }]);
      }
      next.set(permission, scope);
    }

    const current = new Map(role.permissions.map((p) => [p.permission, p.scope]));
    const broadened = SENSITIVE_BROADEN.filter((p) => {
      const now = current.get(p);
      return next.get(p) === 'ALL' && (!now || SCOPE_RANK[now] < SCOPE_RANK.ALL);
    });
    if (broadened.length && !input.confirmBroaden) {
      throw new AppError('CONFIRM_REQUIRED', 422, `This lets everyone with the ${role.name} role see every student's records. Confirm to continue.`, broadened.map((p) => ({ field: 'permissions', message: p })));
    }

    if (current.has('role.manage') && !next.has('role.manage')) {
      const managersElsewhere = await this.prisma.db.membership.count({
        where: { ...MANAGES_ROLES, roles: { some: { roleId: { not: id }, role: { permissions: { some: { permission: 'role.manage' } } } } } },
      });
      if (managersElsewhere === 0) throw LOCKOUT();
    }

    await this.prisma.tenantTx(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      await tx.rolePermission.createMany({
        data: [...next].map(([permission, scope]) => ({ roleId: id, permission, scope })) as Prisma.RolePermissionCreateManyInput[],
      });
      await tx.role.update({ where: { id }, data: { version: { increment: 1 } } });
      await this.audit.record(tx, {
        action: 'role.permissions.update',
        entityType: 'Role',
        entityId: id,
        before: Object.fromEntries(current),
        after: Object.fromEntries(next),
      });
    });
    this.access.clearAll(); // every member with this role gets the new permissions immediately
    return (await this.listRoles()).find((r) => r.id === id)!;
  }

  async deleteRole(id: string): Promise<void> {
    const role = await this.prisma.db.role.findUnique({ where: { id }, include: { _count: { select: { members: true } } } });
    if (!role) throw AppError.notFound('role');
    if (role.isSystem) throw new AppError('SYSTEM_ROLE', 422, 'Built-in roles can be edited but not deleted.');
    if (role._count.members) throw new AppError('IN_USE', 409, 'Move everyone out of this role before deleting it.');
    await this.prisma.tenantTx(async (tx) => {
      await tx.role.delete({ where: { id } });
      await this.audit.record(tx, { action: 'role.delete', entityType: 'Role', entityId: id, before: { name: role.name } });
    });
  }
}

function toMember(
  m: Prisma.MembershipGetPayload<{ include: { user: true; roles: { include: { role: true } } } }>,
): MemberItem {
  return {
    id: m.id,
    userId: m.userId,
    name: m.user.name,
    phone: m.user.phone,
    email: m.user.email,
    status: m.status,
    roles: m.roles.map((r) => ({ id: r.role.id, key: r.role.key, name: r.role.name })),
    lastActiveAt: m.lastActiveAt?.toISOString() ?? null,
    joinedAt: m.joinedAt?.toISOString() ?? null,
  };
}

function toRole(
  r: Prisma.RoleGetPayload<{ include: { permissions: true; _count: { select: { members: true } } } }>,
): RoleItem {
  return {
    id: r.id,
    key: r.key,
    name: r.name,
    description: r.description,
    isSystem: r.isSystem,
    memberCount: r._count.members,
    permissions: r.permissions
      .filter((p) => isPermission(p.permission))
      .map((p) => ({ permission: p.permission as Permission, scope: p.scope })),
  };
}
