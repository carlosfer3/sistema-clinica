import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Reservations (HTTP, mocked database)', () => {
  let app: INestApplication;
  let token: string;
  const actor = vi.fn();
  const doctor = vi.fn();
  const patient = vi.fn();
  const schedules = vi.fn();
  const overlap = vi.fn();
  const create = vi.fn();
  const audit = vi.fn();
  const lock = vi.fn();
  const tx = {
    $queryRaw: lock,
    medico: { findFirst: doctor },
    paciente: { findUnique: patient },
    horarioMedico: { findMany: schedules },
    cita: { findFirst: overlap, create },
    bitacoraAuditoria: { create: audit },
  };
  const transaction = vi.fn(
    async (callback: (db: typeof tx) => Promise<unknown>) => callback(tx),
  );
  const body = {
    pacienteId: 1,
    medicoId: 2,
    inicio: '2099-01-09T08:00:00-05:00',
  };
  const post = (data: object = body) =>
    request(app.getHttpServer())
      .post('/api/agenda/appointments')
      .auth(token, { type: 'bearer' })
      .send(data);

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-only-secret-with-at-least-32-characters';
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        usuario: { findUnique: actor },
        bitacoraAuditoria: { create: audit },
        $transaction: transaction,
      })
      .compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    token = await module.get(JwtService).signAsync({ sub: 7 });
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    actor.mockResolvedValue({ id: 7, rol: 'admision', activo: true });
    doctor.mockResolvedValue({ id: 2 });
    patient.mockResolvedValue({ id: 1 });
    lock.mockResolvedValue([{ id: 2 }]);
    audit.mockResolvedValue({ id: 1 });
    overlap.mockResolvedValue(null);
    schedules.mockResolvedValue([
      {
        horaInicio: new Date('1970-01-01T08:00:00Z'),
        horaFin: new Date('1970-01-01T09:10:00Z'),
        duracionCitaMin: 20,
      },
    ]);
    create.mockResolvedValue({ id: 12, estado: 'programada' });
  });

  it('requires an admission account', async () => {
    await request(app.getHttpServer())
      .post('/api/agenda/appointments')
      .send(body)
      .expect(401);
    actor.mockResolvedValue({ id: 7, rol: 'medico', activo: true });
    await post().expect(403);
    expect(transaction).not.toHaveBeenCalled();
  });

  it.each([
    { inicio: '2099-02-30T08:00:00Z' },
    { inicio: '2099-01-09T08:00:00' },
    { inicio: '2099-01-09T08:00:01-05:00' },
    { pacienteId: '1' },
    { medicoId: 0 },
    { canalOrigen: 'portal' },
    { estado: 'confirmada' },
    { fechaHoraFin: '2099-01-09T09:00:00Z' },
  ])('rejects invalid input %j', async (change) => {
    await post({ ...body, ...change }).expect(400);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('computes duration and creator on the server, and audits inside the transaction', async () => {
    await post({
      ...body,
      inicio: '2099-01-09T13:00:00Z',
      canalOrigen: 'telefono',
    }).expect(201);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          pacienteId: 1,
          medicoId: 2,
          fechaHoraInicio: new Date('2099-01-09T13:00:00Z'),
          fechaHoraFin: new Date('2099-01-09T13:20:00Z'),
          creadoPor: 7,
          motivo: undefined,
          canalOrigen: 'telefono',
          modalidad: 'presencial',
        },
      }),
    );
    expect(schedules).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { medicoId: 2, diaSemana: 5, consultorio: { activo: true } },
      }),
    );
    expect(audit).toHaveBeenCalledWith({
      data: {
        usuarioId: 7,
        accion: 'CREATE_CITA',
        recurso: 'agenda/appointments/12',
        ipOrigen: expect.any(String),
      },
    });
  });

  it('returns 409 for occupied slots without inserting another appointment', async () => {
    overlap.mockResolvedValue({ id: 3 });
    await post().expect(409);
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects unknown patients and inactive or unknown doctors', async () => {
    doctor.mockResolvedValueOnce(null);
    await post().expect(404);
    patient.mockResolvedValueOnce(null);
    await post().expect(404);
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    '2099-01-09T08:01:00-05:00',
    '2099-01-09T09:00:00-05:00',
    '2000-01-01T08:00:00-05:00',
  ])('rejects incomplete, unaligned or past slots: %s', async (inicio) => {
    await post({ ...body, inicio }).expect(400);
    expect(create).not.toHaveBeenCalled();
  });
});
