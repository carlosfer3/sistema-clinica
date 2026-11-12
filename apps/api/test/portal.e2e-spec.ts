import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Patient portal (HTTP, mocked database)', () => {
  let app: INestApplication;
  let token: string;
  const actor = vi.fn();
  const patient = vi.fn();
  const audit = vi.fn();
  const list = vi.fn();
  const count = vi.fn();
  const history = vi.fn();
  const clinicalProfile = vi.fn();
  const specialties = vi.fn();
  const notificationRows = vi.fn();
  const find = vi.fn();
  const update = vi.fn();
  const updateMany = vi.fn();
  const create = vi.fn();
  const overlap = vi.fn();
  const tx = {
    $queryRaw: vi.fn(),
    paciente: { findUnique: patient },
    medico: { findFirst: vi.fn() },
    horarioMedico: { findMany: vi.fn() },
    cita: {
      findMany: list,
      count,
      findUnique: find,
      update,
      create,
      findFirst: overlap,
    },
    bitacoraAuditoria: { create: audit },
  };
  const transaction = vi.fn(
    async (value: ((db: typeof tx) => unknown) | Promise<unknown>[]) =>
      typeof value === 'function' ? value(tx) : Promise.all(value),
  );
  const get = (path: string) =>
    request(app.getHttpServer())
      .get(`/api/portal/${path}`)
      .auth(token, { type: 'bearer' });
  const post = (path: string, body = {}) =>
    request(app.getHttpServer())
      .post(`/api/portal/${path}`)
      .auth(token, { type: 'bearer' })
      .send(body);

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-only-secret-with-at-least-32-characters';
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        usuario: { findUnique: actor },
        paciente: { findUnique: patient, findUniqueOrThrow: clinicalProfile },
        especialidad: { findMany: specialties },
        cita: { findMany: list, count, updateMany },
        consulta: { findMany: history },
        bitacoraAuditoria: { create: audit },
        $transaction: transaction,
        $queryRaw: notificationRows,
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
    actor.mockResolvedValue({ id: 7, rol: 'paciente', activo: true });
    patient.mockResolvedValue({
      id: 41,
      nombres: 'Paciente',
      apellidos: 'Prueba',
    });
    audit.mockResolvedValue({ id: 1 });
    list.mockResolvedValue([]);
    count.mockResolvedValue(0);
    updateMany.mockResolvedValue({ count: 0 });
    history.mockResolvedValue([]);
    clinicalProfile.mockResolvedValue({ alergias: [], antecedentes: [] });
    specialties.mockResolvedValue([]);
    notificationRows.mockResolvedValue([]);
    tx.$queryRaw.mockResolvedValue([]);
    tx.medico.findFirst.mockResolvedValue({ id: 2 });
    tx.horarioMedico.findMany.mockResolvedValue([
      {
        horaInicio: new Date('1970-01-01T08:00:00Z'),
        horaFin: new Date('1970-01-01T10:00:00Z'),
        duracionCitaMin: 20,
      },
    ]);
    find.mockResolvedValue({
      id: 12,
      pacienteId: 41,
      medicoId: 2,
      fechaHoraInicio: new Date('2099-01-09T13:00:00Z'),
      fechaHoraFin: new Date('2099-01-09T13:20:00Z'),
      estado: 'programada',
      canalOrigen: 'presencial',
      llegadaEn: null,
      preparacionCompletadaEn: null,
      consulta: null,
      evaluacionPrevia: null,
    });
    create.mockResolvedValue({ id: 12, estado: 'programada' });
    update.mockResolvedValue({ id: 12, estado: 'cancelada' });
    overlap.mockResolvedValue(null);
  });
  it('requires authentication and rejects staff accounts', async () => {
    await request(app.getHttpServer()).get('/api/portal/profile').expect(401);
    actor.mockResolvedValue({ id: 7, rol: 'admision', activo: true });
    await get('profile').expect(403);
    await get('appointments').expect(403);
    await get('history').expect(403);
    await post('appointments/12/cancel').expect(403);
    expect(patient).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
  });
  it('resolves the profile using the authenticated account, never a supplied patient ID', async () => {
    await get('profile').expect(200);
    expect(patient).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { usuarioId: 7 },
        select: expect.not.objectContaining({ usuario: true }),
      }),
    );
    await get('appointments?pacienteId=99').expect(400);
    expect(list).not.toHaveBeenCalled();
  });
  it('lists and counts only the authenticated patient’s upcoming active appointments', async () => {
    await get('appointments?limite=2').expect(200, {
      citas: [],
      total: 0,
      pagina: 1,
      hayMas: false,
    });
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          pacienteId: 41,
          fechaHoraInicio: { gte: expect.any(Date) },
          estado: { in: ['pendiente_confirmacion', 'programada', 'confirmada', 'reprogramada'] },
        },
        take: 2,
      }),
    );
    expect(count).toHaveBeenCalledWith({
      where: expect.objectContaining({ pacienteId: 41 }),
    });
  });
  it('separates cancelled and past appointments within the authenticated patient', async () => {
    await get('appointments?scope=cancelled').expect(200);
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { pacienteId: 41, estado: 'cancelada' },
    }));
    await get('appointments?scope=past').expect(200);
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({
      where: {
        pacienteId: 41,
        estado: { not: 'cancelada' },
        OR: [{ fechaHoraInicio: { lt: expect.any(Date) } }, { estado: { in: ['atendida', 'no_asistio'] } }],
      },
    }));
    await get('appointments?scope=unknown').expect(400);
  });
  it('paginates all appointments without allowing account substitution', async () => {
    await get('appointments?scope=all&pagina=2&limite=10').expect(200);
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { pacienteId: 41 },
        skip: 10,
        take: 10,
      }),
    );
    await get('history?usuarioId=99').expect(400);
    await get('appointments?pagina=0').expect(400);
  });
  it('reads only the patient’s consultations and prescriptions', async () => {
    await get('history').expect(200);
    expect(history).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { pacienteId: 41 },
        select: expect.objectContaining({
          recetaItems: expect.any(Object),
          diagnosticos: expect.any(Object),
        }),
      }),
    );
  });
  it('returns persisted notifications with patient ownership and server pagination', async () => {
    notificationRows.mockResolvedValue(Array.from({ length: 3 }, (_, i) => ({ id: `aviso-${i}`, tipo: 'confirmacion', citaId: 12, inicio: null, inicioAnterior: null, especialidad: 'General', pendienteConfirmacion: false, creadoEn: new Date('2026-11-12T14:00:00Z') })));
    const response = await get('notifications?pagina=2&limite=2').expect(200);
    expect(response.body.notificaciones).toHaveLength(2);
    expect(response.body.hayMas).toBe(true);
    const [sql, ...parameters] = notificationRows.mock.calls[0];
    expect(parameters).toEqual([41, 41, 2, 3]);
    expect(sql.join('')).toContain("b.accion = 'CONFIRM_CITA'");
    expect(sql.join('')).toContain('NOT EXISTS');
    expect(response.body.notificaciones[0]).not.toHaveProperty('correo');
  });
  it('validates notification pagination and blocks staff access', async () => {
    await get('notifications?pagina=0').expect(400);
    await get('notifications?pacienteId=99').expect(400);
    actor.mockResolvedValue({ id: 7, rol: 'admision', activo: true });
    await get('notifications').expect(403);
    expect(notificationRows).not.toHaveBeenCalled();
  });
  it('applies history filters before pagination, restricted to the authenticated patient', async () => {
    await get('history?buscar=J00&especialidadId=2&desde=2026-01-01&hasta=2026-11-12&conReceta=true&pagina=2&limite=6').expect(200);
    expect(history).toHaveBeenCalledWith(expect.objectContaining({
      skip: 6, take: 7,
      where: expect.objectContaining({ pacienteId: 41, medico: { especialidadId: 2 }, estado: 'activo', recetaItems: { some: {} }, OR: expect.any(Array), fechaHora: { gte: new Date('2026-01-01T05:00:00Z'), lt: new Date('2026-11-13T05:00:00Z') } }),
    }));
  });
  it('reads the linked patient clinical context without accepting another patient ID', async () => {
    await get('history-context').expect(200);
    expect(clinicalProfile).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 41 }, select: expect.objectContaining({ alergias: expect.any(Object), antecedentes: expect.any(Object) }) }));
    expect(specialties).toHaveBeenCalledWith(expect.objectContaining({ where: { medicos: { some: { consultas: { some: { pacienteId: 41 } } } } } }));
  });
  it('restricts the clinical context to patient accounts and requires its audit', async () => {
    actor.mockResolvedValue({ id: 7, rol: 'medico', activo: true });
    await get('history-context').expect(403);
    expect(clinicalProfile).not.toHaveBeenCalled();
    actor.mockResolvedValue({ id: 7, rol: 'paciente', activo: true });
    audit.mockRejectedValueOnce(new Error('Audit unavailable'));
    await get('history-context').expect(500);
    expect(clinicalProfile).not.toHaveBeenCalled();
  });
  it.each(['desde=2026-02-30', 'desde=2026-11-12&hasta=2026-01-01', 'buscar=a', 'conReceta=bad', 'especialidadId=0'])('rejects invalid history filters: %s', async query => {
    await get(`history?${query}`).expect(400);
    expect(history).not.toHaveBeenCalled();
  });
  it('fails closed when auditing is unavailable', async () => {
    audit.mockRejectedValue(new Error('Audit unavailable'));
    await get('history').expect(500);
    expect(history).not.toHaveBeenCalled();
    expect(patient).not.toHaveBeenCalled();
  });
  it('does not invent or automatically link a patient profile', async () => {
    patient.mockResolvedValue(null);
    await get('profile').expect(404);
    await get('appointments').expect(404);
    await post('appointments', {
      medicoId: 2,
      inicio: '2099-01-09T08:00:00-05:00',
    }).expect(404);
    expect(create).not.toHaveBeenCalled();
  });
  it('derives the patient, creator and portal channel for bookings', async () => {
    const body = { medicoId: 2, inicio: '2099-01-09T08:00:00-05:00' };
    await post('appointments', { ...body, pacienteId: 99 }).expect(400);
    await post('appointments', body).expect(201);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pacienteId: 41,
          creadoPor: 7,
          canalOrigen: 'portal',
            estado: 'pendiente_confirmacion',
        }),
      }),
    );
  });
  it.each(['cancel', 'reschedule'])(
    'checks ownership inside the locked transaction for %s',
    async (action) => {
      find.mockResolvedValue(null);
      await post(
        `appointments/12/${action}`,
        action === 'reschedule' ? { inicio: '2099-01-09T08:20:00-05:00' } : {},
      ).expect(404);
      expect(find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 12, paciente: { usuarioId: 7 } },
        }),
      );
      expect(update).not.toHaveBeenCalled();
    },
  );
  it('allows a patient to reschedule their own eligible appointment', async () => {
    await post('appointments/12/reschedule', {
      inicio: '2099-01-09T08:20:00-05:00',
    }).expect(200);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 12 },
        data: expect.objectContaining({ estado: 'pendiente_confirmacion' }),
      }),
    );
  });
});
