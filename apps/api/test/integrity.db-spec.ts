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
