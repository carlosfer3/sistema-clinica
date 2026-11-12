import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { ReminderMailer } from './reminder-mailer.js';

export type AppointmentNotification = {
  id: number; cita_id: number; tipo: string; correo: string; inicio: Date;
  inicio_anterior: Date | null; especialidad: string; pendiente_confirmacion: boolean; intentos: number;
};
export function notificationContent(row: AppointmentNotification) {
  const format = (date: Date) => new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', dateStyle: 'full', timeStyle: 'short' }).format(date);
  const title = row.tipo === 'cancelacion' ? 'Cita cancelada' : row.tipo === 'reprogramacion' ? 'Cita reprogramada' : row.tipo === 'confirmacion' ? 'Cita confirmada por admisión' : row.pendiente_confirmacion ? 'Solicitud de cita recibida' : 'Cita registrada';
  const status = row.tipo === 'cancelacion' ? 'Tu cita fue cancelada.' : row.pendiente_confirmacion ? 'Tu solicitud está pendiente de confirmación por admisión. Este correo no confirma la atención.' : 'Tu cita está registrada para el horario indicado.';
  return {
    subject: `${title} — Clínica San Rafael`,
    text: `${title}\nCita #${row.cita_id}\n${status}\nEspecialidad: ${row.especialidad}\n${row.tipo === 'cancelacion' ? 'Horario cancelado' : 'Fecha y hora'}: ${format(row.inicio)} (Lima)${row.inicio_anterior ? `\nHorario anterior: ${format(row.inicio_anterior)} (Lima)` : ''}\nPuedes consultar tus citas en el portal del paciente o comunicarte con admisión.`,
  };
}

@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  constructor(private readonly prisma: PrismaService, private readonly mailer: ReminderMailer, private readonly config: ConfigService) {}
  onModuleInit() {
    if (this.config.get<string>('NOTIFICATIONS_ENABLED') !== 'true' || process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => { void this.run(); }, 15000); this.timer.unref(); void this.run();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  async run() {
    if (this.running) return;
    this.running = true;
    try {
      for (let i = 0; i < 20; i++) {
        const rows = await this.prisma.$queryRaw<AppointmentNotification[]>`
          UPDATE notificacion_cita n SET estado = 'enviando', intentos = intentos + 1, actualizado_en = now()
          WHERE n.id = (SELECT q.id FROM notificacion_cita q
            WHERE q.estado = 'pendiente' AND (q.intentos = 0 OR q.actualizado_en < now() - interval '5 minutes')
            AND NOT EXISTS (SELECT 1 FROM notificacion_cita prev WHERE prev.cita_id = q.cita_id AND prev.id < q.id AND prev.estado IN ('pendiente', 'enviando'))
            ORDER BY q.id FOR UPDATE SKIP LOCKED LIMIT 1)
          RETURNING n.*`;
        if (!rows.length) break;
        const row = rows[0];
        try {
          const content = notificationContent(row);
          await this.mailer.send(row.correo, content.text, `aviso-${row.id}`, content.subject);
          await this.prisma.$executeRaw`UPDATE notificacion_cita SET estado = 'enviado', enviado_en = now(), actualizado_en = now() WHERE id = ${row.id}`;
        } catch (error) {
          const e = error as { code?: string; responseCode?: number };
          const retry = e.code === 'ECONNREFUSED' || (e.responseCode !== undefined && e.responseCode >= 400 && e.responseCode < 500);
          const estado = retry ? (row.intentos < 5 ? 'pendiente' : 'fallido') : e.responseCode && e.responseCode >= 500 ? 'fallido' : 'incierto';
          await this.prisma.$executeRaw`UPDATE notificacion_cita SET estado = ${estado}, actualizado_en = now() WHERE id = ${row.id}`;
          this.logger.warn(`Notificación ${row.id}: ${estado}.`);
        }
      }
    } catch { this.logger.error('No se pudo procesar la cola de notificaciones.'); }
    finally { this.running = false; }
  }
}
