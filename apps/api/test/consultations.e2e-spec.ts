import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Consultations and manual prescriptions (HTTP, mocked database)', () => {
  let app: INestApplication;
  let token: string;
  const actor = vi.fn();
  const appointmentFind = vi.fn();
  const catalog = vi.fn();
  const create = vi.fn();
  const update = vi.fn();
  const read = vi.fn();
  const audit = vi.fn();
  const lock = vi.fn();
  const tx = {
    $queryRaw: lock,
    cita: { findFirst: appointmentFind, update },
    cie10: { findMany: catalog },
    consulta: { create },
    bitacoraAuditoria: { create: audit },
  };
  const transaction = vi.fn(
    async (callback: (db: typeof tx) => Promise<unknown>) => callback(tx),
  );
  const now = new Date('2026-11-09T02:00:00Z');
  const appointment = {
    id: 12,
    pacienteId: 3,
    medicoId: 2,
    fechaHoraInicio: new Date('2026-11-08T15:00:00Z'),
    estado: 'programada',
    modalidad: 'presencial',
    llegadaEn: new Date('2026-11-08T14:40:00Z'),
    preparacionCompletadaEn: new Date('2026-11-08T14:50:00Z'),
    evaluacionPrevia: { id: 1 },
    consulta: null,
  };
  const medication = {
    medicamento: 'Medicamento ficticio',
    dosis: 'Dosis ficticia',
    via: 'Via ficticia',
    frecuencia: 'Frecuencia ficticia',
    duracion: 'Duracion ficticia',
  };
  const body = {
    citaId: 12,
    motivo: ' Motivo ficticio ',
    indicaciones: ' Indicaciones ficticias ',
    diagnosticos: [{ codigo: 'J00' }],
  };
  const result = {
    id: 8,
    pacienteId: 3,
    medicoId: 2,
    citaId: 12,
    estado: 'activo',
    diagnosticos: [{ codigo: 'J00', descripcion: 'Descripcion ficticia' }],
    recetaItems: [],
  };
  const post = (data: object = body) =>
    request(app.getHttpServer())
      .post('/api/consultations')
      .auth(token, { type: 'bearer' })
      .send(data);
  const get = (path = '/api/consultations/8') =>
    request(app.getHttpServer()).get(path).auth(token, { type: 'bearer' });
  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-only-secret-with-at-least-32-characters';
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        usuario: { findUnique: actor },
        consulta: { findFirst: read },
        cie10: { findMany: catalog },
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
    actor.mockResolvedValue({ id: 7, rol: 'medico', activo: true });
    appointmentFind.mockResolvedValue({ ...appointment });
    catalog.mockResolvedValue([
      { codigo: 'J00', descripcion: 'Descripcion ficticia' },
    ]);
    create.mockResolvedValue(result);
    update.mockResolvedValue({});
    read.mockResolvedValue(result);
    audit.mockResolvedValue({ id: 1 });
    lock.mockResolvedValue([{ id: 12 }]);
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => {
    await app?.close();
  });
  it('requires authentication on all three routes', async () => {
    await request(app.getHttpServer())
      .post('/api/consultations')
      .send(body)
      .expect(401);
    for (const path of ['/api/consultations/8', '/api/consultations/diagnoses'])
      await request(app.getHttpServer()).get(path).expect(401);
    expect(transaction).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
    expect(catalog).not.toHaveBeenCalled();
  });
  it.each([
    'admision',
    'enfermeria',
    'laboratorio',
    'cajero',
    'gerencia',
    'paciente',
  ])('denies %s consultation and prescription access', async (rol) => {
    actor.mockResolvedValue({ id: 7, rol, activo: true });
    await post().expect(403);
    await get().expect(403);
    await get('/api/consultations/diagnoses').expect(403);
    expect(transaction).not.toHaveBeenCalled();
    expect(read).not.toHaveBeenCalled();
  });
  it.each([
    { citaId: 0 },
    { citaId: '12' },
    { motivo: '  ' },
    { indicaciones: '' },
    { pacienteId: 99 },
    { medicoId: 99 },
    { fechaHora: '2026-11-08T00:00:00Z' },
    { estado: 'anulado' },
    { diagnosticos: [] },
    { diagnosticos: [{ codigo: 'J00' }, { codigo: 'J00' }] },
    { diagnosticos: [{ codigo: 'INVALIDO' }] },
    { diagnosticos: [{ codigo: 'J00', descripcion: 'Manipulada' }] },
    { receta: [{ ...medication, medicamento: ' ' }] },
    { receta: [{ ...medication, dosis: '' }] },
    { receta: [{ ...medication, via: '' }] },
    { receta: [{ ...medication, frecuencia: '' }] },
    { receta: [{ ...medication, duracion: '' }] },
    { receta: [{ medicamento: 'Solo nombre' }] },
    { receta: [{ ...medication, registradoPor: 99 }] },
  ])(
    'rejects invalid or client-controlled clinical data %j',
    async (change) => {
      await post({ ...body, ...change }).expect(400);
      expect(transaction).not.toHaveBeenCalled();
    },
  );
  it('rejects missing required consultation fields', async () => {
    await post({}).expect(400);
    expect(transaction).not.toHaveBeenCalled();
  });
  it('returns 404 for a missing or unassigned appointment using an ownership filter', async () => {
    appointmentFind.mockResolvedValue(null);
    await post().expect(404);
    expect(appointmentFind).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 12,
          medico: { usuarioId: 7, usuario: { activo: true, rol: 'medico' } },
        },
      }),
    );
    expect(create).not.toHaveBeenCalled();
  });
  it.each(['2026-11-08T04:59:59Z', '2026-11-09T05:00:00Z'])(
    'rejects a different Lima day %s',
    async (start) => {
      appointmentFind.mockResolvedValue({
        ...appointment,
        fechaHoraInicio: new Date(start),
      });
      await post().expect(400);
      expect(create).not.toHaveBeenCalled();
    },
  );
  it.each([
    { estado: 'cancelada' },
    { estado: 'atendida' },
    { estado: 'no_asistio' },
    { modalidad: 'virtual' },
    { llegadaEn: null },
    { llegadaEn: new Date('2026-11-09T03:00:00Z') },
    { preparacionCompletadaEn: null },
    { preparacionCompletadaEn: new Date('2026-11-09T03:00:00Z') },
    { evaluacionPrevia: null },
    { consulta: { id: 4 } },
  ])('rejects an appointment not ready for consultation %j', async (change) => {
    appointmentFind.mockResolvedValue({ ...appointment, ...change });
    await post().expect(409);
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
  it('rejects syntactically valid codes absent from the catalog', async () => {
    catalog.mockResolvedValue([]);
    await post().expect(400);
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
  it.each([undefined, [], null])(
    'permits a consultation with no prescription: %j',
    async (receta) => {
      await post({
        ...body,
        ...(receta === undefined ? {} : { receta }),
      }).expect(201, result);
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            pacienteId: 3,
            medicoId: 2,
            fechaHora: now,
            motivo: 'Motivo ficticio',
            indicaciones: 'Indicaciones ficticias',
            recetaItems: { create: [] },
          }),
        }),
      );
    },
  );
  it.each(['programada', 'confirmada', 'reprogramada'])(
    'saves diagnoses, multiple manual medications and audit together for %s',
    async (estado) => {
      appointmentFind.mockResolvedValue({ ...appointment, estado });
      catalog.mockResolvedValue([
        { codigo: 'J00', descripcion: 'Descripcion uno' },
        { codigo: 'Z00.0', descripcion: 'Descripcion dos' },
      ]);
      await post({
        ...body,
        diagnosticos: [{ codigo: 'J00' }, { codigo: 'Z00.0' }],
        receta: [
          {
            ...medication,
            medicamento: ' Medicamento uno ',
            indicaciones: ' Nota ',
          },
          { ...medication, medicamento: 'Medicamento dos' },
        ],
      }).expect(201);
      const data = create.mock.calls[0][0].data;
      expect(data.diagnosticos.create).toEqual([
        {
          codigo: 'J00',
          descripcion: 'Descripcion uno',
          orden: 1,
          tipo: 'principal',
        },
        {
          codigo: 'Z00.0',
          descripcion: 'Descripcion dos',
          orden: 2,
          tipo: 'secundario',
        },
      ]);
      expect(data.recetaItems.create).toEqual([
        {
          ...medication,
          medicamento: 'Medicamento uno',
          orden: 1,
          indicaciones: 'Nota',
        },
        {
          ...medication,
          medicamento: 'Medicamento dos',
          orden: 2,
          indicaciones: null,
        },
      ]);
      expect(update).toHaveBeenCalledWith({
        where: { id: 12 },
        data: { estado: 'atendida' },
      });
      expect(audit).toHaveBeenCalledWith({
        data: {
          usuarioId: 7,
          accion: 'CREATE_CONSULTATION',
          recurso: 'consultations/8',
          ipOrigen: expect.any(String),
        },
      });
      expect(transaction).toHaveBeenCalledOnce();
    },
  );
  it('reads only the author doctor consultation including its prescription', async () => {
    await get().expect(200, result);
    expect(read).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 8, medico: { usuarioId: 7 } } }),
    );
    expect(audit.mock.invocationCallOrder[0]).toBeLessThan(
      read.mock.invocationCallOrder[0],
    );
  });
  it('returns 404 for an inaccessible episode', async () => {
    read.mockResolvedValue(null);
    await get().expect(404);
  });
  it('searches the catalog and audits before accessing it', async () => {
    await get('/api/consultations/diagnoses?q=j00').expect(200);
    expect(catalog).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 50,
        where: {
          OR: [
            { codigo: { contains: 'j00', mode: 'insensitive' } },
            { descripcion: { contains: 'j00', mode: 'insensitive' } },
          ],
        },
      }),
    );
  });
  it.each([
    '/api/consultations/0',
    '/api/consultations/no-id',
    '/api/consultations/diagnoses?q=x',
    '/api/consultations/diagnoses?include=patients',
  ])('rejects invalid query or id %s', async (path) => {
    await get(path).expect(400);
    expect(read).not.toHaveBeenCalled();
    expect(catalog).not.toHaveBeenCalled();
  });
  it('does not expose clinical information when auditing fails', async () => {
    audit.mockRejectedValueOnce(new Error('Audit unavailable'));
    await get().expect(500);
    expect(read).not.toHaveBeenCalled();
  });
});
