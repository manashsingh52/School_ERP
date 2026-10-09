import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import type { z } from 'zod';
import { examTermSchema, termResultsQuerySchema, uuidSchema } from '@schoolos/contracts';
import { RequirePermission } from '../../core/auth/decorators.js';
import { ZodPipe } from '../../core/validation/zod.pipe.js';
import { TermsService } from './terms.service.js';

const id = new ZodPipe(uuidSchema);
type Out<T extends z.ZodType> = z.output<T>;

@Controller('exam-terms')
export class TermsController {
  constructor(private readonly terms: TermsService) {}

  @Get()
  @RequirePermission('exam.view')
  async list() {
    return { data: await this.terms.list() };
  }

  @Post()
  @RequirePermission('exam.manage')
  async create(@Body(new ZodPipe(examTermSchema)) body: Out<typeof examTermSchema>) {
    return { data: await this.terms.create(body) };
  }

  @Put(':id')
  @RequirePermission('exam.manage')
  async update(@Param('id', id) termId: string, @Body(new ZodPipe(examTermSchema)) body: Out<typeof examTermSchema>) {
    return { data: await this.terms.update(termId, body) };
  }

  @Delete(':id')
  @HttpCode(200)
  @RequirePermission('exam.manage')
  async remove(@Param('id', id) termId: string) {
    await this.terms.remove(termId);
    return { data: { ok: true } };
  }

  @Get(':id/results')
  @RequirePermission('results.view')
  async results(@Param('id', id) termId: string, @Query(new ZodPipe(termResultsQuerySchema)) q: Out<typeof termResultsQuerySchema>) {
    return { data: await this.terms.resultsFor(termId, q.sectionId) };
  }

  @Post(':id/publish')
  @HttpCode(200)
  @RequirePermission('results.publish')
  async publish(@Param('id', id) termId: string) {
    return { data: await this.terms.publish(termId) };
  }

  @Post(':id/unpublish')
  @HttpCode(200)
  @RequirePermission('results.publish')
  async unpublish(@Param('id', id) termId: string) {
    return { data: await this.terms.unpublish(termId) };
  }

  @Get(':id/report-cards/:studentId')
  @RequirePermission('results.view')
  async reportCard(@Param('id', id) termId: string, @Param('studentId', id) studentId: string) {
    return { data: await this.terms.reportCardLink(termId, studentId) };
  }
}

@Controller('students')
export class StudentTermsController {
  constructor(private readonly terms: TermsService) {}

  @Get(':id/term-results')
  @RequirePermission('results.view')
  async forStudent(@Param('id', id) studentId: string) {
    return { data: await this.terms.forStudent(studentId) };
  }
}
