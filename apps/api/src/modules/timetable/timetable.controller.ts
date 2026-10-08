import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import type { z } from 'zod';
import { bellScheduleSchema, createTimetableSchema, saveTimetableSchema, timetableQuerySchema, todayQuerySchema, uuidSchema } from '@schoolos/contracts';
import { RequirePermission } from '../../core/auth/decorators.js';
import { ZodPipe } from '../../core/validation/zod.pipe.js';
import { TimetableService } from './timetable.service.js';

const id = new ZodPipe(uuidSchema);
type Out<T extends z.ZodType> = z.output<T>;

@Controller('bell-schedules')
export class BellSchedulesController {
  constructor(private readonly timetable: TimetableService) {}

  @Get()
  @RequirePermission('timetable.view')
  async list() {
    return { data: await this.timetable.listSchedules() };
  }

  @Post()
  @RequirePermission('timetable.manage')
  async create(@Body(new ZodPipe(bellScheduleSchema)) body: Out<typeof bellScheduleSchema>) {
    return { data: await this.timetable.createSchedule(body) };
  }

  @Put(':id')
  @RequirePermission('timetable.manage')
  async update(@Param('id', id) scheduleId: string, @Body(new ZodPipe(bellScheduleSchema)) body: Out<typeof bellScheduleSchema>) {
    return { data: await this.timetable.updateSchedule(scheduleId, body) };
  }

  @Delete(':id')
  @HttpCode(200)
  @RequirePermission('timetable.manage')
  async remove(@Param('id', id) scheduleId: string) {
    await this.timetable.deleteSchedule(scheduleId);
    return { data: { ok: true } };
  }
}

@Controller()
export class TimetablesController {
  constructor(private readonly timetable: TimetableService) {}

  @Get('timetables/overview')
  @RequirePermission('timetable.view')
  async overview() {
    return { data: await this.timetable.overview() };
  }

  @Get('timetables/today')
  @RequirePermission('timetable.view')
  async today(@Query(new ZodPipe(todayQuerySchema)) query: Out<typeof todayQuerySchema>) {
    return { data: await this.timetable.today(query.date, query.studentId) };
  }

  @Get('timetables')
  @RequirePermission('timetable.view')
  async forSection(@Query(new ZodPipe(timetableQuerySchema)) query: Out<typeof timetableQuerySchema>) {
    return { data: await this.timetable.forSection(query.sectionId) };
  }

  @Post('timetables')
  @RequirePermission('timetable.manage')
  async create(@Body(new ZodPipe(createTimetableSchema)) body: Out<typeof createTimetableSchema>) {
    return { data: await this.timetable.create(body.sectionId, body.bellScheduleId) };
  }

  @Put('timetables/:id/entries')
  @RequirePermission('timetable.manage')
  async save(@Param('id', id) timetableId: string, @Body(new ZodPipe(saveTimetableSchema)) body: Out<typeof saveTimetableSchema>) {
    return { data: await this.timetable.saveEntries(timetableId, body) };
  }

  @Post('timetables/:id/publish')
  @HttpCode(200)
  @RequirePermission('timetable.manage')
  async publish(@Param('id', id) timetableId: string) {
    return { data: await this.timetable.publish(timetableId) };
  }

  @Delete('timetables/:id')
  @HttpCode(200)
  @RequirePermission('timetable.manage')
  async remove(@Param('id', id) timetableId: string) {
    await this.timetable.remove(timetableId);
    return { data: { ok: true } };
  }

  @Get('teachers/:id/timetable')
  @RequirePermission('timetable.view')
  async teacher(@Param('id', id) teacherId: string) {
    return { data: await this.timetable.teacherWeek(teacherId) };
  }
}
