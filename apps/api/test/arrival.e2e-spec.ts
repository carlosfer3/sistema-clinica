import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Arrival registration (HTTP, mocked database)', () => {
  let app: INestApplication;
  let token: string;
  const actor = vi.fn();
  const findUnique = vi.fn();
  const update = vi.fn();
  const audit = vi.fn();
  const lock = vi.fn();
  const tx = {
    $queryRaw: lock,
    cita: { findUnique, update },
    bitacoraAuditoria: { create: audit },
  };
  const transaction = vi.fn(
    async (callback: (db: typeof tx) => Promise<unknown>) => callback(tx),
  );
  // UTC November 9 is still November 8 in Lima.
  const now = new Date('2026-11-09T02:00:00Z');
  const appointment = {
    id: 12,
    fechaHoraInicio: new Date('2026-11-08T15:00:00Z'),
    estado: 'programada',
    modalidad: 'presencial',
    llegadaEn: null,
  };
  const post = (id: string = '12') =>
    request(app.getHttpServer())
      .post(`/api/agenda/appointments/${id}/arrival`)
      .auth(token, { type: 'bearer' });

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
    token = await module
      .get(JwtService)
      .signAsync({ sub: 7 }, { expiresIn: '100y' });
  });
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, 'now').mockReturnValue(now.getTime());
    actor.mockResolvedValue({ id: 7, rol: 'admision', activo: true });
    findUnique.mockResolvedValue({ ...appointment });
    lock.mockResolvedValue([{ id: 12 }]);
    audit.mockResolvedValue({ id: 1 });
    update.mockResolvedValue({ id: 12, estado: 'programada', llegadaEn: now });
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await app?.close();
  });

  it('requires authentication', async () => {
    await request(app.getHttpServer())
      .post('/api/agenda/appointments/12/arrival')
      .expect(401);
    expect(transaction).not.toHaveBeenCalled();
  });
  it.each([
    'medico',
    'enfermeria',
    'laboratorio',
    'cajero',
    'gerencia',
    'paciente',
  ])('denies %s', async (rol) => {
    actor.mockResolvedValue({ id: 7, rol, activo: true });
    await post().expect(403);
    expect(transaction).not.toHaveBeenCalled();
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ accion: 'ACCESS_DENIED' }),
      }),
    );
  });
  it.each(['0', '-1', 'abc', '1.5', '2147483648'])(
    'rejects invalid id %s',
    async (id) => {
      await post(id).expect(400);
      expect(transaction).not.toHaveBeenCalled();
    },
  );
  it('rejects client-supplied timestamps, actors and states', async () => {
    await post()
      .send({ llegadaEn: now.toISOString(), usuarioId: 99, estado: 'atendida' })
      .expect(400);
    expect(transaction).not.toHaveBeenCalled();
  });
  it('returns 404 for a missing appointment', async () => {
    findUnique.mockResolvedValue(null);
    await post().expect(404);
    expect(update).not.toHaveBeenCalled();
  });
  it.each(['programada', 'confirmada', 'reprogramada'])(
    'registers arrival for %s using Lima date without changing state',
    async (estado) => {
      findUnique.mockResolvedValue({ ...appointment, estado });
      update.mockResolvedValue({ id: 12, estado, llegadaEn: now });
      await post().expect(200, {
        id: 12,
        estado,
        llegadaEn: now.toISOString(),
      });
      expect(update).toHaveBeenCalledWith({
        where: { id: 12 },
        data: { llegadaEn: now },
        select: { id: true, estado: true, llegadaEn: true },
      });
      expect(audit).toHaveBeenCalledWith({
        data: {
          usuarioId: 7,
          accion: 'REGISTER_ARRIVAL',
          recurso: 'agenda/appointments/12',
          ipOrigen: expect.any(String),
        },
      });
    },
  );
  it.each(['2026-11-08T04:59:59Z', '2026-11-09T05:00:00Z'])(
    'rejects dates outside today in Lima: %s',
    async (start) => {
      findUnique.mockResolvedValue({
        ...appointment,
        fechaHoraInicio: new Date(start),
      });
      await post().expect(400);
      expect(update).not.toHaveBeenCalled();
      expect(audit).not.toHaveBeenCalled();
    },
  );
  it.each(['2026-11-08T05:00:00Z', '2026-11-09T04:59:59Z'])(
    'accepts the boundaries of today in Lima: %s',
    async (start) => {
      findUnique.mockResolvedValue({
        ...appointment,
        fechaHoraInicio: new Date(start),
      });
      await post().expect(200);
    },
  );
  it.each(['cancelada', 'atendida', 'no_asistio'])(
    'rejects state %s',
    async (estado) => {
      findUnique.mockResolvedValue({ ...appointment, estado });
      await post().expect(409);
      expect(update).not.toHaveBeenCalled();
    },
  );
  it('rejects virtual appointments', async () => {
    findUnique.mockResolvedValue({ ...appointment, modalidad: 'virtual' });
    await post().expect(409);
    expect(update).not.toHaveBeenCalled();
  });
  it('preserves the first arrival and does not duplicate its audit on retry', async () => {
    const first = new Date('2026-11-08T14:50:00Z');
    findUnique.mockResolvedValue({ ...appointment, llegadaEn: first });
    await post().expect(200, {
      id: 12,
      estado: 'programada',
      llegadaEn: first.toISOString(),
    });
    expect(update).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });
});
