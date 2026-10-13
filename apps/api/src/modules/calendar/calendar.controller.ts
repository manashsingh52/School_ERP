import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import type { z } from 'zod';
import { calendarEventSchema, calendarQuerySchema, updateCalendarEventSchema, uuidSchema } from '@schoolos/contracts';
import { RequirePermission } from '../../core/auth/decorators.js';
import { ZodPipe } from '../../core/validation/zod.pipe.js';
import { CalendarService } from './calendar.service.js';

const id = new ZodPipe(uuidSchema);
type Out<T extends z.ZodType> = z.output<T>;

@Controller('calendar')
export class CalendarController {
  constructor(private readonly calendar: CalendarService) {}

  @Get()
  @RequirePermission('calendar.view')
  async list(@Query(new ZodPipe(calendarQuerySchema)) query: Out<typeof calendarQuerySchema>) {
    return { data: await this.calendar.list(query.from, query.to) };
  }

  @Post()
  @RequirePermission('calendar.manage')
  async create(@Body(new ZodPipe(calendarEventSchema)) body: Out<typeof calendarEventSchema>) {
    return { data: await this.calendar.create(body) };
  }

  @Patch(':id')
  @RequirePermission('calendar.manage')
  async update(@Param('id', id) eventId: string, @Body(new ZodPipe(updateCalendarEventSchema)) body: Out<typeof updateCalendarEventSchema>) {
    return { data: await this.calendar.update(eventId, body) };
  }

  @Delete(':id')
  @HttpCode(200)
  @RequirePermission('calendar.manage')
  async remove(@Param('id', id) eventId: string) {
    await this.calendar.remove(eventId);
    return { data: { ok: true } };
  }
}
