import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Consultations and prescriptions (isolated PostgreSQL schema)', () => {
  const schema = `test_consult_${randomUUID().replaceAll('-', '')}`;
  let admin: PrismaClient;
  let db: PrismaClient;
  let app: INestApplication;
  let created = false;
  let url: URL;
  let doctorId: number;
  let doctorUserId: number;
  let patientId: number;
  let nurseId: number;
  let token: string;
  let otherToken: string;
  let nurseToken: string;
  let sequence = 0;
  const medication = {
    medicamento: 'Medicamento ficticio',
    dosis: 'Dosis ficticia',
    via: 'Via ficticia',
    frecuencia: 'Frecuencia ficticia',
    duracion: 'Duracion ficticia',
  };
  const body = (citaId: number) => ({
    citaId,
    motivo: 'Motivo ficticio',
    indicaciones: 'Indicaciones ficticias',
    diagnosticos: [{ codigo: 'J00' }],
    receta: [medication],
  });
  const post = (citaId: number, bearer = token) =>
    request(app.getHttpServer())
      .post('/api/consultations')
      .auth(bearer, { type: 'bearer' })
      .send(body(citaId));
  async function appointment() {
    const now = new Date();
    const date = new Date(now.getTime() - 5 * 3600000)
      .toISOString()
      .slice(0, 10);
    const start = new Date(
      new Date(`${date}T12:00:00-05:00`).getTime() + sequence++ * 30 * 60000,
    );
    const result = await db.cita.create({
      data: {
        pacienteId: patientId,
        medicoId: doctorId,
        creadoPor: doctorUserId,
        fechaHoraInicio: start,
        fechaHoraFin: new Date(start.getTime() + 20 * 60000),
        llegadaEn: now,
        preparacionCompletadaEn: now,
      },
    });
    await db.evaluacionPrevia.create({
      data: {
        citaId: result.id,
        registradoPor: nurseId,
        registradoEn: now,
        temperaturaC: 36.5,
        presionSistolica: 120,
        presionDiastolica: 80,
        frecuenciaCardiaca: 75,
        frecuenciaRespiratoria: 18,
        saturacionOxigeno: 98,
      },
    });
    return result;
  }
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required');
    admin = new PrismaClient();
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    created = true;
    url = new URL(process.env.DATABASE_URL);
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
    const doctor = await db.medico.create({
      data: {
        cmp: 'TESTHU08',
        usuario: {
          create: {
            username: 'doctor-hu08',
            passwordHash: 'unused-test-hash',
            rol: 'medico',
            nombres: 'Medico',
            apellidos: 'Ficticio',
          },
        },
        especialidad: { create: { nombre: 'General ficticia' } },
      },
    });
    doctorId = doctor.id;
    doctorUserId = doctor.usuarioId;
    const nurse = await db.usuario.create({
      data: {
        username: 'nurse-hu08',
        passwordHash: 'unused-test-hash',
        rol: 'enfermeria',
        nombres: 'Enfermeria',
        apellidos: 'Ficticia',
      },
    });
    nurseId = nurse.id;
    const other = await db.usuario.create({
      data: {
        username: 'other-hu08',
        passwordHash: 'unused-test-hash',
        rol: 'medico',
        nombres: 'Otro',
        apellidos: 'Medico',
      },
    });
    const patient = await db.paciente.create({
      data: {
        tipoDocumento: 'DNI',
        numeroDocumento: '87654321',
        nombres: 'Paciente',
        apellidos: 'Ficticio',
        fechaNacimiento: new Date('1990-01-01'),
        sexo: 'F',
        telefono: '999888777',
        correo: 'ficticio@example.test',
      },
    });
    patientId = patient.id;
    await db.cie10.createMany({
      data: [
        { codigo: 'J00', descripcion: 'Descripcion de prueba J00' },
        { codigo: 'Z00.0', descripcion: 'Descripcion de prueba Z00.0' },
      ],
    });
    process.env.JWT_SECRET = 'isolated-db-test-secret-at-least-32-characters';
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(db)
      .compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    const jwt = module.get(JwtService);
    token = await jwt.signAsync({ sub: doctorUserId });
    nurseToken = await jwt.signAsync({ sub: nurseId });
    otherToken = await jwt.signAsync({ sub: other.id });
  });
  afterAll(async () => {
    await app?.close();
    await db?.$disconnect();
    if (created)
      await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin?.$disconnect();
  });
  it('saves a manual prescription, reads it only as its doctor and preserves original clinical content', async () => {
    const cita = await appointment();
    const response = await post(cita.id).expect(201);
    const id = response.body.id;
    expect(response.body.recetaItems[0]).toMatchObject(medication);
    expect(response.body.diagnosticos[0]).toMatchObject({
      codigo: 'J00',
      tipo: 'principal',
    });
    expect(await db.cita.findUnique({ where: { id: cita.id } })).toMatchObject({
      estado: 'atendida',
    });
    await request(app.getHttpServer())
      .get(`/api/consultations/${id}`)
      .auth(token, { type: 'bearer' })
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/consultations/${id}`)
      .auth(otherToken, { type: 'bearer' })
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/consultations/${id}`)
      .auth(nurseToken, { type: 'bearer' })
      .expect(403);
    await db.cie10.update({
      where: { codigo: 'J00' },
      data: { descripcion: 'Descripcion actualizada' },
    });
    expect(
      (await db.consultaDiagnostico.findMany({ where: { consultaId: id } }))[0]
        .descripcion,
    ).toBe('Descripcion de prueba J00');
    await expect(
      db.recetaItem.update({
        where: { id: response.body.recetaItems[0].id },
        data: { dosis: 'Otra' },
      }),
    ).rejects.toThrow();
    await expect(
      db.recetaItem.delete({ where: { id: response.body.recetaItems[0].id } }),
    ).rejects.toThrow();
    await expect(
      db.consulta.update({ where: { id }, data: { motivo: 'Otro' } }),
    ).rejects.toThrow();
    expect(
      await db.bitacoraAuditoria.count({
        where: {
          accion: 'CREATE_CONSULTATION',
          recurso: `consultations/${id}`,
        },
      }),
    ).toBe(1);
  });
  it('reads audited chronological HCE with real relations and denies unassigned doctors', async () => {
    const cita = await appointment();
    const response = await post(cita.id).expect(201);
    await db.antecedente.create({
      data: {
        pacienteId: patientId,
        tipo: 'Personal',
        descripcion: 'Antecedente ficticio',
      },
    });
    await db.alergia.create({
      data: {
        pacienteId: patientId,
        sustancia: 'Sustancia ficticia',
        reaccion: 'Reacción ficticia',
      },
    });
    const history = (bearer = token, query = '') =>
      request(app.getHttpServer())
        .get(`/api/patients/${patientId}/history${query}`)
        .auth(bearer, { type: 'bearer' });
    const result = await history(token, '?pagina=1&limite=1').expect(200);
    expect(result.body.paciente.antecedentes[0].descripcion).toBe(
      'Antecedente ficticio',
    );
    expect(result.body.paciente.alergias[0].sustancia).toBe(
      'Sustancia ficticia',
    );
    expect(result.body.consultas[0]).toMatchObject({
      id: response.body.id,
      diagnosticos: [{ codigo: 'J00' }],
      recetaItems: [medication],
      medico: { usuario: { nombres: 'Medico' } },
    });
    expect(result.body.hayMas).toBe(true);
    const next = await history(token, '?pagina=2&limite=1').expect(200);
    expect(next.body.consultas[0].id).not.toBe(response.body.id);
    await history(otherToken).expect(404);
    await history(nurseToken).expect(403);
    expect(
      await db.bitacoraAuditoria.count({
        where: {
          accion: 'READ_HCE',
          usuarioId: doctorUserId,
          recurso: `patients/${patientId}/history`,
        },
      }),
    ).toBe(2);
    const otherUser = await db.usuario.findUniqueOrThrow({
      where: { username: 'other-hu08' },
    });
    const otherDoctor = await db.medico.create({
      data: {
        usuarioId: otherUser.id,
        cmp: 'TESTHCE',
        especialidadId: (
          await db.medico.findUniqueOrThrow({ where: { id: doctorId } })
        ).especialidadId,
      },
    });
    const assigned = await db.cita.create({
      data: {
        pacienteId: patientId,
        medicoId: otherDoctor.id,
        creadoPor: doctorUserId,
        fechaHoraInicio: cita.fechaHoraInicio,
        fechaHoraFin: cita.fechaHoraFin,
      },
    });
    const crossDoctor = await history(otherToken).expect(200);
    expect(
      crossDoctor.body.consultas.some(
        (entry: { id: number }) => entry.id === response.body.id,
      ),
    ).toBe(true);
    await db.cita.update({
      where: { id: assigned.id },
      data: { estado: 'cancelada' },
    });
    await history(otherToken).expect(404);
  });
  it('accepts exactly one of two simultaneous consultations for a prepared appointment', async () => {
    const cita = await appointment();
    const results = await Promise.all([post(cita.id), post(cita.id)]);
    expect(
      results.map((response) => response.status).sort((a, b) => a - b),
    ).toEqual([201, 409]);
    expect(await db.consulta.count({ where: { citaId: cita.id } })).toBe(1);
  });
  it('keeps consultation without medication valid and rejects an unassigned doctor without writes', async () => {
    const cita = await appointment();
    await post(cita.id, otherToken).expect(404);
    await post(cita.id, nurseToken).expect(403);
    await request(app.getHttpServer())
      .post('/api/consultations')
      .auth(token, { type: 'bearer' })
      .send({ ...body(cita.id), receta: [] })
      .expect(201);
    const consultation = await db.consulta.findUniqueOrThrow({
      where: { citaId: cita.id },
    });
    expect(
      await db.recetaItem.count({ where: { consultaId: consultation.id } }),
    ).toBe(0);
  });
  it('rolls back consultation, diagnoses, medication and attended state if the audit insert fails', async () => {
    const cita = await appointment();
    await db.$executeRawUnsafe(
      `CREATE FUNCTION reject_consult_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.accion = 'CREATE_CONSULTATION' THEN RAISE EXCEPTION 'Test audit failure'; END IF; RETURN NEW; END; $$`,
    );
    await db.$executeRawUnsafe(
      'CREATE TRIGGER test_consult_audit BEFORE INSERT ON bitacora_auditoria FOR EACH ROW EXECUTE FUNCTION reject_consult_audit()',
    );
    const diagnosesBefore = await db.consultaDiagnostico.count();
    const prescriptionsBefore = await db.recetaItem.count();
    try {
      await post(cita.id).expect(500);
      expect(await db.consulta.count({ where: { citaId: cita.id } })).toBe(0);
      expect(await db.consultaDiagnostico.count()).toBe(diagnosesBefore);
      expect(await db.recetaItem.count()).toBe(prescriptionsBefore);
      expect(
        await db.cita.findUnique({ where: { id: cita.id } }),
      ).toMatchObject({ estado: 'programada' });
    } finally {
      await db.$executeRawUnsafe(
        'DROP TRIGGER test_consult_audit ON bitacora_auditoria',
      );
      await db.$executeRawUnsafe('DROP FUNCTION reject_consult_audit()');
    }
  });
  it('loads the small demo CIE-10 catalog idempotently without overwriting existing descriptions', async () => {
    const run = () =>
      execFileSync(process.execPath, ['prisma/seed-cie10-demo.mjs'], {
        env: { ...process.env, DATABASE_URL: url.toString(), NODE_ENV: 'test' },
        timeout: 30000,
        stdio: 'pipe',
      });
    run();
    run();
    expect(await db.cie10.count()).toBe(2);
    expect(
      await db.cie10.findUnique({ where: { codigo: 'J00' } }),
    ).toMatchObject({ descripcion: 'Descripcion actualizada' });
    expect(() =>
      execFileSync(process.execPath, ['prisma/seed-cie10-demo.mjs'], {
        env: {
          ...process.env,
          DATABASE_URL: url.toString(),
          NODE_ENV: 'production',
        },
        timeout: 30000,
        stdio: 'pipe',
      }),
    ).toThrow();
  });
});
