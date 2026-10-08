import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import type { z } from 'zod';
import {
  computeResultsSchema,
  createExamSchema,
  gradingPresetSchema,
  gradingScaleSchema,
  listExamsQuerySchema,
  marksSheetQuerySchema,
  saveMarksSchema,
  resultsQuerySchema,
  setExamSubjectsSchema,
  updateExamSchema,
  updateResultSchema,
  uuidSchema,
} from '@schoolos/contracts';
import { RequirePermission } from '../../core/auth/decorators.js';
import { ZodPipe } from '../../core/validation/zod.pipe.js';
import { ExamsService } from './exams.service.js';
import { MarksService } from './marks.service.js';
import { ResultsService } from './results.service.js';

const id = new ZodPipe(uuidSchema);
type Out<T extends z.ZodType> = z.output<T>;

@Controller('grading-scales')
export class GradingScalesController {
  constructor(private readonly exams: ExamsService) {}

  @Get()
  @RequirePermission('exam.view')
  async list() {
    return { data: await this.exams.listScales() };
  }

  @Post()
  @RequirePermission('exam.manage')
  async create(@Body(new ZodPipe(gradingScaleSchema)) body: Out<typeof gradingScaleSchema>) {
    return { data: await this.exams.createScale(body) };
  }

  @Post('presets')
  @RequirePermission('exam.manage')
  async preset(@Body(new ZodPipe(gradingPresetSchema)) body: Out<typeof gradingPresetSchema>) {
    return { data: await this.exams.createPreset(body.preset) };
  }

  @Put(':id')
  @RequirePermission('exam.manage')
  async update(@Param('id', id) scaleId: string, @Body(new ZodPipe(gradingScaleSchema)) body: Out<typeof gradingScaleSchema>) {
    return { data: await this.exams.updateScale(scaleId, body) };
  }

  @Delete(':id')
  @HttpCode(200)
  @RequirePermission('exam.manage')
  async remove(@Param('id', id) scaleId: string) {
    await this.exams.deleteScale(scaleId);
    return { data: { ok: true } };
  }
}

@Controller('exams')
export class ExamsController {
  constructor(
    private readonly exams: ExamsService,
    private readonly marks: MarksService,
    private readonly results: ResultsService,
  ) {}

  @Get()
  @RequirePermission('exam.view')
  async list(@Query(new ZodPipe(listExamsQuerySchema)) query: Out<typeof listExamsQuerySchema>) {
    return { data: await this.exams.list(query) };
  }

  @Post()
  @RequirePermission('exam.manage')
  async create(@Body(new ZodPipe(createExamSchema)) body: Out<typeof createExamSchema>) {
    return { data: await this.exams.create(body) };
  }

  @Get('marks')
  @RequirePermission('exam.view')
  async sheet(@Query(new ZodPipe(marksSheetQuerySchema)) query: Out<typeof marksSheetQuerySchema>) {
    return { data: await this.marks.sheet(query.examSubjectId, query.sectionId) };
  }

  @Put('marks')
  @RequirePermission('marks.enter')
  async saveMarks(@Body(new ZodPipe(saveMarksSchema)) body: Out<typeof saveMarksSchema>) {
    return { data: await this.marks.save(body) };
  }

  @Get(':id')
  @RequirePermission('exam.view')
  async get(@Param('id', id) examId: string, @Query(new ZodPipe(listExamsQuerySchema.pick({ studentId: true }))) query: { studentId?: string }) {
    return { data: await this.exams.get(examId, query.studentId) };
  }

  @Patch(':id')
  @RequirePermission('exam.manage')
  async update(@Param('id', id) examId: string, @Body(new ZodPipe(updateExamSchema)) body: Out<typeof updateExamSchema>) {
    return { data: await this.exams.update(examId, body) };
  }

  @Delete(':id')
  @HttpCode(200)
  @RequirePermission('exam.manage')
  async remove(@Param('id', id) examId: string) {
    await this.exams.remove(examId);
    return { data: { ok: true } };
  }

  @Put(':id/subjects')
  @RequirePermission('exam.manage')
  async setSubjects(@Param('id', id) examId: string, @Body(new ZodPipe(setExamSubjectsSchema)) body: Out<typeof setExamSubjectsSchema>) {
    return { data: await this.exams.setSubjects(examId, body) };
  }

  @Get(':id/progress')
  @RequirePermission('exam.view')
  async progress(@Param('id', id) examId: string) {
    return { data: await this.marks.progress(examId) };
  }

  @Post(':id/subjects/:examSubjectId/lock')
  @HttpCode(200)
  @RequirePermission('marks.enter')
  async lock(@Param('id', id) examId: string, @Param('examSubjectId', id) examSubjectId: string) {
    await this.marks.lock(examId, examSubjectId, true);
    return { data: { ok: true } };
  }

  @Post(':id/subjects/:examSubjectId/unlock')
  @HttpCode(200)
  @RequirePermission('marks.edit_locked')
  async unlock(@Param('id', id) examId: string, @Param('examSubjectId', id) examSubjectId: string) {
    await this.marks.lock(examId, examSubjectId, false);
    return { data: { ok: true } };
  }

  @Post(':id/results/compute')
  @HttpCode(200)
  @RequirePermission('results.publish')
  async compute(@Param('id', id) examId: string, @Body(new ZodPipe(computeResultsSchema)) body: Out<typeof computeResultsSchema>) {
    return { data: await this.results.compute(examId, body.force) };
  }

  @Get(':id/results')
  @RequirePermission('results.view')
  listResults(@Param('id', id) examId: string, @Query(new ZodPipe(resultsQuerySchema)) query: Out<typeof resultsQuerySchema>) {
    return this.results.list(examId, query.sectionId);
  }

  @Patch(':id/results/:studentId')
  @RequirePermission('results.view')
  async updateResult(@Param('id', id) examId: string, @Param('studentId', id) studentId: string, @Body(new ZodPipe(updateResultSchema)) body: Out<typeof updateResultSchema>) {
    return { data: await this.results.update(examId, studentId, body) };
  }

  @Post(':id/results/publish')
  @HttpCode(200)
  @RequirePermission('results.publish')
  async publish(@Param('id', id) examId: string) {
    return { data: await this.results.publish(examId) };
  }

  @Post(':id/results/unpublish')
  @HttpCode(200)
  @RequirePermission('results.publish')
  async unpublish(@Param('id', id) examId: string) {
    return { data: await this.results.unpublish(examId) };
  }
}

@Controller('students')
export class StudentResultsController {
  constructor(private readonly results: ResultsService) {}

  @Get(':id/results')
  @RequirePermission('results.view')
  async list(@Param('id', id) studentId: string) {
    return { data: await this.results.forStudent(studentId) };
  }
}
