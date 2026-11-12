import { describe, it, expect, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { createServer } from 'node:net';
import { ReminderMailer } from '../src/reminders/reminder-mailer.js';
import { RemindersService, reminderText } from '../src/reminders/reminders.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';

const inicio = new Date(Date.now() + 3600000);
function setup() {
  const db = {
    $executeRaw: vi.fn().mockResolvedValue(1),
    $queryRaw: vi.fn().mockResolvedValueOnce([{ id: 1, cita_id: 12, inicio, intentos: 1 }]).mockResolvedValue([]),
    cita: { findUnique: vi.fn().mockResolvedValue({ estado: 'confirmada', llegadaEn: null, fechaHoraInicio: inicio, paciente: { correo: 'paciente@example.test' }, medico: { especialidad: { nombre: 'Cardiología' } } }) },
  };
  const mailer = { send: vi.fn().mockResolvedValue(undefined) };
  const service = new RemindersService(db as unknown as PrismaService, mailer as unknown as ReminderMailer, new ConfigService());
  return { db, mailer, service };
}
describe('Appointment reminders', () => {
  it('formats dates in Lima and includes specialty without clinical history', () => {
    const text = reminderText(new Date('2099-01-09T13:00:00Z'), 'Cardiología');
    expect(text).toContain('08:00 (Lima)'); expect(text).toContain('Cardiología'); expect(text).toContain('2099');
  });
  it('sends a claimed reminder and records delivery', async () => {
    const { db, mailer, service } = setup(); await service.run();
    expect(mailer.send).toHaveBeenCalledWith('paciente@example.test', expect.stringContaining('Cardiología'), 1);
    expect(db.$executeRaw.mock.calls.at(-1)?.[0].join('')).toContain("estado = 'enviado'");
  });
  it.each(['cancelada', 'pendiente_confirmacion', 'atendida'])('does not send for state %s', async estado => {
    const { db, mailer, service } = setup(); db.cita.findUnique.mockResolvedValueOnce({ ...await db.cita.findUnique(), estado });
    await service.run(); expect(mailer.send).not.toHaveBeenCalled();
    expect(db.$executeRaw.mock.calls.at(-1)?.[1]).toBe('omitido');
  });
  it('omits an obsolete schedule after rescheduling', async () => {
    const { db, mailer, service } = setup(); db.cita.findUnique.mockResolvedValueOnce({ ...await db.cita.findUnique(), fechaHoraInicio: new Date(inicio.getTime() + 60000) });
    await service.run(); expect(mailer.send).not.toHaveBeenCalled();
  });
  it('does not send a reminder twice when there is no new claim', async () => {
    const { mailer, service } = setup(); await service.run(); await service.run(); expect(mailer.send).toHaveBeenCalledTimes(1);
  });
  it('retries a definite connection refusal', async () => {
    const { db, mailer, service } = setup(); mailer.send.mockRejectedValueOnce({ code: 'ECONNREFUSED' });
    await service.run(); expect(db.$executeRaw.mock.calls.at(-1)?.[1]).toBe('pendiente');
  });
  it('does not automatically resend an ambiguous delivery', async () => {
    const { db, mailer, service } = setup(); mailer.send.mockRejectedValueOnce({ code: 'ECONNRESET' });
    await service.run(); expect(db.$executeRaw.mock.calls.at(-1)?.[1]).toBe('incierto');
  });
  it('delivers an actual email to a local SMTP receiver', async () => {
    let message = '';
    const server = createServer(socket => {
      socket.setEncoding('utf8'); socket.write('220 local.test ESMTP\r\n');
      let buffer = ''; let data = false;
      socket.on('data', chunk => {
        buffer += chunk;
        let end: number;
        while ((end = buffer.indexOf('\r\n')) >= 0) {
          const line = buffer.slice(0, end); buffer = buffer.slice(end + 2);
          if (data) { if (line === '.') { data = false; socket.write('250 queued\r\n'); } else message += line + '\n'; }
          else if (line.startsWith('EHLO')) socket.write('250 local.test\r\n');
          else if (line === 'DATA') { data = true; socket.write('354 send data\r\n'); }
          else if (line === 'QUIT') socket.end('221 bye\r\n');
          else socket.write('250 OK\r\n');
        }
      });
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address(); if (!address || typeof address === 'string') throw Error('No port');
      const mailer = new ReminderMailer(new ConfigService({ SMTP_HOST: '127.0.0.1', SMTP_PORT: String(address.port) }));
      await mailer.send('paciente@example.test', 'Fecha: 09/01/2099\nHora: 08:00 (Lima)\nEspecialidad: Cardiologia', 123);
      expect(message).toContain('paciente@example.test'); expect(message).toContain('08:00 (Lima)');
    } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
  });
});
