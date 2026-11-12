import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';

@Injectable()
export class ReminderMailer {
  constructor(private readonly config: ConfigService) {}
  async send(to: string, text: string, id: number | string, subject = 'Recordatorio de tu cita — Clínica San Rafael') {
    const user = this.config.get<string>('SMTP_USER');
    const transport = nodemailer.createTransport({
      host: this.config.get<string>('SMTP_HOST') || '127.0.0.1',
      port: Number(this.config.get<string>('SMTP_PORT') || '1025'),
      secure: this.config.get<string>('SMTP_SECURE') === 'true',
      auth: user ? { user, pass: this.config.get<string>('SMTP_PASSWORD') } : undefined,
      connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10000,
    });
    try {
      const result = await transport.sendMail({
        from: this.config.get<string>('SMTP_FROM') || 'Clínica San Rafael <recordatorios@sanrafael.test>',
        to, subject, text,
        messageId: `<cita-recordatorio-${id}@sanrafael.test>`,
      });
      if (!result.accepted.length) throw Object.assign(new Error('Recipient rejected'), { responseCode: 550 });
    } finally { transport.close(); }
  }
}
