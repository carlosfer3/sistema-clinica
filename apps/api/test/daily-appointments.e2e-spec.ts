import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Admission daily appointments (HTTP, mocked database)', () => {
  let app: INestApplication;
  let token: string;
  const actor = vi.fn();
  const findMany = vi.fn();
  const audit = vi.fn();
  const count = vi.fn();
  const directoryDoctors = vi.fn();
  const directorySpecialties = vi.fn();
  const transaction = vi.fn(async (queries: Promise<unknown>[]) => Promise.all(queries));
  const now = new Date('2026-11-09T02:00:00Z');
  const row = {
    id: 12,
    fechaHoraInicio: new Date('2026-11-08T15:00:00Z'),
    fechaHoraFin: new Date('2026-11-08T15:20:00Z'),
    estado: 'programada',
    modalidad: 'presencial',
    llegadaEn: null,
    paciente: {
      id: 1,
      tipoDocumento: 'DNI',
      numeroDocumento: '87654321',
      nombres: 'Paciente',
      apellidos: 'Prueba',
    },
    medico: {
      id: 2,
      usuario: { nombres: 'Medico', apellidos: 'Prueba' },
      especialidad: { id: 1, nombre: 'General' },
    },
  };
  const get = (query = '') =>
    request(app.getHttpServer())
      .get(`/api/agenda/appointments${query}`)
      .auth(token, { type: 'bearer' });
  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-only-secret-with-at-least-32-characters';
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        usuario: { findUnique: actor },
        cita: { findMany, count },
        medico: { findMany: directoryDoctors },
        especialidad: { findMany: directorySpecialties },
        $transaction: transaction,
        bitacoraAuditoria: { create: audit },
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
    actor.mockResolvedValue({ id: 7, rol: 'admision', activo: true });
    findMany.mockResolvedValue([row]);
    audit.mockResolvedValue({ id: 1 });
    count.mockResolvedValue(0);
    directorySpecialties.mockResolvedValue([{ id: 1, nombre: 'General' }]);
    directoryDoctors.mockResolvedValue([]);
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await app?.close();
  });
  it('requires authentication', async () => {
    await request(app.getHttpServer())
      .get('/api/agenda/appointments')
      .expect(401);
    expect(findMany).not.toHaveBeenCalled();
  });
  it('returns full admission totals with Lima day boundaries and a consistent snapshot', async () => {
    count.mockResolvedValueOnce(35).mockResolvedValueOnce(12).mockResolvedValueOnce(18).mockResolvedValueOnce(8);
    const result = await request(app.getHttpServer()).get('/api/agenda/admission-summary').auth(token, { type: 'bearer' }).expect(200);
    expect(result.body).toEqual({ fecha: '2026-11-08', zonaHoraria: 'America/Lima', citasHoy: 35, llegadasRegistradas: 12, pendientesLlegada: 18, solicitudesPendientes: 8 });
    expect(count).toHaveBeenNthCalledWith(1, { where: { fechaHoraInicio: { gte: new Date('2026-11-08T05:00:00Z'), lt: new Date('2026-11-09T05:00:00Z') } } });
    expect(count).toHaveBeenNthCalledWith(3, { where: expect.objectContaining({ modalidad: 'presencial', llegadaEn: null, estado: { in: ['programada', 'confirmada', 'reprogramada'] } }) });
    expect(count).toHaveBeenNthCalledWith(4, { where: { fechaHoraInicio: { gt: now }, canalOrigen: 'portal', estado: 'pendiente_confirmacion' } });
    expect(transaction).toHaveBeenCalledWith(expect.any(Array), { isolationLevel: 'RepeatableRead' });
  });
  it('restricts admission totals to admission staff', async () => {
    await request(app.getHttpServer()).get('/api/agenda/admission-summary').expect(401);
    actor.mockResolvedValue({ id: 7, rol: 'medico', activo: true });
    await request(app.getHttpServer()).get('/api/agenda/admission-summary').auth(token, { type: 'bearer' }).expect(403);
    expect(count).not.toHaveBeenCalled();
  });
  it('does not load doctors before filtering the directory', async () => {
    const result = await request(app.getHttpServer()).get('/api/agenda/directory').auth(token, { type: 'bearer' }).expect(200);
    expect(result.body.medicos).toEqual([]);
    expect(directoryDoctors).not.toHaveBeenCalled();
  });
  it('filters and paginates doctors on the server', async () => {
    directoryDoctors.mockResolvedValue(Array.from({ length: 7 }, (_, i) => ({ id: i + 1, usuario: { nombres: 'Ana', apellidos: 'Pérez' }, especialidad: { id: 1, nombre: 'General' } })));
    const result = await request(app.getHttpServer()).get('/api/agenda/directory?especialidadId=1&buscar=Ana%20Perez&pagina=2&limite=6').auth(token, { type: 'bearer' }).expect(200);
    expect(result.body.medicos).toHaveLength(6);
    expect(result.body.hayMas).toBe(true);
    expect(directoryDoctors).toHaveBeenCalledWith(expect.objectContaining({ skip: 6, take: 7, where: expect.objectContaining({ especialidadId: 1, AND: expect.any(Array) }) }));
  });
  it.each(['pagina=0', 'limite=101', 'especialidadId=abc', 'buscar=a'])('validates directory filters: %s', async query => {
    await request(app.getHttpServer()).get(`/api/agenda/directory?${query}`).auth(token, { type: 'bearer' }).expect(400);
    expect(directoryDoctors).not.toHaveBeenCalled();
  });
  it.each([
    'enfermeria',
    'medico',
    'laboratorio',
    'cajero',
    'gerencia',
    'paciente',
  ])('rejects %s', async (rol) => {
    actor.mockResolvedValue({ id: 7, rol, activo: true });
    await get().expect(403);
    expect(findMany).not.toHaveBeenCalled();
  });
  it.each([
    '?pagina=0',
    '?limite=101',
    '?medicoId=abc',
    '?medicoId=0',
    '?estado=invalido',
    '?fecha=2026-02-30',
    '?fecha=2026-13-01',
    '?fecha=2026-1-01',
    '?fecha=2026-11-07T00:00:00Z',
    '?fecha=',
    '?extra=1',
  ])('rejects query %s', async (query) => {
    await get(query).expect(400);
    expect(findMany).not.toHaveBeenCalled();
  });
  it('uses Lima day boundaries and only selects identification and operational fields', async () => {
    const response = await get().expect(200);
    expect(response.body.fecha).toBe('2026-11-08');
    expect(response.body.citas[0].paciente).toEqual(row.paciente);
    expect(response.body.citas[0]).not.toHaveProperty('motivo');
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          fechaHoraInicio: {
            gte: new Date('2026-11-08T05:00:00Z'),
            lt: new Date('2026-11-09T05:00:00Z'),
          },
          medicoId: undefined,
          estado: undefined,
        },
        skip: 0,
        take: 51,
        orderBy: [{ fechaHoraInicio: 'asc' }, { id: 'asc' }],
      }),
    );
    expect(
      Object.keys(findMany.mock.calls[0][0].select.paciente.select).sort(),
    ).toEqual(
      ['id', 'tipoDocumento', 'numeroDocumento', 'nombres', 'apellidos'].sort(),
    );
    expect(audit.mock.invocationCallOrder[0]).toBeLessThan(
      findMany.mock.invocationCallOrder[0],
    );
  });
  it.each(['2026-11-07', '2027-01-01', '2028-02-29'])(
    'filters selected local day %s with Lima UTC boundaries',
    async (fecha) => {
      const response = await get(
        `?fecha=${fecha}&estado=confirmada&pagina=2&limite=10`,
      ).expect(200);
      expect(response.body.fecha).toBe(fecha);
      const start = new Date(`${fecha}T00:00:00-05:00`);
      expect(findMany.mock.calls[0][0]).toMatchObject({
        where: {
          fechaHoraInicio: {
            gte: start,
            lt: new Date(start.getTime() + 86400000),
          },
          estado: 'confirmada',
        },
        skip: 10,
        take: 11,
      });
    },
  );
  it('filters and paginates without losing completed or cancelled states', async () => {
    findMany.mockResolvedValue([row, row]);
    const response = await get(
      '?estado=cancelada&medicoId=2&pagina=2&limite=1',
    ).expect(200);
    expect(response.body.hayMas).toBe(true);
    expect(response.body.citas).toHaveLength(1);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ estado: 'cancelada', medicoId: 2 }),
        skip: 1,
        take: 2,
      }),
    );
  });
  it('returns an empty list and fails closed if auditing fails', async () => {
    findMany.mockResolvedValue([]);
    const response = await get().expect(200);
    expect(response.body.citas).toEqual([]);
    findMany.mockClear();
    audit.mockRejectedValueOnce(new Error('Audit unavailable'));
    await get().expect(500);
    expect(findMany).not.toHaveBeenCalled();
  });
});
