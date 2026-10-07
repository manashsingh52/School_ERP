import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import type { z } from 'zod';
import {
  createStudentSchema,
  listStudentsQuerySchema,
  updateStudentSchema,
  uuidSchema,
} from '@schoolos/contracts';
import { RequirePermission } from '../../core/auth/decorators.js';
import { Idempotent } from '../../core/idempotency/idempotency.js';
import { ZodPipe } from '../../core/validation/zod.pipe.js';
import { StudentsService } from './students.service.js';

const idPipe = new ZodPipe(uuidSchema);

@Controller('students')
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @Get()
  @RequirePermission('student.view')
  list(@Query(new ZodPipe(listStudentsQuerySchema)) query: z.output<typeof listStudentsQuerySchema>) {
    return this.students.list(query);
  }

  @Get(':id')
  @RequirePermission('student.view')
  async get(@Param('id', idPipe) id: string) {
    return { data: await this.students.get(id) };
  }

  @Post()
  @RequirePermission('student.create')
  @Idempotent({ required: false })
  async create(@Body(new ZodPipe(createStudentSchema)) body: z.output<typeof createStudentSchema>) {
    return { data: await this.students.create(body) };
  }

  @Patch(':id')
  @RequirePermission('student.edit')
  async update(
    @Param('id', idPipe) id: string,
    @Body(new ZodPipe(updateStudentSchema)) body: z.output<typeof updateStudentSchema>,
  ) {
    return { data: await this.students.update(id, body) };
  }
}
