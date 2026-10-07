import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import type { z } from 'zod';
import { createTeacherSchema, listTeachersQuerySchema, updateTeacherSchema, uuidSchema } from '@schoolos/contracts';
import { RequirePermission } from '../../core/auth/decorators.js';
import { Idempotent } from '../../core/idempotency/idempotency.js';
import { ZodPipe } from '../../core/validation/zod.pipe.js';
import { TeachersService } from './teachers.service.js';

const id = new ZodPipe(uuidSchema);

@Controller('teachers')
export class TeachersController {
  constructor(private readonly teachers: TeachersService) {}

  @Get()
  @RequirePermission('teacher.view')
  list(@Query(new ZodPipe(listTeachersQuerySchema)) query: z.output<typeof listTeachersQuerySchema>) {
    return this.teachers.list(query);
  }

  @Get(':id')
  @RequirePermission('teacher.view')
  async get(@Param('id', id) teacherId: string) {
    return { data: await this.teachers.get(teacherId) };
  }

  @Post()
  @RequirePermission('teacher.manage')
  @Idempotent({ required: false })
  async create(@Body(new ZodPipe(createTeacherSchema)) body: z.output<typeof createTeacherSchema>) {
    return { data: await this.teachers.create(body) };
  }

  @Patch(':id')
  @RequirePermission('teacher.manage')
  async update(@Param('id', id) teacherId: string, @Body(new ZodPipe(updateTeacherSchema)) body: z.output<typeof updateTeacherSchema>) {
    return { data: await this.teachers.update(teacherId, body) };
  }

  @Post(':id/invite')
  @HttpCode(200)
  @RequirePermission('teacher.manage')
  async invite(@Param('id', id) teacherId: string) {
    return { data: await this.teachers.invite(teacherId) };
  }
}
