import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { RemindersService } from '../src/reminders/reminders.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import type { ReminderMailer } from '../src/reminders/reminder-mailer.js';
import { NotificationsService } from '../src/reminders/notifications.service.js';
import { PortalService } from '../src/portal/portal.service.js';
import { AgendaService } from '../src/agenda/agenda.service.js';
import { AuditService } from '../src/audit/audit.service.js';

describe('Reminder queue with PostgreSQL in an isolated schema', () => {
  const schema = `reminders_${randomUUID().replaceAll('-', '')}`;
  let admin: PrismaClient; let db: PrismaClient; let created = false;
  let citaId: number;
  const send = vi.fn().mockResolvedValue(undefined);
  const service = () => new RemindersService(db as PrismaService, { send } as unknown as ReminderMailer, new ConfigService());
  beforeAll(async () => {
    admin = new PrismaClient();
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`); created = true;
    const url = new URL(process.env.DATABASE_URL!); url.searchParams.set('schema', schema);
    execFileSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], { env: { ...process.env, DATABASE_URL: url.toString() }, stdio: 'pipe', timeout: 45000 });
    db = new PrismaClient({ datasourceUrl: url.toString() });
    const account = await db.usuario.create({ data: { username: 'reminder-doctor', passwordHash: 'test-only', nombres: 'Doctor', apellidos: 'Ficticio', rol: 'medico' } });
    const specialty = await db.especialidad.create({ data: { nombre: 'Especialidad ficticia' } });
    const doctor = await db.medico.create({ data: { usuarioId: account.id, especialidadId: specialty.id, cmp: 'TEST123' } });
    const patient = await db.paciente.create({ data: { tipoDocumento: 'DNI', numeroDocumento: '01234567', nombres: 'Paciente', apellidos: 'Ficticio', fechaNacimiento: new Date('1990-01-01'), sexo: 'F', telefono: '999888777', correo: 'patient@example.test' } });
    const start = new Date(Date.now() + 3600000);
    const appointment = await db.cita.create({ data: { pacienteId: patient.id, medicoId: doctor.id, creadoPor: account.id, fechaHoraInicio: start, fechaHoraFin: new Date(start.getTime() + 1200000), estado: 'confirmada' } });
    citaId = appointment.id;
  }, 60000);
  afterAll(async () => {
    await db?.$disconnect();
    if (created) await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin?.$disconnect();
  });
  it('concurrent workers send once, persist delivery and skip obsolete schedules', async () => {
    await Promise.all([service().run(), service().run()]);
    expect(send).toHaveBeenCalledTimes(1);
    const rows = await db.$queryRaw<{ estado: string }[]>`SELECT estado FROM recordatorio_cita WHERE cita_id = ${citaId}`;
    expect(rows).toEqual([{ estado: 'enviado' }]);
    await service().run(); expect(send).toHaveBeenCalledTimes(1);
    await db.$executeRaw`INSERT INTO recordatorio_cita(cita_id, inicio) VALUES (${citaId}, now() + interval '2 hours')`;
    await service().run(); expect(send).toHaveBeenCalledTimes(1);
    const omitted = await db.$queryRaw<{ cantidad: number }[]>`SELECT count(*)::int AS cantidad FROM recordatorio_cita WHERE estado = 'omitido'`;
    expect(omitted[0].cantidad).toBe(1);
  });
  it('queues committed changes only and sends each event once under concurrency', async () => {
    const count = async () => (await db.$queryRaw<{ n: number }[]>`SELECT count(*)::int AS n FROM notificacion_cita`)[0].n;
    expect(await count()).toBe(1);
    await expect(db.$transaction(async tx => {
      await tx.cita.update({ where: { id: citaId }, data: { estado: 'cancelada' } });
      throw new Error('Rollback notification');
    })).rejects.toThrow('Rollback notification');
    expect(await count()).toBe(1);
    const start = new Date(Date.now() + 3 * 3600000);
    await db.cita.update({ where: { id: citaId }, data: { fechaHoraInicio: start, fechaHoraFin: new Date(start.getTime() + 1200000), estado: 'reprogramada' } });
    await db.cita.update({ where: { id: citaId }, data: { estado: 'cancelada' } });
    await db.cita.update({ where: { id: citaId }, data: { estado: 'cancelada' } });
    const events = await db.$queryRaw<{ tipo: string }[]>`SELECT tipo FROM notificacion_cita ORDER BY id`;
    expect(events.map(e => e.tipo)).toEqual(['registro', 'reprogramacion', 'cancelacion']);
    const mailer = { send: vi.fn().mockResolvedValue(undefined) };
    const worker = () => new NotificationsService(db as PrismaService, mailer as unknown as ReminderMailer, new ConfigService());
    await Promise.all([worker().run(), worker().run()]);
    await worker().run();
    expect(mailer.send).toHaveBeenCalledTimes(3);
    expect(mailer.send.mock.calls.map(args => args[3])).toEqual([
      'Cita registrada — Clínica San Rafael', 'Cita reprogramada — Clínica San Rafael', 'Cita cancelada — Clínica San Rafael',
    ]);
    const states = await db.$queryRaw<{ estado: string }[]>`SELECT estado FROM notificacion_cita`;
    expect(states.every(r => r.estado === 'enviado')).toBe(true);
  });
  it('shows a committed confirmation in the patient inbox independently of email and recovers legacy audit events without duplicates', async () => {
    const original = await db.cita.findUniqueOrThrow({ where: { id: citaId } });
    const account = await db.usuario.create({ data: { username: 'inbox-patient', passwordHash: 'test-only', nombres: 'Paciente', apellidos: 'Avisos', rol: 'paciente' } });
    await db.paciente.update({ where: { id: original.pacienteId }, data: { usuarioId: account.id } });
    const start = new Date(Date.now() + 86400000);
    const appointment = await db.cita.create({ data: { pacienteId: original.pacienteId, medicoId: original.medicoId, creadoPor: original.creadoPor, fechaHoraInicio: start, fechaHoraFin: new Date(start.getTime() + 1200000), canalOrigen: 'portal', estado: 'pendiente_confirmacion' } });
    const audit = new AuditService(db as PrismaService);
    const agenda = new AgendaService(db as PrismaService, audit);
    const portal = new PortalService(db as PrismaService, audit, agenda);
    await agenda.confirm(appointment.id, original.creadoPor);
    await agenda.confirm(appointment.id, original.creadoPor);
    await db.$executeRaw`UPDATE notificacion_cita SET estado = 'fallido' WHERE cita_id = ${appointment.id} AND tipo = 'confirmacion'`;
    let inbox = await portal.notifications({ pagina: 1, limite: 100 }, account.id);
    let confirmations = inbox.notificaciones.filter(n => n.citaId === appointment.id && n.tipo === 'confirmacion');
    expect(confirmations).toHaveLength(1);
    expect(confirmations[0].id).toMatch(/^aviso-/);
    await db.$executeRaw`DELETE FROM notificacion_cita WHERE cita_id = ${appointment.id} AND tipo = 'confirmacion'`;
    inbox = await portal.notifications({ pagina: 1, limite: 100 }, account.id);
    confirmations = inbox.notificaciones.filter(n => n.citaId === appointment.id && n.tipo === 'confirmacion');
    expect(confirmations).toHaveLength(1);
    expect(confirmations[0].id).toMatch(/^auditoria-/);
    expect(confirmations[0].inicio).toBeNull();
  });
});
