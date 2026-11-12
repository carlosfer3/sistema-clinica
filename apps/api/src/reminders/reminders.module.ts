import { Module } from '@nestjs/common';
import { ReminderMailer } from './reminder-mailer.js';
import { RemindersService } from './reminders.service.js';
import { NotificationsService } from './notifications.service.js';
@Module({ providers: [ReminderMailer, RemindersService, NotificationsService] })
export class RemindersModule {}
