import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Availability (HTTP, mocked database)', () => {
  let app: INestApplication;
  let token: string;
  const user = vi.fn();
  const schedules = vi.fn();
  const appointments = vi.fn();
  const audit = vi.fn();
  const url =
    '/api/agenda/availability?fecha=2099-01-05&especialidadId=1&medicoId=2';

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-only-secret-with-at-least-32-characters';
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        usuario: { findUnique: user },
        horarioMedico: { findMany: schedules },
        cita: { findMany: appointments },
        bitacoraAuditoria: { create: audit },
      })
      .compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    token = await module.get(JwtService).signAsync({ sub: 1 });
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    user.mockResolvedValue({ id: 1, rol: 'admision', activo: true });
    audit.mockResolvedValue({ id: 1 });
    schedules.mockResolvedValue([
      {
        medicoId: 2,
        consultorioId: 1,
        horaInicio: new Date('1970-01-01T08:00:00Z'),
        horaFin: new Date('1970-01-01T09:10:00Z'),
        duracionCitaMin: 20,
        medico: { usuario: { nombres: 'Demo', apellidos: 'Medico' } },
        consultorio: { nombre: 'Demo 1' },
      },
    ]);
    appointments.mockResolvedValue([]);
  });

  it('requires authentication and authorized roles', async () => {
    await request(app.getHttpServer()).get(url).expect(401);
    user.mockResolvedValue({ id: 1, rol: 'paciente', activo: true });
    await request(app.getHttpServer())
      .get(url)
      .auth(token, { type: 'bearer' })
      .expect(403);
    expect(schedules).not.toHaveBeenCalled();
  });

  it.each([
    'fecha=2099-02-30&especialidadId=1',
    'fecha=2099-01-05T00:00:00Z&especialidadId=1',
    'fecha=2099-01-05',
    'fecha=2099-01-05&especialidadId=0',
    'fecha=2099-01-05&especialidadId=1&medicoId=abc',
    'fecha=2099-01-05&especialidadId=1&extra=1',
  ])('rejects invalid query %s', async (query) => {
    await request(app.getHttpServer())
      .get(`/api/agenda/availability?${query}`)
      .auth(token, { type: 'bearer' })
      .expect(400);
    expect(schedules).not.toHaveBeenCalled();
  });

  it('generates complete Lima slots and applies resource filters', async () => {
    const response = await request(app.getHttpServer())
      .get(url)
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(
      response.body.turnos.map((s: { inicio: string }) => s.inicio),
    ).toEqual([
      '2099-01-05T13:00:00.000Z',
      '2099-01-05T13:20:00.000Z',
      '2099-01-05T13:40:00.000Z',
    ]);
    expect(schedules).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          diaSemana: 1,
          medicoId: 2,
          medico: {
            especialidadId: 1,
            usuario: { activo: true, rol: 'medico' },
          },
          consultorio: { activo: true },
        },
      }),
    );
    expect(appointments).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ estado: { not: 'cancelada' } }),
      }),
    );
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ accion: 'READ_AVAILABILITY' }),
      }),
    );
  });

  it('removes partial overlaps while allowing adjacent intervals and other doctors', async () => {
    appointments.mockResolvedValue([
      {
        medicoId: 2,
        fechaHoraInicio: new Date('2099-01-05T12:50:00Z'),
        fechaHoraFin: new Date('2099-01-05T13:01:00Z'),
      },
      {
        medicoId: 2,
        fechaHoraInicio: new Date('2099-01-05T13:40:00Z'),
        fechaHoraFin: new Date('2099-01-05T14:00:00Z'),
      },
      {
        medicoId: 3,
        fechaHoraInicio: new Date('2099-01-05T13:20:00Z'),
        fechaHoraFin: new Date('2099-01-05T13:40:00Z'),
      },
    ]);
    const response = await request(app.getHttpServer())
      .get(url)
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(response.body.turnos).toHaveLength(1);
    expect(response.body.turnos[0].inicio).toBe('2099-01-05T13:20:00.000Z');
  });

  it('returns empty availability without schedules', async () => {
    schedules.mockResolvedValue([]);
    const response = await request(app.getHttpServer())
      .get(url)
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(response.body.turnos).toEqual([]);
    expect(appointments).not.toHaveBeenCalled();
  });

  it('excludes past slots', async () => {
    const response = await request(app.getHttpServer())
      .get(url.replace('2099-01-05', '2000-01-03'))
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(response.body.turnos).toEqual([]);
  });
});
