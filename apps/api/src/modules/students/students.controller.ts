import { Body, Controller, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { z } from 'zod';
import {
  createStudentSchema,
  idCardsQuerySchema,
  listStudentsQuerySchema,
  updateStudentSchema,
  uuidSchema,
} from '@schoolos/contracts';
import { RequirePermission } from '../../core/auth/decorators.js';
import { Idempotent } from '../../core/idempotency/idempotency.js';
import { contentDisposition } from '../../core/storage/storage.js';
import { ZodPipe } from '../../core/validation/zod.pipe.js';
import { IdCardsService } from './id-cards.service.js';
import { StudentsService } from './students.service.js';

const idPipe = new ZodPipe(uuidSchema);

@Controller('students')
export class StudentsController {
  constructor(
    private readonly students: StudentsService,
    private readonly idCards: IdCardsService,
  ) {}

  @Get()
  @RequirePermission('student.view')
  list(@Query(new ZodPipe(listStudentsQuerySchema)) query: z.output<typeof listStudentsQuerySchema>) {
    return this.students.list(query);
  }

  // Before ':id', so "id-cards" isn't read as a student id.
  @Get('id-cards')
  @RequirePermission('student.edit')
  async idCardsPdf(@Query(new ZodPipe(idCardsQuerySchema)) query: z.output<typeof idCardsQuerySchema>, @Res() res: Response) {
    const { data, fileName } = await this.idCards.render(query);
    res.setHeader('content-type', 'application/pdf');
    res.setHeader('content-disposition', contentDisposition(fileName, true));
    res.send(data);
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
