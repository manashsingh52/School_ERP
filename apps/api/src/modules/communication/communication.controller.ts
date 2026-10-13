import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import type { z } from 'zod';
import {
  cancelMeetingSchema,
  contactsQuerySchema,
  createMeetingSchema,
  createReminderSchema,
  listConversationsQuerySchema,
  listMeetingsQuerySchema,
  listRemindersQuerySchema,
  sendMessageSchema,
  startConversationSchema,
  updateConversationSchema,
  updateMeetingSchema,
  updateReminderSchema,
  uuidSchema,
} from '@schoolos/contracts';
import { RequirePermission } from '../../core/auth/decorators.js';
import { ZodPipe } from '../../core/validation/zod.pipe.js';
import { ConversationsService } from './conversations.service.js';
import { MeetingsService } from './meetings.service.js';
import { RemindersService } from './reminders.service.js';

const id = new ZodPipe(uuidSchema);
type Out<T extends z.ZodType> = z.output<T>;

@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get()
  @RequirePermission('message.use')
  list(@Query(new ZodPipe(listConversationsQuerySchema)) query: Out<typeof listConversationsQuerySchema>) {
    return this.conversations.list(query);
  }

  @Post()
  @RequirePermission('message.use')
  async start(@Body(new ZodPipe(startConversationSchema)) body: Out<typeof startConversationSchema>) {
    return { data: await this.conversations.start(body) };
  }

  @Get('contacts')
  @RequirePermission('message.use')
  async contacts(@Query(new ZodPipe(contactsQuerySchema)) query: Out<typeof contactsQuerySchema>) {
    return { data: await this.conversations.contacts(query.studentId) };
  }

  @Get('unread')
  @RequirePermission('message.use')
  async unread() {
    return { data: { count: await this.conversations.unreadCount() } };
  }

  @Get(':id')
  @RequirePermission('message.use')
  async get(@Param('id', id) conversationId: string) {
    return { data: await this.conversations.get(conversationId) };
  }

  @Post(':id/messages')
  @RequirePermission('message.use')
  async reply(@Param('id', id) conversationId: string, @Body(new ZodPipe(sendMessageSchema)) body: Out<typeof sendMessageSchema>) {
    return { data: await this.conversations.reply(conversationId, body.body) };
  }

  @Patch(':id')
  @RequirePermission('message.use')
  async status(@Param('id', id) conversationId: string, @Body(new ZodPipe(updateConversationSchema)) body: Out<typeof updateConversationSchema>) {
    return { data: await this.conversations.setStatus(conversationId, body.status) };
  }
}

@Controller('meetings')
export class MeetingsController {
  constructor(private readonly meetings: MeetingsService) {}

  @Get()
  @RequirePermission('meeting.view')
  async list(@Query(new ZodPipe(listMeetingsQuerySchema)) query: Out<typeof listMeetingsQuerySchema>) {
    return { data: await this.meetings.list(query) };
  }

  @Post()
  @RequirePermission('meeting.manage')
  async create(@Body(new ZodPipe(createMeetingSchema)) body: Out<typeof createMeetingSchema>) {
    return { data: await this.meetings.create(body) };
  }

  @Get(':id')
  @RequirePermission('meeting.view')
  async get(@Param('id', id) meetingId: string) {
    return { data: await this.meetings.get(meetingId) };
  }

  @Patch(':id')
  @RequirePermission('meeting.manage')
  async update(@Param('id', id) meetingId: string, @Body(new ZodPipe(updateMeetingSchema)) body: Out<typeof updateMeetingSchema>) {
    return { data: await this.meetings.update(meetingId, body) };
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @RequirePermission('meeting.manage')
  async cancel(@Param('id', id) meetingId: string, @Body(new ZodPipe(cancelMeetingSchema)) body: Out<typeof cancelMeetingSchema>) {
    return { data: await this.meetings.cancel(meetingId, body) };
  }

  @Post(':id/complete')
  @HttpCode(200)
  @RequirePermission('meeting.manage')
  async complete(@Param('id', id) meetingId: string) {
    return { data: await this.meetings.complete(meetingId) };
  }
}

@Controller('reminders')
export class RemindersController {
  constructor(private readonly reminders: RemindersService) {}

  @Get()
  @RequirePermission('reminder.use')
  async list(@Query(new ZodPipe(listRemindersQuerySchema)) query: Out<typeof listRemindersQuerySchema>) {
    return { data: await this.reminders.list(query) };
  }

  @Post()
  @RequirePermission('reminder.use')
  async create(@Body(new ZodPipe(createReminderSchema)) body: Out<typeof createReminderSchema>) {
    return { data: await this.reminders.create(body) };
  }

  @Patch(':id')
  @RequirePermission('reminder.use')
  async update(@Param('id', id) reminderId: string, @Body(new ZodPipe(updateReminderSchema)) body: Out<typeof updateReminderSchema>) {
    return { data: await this.reminders.update(reminderId, body) };
  }

  @Delete(':id')
  @HttpCode(200)
  @RequirePermission('reminder.use')
  async remove(@Param('id', id) reminderId: string) {
    await this.reminders.remove(reminderId);
    return { data: { ok: true } };
  }
}
