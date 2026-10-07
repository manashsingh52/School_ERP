import { Module } from '@nestjs/common';
import {
  AcademicYearsController,
  AssignmentsController,
  ClassSubjectsController,
  ClassesController,
  SectionsController,
  SubjectsController,
} from './academics.controller.js';
import { AcademicsService } from './academics.service.js';

@Module({
  controllers: [AcademicYearsController, ClassesController, SectionsController, SubjectsController, ClassSubjectsController, AssignmentsController],
  providers: [AcademicsService],
  exports: [AcademicsService],
})
export class AcademicsModule {}
