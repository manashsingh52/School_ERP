import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import type { z } from 'zod';
import { createGuardianSchema, linkChildSchema, listGuardiansQuerySchema, updateGuardianSchema, uuidSchema } from '@schoolos/contracts';
import { RequirePermission } from '../../core/auth/decorators.js';
import { ZodPipe } from '../../core/validation/zod.pipe.js';
import { GuardiansService } from './guardians.service.js';

const id = new ZodPipe(uuidSchema);

@Controller('guardians')
export class GuardiansController {
  constructor(private readonly guardians: GuardiansService) {}

  @Get()
  @RequirePermission('guardian.view')
  list(@Query(new ZodPipe(listGuardiansQuerySchema)) query: z.output<typeof listGuardiansQuerySchema>) {
    return this.guardians.list(query);
  }

  @Get(':id')
  @RequirePermission('guardian.view')
  async get(@Param('id', id) guardianId: string) {
    return { data: await this.guardians.get(guardianId) };
  }

  @Post()
  @RequirePermission('guardian.manage')
  async create(@Body(new ZodPipe(createGuardianSchema)) body: z.output<typeof createGuardianSchema>) {
    return { data: await this.guardians.create(body) };
  }

  @Patch(':id')
  @RequirePermission('guardian.manage')
  async update(@Param('id', id) guardianId: string, @Body(new ZodPipe(updateGuardianSchema)) body: z.output<typeof updateGuardianSchema>) {
    return { data: await this.guardians.update(guardianId, body) };
  }

  @Post(':id/children')
  @HttpCode(200)
  @RequirePermission('guardian.manage')
  async link(@Param('id', id) guardianId: string, @Body(new ZodPipe(linkChildSchema)) body: z.output<typeof linkChildSchema>) {
    return { data: await this.guardians.linkChild(guardianId, body) };
  }

  @Delete(':id/children/:studentId')
  @HttpCode(200)
  @RequirePermission('guardian.manage')
  async unlink(@Param('id', id) guardianId: string, @Param('studentId', id) studentId: string) {
    return { data: await this.guardians.unlinkChild(guardianId, studentId) };
  }

  @Post(':id/invite')
  @HttpCode(200)
  @RequirePermission('guardian.manage')
  async invite(@Param('id', id) guardianId: string) {
    return { data: await this.guardians.inviteGuardian(guardianId) };
  }
}
