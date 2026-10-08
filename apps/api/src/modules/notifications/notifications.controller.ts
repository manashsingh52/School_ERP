import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import type { z } from 'zod';
import { listNotificationsQuerySchema, updateNotificationRulesSchema, uuidSchema } from '@schoolos/contracts';
import { RequirePermission, SchoolMember } from '../../core/auth/decorators.js';
import { ZodPipe } from '../../core/validation/zod.pipe.js';
import { NotificationsService } from './notifications.service.js';

/** The signed-in member's own inbox. Everyone in a school has one. */
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @SchoolMember() // only ever returns the caller's own notifications
  list(@Query(new ZodPipe(listNotificationsQuerySchema)) query: z.output<typeof listNotificationsQuerySchema>) {
    return this.notifications.inbox(query);
  }

  @Get('unread-count')
  @SchoolMember()
  async unread() {
    return { data: { count: await this.notifications.unreadCount() } };
  }

  @Post('read-all')
  @HttpCode(200)
  @SchoolMember()
  async readAll() {
    return { data: { updated: await this.notifications.markAllRead() } };
  }

  @Post(':id/read')
  @HttpCode(200)
  @SchoolMember()
  async read(@Param('id', new ZodPipe(uuidSchema)) id: string) {
    await this.notifications.markRead(id);
    return { data: { ok: true } };
  }
}

@Controller('notification-rules')
export class NotificationRulesController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @RequirePermission('notification.settings.manage')
  async list() {
    return { data: await this.notifications.listRules() };
  }

  @Put()
  @RequirePermission('notification.settings.manage')
  async update(@Body(new ZodPipe(updateNotificationRulesSchema)) body: z.output<typeof updateNotificationRulesSchema>) {
    return { data: await this.notifications.updateRules(body) };
  }
}
