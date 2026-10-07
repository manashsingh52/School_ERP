import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import type { z } from 'zod';
import {
  bulkCreateClassesSchema,
  bulkCreateSectionsSchema,
  bulkCreateSubjectsSchema,
  createAcademicYearSchema,
  createAssignmentSchema,
  createClassSchema,
  createSectionSchema,
  createSubjectSchema,
  listAssignmentsQuerySchema,
  listSectionsQuerySchema,
  setClassSubjectsSchema,
  updateAcademicYearSchema,
  updateClassSchema,
  updateSectionSchema,
  updateSubjectSchema,
  uuidSchema,
} from '@schoolos/contracts';
import { RequirePermission } from '../../core/auth/decorators.js';
import { ZodPipe } from '../../core/validation/zod.pipe.js';
import { AcademicsService } from './academics.service.js';

const id = new ZodPipe(uuidSchema);
type Out<T extends z.ZodType> = z.output<T>;

@Controller('academic-years')
export class AcademicYearsController {
  constructor(private readonly academics: AcademicsService) {}

  @Get()
  @RequirePermission('academic.view')
  async list() {
    return { data: await this.academics.listYears() };
  }

  @Post()
  @RequirePermission('academic.manage')
  async create(@Body(new ZodPipe(createAcademicYearSchema)) body: Out<typeof createAcademicYearSchema>) {
    return { data: await this.academics.createYear(body) };
  }

  @Patch(':id')
  @RequirePermission('academic.manage')
  async update(@Param('id', id) yearId: string, @Body(new ZodPipe(updateAcademicYearSchema)) body: Out<typeof updateAcademicYearSchema>) {
    return { data: await this.academics.updateYear(yearId, body) };
  }

  @Post(':id/activate')
  @HttpCode(200)
  @RequirePermission('academic.manage')
  async activate(@Param('id', id) yearId: string) {
    return { data: await this.academics.activateYear(yearId) };
  }

  @Post(':id/close')
  @HttpCode(200)
  @RequirePermission('academic.manage')
  async close(@Param('id', id) yearId: string) {
    return { data: await this.academics.closeYear(yearId) };
  }
}

@Controller('classes')
export class ClassesController {
  constructor(private readonly academics: AcademicsService) {}

  @Get()
  @RequirePermission('academic.view')
  async list(@Query(new ZodPipe(listSectionsQuerySchema)) query: Out<typeof listSectionsQuerySchema>) {
    return { data: await this.academics.listClasses(query.academicYearId) };
  }

  @Post()
  @RequirePermission('academic.manage')
  async create(@Body(new ZodPipe(createClassSchema)) body: Out<typeof createClassSchema>) {
    return { data: await this.academics.createClass(body) };
  }

  @Post('bulk')
  @RequirePermission('academic.manage')
  async bulk(@Body(new ZodPipe(bulkCreateClassesSchema)) body: Out<typeof bulkCreateClassesSchema>) {
    return { data: await this.academics.bulkCreateClasses(body) };
  }

  @Patch(':id')
  @RequirePermission('academic.manage')
  async update(@Param('id', id) classId: string, @Body(new ZodPipe(updateClassSchema)) body: Out<typeof updateClassSchema>) {
    return { data: await this.academics.updateClass(classId, body) };
  }

  @Delete(':id')
  @HttpCode(200)
  @RequirePermission('academic.manage')
  async remove(@Param('id', id) classId: string) {
    await this.academics.deleteClass(classId);
    return { data: { ok: true } };
  }
}

@Controller('sections')
export class SectionsController {
  constructor(private readonly academics: AcademicsService) {}

  @Post()
  @RequirePermission('academic.manage')
  async create(@Body(new ZodPipe(createSectionSchema)) body: Out<typeof createSectionSchema>) {
    return { data: await this.academics.createSection(body) };
  }

  @Post('bulk')
  @RequirePermission('academic.manage')
  async bulk(@Body(new ZodPipe(bulkCreateSectionsSchema)) body: Out<typeof bulkCreateSectionsSchema>) {
    return { data: await this.academics.bulkCreateSections(body) };
  }

  @Patch(':id')
  @RequirePermission('academic.manage')
  async update(@Param('id', id) sectionId: string, @Body(new ZodPipe(updateSectionSchema)) body: Out<typeof updateSectionSchema>) {
    return { data: await this.academics.updateSection(sectionId, body) };
  }

  @Delete(':id')
  @HttpCode(200)
  @RequirePermission('academic.manage')
  async remove(@Param('id', id) sectionId: string) {
    await this.academics.deleteSection(sectionId);
    return { data: { ok: true } };
  }
}

@Controller('subjects')
export class SubjectsController {
  constructor(private readonly academics: AcademicsService) {}

  @Get()
  @RequirePermission('academic.view')
  async list() {
    return { data: await this.academics.listSubjects() };
  }

  @Post()
  @RequirePermission('academic.manage')
  async create(@Body(new ZodPipe(createSubjectSchema)) body: Out<typeof createSubjectSchema>) {
    return { data: await this.academics.createSubject(body) };
  }

  @Post('bulk')
  @RequirePermission('academic.manage')
  async bulk(@Body(new ZodPipe(bulkCreateSubjectsSchema)) body: Out<typeof bulkCreateSubjectsSchema>) {
    return { data: await this.academics.bulkCreateSubjects(body) };
  }

  @Patch(':id')
  @RequirePermission('academic.manage')
  async update(@Param('id', id) subjectId: string, @Body(new ZodPipe(updateSubjectSchema)) body: Out<typeof updateSubjectSchema>) {
    return { data: await this.academics.updateSubject(subjectId, body) };
  }
}

@Controller('class-subjects')
export class ClassSubjectsController {
  constructor(private readonly academics: AcademicsService) {}

  @Get()
  @RequirePermission('academic.view')
  async list(@Query(new ZodPipe(listSectionsQuerySchema)) query: Out<typeof listSectionsQuerySchema>) {
    return { data: await this.academics.listClassSubjects(query.academicYearId) };
  }

  @Put()
  @RequirePermission('academic.manage')
  async set(@Body(new ZodPipe(setClassSubjectsSchema)) body: Out<typeof setClassSubjectsSchema>) {
    return { data: await this.academics.setClassSubjects(body) };
  }
}

@Controller('teaching-assignments')
export class AssignmentsController {
  constructor(private readonly academics: AcademicsService) {}

  @Get()
  @RequirePermission('academic.view')
  async list(@Query(new ZodPipe(listAssignmentsQuerySchema)) query: Out<typeof listAssignmentsQuerySchema>) {
    return { data: await this.academics.listAssignments(query) };
  }

  @Post()
  @RequirePermission('academic.manage')
  async create(@Body(new ZodPipe(createAssignmentSchema)) body: Out<typeof createAssignmentSchema>) {
    return { data: await this.academics.createAssignment(body) };
  }

  @Delete(':id')
  @HttpCode(200)
  @RequirePermission('academic.manage')
  async remove(@Param('id', id) assignmentId: string) {
    await this.academics.deleteAssignment(assignmentId);
    return { data: { ok: true } };
  }
}
