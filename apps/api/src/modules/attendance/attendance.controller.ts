import { Body, Controller, Get, Param, Put, Query } from '@nestjs/common';
import type { z } from 'zod';
import {
  historyQuerySchema,
  monthQuerySchema,
  overviewQuerySchema,
  registerQuerySchema,
  saveRegisterSchema,
  saveStaffAttendanceSchema,
  updateAttendanceSettingsSchema,
  uuidSchema,
} from '@schoolos/contracts';
import { RequirePermission } from '../../core/auth/decorators.js';
import { ZodPipe } from '../../core/validation/zod.pipe.js';
import { AttendanceService } from './attendance.service.js';

const id = new ZodPipe(uuidSchema);
type Out<T extends z.ZodType> = z.output<T>;

@Controller()
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  @Get('attendance/overview')
  @RequirePermission('attendance.view')
  async overview(@Query(new ZodPipe(overviewQuerySchema)) query: Out<typeof overviewQuerySchema>) {
    return { data: await this.attendance.overview(query.date) };
  }

  @Get('attendance/settings')
  @RequirePermission('attendance.view')
  async settings() {
    return { data: await this.attendance.settings() };
  }

  @Put('attendance/settings')
  @RequirePermission('school.settings.manage')
  async updateSettings(@Body(new ZodPipe(updateAttendanceSettingsSchema)) body: Out<typeof updateAttendanceSettingsSchema>) {
    return { data: await this.attendance.updateSettings(body) };
  }

  @Get('sections/:id/attendance')
  @RequirePermission('attendance.view')
  async register(@Param('id', id) sectionId: string, @Query(new ZodPipe(registerQuerySchema)) query: Out<typeof registerQuerySchema>) {
    return { data: await this.attendance.register(sectionId, query.date) };
  }

  @Put('sections/:id/attendance')
  @RequirePermission('attendance.mark')
  async save(@Param('id', id) sectionId: string, @Body(new ZodPipe(saveRegisterSchema)) body: Out<typeof saveRegisterSchema>) {
    return { data: await this.attendance.save(sectionId, body) };
  }

  @Get('sections/:id/attendance/month')
  @RequirePermission('attendance.view')
  async month(@Param('id', id) sectionId: string, @Query(new ZodPipe(monthQuerySchema)) query: Out<typeof monthQuerySchema>) {
    return { data: await this.attendance.sectionMonth(sectionId, query.month) };
  }

  @Get('students/:id/attendance')
  @RequirePermission('attendance.view')
  async history(@Param('id', id) studentId: string, @Query(new ZodPipe(historyQuerySchema)) query: Out<typeof historyQuerySchema>) {
    return { data: await this.attendance.studentHistory(studentId, query.from, query.to) };
  }

  @Get('staff-attendance')
  @RequirePermission('staff_attendance.manage')
  async staff(@Query(new ZodPipe(registerQuerySchema)) query: Out<typeof registerQuerySchema>) {
    return { data: await this.attendance.staffDay(query.date) };
  }

  @Put('staff-attendance')
  @RequirePermission('staff_attendance.manage')
  async saveStaff(@Body(new ZodPipe(saveStaffAttendanceSchema)) body: Out<typeof saveStaffAttendanceSchema>) {
    return { data: await this.attendance.saveStaff(body) };
  }
}
