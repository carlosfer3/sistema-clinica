import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Nursing vital signs (HTTP, mocked database)', () => {
  let app: INestApplication;
  let token: string;
  const actor = vi.fn();
  const findUnique = vi.fn();
  const findFirst = vi.fn();
  const create = vi.fn();
  const update = vi.fn();
  const audit = vi.fn();
  const lock = vi.fn();
  const tx = {
    $queryRaw: lock,
    cita: { findUnique, update },
    evaluacionPrevia: { create },
    bitacoraAuditoria: { create: audit },
  };
  const transaction = vi.fn(
    async (callback: (db: typeof tx) => Promise<unknown>) => callback(tx),
  );
  const now = new Date('2026-11-09T02:00:00Z');
  const appointment = {
    id: 12,
    fechaHoraInicio: new Date('2026-11-08T15:00:00Z'),
    estado: 'programada',
    modalidad: 'presencial',
    llegadaEn: new Date('2026-11-08T14:50:00Z'),
    preparacionCompletadaEn: null,
    evaluacionPrevia: null,
  };
  const body = {
    temperaturaC: 36.5,
    presionSistolica: 120,
    presionDiastolica: 80,
    frecuenciaCardiaca: 75,
    frecuenciaRespiratoria: 18,
    saturacionOxigeno: 98,
  };
  const evaluation = {
    id: 1,
    citaId: 12,
    registradoPor: 7,
    registradoEn: now.toISOString(),
    ...body,
  };
  const post = (data: object = body, id = '12') =>
    request(app.getHttpServer())
      .post(`/api/agenda/appointments/${id}/vital-signs`)
      .auth(token, { type: 'bearer' })
      .send(data);
  const get = () =>
    request(app.getHttpServer())
      .get('/api/agenda/appointments/12/vital-signs')
      .auth(token, { type: 'bearer' });
  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-only-secret-with-at-least-32-characters';
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        usuario: { findUnique: actor },
        cita: { findFirst },
        bitacoraAuditoria: { create: audit },
        $transaction: transaction,
      })
      .compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    token = await module
      .get(JwtService)
      .signAsync({ sub: 7, iat: Math.floor(now.getTime() / 1000) });
  });
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, 'now').mockReturnValue(now.getTime());
    actor.mockResolvedValue({ id: 7, rol: 'enfermeria', activo: true });
    findUnique.mockResolvedValue({ ...appointment });
    findFirst.mockResolvedValue({ evaluacionPrevia: evaluation });
    create.mockResolvedValue(evaluation);
    update.mockResolvedValue({});
    audit.mockResolvedValue({ id: 1 });
    lock.mockResolvedValue([{ id: 12 }]);
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await app?.close();
  });

  it('requires authentication for writing and reading', async () => {
    await request(app.getHttpServer())
      .post('/api/agenda/appointments/12/vital-signs')
      .send(body)
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/agenda/appointments/12/vital-signs')
      .expect(401);
    expect(transaction).not.toHaveBeenCalled();
    expect(findFirst).not.toHaveBeenCalled();
  });
  it.each([
    'admision',
    'medico',
    'laboratorio',
    'cajero',
    'gerencia',
    'paciente',
  ])('denies writing as %s', async (rol) => {
    actor.mockResolvedValue({ id: 7, rol, activo: true });
    await post().expect(403);
    expect(transaction).not.toHaveBeenCalled();
  });
  it.each([
    'admision',
    'enfermeria',
    'laboratorio',
    'cajero',
    'gerencia',
    'paciente',
  ])('denies reading as %s', async (rol) => {
    actor.mockResolvedValue({ id: 7, rol, activo: true });
    await get().expect(403);
    expect(findFirst).not.toHaveBeenCalled();
  });
  it.each(['0', '-1', 'abc', '1.5', '2147483648'])(
    'rejects invalid appointment id %s',
    async (id) => {
      await post(body, id).expect(400);
      expect(transaction).not.toHaveBeenCalled();
    },
  );
  it.each([
    { temperaturaC: '36.5' },
    { temperaturaC: null },
    { temperaturaC: 0 },
    { temperaturaC: 36.55 },
    { presionSistolica: -1 },
    { presionDiastolica: 80.5 },
    { frecuenciaCardiaca: 0 },
    { frecuenciaRespiratoria: 1001 },
    { saturacionOxigeno: 101 },
    { saturacionOxigeno: -1 },
    { pesoKg: -1 },
    { tallaCm: 0 },
    { observaciones: 'a'.repeat(1001) },
    { registradoPor: 99 },
    { registradoEn: '2026-11-08T10:00:00Z' },
    { pacienteId: 99 },
    { diagnostico: 'No autorizado' },
  ])('rejects invalid or unauthorized data %j', async (change) => {
    await post({ ...body, ...change }).expect(400);
    expect(transaction).not.toHaveBeenCalled();
  });
  it('rejects missing measurements', async () => {
    await post({}).expect(400);
    expect(transaction).not.toHaveBeenCalled();
  });
  it('rejects missing appointments', async () => {
    findUnique.mockResolvedValue(null);
    await post().expect(404);
    expect(create).not.toHaveBeenCalled();
  });
  it.each(['2026-11-08T04:59:59Z', '2026-11-09T05:00:00Z'])(
    'rejects appointments outside today in Lima: %s',
    async (start) => {
      findUnique.mockResolvedValue({
        ...appointment,
        fechaHoraInicio: new Date(start),
      });
      await post().expect(400);
      expect(create).not.toHaveBeenCalled();
    },
  );
  it.each([
    { llegadaEn: null },
    { llegadaEn: new Date('2026-11-09T03:00:00Z') },
    { preparacionCompletadaEn: now },
    { evaluacionPrevia: { id: 1 } },
    { estado: 'cancelada' },
    { estado: 'atendida' },
    { estado: 'no_asistio' },
    { modalidad: 'virtual' },
  ])('rejects a patient not waiting for preparation: %j', async (change) => {
    findUnique.mockResolvedValue({ ...appointment, ...change });
    await post().expect(409);
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
  it.each(['programada', 'confirmada', 'reprogramada'])(
    'saves evaluation for %s, records its author and completes preparation atomically',
    async (estado) => {
      findUnique.mockResolvedValue({ ...appointment, estado });
      await post({
        ...body,
        pesoKg: 65.5,
        tallaCm: 170,
        observaciones: 'Observacion ficticia',
      }).expect(201, evaluation);
      expect(create).toHaveBeenCalledWith({
        data: {
          citaId: 12,
          registradoPor: 7,
          registradoEn: now,
          ...body,
          pesoKg: 65.5,
          tallaCm: 170,
          observaciones: 'Observacion ficticia',
        },
      });
      expect(update).toHaveBeenCalledWith({
        where: { id: 12 },
        data: { preparacionCompletadaEn: now },
      });
      expect(audit).toHaveBeenCalledWith({
        data: {
          usuarioId: 7,
          accion: 'CREATE_VITAL_SIGNS',
          recurso: 'agenda/appointments/12/vital-signs',
          ipOrigen: expect.any(String),
        },
      });
      expect(transaction).toHaveBeenCalledOnce();
    },
  );
  it('allows the assigned doctor to read measurements using an ownership filter', async () => {
    actor.mockResolvedValue({ id: 7, rol: 'medico', activo: true });
    await get().expect(200, evaluation);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 12, medico: { usuarioId: 7 } } }),
    );
    expect(audit.mock.invocationCallOrder[0]).toBeLessThan(
      findFirst.mock.invocationCallOrder[0],
    );
  });
  it('returns 404 when there is no evaluation accessible to the doctor', async () => {
    actor.mockResolvedValue({ id: 7, rol: 'medico', activo: true });
    findFirst.mockResolvedValueOnce(null);
    await get().expect(404);
    findFirst.mockResolvedValueOnce({ evaluacionPrevia: null });
    await get().expect(404);
  });
  it('does not read clinical measurements if auditing fails', async () => {
    actor.mockResolvedValue({ id: 7, rol: 'medico', activo: true });
    audit.mockRejectedValueOnce(new Error('Audit unavailable'));
    await get().expect(500);
    expect(findFirst).not.toHaveBeenCalled();
  });
});
