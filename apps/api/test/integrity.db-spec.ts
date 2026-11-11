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
  let nurseToken: string;
  let patientId: number;
  let doctorId: number;
  let doctorUserId: number;
  let consultingRoomId: number;
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
    await db.usuario.create({
      data: {
        username: 'nurse-test',
        passwordHash,
        rol: 'enfermeria',
        nombres: 'Enfermeria',
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
    const room = await db.consultorio.create({
      data: { nombre: 'Consultorio ficticio' },
    });
    consultingRoomId = room.id;
    process.env.JWT_SECRET = 'isolated-db-test-secret-at-least-32-characters';
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(db)
      .compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    for (const username of ['admission-test', 'doctor-test', 'nurse-test']) {
      const response = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username, password: 'fictitious-test-password' })
        .expect(200);
      if (username === 'admission-test')
        admissionToken = response.body.accessToken;
      else if (username === 'doctor-test')
        doctorToken = response.body.accessToken;
      else nurseToken = response.body.accessToken;
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

  it.each([
    { antecedentes: [{ tipo: 'cronica', descripcion: 'Dato ficticio' }] },
    { alergias: [{ sustancia: 'Sustancia ficticia' }] },
  ])(
    'rejects clinical data at registration without writing anything: %j',
    async (clinical) => {
      const before = await db.paciente.count();
      const audits = await db.bitacoraAuditoria.count({
        where: { accion: 'CREATE_PATIENT' },
      });
      await request(app.getHttpServer())
        .post('/api/patients')
        .auth(admissionToken, { type: 'bearer' })
        .send({ ...patient, numeroDocumento: '12345678', ...clinical })
        .expect(400);
      expect(await db.paciente.count()).toBe(before);
      expect(await db.antecedente.count()).toBe(0);
      expect(await db.alergia.count()).toBe(0);
      expect(
        await db.bitacoraAuditoria.count({
          where: { accion: 'CREATE_PATIENT' },
        }),
      ).toBe(audits);
    },
  );

  it('rejects duplicate documents and identifies the existing patient', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/patients')
      .set('Authorization', `Bearer ${admissionToken}`)
      .send(patient)
      .expect(409);
    expect(response.body.patientId).toBe(patientId);
    expect(await db.paciente.count()).toBe(1);
  });

  it('searches only by exact DNI without disclosing clinical fields', async () => {
    for (const q of ['87654321', ' 87654321 ']) {
      const response = await request(app.getHttpServer())
        .get(`/api/patients?${new URLSearchParams({ q })}`)
        .set('Authorization', `Bearer ${admissionToken}`)
        .expect(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].id).toBe(patientId);
      expect(response.body[0]).not.toHaveProperty('alergias');
    }
  });

  it('does not return another document type or a partial/name match', async () => {
    await db.paciente.create({
      data: {
        ...patient,
        tipoDocumento: 'CE',
        numeroDocumento: '12345678',
        fechaNacimiento: new Date(patient.fechaNacimiento),
      },
    });
    const result = await request(app.getHttpServer())
      .get('/api/patients?q=12345678')
      .auth(admissionToken, { type: 'bearer' })
      .expect(200);
    expect(result.body).toEqual([]);
    for (const q of ['8765', 'ficticio', 'prueba']) {
      await request(app.getHttpServer())
        .get(`/api/patients?q=${q}`)
        .auth(admissionToken, { type: 'bearer' })
        .expect(400);
    }
  });

  it('allows a doctor to read existing clinical data and denies admission', async () => {
    await db.antecedente.create({
      data: {
        pacienteId: patientId,
        tipo: 'cronica',
        descripcion: 'Antecedente ficticio',
      },
    });
    await db.alergia.create({
      data: { pacienteId: patientId, sustancia: 'Sustancia ficticia' },
    });
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

  it('denies nursing clinical access, audits the denial and still allows demographics', async () => {
    const profilePath = `/api/patients/${patientId}/clinical-profile`;
    const reads = await db.bitacoraAuditoria.count({
      where: { accion: 'READ_CLINICAL_PROFILE' },
    });
    const response = await request(app.getHttpServer())
      .get(profilePath)
      .auth(nurseToken, { type: 'bearer' })
      .expect(403);
    expect(response.body).not.toHaveProperty('antecedentes');
    expect(response.body).not.toHaveProperty('alergias');
    expect(
      await db.bitacoraAuditoria.count({
        where: { accion: 'READ_CLINICAL_PROFILE' },
      }),
    ).toBe(reads);
    expect(
      await db.bitacoraAuditoria.count({
        where: {
          accion: 'ACCESS_DENIED',
          recurso: { contains: 'clinical-profile' },
          usuario: { username: 'nurse-test' },
        },
      }),
    ).toBeGreaterThan(0);
    const demographics = await request(app.getHttpServer())
      .get(`/api/patients/${patientId}`)
      .auth(nurseToken, { type: 'bearer' })
      .expect(200);
    expect(demographics.body.id).toBe(patientId);
    expect(demographics.body).not.toHaveProperty('antecedentes');
    expect(demographics.body).not.toHaveProperty('alergias');
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

  it('reserves exactly once under concurrent HTTP requests and removes the occupied slot', async () => {
    await db.horarioMedico.create({
      data: {
        medicoId: doctorId,
        consultorioId: consultingRoomId,
        diaSemana: 5,
        horaInicio: new Date('1970-01-01T08:00:00Z'),
        horaFin: new Date('1970-01-01T09:10:00Z'),
        duracionCitaMin: 20,
      },
    });
    const body = {
      pacienteId: patientId,
      medicoId: doctorId,
      inicio: '2099-01-09T08:00:00-05:00',
    };
    const reserve = () =>
      request(app.getHttpServer())
        .post('/api/agenda/appointments')
        .auth(admissionToken, { type: 'bearer' })
        .send(body);
    const results = await Promise.all([reserve(), reserve()]);
    expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([
      201, 409,
    ]);
    const created = results.find((r) => r.status === 201)!.body;
    expect(created).toMatchObject({
      pacienteId: patientId,
      medicoId: doctorId,
      fechaHoraInicio: '2099-01-09T13:00:00.000Z',
      fechaHoraFin: '2099-01-09T13:20:00.000Z',
      estado: 'programada',
      canalOrigen: 'presencial',
    });
    expect(
      await db.cita.count({
        where: { medicoId: doctorId, fechaHoraInicio: new Date(body.inicio) },
      }),
    ).toBe(1);
    expect(
      await db.bitacoraAuditoria.count({
        where: {
          accion: 'CREATE_CITA',
          recurso: `agenda/appointments/${created.id}`,
        },
      }),
    ).toBe(1);
    const doctor = await db.medico.findUniqueOrThrow({
      where: { id: doctorId },
    });
    const available = await request(app.getHttpServer())
      .get(
        `/api/agenda/availability?fecha=2099-01-09&especialidadId=${doctor.especialidadId}`,
      )
      .auth(admissionToken, { type: 'bearer' })
      .expect(200);
    expect(
      available.body.turnos.map((s: { inicio: string }) => s.inicio),
    ).toEqual(['2099-01-09T13:20:00.000Z', '2099-01-09T13:40:00.000Z']);
    await db.cita.update({
      where: { id: created.id },
      data: { estado: 'cancelada' },
    });
    await reserve().expect(201);
  });

  it('lists only eligible doctors in the scheduling catalog', async () => {
    const doctor = await db.medico.findUniqueOrThrow({
      where: { id: doctorId },
    });
    const getCatalog = () =>
      request(app.getHttpServer())
        .get('/api/agenda/catalog')
        .auth(admissionToken, { type: 'bearer' });
    const response = await getCatalog().expect(200);
    expect(response.body).toEqual({
      especialidades: [
        {
          id: doctor.especialidadId,
          nombre: 'Especialidad ficticia',
          medicos: [{ id: doctorId, nombres: 'Medico', apellidos: 'Prueba' }],
        },
      ],
    });
    await db.usuario.update({
      where: { id: doctorUserId },
      data: { activo: false },
    });
    try {
      await getCatalog().expect(200, { especialidades: [] });
    } finally {
      await db.usuario.update({
        where: { id: doctorUserId },
        data: { activo: true },
      });
    }
    await db.consultorio.update({
      where: { id: consultingRoomId },
      data: { activo: false },
    });
    try {
      await getCatalog().expect(200, { especialidades: [] });
    } finally {
      await db.consultorio.update({
        where: { id: consultingRoomId },
        data: { activo: true },
      });
    }
  });

  it('validates reservation roles, exact slots, dates, patient and active resources', async () => {
    const body = {
      pacienteId: patientId,
      medicoId: doctorId,
      inicio: '2099-01-09T08:20:00-05:00',
    };
    const post = (data: object) =>
      request(app.getHttpServer())
        .post('/api/agenda/appointments')
        .auth(admissionToken, { type: 'bearer' })
        .send(data);
    await request(app.getHttpServer())
      .post('/api/agenda/appointments')
      .send(body)
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/agenda/appointments')
      .auth(doctorToken, { type: 'bearer' })
      .send(body)
      .expect(403);
    for (const change of [
      { inicio: '2099-01-09T08:21:00-05:00' },
      { inicio: '2099-01-09T09:00:00-05:00' },
      { inicio: '2099-01-09T08:20:01-05:00' },
      { inicio: '2099-01-09T08:20:00' },
      { inicio: '2099-02-30T08:20:00Z' },
      { inicio: '2000-01-01T08:20:00Z' },
      { estado: 'confirmada' },
      { canalOrigen: 'portal' },
      { medicoId: '1' },
    ])
      await post({ ...body, ...change }).expect(400);
    await post({ ...body, pacienteId: 2147483647 }).expect(404);
    await post({ ...body, medicoId: 2147483647 }).expect(404);
    await db.usuario.update({
      where: { id: doctorUserId },
      data: { activo: false },
    });
    try {
      await post(body).expect(404);
    } finally {
      await db.usuario.update({
        where: { id: doctorUserId },
        data: { activo: true },
      });
    }
    await db.consultorio.update({
      where: { id: consultingRoomId },
      data: { activo: false },
    });
    try {
      await post(body).expect(400);
    } finally {
      await db.consultorio.update({
        where: { id: consultingRoomId },
        data: { activo: true },
      });
    }
  });

  it('rolls back the reservation if its audit insert fails', async () => {
    await db.$executeRawUnsafe(
      `CREATE FUNCTION reject_booking_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.accion = 'CREATE_CITA' THEN RAISE EXCEPTION 'Test audit failure'; END IF; RETURN NEW; END; $$`,
    );
    await db.$executeRawUnsafe(
      'CREATE TRIGGER test_booking_audit BEFORE INSERT ON bitacora_auditoria FOR EACH ROW EXECUTE FUNCTION reject_booking_audit()',
    );
    const inicio = '2099-01-09T08:20:00-05:00';
    try {
      await request(app.getHttpServer())
        .post('/api/agenda/appointments')
        .auth(admissionToken, { type: 'bearer' })
        .send({ pacienteId: patientId, medicoId: doctorId, inicio })
        .expect(500);
      expect(
        await db.cita.count({
          where: { medicoId: doctorId, fechaHoraInicio: new Date(inicio) },
        }),
      ).toBe(0);
    } finally {
      await db.$executeRawUnsafe(
        'DROP TRIGGER test_booking_audit ON bitacora_auditoria',
      );
      await db.$executeRawUnsafe('DROP FUNCTION reject_booking_audit()');
    }
  });

  it('registers concurrent arrivals once and rolls back an arrival if auditing fails', async () => {
    const now = new Date();
    const localDate = new Date(now.getTime() - 5 * 3600000)
      .toISOString()
      .slice(0, 10);
    const start = new Date(`${localDate}T10:00:00-05:00`);
    const data = {
      pacienteId: patientId,
      medicoId: doctorId,
      creadoPor: doctorUserId,
      fechaHoraInicio: start,
      fechaHoraFin: new Date(start.getTime() + 20 * 60000),
    };
    const first = await db.cita.create({ data });
    const path = `/api/agenda/appointments/${first.id}/arrival`;
    const results = await Promise.all([
      request(app.getHttpServer())
        .post(path)
        .auth(admissionToken, { type: 'bearer' }),
      request(app.getHttpServer())
        .post(path)
        .auth(admissionToken, { type: 'bearer' }),
    ]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(results[0].body.llegadaEn).toBe(results[1].body.llegadaEn);
    expect(results[0].body.estado).toBe('programada');
    expect(
      await db.bitacoraAuditoria.count({
        where: {
          accion: 'REGISTER_ARRIVAL',
          recurso: `agenda/appointments/${first.id}`,
        },
      }),
    ).toBe(1);
    const second = await db.cita.create({
      data: {
        ...data,
        fechaHoraInicio: data.fechaHoraFin,
        fechaHoraFin: new Date(start.getTime() + 40 * 60000),
      },
    });
    await db.$executeRawUnsafe(
      `CREATE FUNCTION reject_arrival_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.accion = 'REGISTER_ARRIVAL' THEN RAISE EXCEPTION 'Test audit failure'; END IF; RETURN NEW; END; $$`,
    );
    await db.$executeRawUnsafe(
      'CREATE TRIGGER test_arrival_audit BEFORE INSERT ON bitacora_auditoria FOR EACH ROW EXECUTE FUNCTION reject_arrival_audit()',
    );
    try {
      await request(app.getHttpServer())
        .post(`/api/agenda/appointments/${second.id}/arrival`)
        .auth(admissionToken, { type: 'bearer' })
        .expect(500);
      expect(
        await db.cita.findUnique({ where: { id: second.id } }),
      ).toMatchObject({ llegadaEn: null, estado: 'programada' });
      expect(
        await db.bitacoraAuditoria.count({
          where: {
            accion: 'REGISTER_ARRIVAL',
            recurso: `agenda/appointments/${second.id}`,
          },
        }),
      ).toBe(0);
    } finally {
      await db.$executeRawUnsafe(
        'DROP TRIGGER test_arrival_audit ON bitacora_auditoria',
      );
      await db.$executeRawUnsafe('DROP FUNCTION reject_arrival_audit()');
    }
  });

  it('lists only arrived, pending, in-person appointments for today without clinical data', async () => {
    const now = new Date();
    const date = new Date(now.getTime() - 5 * 3600000)
      .toISOString()
      .slice(0, 10);
    const start = new Date(`${date}T12:00:00-05:00`);
    const make = async (offset: number, extra: object = {}) =>
      db.cita.create({
        data: {
          pacienteId: patientId,
          medicoId: doctorId,
          creadoPor: doctorUserId,
          fechaHoraInicio: new Date(start.getTime() + offset * 60000),
          fechaHoraFin: new Date(start.getTime() + (offset + 20) * 60000),
          llegadaEn: now,
          ...extra,
        },
      });
    const pending = await make(0);
    const excluded = await Promise.all([
      make(20, { llegadaEn: null }),
      make(40, { estado: 'cancelada' }),
      make(60, { estado: 'atendida' }),
      make(80, { preparacionCompletadaEn: now }),
      make(100, { modalidad: 'virtual' }),
      make(120, { estado: 'no_asistio' }),
      make(1440),
      make(-1440),
    ]);
    const response = await request(app.getHttpServer())
      .get('/api/agenda/nursing-queue?limite=100')
      .auth(nurseToken, { type: 'bearer' })
      .expect(200);
    const ids = response.body.pacientes.map(
      (item: { citaId: number }) => item.citaId,
    );
    expect(ids).toContain(pending.id);
    for (const appointment of excluded)
      expect(ids).not.toContain(appointment.id);
    const entry = response.body.pacientes.find(
      (item: { citaId: number }) => item.citaId === pending.id,
    );
    expect(Object.keys(entry.paciente).sort()).toEqual(
      [
        'id',
        'tipoDocumento',
        'numeroDocumento',
        'nombres',
        'apellidos',
        'edad',
      ].sort(),
    );
    expect(entry.estadoPreparacion).toBe('pendiente');
    expect(JSON.stringify(response.body)).not.toContain('Antecedente ficticio');
    expect(JSON.stringify(response.body)).not.toContain('Sustancia ficticia');
    const completed = excluded[3];
    await expect(
      db.cita.update({
        where: { id: completed.id },
        data: { llegadaEn: null },
      }),
    ).rejects.toThrow();
    await expect(
      db.cita.update({
        where: { id: pending.id },
        data: { preparacionCompletadaEn: new Date(now.getTime() - 1000) },
      }),
    ).rejects.toThrow();
  });

  it('records vital signs once, removes the patient from the queue and rolls back on audit failure', async () => {
    const now = new Date();
    const date = new Date(now.getTime() - 5 * 3600000)
      .toISOString()
      .slice(0, 10);
    const start = new Date(`${date}T16:00:00-05:00`);
    const data = {
      pacienteId: patientId,
      medicoId: doctorId,
      creadoPor: doctorUserId,
      fechaHoraInicio: start,
      fechaHoraFin: new Date(start.getTime() + 20 * 60000),
      llegadaEn: now,
    };
    const appointment = await db.cita.create({ data });
    const measurements = {
      temperaturaC: 36.5,
      presionSistolica: 120,
      presionDiastolica: 80,
      frecuenciaCardiaca: 75,
      frecuenciaRespiratoria: 18,
      saturacionOxigeno: 98,
      observaciones: 'Observacion ficticia',
    };
    const path = `/api/agenda/appointments/${appointment.id}/vital-signs`;
    const results = await Promise.all([
      request(app.getHttpServer())
        .post(path)
        .auth(nurseToken, { type: 'bearer' })
        .send(measurements),
      request(app.getHttpServer())
        .post(path)
        .auth(nurseToken, { type: 'bearer' })
        .send(measurements),
    ]);
    expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([
      201, 409,
    ]);
    const evaluation = await db.evaluacionPrevia.findUniqueOrThrow({
      where: { citaId: appointment.id },
      include: { autor: true },
    });
    expect(evaluation).toMatchObject(measurements);
    expect(evaluation.autor.username).toBe('nurse-test');
    const completed = await db.cita.findUniqueOrThrow({
      where: { id: appointment.id },
    });
    expect(completed.preparacionCompletadaEn).toEqual(evaluation.registradoEn);
    expect(completed.estado).toBe('programada');
    expect(
      await db.bitacoraAuditoria.count({
        where: {
          accion: 'CREATE_VITAL_SIGNS',
          recurso: `agenda/appointments/${appointment.id}/vital-signs`,
        },
      }),
    ).toBe(1);
    const queue = await request(app.getHttpServer())
      .get('/api/agenda/nursing-queue?limite=100')
      .auth(nurseToken, { type: 'bearer' })
      .expect(200);
    expect(
      queue.body.pacientes.map((item: { citaId: number }) => item.citaId),
    ).not.toContain(appointment.id);
    const medical = await request(app.getHttpServer())
      .get(path)
      .auth(doctorToken, { type: 'bearer' })
      .expect(200);
    expect(medical.body.temperaturaC).toBe(36.5);
    expect(medical.body.autor).not.toHaveProperty('passwordHash');
    await request(app.getHttpServer())
      .get(path)
      .auth(nurseToken, { type: 'bearer' })
      .expect(403);
    await request(app.getHttpServer())
      .get(path)
      .auth(admissionToken, { type: 'bearer' })
      .expect(403);
    await expect(
      db.evaluacionPrevia.update({
        where: { id: evaluation.id },
        data: { temperaturaC: 37 },
      }),
    ).rejects.toThrow();
    await expect(
      db.evaluacionPrevia.delete({ where: { id: evaluation.id } }),
    ).rejects.toThrow();
    const waiting = await db.cita.create({
      data: {
        ...data,
        fechaHoraInicio: data.fechaHoraFin,
        fechaHoraFin: new Date(start.getTime() + 40 * 60000),
      },
    });
    await db.$executeRawUnsafe(
      `CREATE FUNCTION reject_vitals_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.accion = 'CREATE_VITAL_SIGNS' THEN RAISE EXCEPTION 'Test audit failure'; END IF; RETURN NEW; END; $$`,
    );
    await db.$executeRawUnsafe(
      'CREATE TRIGGER test_vitals_audit BEFORE INSERT ON bitacora_auditoria FOR EACH ROW EXECUTE FUNCTION reject_vitals_audit()',
    );
    try {
      await request(app.getHttpServer())
        .post(`/api/agenda/appointments/${waiting.id}/vital-signs`)
        .auth(nurseToken, { type: 'bearer' })
        .send(measurements)
        .expect(500);
      expect(
        await db.evaluacionPrevia.count({ where: { citaId: waiting.id } }),
      ).toBe(0);
      expect(
        await db.cita.findUnique({ where: { id: waiting.id } }),
      ).toMatchObject({ preparacionCompletadaEn: null, estado: 'programada' });
    } finally {
      await db.$executeRawUnsafe(
        'DROP TRIGGER test_vitals_audit ON bitacora_auditoria',
      );
      await db.$executeRawUnsafe('DROP FUNCTION reject_vitals_audit()');
    }
  });

  it('lists only today appointments for admission with filtering and no clinical fields', async () => {
    const date = new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
    const start = new Date(`${date}T19:00:00-05:00`);
    const make = (offset: number) =>
      db.cita.create({
        data: {
          pacienteId: patientId,
          medicoId: doctorId,
          creadoPor: doctorUserId,
          estado: 'confirmada',
          fechaHoraInicio: new Date(start.getTime() + offset),
          fechaHoraFin: new Date(start.getTime() + offset + 20 * 60000),
        },
      });
    const today = await make(0);
    const yesterday = await make(-86400000);
    const tomorrow = await make(86400000);
    const response = await request(app.getHttpServer())
      .get(
        `/api/agenda/appointments?medicoId=${doctorId}&estado=confirmada&limite=100`,
      )
      .auth(admissionToken, { type: 'bearer' })
      .expect(200);
    const ids = response.body.citas.map((item: { id: number }) => item.id);
    expect(ids).toContain(today.id);
    expect(ids).not.toContain(yesterday.id);
    expect(ids).not.toContain(tomorrow.id);
    for (const selected of [yesterday, tomorrow]) {
      const fecha = new Date(selected.fechaHoraInicio.getTime() - 5 * 3600000)
        .toISOString()
        .slice(0, 10);
      const filtered = await request(app.getHttpServer())
        .get(
          `/api/agenda/appointments?fecha=${fecha}&medicoId=${doctorId}&estado=confirmada&limite=100`,
        )
        .auth(admissionToken, { type: 'bearer' })
        .expect(200);
      expect(filtered.body.fecha).toBe(fecha);
      expect(
        filtered.body.citas.map((item: { id: number }) => item.id),
      ).toContain(selected.id);
      expect(
        filtered.body.citas.map((item: { id: number }) => item.id),
      ).not.toContain(today.id);
      await request(app.getHttpServer())
        .post(`/api/agenda/appointments/${selected.id}/arrival`)
        .auth(admissionToken, { type: 'bearer' })
        .send({})
        .expect(400);
    }
    const entry = response.body.citas.find(
      (item: { id: number }) => item.id === today.id,
    );
    expect(entry.estado).toBe('confirmada');
    expect(entry.llegadaEn).toBeNull();
    expect(Object.keys(entry.paciente).sort()).toEqual(
      ['id', 'tipoDocumento', 'numeroDocumento', 'nombres', 'apellidos'].sort(),
    );
    expect(entry).not.toHaveProperty('motivo');
    expect(entry).not.toHaveProperty('evaluacionPrevia');
  });

  const time = (value: string) => new Date(`1970-01-01T${value}:00.000Z`);

  it('stores weekly local schedules with a default duration and accepts adjacent blocks', async () => {
    const data = {
      medicoId: doctorId,
      consultorioId: consultingRoomId,
      diaSemana: 1,
      horaInicio: time('09:00'),
      horaFin: time('12:00'),
    };
    const schedule = await db.horarioMedico.create({ data });
    expect(schedule.duracionCitaMin).toBe(20);
    expect(schedule.horaInicio.toISOString()).toBe('1970-01-01T09:00:00.000Z');
    await expect(
      db.horarioMedico.create({
        data: {
          ...data,
          horaInicio: time('12:00'),
          horaFin: time('13:00'),
          duracionCitaMin: 30,
        },
      }),
    ).resolves.toBeDefined();
    await expect(
      db.horarioMedico.create({ data: { ...data, diaSemana: 7 } }),
    ).resolves.toBeDefined();
  });

  it('rejects invalid days, reversed intervals, seconds and durations that do not fit', async () => {
    const data = {
      medicoId: doctorId,
      consultorioId: consultingRoomId,
      diaSemana: 2,
      horaInicio: time('09:00'),
      horaFin: time('10:00'),
      duracionCitaMin: 20,
    };
    const invalid = [
      { diaSemana: 0 },
      { diaSemana: 8 },
      { horaFin: time('09:00') },
      { horaFin: time('08:00') },
      { horaInicio: new Date('1970-01-01T09:00:01.000Z') },
      { horaFin: new Date('1970-01-01T10:00:01.000Z') },
      { duracionCitaMin: 0 },
      { duracionCitaMin: -1 },
      { duracionCitaMin: 61 },
    ];
    for (const change of invalid) {
      await expect(
        db.horarioMedico.create({ data: { ...data, ...change } }),
      ).rejects.toThrow();
    }
    await expect(db.$executeRaw`
      INSERT INTO horario_medico (medico_id, consultorio_id, dia_semana, hora_inicio, hora_fin)
      VALUES (${doctorId}, ${consultingRoomId}, 2, time '23:00', time '24:00')
    `).rejects.toThrow();
    expect(await db.horarioMedico.count({ where: { diaSemana: 2 } })).toBe(0);
  });

  it('rejects doctor overlaps across rooms and room overlaps across doctors', async () => {
    const otherRoom = await db.consultorio.create({
      data: { nombre: 'Consultorio alterno' },
    });
    const otherDoctor = await db.medico.create({
      data: {
        cmp: 'TEST0002',
        especialidad: {
          connect: {
            id: (await db.medico.findUniqueOrThrow({ where: { id: doctorId } }))
              .especialidadId,
          },
        },
        usuario: {
          create: {
            username: 'other-doctor-test',
            passwordHash: await hash('fictitious-test-password', 4),
            rol: 'medico',
            nombres: 'Otro',
            apellidos: 'Ficticio',
          },
        },
      },
    });
    const data = {
      medicoId: doctorId,
      consultorioId: consultingRoomId,
      diaSemana: 3,
      horaInicio: time('09:00'),
      horaFin: time('12:00'),
    };
    await db.horarioMedico.create({ data });
    await expect(
      db.horarioMedico.create({
        data: {
          ...data,
          consultorioId: otherRoom.id,
          horaInicio: time('10:00'),
          horaFin: time('13:00'),
        },
      }),
    ).rejects.toThrow();
    await expect(
      db.horarioMedico.create({
        data: {
          ...data,
          medicoId: otherDoctor.id,
          horaInicio: time('10:00'),
          horaFin: time('13:00'),
        },
      }),
    ).rejects.toThrow();
    await expect(
      db.horarioMedico.create({
        data: {
          ...data,
          medicoId: otherDoctor.id,
          consultorioId: otherRoom.id,
        },
      }),
    ).resolves.toBeDefined();
  });

  it('allows only one concurrent allocation of the same weekly block', async () => {
    const data = {
      medicoId: doctorId,
      consultorioId: consultingRoomId,
      diaSemana: 4,
      horaInicio: time('09:00'),
      horaFin: time('12:00'),
    };
    const results = await Promise.allSettled([
      db.horarioMedico.create({ data }),
      db.horarioMedico.create({ data }),
    ]);
    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
  });
});
