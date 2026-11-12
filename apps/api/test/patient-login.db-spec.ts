import { JwtService } from '@nestjs/jwt';
import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Patient credentials (isolated PostgreSQL schema)', () => {
  const schema = `test_patient_login_${randomUUID().replaceAll('-', '')}`;
  const admin = new PrismaClient();
  let db: PrismaClient;
  let app: INestApplication;
  let created = false;
  const password = 'fictitious-patient-password';
  const login = (identifier: string, secret = password) =>
    request(app.getHttpServer())
      .post('/api/auth/patient-login')
      .send({ identifier, password: secret });
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    url.searchParams.set('schema', schema);
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    created = true;
    execFileSync(
      process.execPath,
      ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
      {
        env: { ...process.env, DATABASE_URL: url.toString() },
        stdio: 'pipe',
        timeout: 45000,
      },
    );
    db = new PrismaClient({ datasourceUrl: url.toString() });
    const user = await db.usuario.create({
      data: {
        username: 'internal-patient-account',
        rol: 'paciente',
        nombres: 'Paciente',
        apellidos: 'Prueba',
        passwordHash: await hash(password, 4),
      },
    });
    await db.paciente.create({
      data: {
        usuarioId: user.id,
        nombres: 'Paciente',
        apellidos: 'Prueba',
        tipoDocumento: 'DNI',
        numeroDocumento: '01234567',
        fechaNacimiento: new Date('1990-01-01'),
        sexo: 'F',
        telefono: '999888777',
        correo: 'patient@example.test',
      },
    });
    process.env.JWT_SECRET = 'test-only-secret-with-at-least-32-characters';
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(db)
      .compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
  }, 60000);
  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
    if (created)
      await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.$disconnect();
  });
  it('authenticates the same linked patient by DNI and case-insensitive email', async () => {
    for (const identifier of ['01234567', ' PATIENT@example.test ']) {
      const result = await login(identifier).expect(200);
      await request(app.getHttpServer())
        .get('/api/portal/profile')
        .auth(result.body.accessToken, { type: 'bearer' })
        .expect(200)
        .expect((res) => expect(res.body.numeroDocumento).toBe('01234567'));
    }
  });
  it('requires the existing password, not just knowledge of the DNI or email', async () => {
    await login('01234567', 'incorrect-password').expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/patient-login')
      .send({ identifier: '01234567' })
      .expect(400);
    await login('internal-patient-account').expect(400);
  });
  it('does not pick a patient when an email is shared', async () => {
    await db.paciente.create({
      data: {
        nombres: 'Otro',
        apellidos: 'Paciente',
        tipoDocumento: 'DNI',
        numeroDocumento: '76543210',
        fechaNacimiento: new Date('1990-01-01'),
        sexo: 'M',
        telefono: '999888777',
        correo: 'PATIENT@example.test',
      },
    });
    await login('patient@example.test').expect(401);
    await login('01234567').expect(200);
    await login('76543210').expect(401);
  });
  it('requires admission confirmation of portal requests, including rescheduling', async () => {
    const patient = await db.paciente.findUniqueOrThrow({
      where: {
        tipoDocumento_numeroDocumento: {
          tipoDocumento: 'DNI',
          numeroDocumento: '01234567',
        },
      },
    });
    const patientToken = (await login('01234567').expect(200)).body.accessToken;
    const admission = await db.usuario.create({
      data: {
        username: 'flow-admission',
        rol: 'admision',
        nombres: 'Admision',
        apellidos: 'Prueba',
        passwordHash: 'unused',
      },
    });
    const doctorUser = await db.usuario.create({
      data: {
        username: 'flow-doctor',
        rol: 'medico',
        nombres: 'Medico',
        apellidos: 'Prueba',
        passwordHash: 'unused',
      },
    });
    const specialty = await db.especialidad.create({
      data: { nombre: 'Especialidad prueba' },
    });
    const doctor = await db.medico.create({
      data: {
        usuarioId: doctorUser.id,
        especialidadId: specialty.id,
        cmp: 'TEST0001',
      },
    });
    const room = await db.consultorio.create({
      data: { nombre: 'Consultorio prueba' },
    });
    await db.horarioMedico.create({
      data: {
        medicoId: doctor.id,
        consultorioId: room.id,
        diaSemana: 5,
        horaInicio: new Date('1970-01-01T08:00:00Z'),
        horaFin: new Date('1970-01-01T10:00:00Z'),
        duracionCitaMin: 20,
      },
    });
    const admissionToken = await app
      .get(JwtService)
      .signAsync({ sub: admission.id });
    const result = await request(app.getHttpServer())
      .post('/api/portal/appointments')
      .auth(patientToken, { type: 'bearer' })
      .send({ medicoId: doctor.id, inicio: '2099-01-09T08:00:00-05:00' })
      .expect(201);
    expect(result.body.estado).toBe('pendiente_confirmacion');
    const id = result.body.id;
    const queue = await request(app.getHttpServer())
      .get('/api/agenda/appointments?pendientesPortal=true')
      .auth(admissionToken, { type: 'bearer' })
      .expect(200);
    expect(queue.body.citas.map((a: { id: number }) => a.id)).toContain(id);
    await request(app.getHttpServer())
      .post(`/api/agenda/appointments/${id}/confirm`)
      .auth(patientToken, { type: 'bearer' })
      .send({})
      .expect(403);
    const confirm = () =>
      request(app.getHttpServer())
        .post(`/api/agenda/appointments/${id}/confirm`)
        .auth(admissionToken, { type: 'bearer' })
        .send({});
    const results = await Promise.all([confirm(), confirm()]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(
      await db.bitacoraAuditoria.count({
        where: { accion: 'CONFIRM_CITA', recurso: `agenda/appointments/${id}` },
      }),
    ).toBe(1);
    await request(app.getHttpServer())
      .post(`/api/portal/appointments/${id}/reschedule`)
      .auth(patientToken, { type: 'bearer' })
      .send({ inicio: '2099-01-09T08:20:00-05:00' })
      .expect(200)
      .expect((res) => expect(res.body.estado).toBe('pendiente_confirmacion'));
    await confirm().expect(200);
    expect(
      (await db.cita.findUniqueOrThrow({ where: { id } })).pacienteId,
    ).toBe(patient.id);
  });

  it('shows real charges only to their patient, requires cashier verification and records a payment once', async () => {
    const patient = await db.paciente.findUniqueOrThrow({
      where: {
        tipoDocumento_numeroDocumento: {
          tipoDocumento: 'DNI',
          numeroDocumento: '01234567',
        },
      },
    });
    const patientToken = (await login('01234567').expect(200)).body.accessToken;
    const cashier = await db.usuario.create({
      data: {
        username: 'flow-cashier',
        rol: 'cajero',
        nombres: 'Caja',
        apellidos: 'Prueba',
        passwordHash: 'unused',
      },
    });
    const cashierToken = await app
      .get(JwtService)
      .signAsync({ sub: cashier.id });
    const create = (amount = 15000) =>
      request(app.getHttpServer())
        .post('/api/billing/charges')
        .auth(cashierToken, { type: 'bearer' })
        .send({
          pacienteId: patient.id,
          concepto: 'Consulta de prueba',
          montoCentimos: amount,
        });
    await create(0).expect(400);
    await request(app.getHttpServer())
      .post('/api/billing/charges')
      .auth(patientToken, { type: 'bearer' })
      .send({ pacienteId: patient.id, concepto: 'Alterado', montoCentimos: 1 })
      .expect(403);
    const charge = (await create().expect(201)).body;
    const own = () =>
      request(app.getHttpServer())
        .get('/api/portal/payments')
        .auth(patientToken, { type: 'bearer' });
    expect((await own().expect(200)).body.saldoPendienteCentimos).toBe(15000);
    const settle = (data = { metodoPago: 'efectivo' }) =>
      request(app.getHttpServer())
        .post(`/api/billing/charges/${charge.id}/settle`)
        .auth(cashierToken, { type: 'bearer' })
        .send(data);
    await request(app.getHttpServer())
      .post(`/api/billing/charges/${charge.id}/settle`)
      .auth(patientToken, { type: 'bearer' })
      .send({ metodoPago: 'efectivo' })
      .expect(403);
    await settle({ metodoPago: 'yape' }).expect(400);
    const results = await Promise.all([settle(), settle()]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(
      await db.bitacoraAuditoria.count({
        where: {
          accion: 'SETTLE_CHARGE',
          recurso: `billing/charges/${charge.id}`,
        },
      }),
    ).toBe(1);
    expect((await own().expect(200)).body.saldoPendienteCentimos).toBe(0);
    await request(app.getHttpServer())
      .get(`/api/portal/payments/${charge.id}/receipt`)
      .auth(patientToken, { type: 'bearer' })
      .expect(200);
    const outsider = await db.usuario.create({
      data: {
        username: 'flow-outsider',
        rol: 'paciente',
        nombres: 'Otro',
        apellidos: 'Prueba',
        passwordHash: 'unused',
      },
    });
    const outsiderPatient = await db.paciente.findFirstOrThrow({
      where: { numeroDocumento: '76543210' },
    });
    await db.paciente.update({
      where: { id: outsiderPatient.id },
      data: { usuarioId: outsider.id },
    });
    const outsiderToken = await app
      .get(JwtService)
      .signAsync({ sub: outsider.id });
    await request(app.getHttpServer())
      .get(`/api/portal/payments/${charge.id}/receipt`)
      .auth(outsiderToken, { type: 'bearer' })
      .expect(404);
    expect(
      (
        await request(app.getHttpServer())
          .get('/api/portal/payments')
          .auth(outsiderToken, { type: 'bearer' })
          .expect(200)
      ).body.cobros,
    ).toEqual([]);
    const pending = (await create().expect(201)).body;
    await db.$executeRawUnsafe(
      `CREATE FUNCTION reject_payment_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.accion = 'SETTLE_CHARGE' THEN RAISE EXCEPTION 'Test audit failure'; END IF; RETURN NEW; END; $$`,
    );
    await db.$executeRawUnsafe(
      'CREATE TRIGGER test_payment_audit BEFORE INSERT ON bitacora_auditoria FOR EACH ROW EXECUTE FUNCTION reject_payment_audit()',
    );
    try {
      await request(app.getHttpServer())
        .post(`/api/billing/charges/${pending.id}/settle`)
        .auth(cashierToken, { type: 'bearer' })
        .send({ metodoPago: 'efectivo' })
        .expect(500);
      expect(
        (await db.cobro.findUniqueOrThrow({ where: { id: pending.id } }))
          .estado,
      ).toBe('pendiente');
    } finally {
      await db.$executeRawUnsafe(
        'DROP TRIGGER test_payment_audit ON bitacora_auditoria',
      );
      await db.$executeRawUnsafe('DROP FUNCTION reject_payment_audit()');
    }
  });
});
