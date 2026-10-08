import { Module } from '@nestjs/common';
import { NotificationRulesController, NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';

@Module({ controllers: [NotificationsController, NotificationRulesController], providers: [NotificationsService], exports: [NotificationsService] })
export class NotificationsModule {}
