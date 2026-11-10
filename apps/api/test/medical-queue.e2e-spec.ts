import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Medical prepared queue (HTTP, mocked database)', () => {
  let app: INestApplication;
  let token: string;
  const actor = vi.fn();
  const findMany = vi.fn();
  const audit = vi.fn();
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
      .get(`/api/agenda/medical-queue${query}`)
      .auth(token, { type: 'bearer' });
  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-only-secret-with-at-least-32-characters';
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        usuario: { findUnique: actor },
        cita: { findMany },
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
    actor.mockResolvedValue({ id: 7, rol: 'medico', activo: true });
    findMany.mockResolvedValue([appointment]);
    audit.mockResolvedValue({ id: 1 });
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await app?.close();
  });

  it('requires authentication', async () => {
    await request(app.getHttpServer())
      .get('/api/agenda/medical-queue')
      .expect(401);
    expect(findMany).not.toHaveBeenCalled();
  });
  it.each([
    'admision',
    'enfermeria',
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
    '?medicoId=2',
  ])('rejects invalid or unknown query %s', async (query) => {
    await get(query).expect(400);
    expect(findMany).not.toHaveBeenCalled();
  });
  it('returns identification, age and appointment data without clinical or contact information', async () => {
    const response = await get().expect(200);
    expect(response.body).toEqual({
      fecha: '2026-11-08',
      zonaHoraria: 'America/Lima',
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
          estadoPreparacion: 'completada',
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
          llegadaEn: { not: null, lte: now },
          preparacionCompletadaEn: { not: null, lte: now },
          medico: { usuarioId: 7 },
          evaluacionPrevia: { isNot: null },
          consulta: { is: null },
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
        accion: 'READ_MEDICAL_QUEUE',
        recurso: 'agenda/medical-queue',
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
