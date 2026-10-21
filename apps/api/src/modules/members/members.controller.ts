import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import type { z } from 'zod';
import {
  createRoleSchema,
  inviteMemberSchema,
  listMembersQuerySchema,
  setRolePermissionsSchema,
  updateMemberSchema,
  updateRoleSchema,
  uuidSchema,
} from '@schoolos/contracts';
import { PERMISSIONS } from '@schoolos/permissions';
import { RequirePermission } from '../../core/auth/decorators.js';
import { ZodPipe } from '../../core/validation/zod.pipe.js';
import { MembersService } from './members.service.js';

const id = new ZodPipe(uuidSchema);

@Controller('members')
export class MembersController {
  constructor(private readonly members: MembersService) {}

  @Get()
  @RequirePermission('user.view')
  list(@Query(new ZodPipe(listMembersQuerySchema)) query: z.output<typeof listMembersQuerySchema>) {
    return this.members.list(query);
  }

  @Post()
  @RequirePermission('user.manage')
  async invite(@Body(new ZodPipe(inviteMemberSchema)) body: z.output<typeof inviteMemberSchema>) {
    return { data: await this.members.invite(body) };
  }

  @Patch(':id')
  @RequirePermission('user.manage')
  async update(@Param('id', id) memberId: string, @Body(new ZodPipe(updateMemberSchema)) body: z.output<typeof updateMemberSchema>) {
    return { data: await this.members.update(memberId, body) };
  }

  @Post(':id/sign-in-code')
  @RequirePermission('user.manage')
  async signInCode(@Param('id', id) memberId: string) {
    return { data: await this.members.signInCode(memberId) };
  }
}

@Controller('roles')
export class RolesController {
  constructor(private readonly members: MembersService) {}

  @Get()
  @RequirePermission('user.view')
  async list() {
    return { data: await this.members.listRoles() };
  }

  @Post()
  @RequirePermission('role.manage')
  async create(@Body(new ZodPipe(createRoleSchema)) body: z.output<typeof createRoleSchema>) {
    return { data: await this.members.createRole(body) };
  }

  @Patch(':id')
  @RequirePermission('role.manage')
  async update(@Param('id', id) roleId: string, @Body(new ZodPipe(updateRoleSchema)) body: z.output<typeof updateRoleSchema>) {
    return { data: await this.members.updateRole(roleId, body) };
  }

  @Put(':id/permissions')
  @RequirePermission('role.manage')
  async setPermissions(
    @Param('id', id) roleId: string,
    @Body(new ZodPipe(setRolePermissionsSchema)) body: z.output<typeof setRolePermissionsSchema>,
  ) {
    return { data: await this.members.setPermissions(roleId, body) };
  }

  @Delete(':id')
  @HttpCode(200)
  @RequirePermission('role.manage')
  async remove(@Param('id', id) roleId: string) {
    await this.members.deleteRole(roleId);
    return { data: { ok: true } };
  }
}

/** The permission catalog, for the roles editor. */
@Controller('permissions')
export class PermissionsController {
  @Get()
  @RequirePermission('user.view')
  list() {
    return { data: Object.entries(PERMISSIONS).map(([key, def]) => ({ key, ...def })) };
  }
}
