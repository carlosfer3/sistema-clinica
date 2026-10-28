import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

// Each run owns a new schema. Existing application tables are never reset.
describe('PostgreSQL migrations and patient flow (isolated schema)', () => {
  const schema = `test_${randomUUID().replaceAll('-', '')}`;
  let admin: PrismaClient;
  let db: PrismaClient;
  let app: INestApplication;
  let admissionToken: string;
  let doctorToken: string;
  let patientId: number;
  let doctorId: number;
  let doctorUserId: number;
  let schemaCreated = false;
  const patient = {
    tipoDocumento: 'DNI',
    numeroDocumento: '87654321',
    nombres: 'Paciente Ficticio',
    apellidos: 'Prueba',
    fechaNacimiento: '1990-01-01',
    sexo: 'F',
    telefono: '999888777',
    correo: 'ficticio@example.test',
    antecedentes: [{ tipo: 'cronica', descripcion: 'Antecedente ficticio' }],
    alergias: [{ sustancia: 'Sustancia ficticia' }],
  };

  beforeAll(async () => {
    if (!process.env.DATABASE_URL)
      throw new Error('DATABASE_URL is required for database tests');
    admin = new PrismaClient();
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    schemaCreated = true;
    const url = new URL(process.env.DATABASE_URL);
    url.searchParams.set('schema', schema);
    execFileSync(
      process.execPath,
      ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
      {
        env: { ...process.env, DATABASE_URL: url.toString() },
        timeout: 45000,
        stdio: 'pipe',
      },
    );
    db = new PrismaClient({ datasourceUrl: url.toString() });
    await db.$connect();
    const passwordHash = await hash('fictitious-test-password', 4);
    await db.usuario.create({
      data: {
        username: 'admission-test',
        passwordHash,
        rol: 'admision',
        nombres: 'Admision',
        apellidos: 'Prueba',
      },
    });
    const doctor = await db.medico.create({
      data: {
        cmp: 'TEST0001',
        usuario: {
          create: {
            username: 'doctor-test',
            passwordHash,
            rol: 'medico',
            nombres: 'Medico',
            apellidos: 'Prueba',
          },
        },
        especialidad: { create: { nombre: 'Especialidad ficticia' } },
      },
    });
    doctorId = doctor.id;
    doctorUserId = doctor.usuarioId;
    process.env.JWT_SECRET = 'isolated-db-test-secret-at-least-32-characters';
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(db)
      .compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    for (const username of ['admission-test', 'doctor-test']) {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username, password: 'fictitious-test-password' })
        .expect(200);
      if (username === 'admission-test')
        admissionToken = response.body.accessToken;
      else doctorToken = response.body.accessToken;
    }
  });

  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
    if (schemaCreated)
      await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin?.$disconnect();
  });

  it('rejects a malformed DNI and a future birth date', async () => {
    await request(app.getHttpServer())
      .post('/api/patients')
      .set('Authorization', `Bearer ${admissionToken}`)
      .send({ ...patient, numeroDocumento: '123' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/patients')
      .set('Authorization', `Bearer ${admissionToken}`)
      .send({ ...patient, fechaNacimiento: '2999-01-01' })
      .expect(400);
  });

  it('registers a patient without a portal account and atomically audits it', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/patients')
      .set('Authorization', `Bearer ${admissionToken}`)
      .send(patient)
      .expect(201);
    patientId = response.body.id;
    expect(
      await db.paciente.findUnique({ where: { id: patientId } }),
    ).toMatchObject({ usuarioId: null });
    expect(
      await db.bitacoraAuditoria.count({
        where: { accion: 'CREATE_PATIENT', recurso: `patients/${patientId}` },
      }),
    ).toBe(1);
  });

  it('rejects duplicate documents and identifies the existing patient', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/patients')
      .set('Authorization', `Bearer ${admissionToken}`)
      .send(patient)
      .expect(409);
    expect(response.body.patientId).toBe(patientId);
    expect(await db.paciente.count()).toBe(1);
  });

  it('searches by document and partial name without disclosing clinical fields', async () => {
    for (const q of ['87654321', 'ficticio', 'prueba']) {
      const response = await request(app.getHttpServer())
        .get(`/api/patients?q=${q}`)
        .set('Authorization', `Bearer ${admissionToken}`)
        .expect(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].id).toBe(patientId);
      expect(response.body[0]).not.toHaveProperty('alergias');
    }
  });

  it('allows a doctor to read the clinical profile and denies admission', async () => {
    await request(app.getHttpServer())
      .get(`/api/patients/${patientId}/clinical-profile`)
      .set('Authorization', `Bearer ${admissionToken}`)
      .expect(403);
    const response = await request(app.getHttpServer())
      .get(`/api/patients/${patientId}/clinical-profile`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .expect(200);
    expect(response.body.antecedentes).toHaveLength(1);
    expect(response.body.alergias).toHaveLength(1);
    expect(
      await db.bitacoraAuditoria.count({
        where: { accion: 'READ_CLINICAL_PROFILE' },
      }),
    ).toBe(1);
  });

  it('enforces intervals, concurrent collisions, adjacency and cancellation', async () => {
    const data = {
      pacienteId: patientId,
      medicoId: doctorId,
      creadoPor: doctorUserId,
      fechaHoraInicio: new Date('2030-01-01T14:00:00Z'),
      fechaHoraFin: new Date('2030-01-01T14:30:00Z'),
    };
    await expect(
      db.cita.create({ data: { ...data, fechaHoraFin: data.fechaHoraInicio } }),
    ).rejects.toThrow();
    const results = await Promise.allSettled([
      db.cita.create({ data }),
      db.cita.create({ data }),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    await db.cita.create({
      data: {
        ...data,
        fechaHoraInicio: data.fechaHoraFin,
        fechaHoraFin: new Date('2030-01-01T15:00:00Z'),
      },
    });
    await db.cita.updateMany({
      where: { fechaHoraInicio: data.fechaHoraInicio },
      data: { estado: 'cancelada' },
    });
    await expect(db.cita.create({ data })).resolves.toBeDefined();
  });

  it('requires a reason, actor and date for annulment and blocks physical deletion', async () => {
    const consultation = await db.consulta.create({
      data: {
        pacienteId: patientId,
        medicoId: doctorId,
        motivo: 'Consulta ficticia sin cita',
      },
    });
    await expect(
      db.consulta.update({
        where: { id: consultation.id },
        data: { estado: 'anulado' },
      }),
    ).rejects.toThrow();
    await expect(
      db.consulta.update({
        where: { id: consultation.id },
        data: {
          estado: 'anulado',
          motivoAnulacion: '   ',
          anuladoPor: doctorUserId,
          anuladoEn: new Date(),
        },
      }),
    ).rejects.toThrow();
    await db.consulta.update({
      where: { id: consultation.id },
      data: {
        estado: 'anulado',
        motivoAnulacion: 'Correccion ficticia',
        anuladoPor: doctorUserId,
        anuladoEn: new Date(),
      },
    });
    await expect(
      db.consulta.delete({ where: { id: consultation.id } }),
    ).rejects.toThrow();
    await expect(
      db.$executeRawUnsafe('TRUNCATE consulta CASCADE'),
    ).rejects.toThrow();
  });

  it('blocks updates, deletion and truncation of audit records', async () => {
    const row = await db.bitacoraAuditoria.findFirstOrThrow();
    await expect(
      db.bitacoraAuditoria.update({
        where: { id: row.id },
        data: { accion: 'ALTERED' },
      }),
    ).rejects.toThrow();
    await expect(
      db.bitacoraAuditoria.delete({ where: { id: row.id } }),
    ).rejects.toThrow();
    await expect(
      db.$executeRawUnsafe('TRUNCATE bitacora_auditoria'),
    ).rejects.toThrow();
  });
});
