import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { ReminderMailer } from './reminder-mailer.js';

type Claimed = { id: number; cita_id: number; inicio: Date; intentos: number };
export function reminderText(inicio: Date, especialidad: string) {
  const fecha = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', dateStyle: 'full' }).format(inicio);
  const hora = new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', hour12: false }).format(inicio);
  return `Te recordamos tu cita en Clínica San Rafael.\nFecha: ${fecha}\nHora: ${hora} (Lima)\nEspecialidad: ${especialidad}\nSi necesitas reprogramar o cancelar, comunícate con admisión o ingresa al portal del paciente.`;
}

@Injectable()
export class RemindersService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RemindersService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  constructor(private readonly prisma: PrismaService, private readonly mailer: ReminderMailer, private readonly config: ConfigService) {}
  onModuleInit() {
    if (this.config.get<string>('REMINDERS_ENABLED') !== 'true' || process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => { void this.run(); }, 60000);
    this.timer.unref();
    void this.run();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }
  async run() {
    if (this.running) return;
    this.running = true;
    try {
      // Catch up after downtime, but never notify after the appointment has started.
      await this.prisma.$executeRaw`
        INSERT INTO recordatorio_cita(cita_id, inicio)
        SELECT id, fecha_hora_inicio FROM cita
        WHERE estado IN ('programada', 'confirmada', 'reprogramada')
          AND llegada_en IS NULL AND fecha_hora_inicio > now()
          AND fecha_hora_inicio <= now() + interval '24 hours'
        ON CONFLICT (cita_id, inicio) DO NOTHING`;
      for (let i = 0; i < 20; i++) {
        const rows = await this.prisma.$queryRaw<Claimed[]>`
          UPDATE recordatorio_cita SET estado = 'enviando', intentos = intentos + 1, actualizado_en = now()
          WHERE id = (SELECT id FROM recordatorio_cita WHERE estado = 'pendiente'
            AND (intentos = 0 OR actualizado_en < now() - interval '5 minutes')
            ORDER BY inicio, id FOR UPDATE SKIP LOCKED LIMIT 1)
          RETURNING id, cita_id, inicio, intentos`;
        if (!rows.length) break;
        await this.deliver(rows[0]);
      }
    } catch { this.logger.error('No se pudo procesar la cola de recordatorios.'); }
    finally { this.running = false; }
  }
  private async deliver(row: Claimed) {
    try {
      const appointment = await this.prisma.cita.findUnique({ where: { id: row.cita_id }, select: {
        estado: true, llegadaEn: true, fechaHoraInicio: true,
        paciente: { select: { correo: true } },
        medico: { select: { especialidad: { select: { nombre: true } } } },
      } });
      if (!appointment || appointment.llegadaEn || !['programada', 'confirmada', 'reprogramada'].includes(appointment.estado) || appointment.fechaHoraInicio.getTime() !== row.inicio.getTime() || row.inicio.getTime() <= Date.now()) {
        await this.setState(row.id, 'omitido'); return;
      }
      await this.mailer.send(appointment.paciente.correo, reminderText(row.inicio, appointment.medico.especialidad.nombre), row.id);
      await this.prisma.$executeRaw`UPDATE recordatorio_cita SET estado = 'enviado', enviado_en = now(), actualizado_en = now() WHERE id = ${row.id}`;
    } catch (error) {
      const e = error as { code?: string; responseCode?: number };
      // Retry only a definite refusal before delivery; ambiguous SMTP failures need review.
      const safeRetry = e.code === 'ECONNREFUSED' || (e.responseCode !== undefined && e.responseCode >= 400 && e.responseCode < 500);
      const state = safeRetry ? (row.intentos < 5 ? 'pendiente' : 'fallido') : e.responseCode && e.responseCode >= 500 ? 'fallido' : 'incierto';
      await this.setState(row.id, state);
      this.logger.warn(`Recordatorio ${row.id}: ${state}.`);
    }
  }
  private async setState(id: number, estado: string) {
    await this.prisma.$executeRaw`UPDATE recordatorio_cita SET estado = ${estado}, actualizado_en = now() WHERE id = ${id}`;
  }
}
