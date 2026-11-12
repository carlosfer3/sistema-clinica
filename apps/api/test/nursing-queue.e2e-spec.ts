import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Nursing preparation queue (HTTP, mocked database)', () => {
  let app: INestApplication;
  let token: string;
  const actor = vi.fn();
  const findMany = vi.fn();
  const audit = vi.fn();
  const specialties = vi.fn();
  const now = new Date('2026-11-09T02:00:00Z');
  const appointment = {
    id: 12,
    fechaHoraInicio: new Date('2026-11-08T15:00:00Z'),
    llegadaEn: new Date('2026-11-08T14:50:00Z'),
    paciente: {
      id: 3,
      tipoDocumento: 'DNI',
      numeroDocumento: '87654321',
      nombres: 'Paciente',
      apellidos: 'Prueba',
      fechaNacimiento: new Date('2000-11-09T00:00:00Z'),
    },
    medico: {
      id: 2,
      usuario: { nombres: 'Medico', apellidos: 'Prueba' },
      especialidad: { id: 1, nombre: 'Medicina General' },
    },
  };
  const get = (query: string = '') =>
    request(app.getHttpServer())
      .get(`/api/agenda/nursing-queue${query}`)
      .auth(token, { type: 'bearer' });
  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-only-secret-with-at-least-32-characters';
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        usuario: { findUnique: actor },
        cita: { findMany },
        especialidad: { findMany: specialties },
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
    actor.mockResolvedValue({ id: 7, rol: 'enfermeria', activo: true });
    findMany.mockResolvedValue([appointment]);
    audit.mockResolvedValue({ id: 1 });
    specialties.mockResolvedValue([{ id: 1, nombre: 'Medicina General' }]);
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await app?.close();
  });

  it('requires authentication', async () => {
    await request(app.getHttpServer())
      .get('/api/agenda/nursing-queue')
      .expect(401);
    expect(findMany).not.toHaveBeenCalled();
  });
  it('filters before pagination and returns specialty choices from the pending queue', async () => {
    const result = await get('?buscar=Prueba&especialidadId=1&pagina=2&limite=6').expect(200);
    expect(result.body.especialidades).toEqual([{ id: 1, nombre: 'Medicina General' }]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 6, take: 7, where: expect.objectContaining({ medico: { especialidadId: 1 }, AND: expect.any(Array), preparacionCompletadaEn: null }) }));
    expect(specialties).toHaveBeenCalledWith(expect.objectContaining({ where: { medicos: { some: { citas: { some: expect.objectContaining({ preparacionCompletadaEn: null, llegadaEn: { not: null } }) } } } } }));
  });
  it.each(['?buscar=a', '?especialidadId=0', '?especialidadId=abc'])('rejects invalid filters: %s', async query => {
    await get(query).expect(400);
    expect(findMany).not.toHaveBeenCalled();
  });
  it.each([
    'admision',
    'medico',
    'laboratorio',
    'cajero',
    'gerencia',
    'paciente',
  ])('denies %s', async (rol) => {
    actor.mockResolvedValue({ id: 7, rol, activo: true });
    await get().expect(403);
    expect(findMany).not.toHaveBeenCalled();
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ accion: 'ACCESS_DENIED' }),
      }),
    );
  });
  it.each([
    '?pagina=0',
    '?limite=101',
    '?pagina=abc',
    '?limite=1.5',
    '?pagina=10001',
    '?fecha=2026-11-07',
    '?include=historial',
  ])('rejects invalid or unknown query %s', async (query) => {
    await get(query).expect(400);
    expect(findMany).not.toHaveBeenCalled();
  });
  it('returns identification, age and appointment data without clinical or contact information', async () => {
    const response = await get().expect(200);
    expect(response.body).toEqual({
      fecha: '2026-11-08',
      zonaHoraria: 'America/Lima',
      especialidades: [{ id: 1, nombre: 'Medicina General' }],
      pagina: 1,
      limite: 50,
      hayMas: false,
      pacientes: [
        {
          citaId: 12,
          paciente: {
            id: 3,
            tipoDocumento: 'DNI',
            numeroDocumento: '87654321',
            nombres: 'Paciente',
            apellidos: 'Prueba',
            edad: 25,
          },
          inicio: appointment.fechaHoraInicio.toISOString(),
          llegadaEn: appointment.llegadaEn.toISOString(),
          medico: { id: 2, nombres: 'Medico', apellidos: 'Prueba' },
          especialidad: { id: 1, nombre: 'Medicina General' },
          estadoPreparacion: 'pendiente',
        },
      ],
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          fechaHoraInicio: {
            gte: new Date('2026-11-08T05:00:00Z'),
            lt: new Date('2026-11-09T05:00:00Z'),
          },
          llegadaEn: { not: null },
          preparacionCompletadaEn: null,
          modalidad: 'presencial',
          estado: { in: ['programada', 'confirmada', 'reprogramada'] },
        },
        orderBy: [{ llegadaEn: 'asc' }, { id: 'asc' }],
        skip: 0,
        take: 51,
      }),
    );
    const select = findMany.mock.calls[0][0].select;
    expect(Object.keys(select)).toEqual([
      'id',
      'fechaHoraInicio',
      'llegadaEn',
      'paciente',
      'medico',
    ]);
    expect(Object.keys(select.paciente.select)).toEqual([
      'id',
      'tipoDocumento',
      'numeroDocumento',
      'nombres',
      'apellidos',
      'fechaNacimiento',
    ]);
    expect(audit.mock.invocationCallOrder[0]).toBeLessThan(
      findMany.mock.invocationCallOrder[0],
    );
    expect(audit).toHaveBeenCalledWith({
      data: {
        usuarioId: 7,
        accion: 'READ_NURSING_QUEUE',
        recurso: 'agenda/nursing-queue',
        ipOrigen: expect.any(String),
      },
    });
  });
  it('calculates age on the birthday using the Lima date', async () => {
    findMany.mockResolvedValue([
      {
        ...appointment,
        paciente: {
          ...appointment.paciente,
          fechaNacimiento: new Date('2000-11-08T00:00:00Z'),
        },
      },
    ]);
    const response = await get().expect(200);
    expect(response.body.pacientes[0].paciente.edad).toBe(26);
  });
  it('paginates and signals that more patients are available', async () => {
    findMany.mockResolvedValue([appointment, { ...appointment, id: 13 }]);
    const response = await get('?pagina=2&limite=1').expect(200);
    expect(response.body.pacientes).toHaveLength(1);
    expect(response.body.hayMas).toBe(true);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 1, take: 2 }),
    );
  });
  it('returns an empty queue without inventing patients', async () => {
    findMany.mockResolvedValue([]);
    const response = await get().expect(200);
    expect(response.body.pacientes).toEqual([]);
    expect(response.body.hayMas).toBe(false);
  });
  it('does not query or expose patients when auditing fails', async () => {
    audit.mockRejectedValueOnce(new Error('Audit unavailable'));
    await get().expect(500);
    expect(findMany).not.toHaveBeenCalled();
  });
});
