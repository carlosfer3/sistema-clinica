import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Patient history (HTTP, mocked database)', () => {
  let app: INestApplication;
  let token: string;
  const actor = vi.fn();
  const findFirst = vi.fn();
  const audit = vi.fn();
  const get = (query = '', id = '3') =>
    request(app.getHttpServer())
      .get(`/api/patients/${id}/history${query}`)
      .auth(token, { type: 'bearer' });
  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-only-secret-with-at-least-32-characters';
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        usuario: { findUnique: actor },
        paciente: { findFirst },
        bitacoraAuditoria: { create: audit },
      })
      .compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    token = await module.get(JwtService).signAsync({ sub: 7 });
  });
  beforeEach(() => {
    vi.resetAllMocks();
    actor.mockResolvedValue({ id: 7, rol: 'medico', activo: true });
    audit.mockResolvedValue({ id: 1 });
    findFirst.mockResolvedValue({
      id: 3,
      nombres: 'Paciente',
      antecedentes: [],
      alergias: [],
      consultas: [],
    });
  });
  afterAll(async () => {
    await app?.close();
  });
  it('requires authentication', async () => {
    await request(app.getHttpServer())
      .get('/api/patients/3/history')
      .expect(401);
    expect(findFirst).not.toHaveBeenCalled();
  });
  it.each([
    'admision',
    'enfermeria',
    'paciente',
    'gerencia',
    'laboratorio',
    'cajero',
  ])('denies %s', async (rol) => {
    actor.mockResolvedValue({ id: 7, rol, activo: true });
    await get().expect(403);
    expect(findFirst).not.toHaveBeenCalled();
  });
  it('denies inactive doctors', async () => {
    actor.mockResolvedValue({ id: 7, rol: 'medico', activo: false });
    await get().expect(401);
    expect(findFirst).not.toHaveBeenCalled();
  });
  it.each(['?pagina=0', '?limite=101', '?pagina=abc', '?medicoId=8'])(
    'rejects invalid filters %s',
    async (query) => {
      await get(query).expect(400);
      expect(findFirst).not.toHaveBeenCalled();
    },
  );
  it('rejects a noninteger patient ID', async () => {
    await get('', 'abc').expect(400);
  });
  it('hides patients without a noncancelled appointment assigned to the authenticated doctor', async () => {
    findFirst.mockResolvedValue(null);
    await get().expect(404);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 3,
          citas: {
            some: { medico: { usuarioId: 7 }, estado: { not: 'cancelada' } },
          },
        },
      }),
    );
  });
  it('paginates deterministically and preserves cancelled episodes, diagnoses and prescriptions', async () => {
    const consultation = {
      id: 12,
      estado: 'anulado',
      motivoAnulacion: 'Corrección ficticia',
      diagnosticos: [{ codigo: 'J00' }],
      recetaItems: [{ medicamento: 'Ficticio' }],
    };
    findFirst.mockResolvedValue({
      id: 3,
      antecedentes: [],
      alergias: [],
      consultas: [consultation, { id: 11 }],
    });
    const response = await get('?pagina=2&limite=1').expect(200);
    expect(response.body).toEqual({
      paciente: { id: 3, antecedentes: [], alergias: [] },
      consultas: [consultation],
      pagina: 2,
      limite: 1,
      hayMas: true,
    });
    expect(findFirst.mock.calls[0][0].select.consultas).toMatchObject({
      orderBy: [{ fechaHora: 'desc' }, { id: 'desc' }],
      skip: 1,
      take: 2,
    });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          usuarioId: 7,
          accion: 'READ_HCE',
          recurso: 'patients/3/history',
        }),
      }),
    );
    expect(audit.mock.invocationCallOrder[0]).toBeLessThan(
      findFirst.mock.invocationCallOrder[0],
    );
  });
  it('does not read history when audit fails', async () => {
    audit.mockRejectedValue(new Error('Audit unavailable'));
    await get().expect(500);
    expect(findFirst).not.toHaveBeenCalled();
  });
});
