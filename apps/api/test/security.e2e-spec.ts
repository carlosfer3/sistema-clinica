import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { hash } from 'bcryptjs';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Authentication, roles and validation (HTTP, mocked database)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  const auditCreate = vi.fn().mockResolvedValue({ id: 1 });
  const findUnique = vi.fn();
  const patientFindUnique = vi.fn();
  const transaction = vi.fn();
  const patientFindMany = vi.fn().mockResolvedValue([]);

  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-only-secret-with-at-least-32-characters';
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        usuario: { findUnique },
        bitacoraAuditoria: { create: auditCreate },
        paciente: { findMany: patientFindMany, findUnique: patientFindUnique },
        $transaction: transaction,
      })
      .compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    jwt = module.get(JwtService);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    findUnique.mockResolvedValue({ id: 1, rol: 'admision', activo: true });
  });
  afterAll(async () => {
    await app?.close();
  });

  it('returns only the current identity and role for an authenticated session', async () => {
    const token = await jwt.signAsync({ sub: 1 });
    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .auth(token, { type: 'bearer' })
      .expect(200, { id: 1, rol: 'admision' });
    findUnique.mockResolvedValueOnce({ id: 1, rol: 'medico', activo: true });
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .auth(token, { type: 'bearer' })
      .expect(200, { id: 1, rol: 'medico' });
    findUnique.mockResolvedValueOnce({ id: 1, rol: 'admision', activo: false });
    await request(app.getHttpServer())
      .get('/api/auth/me')
      .auth(token, { type: 'bearer' })
      .expect(401);
  });

  it('rejects requests without a token and audits the denial', async () => {
    await request(app.getHttpServer()).get('/api/patients?q=123').expect(401);
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ accion: 'UNAUTHENTICATED' }),
      }),
    );
  });

  it('rejects a tampered token', async () => {
    await request(app.getHttpServer())
      .get('/api/patients?q=123')
      .set('Authorization', 'Bearer invalid')
      .expect(401);
  });

  it('rejects an expired token', async () => {
    const token = await jwt.signAsync({ sub: 1 }, { expiresIn: -1 });
    await request(app.getHttpServer())
      .get('/api/patients?q=123')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it('rejects an inactive account even with a valid token', async () => {
    findUnique.mockResolvedValue({ id: 1, rol: 'admision', activo: false });
    const token = await jwt.signAsync({ sub: 1 });
    await request(app.getHttpServer())
      .get('/api/patients?q=123')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);
  });

  it.each(['admision', 'enfermeria'])(
    'denies %s access to clinical data and audits it',
    async (rol) => {
      findUnique.mockResolvedValue({ id: 1, rol, activo: true });
      const token = await jwt.signAsync({ sub: 1 });
      await request(app.getHttpServer())
        .get('/api/patients/1/clinical-profile')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
      expect(patientFindUnique).not.toHaveBeenCalled();
      expect(auditCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            usuarioId: 1,
            accion: 'ACCESS_DENIED',
          }),
        }),
      );
    },
  );

  it.each([
    ['antecedentes', [{ tipo: 'cronica', descripcion: 'Dato ficticio' }]],
    ['alergias', [{ sustancia: 'Sustancia ficticia' }]],
    ['antecedentes', []],
    ['alergias', []],
  ])(
    'rejects admission registration with clinical field %s',
    async (field, value) => {
      const token = await jwt.signAsync({ sub: 1 });
      const response = await request(app.getHttpServer())
        .post('/api/patients')
        .auth(token, { type: 'bearer' })
        .send({
          tipoDocumento: 'DNI',
          numeroDocumento: '87654321',
          nombres: 'Paciente',
          apellidos: 'Prueba',
          fechaNacimiento: '1990-01-01',
          sexo: 'F',
          telefono: '999888777',
          correo: 'ficticio@example.test',
          [field]: value,
        })
        .expect(400);
      expect(response.body.message).toContain(
        `property ${field} should not exist`,
      );
      expect(transaction).not.toHaveBeenCalled();
    },
  );

  it('allows a doctor to read the clinical profile', async () => {
    findUnique.mockResolvedValue({ id: 1, rol: 'medico', activo: true });
    patientFindUnique.mockResolvedValue({
      id: 1,
      antecedentes: [],
      alergias: [],
    });
    const token = await jwt.signAsync({ sub: 1 });
    await request(app.getHttpServer())
      .get('/api/patients/1/clinical-profile')
      .auth(token, { type: 'bearer' })
      .expect(200, { id: 1, antecedentes: [], alergias: [] });
    expect(patientFindUnique).toHaveBeenCalledOnce();
  });

  it('validates queries and rejects unknown fields', async () => {
    const token = await jwt.signAsync({ sub: 1 });
    await request(app.getHttpServer())
      .get('/api/patients?q=123&extra=true')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expect(patientFindMany).not.toHaveBeenCalled();
  });

  it('allows admission to search and audits before returning demographics', async () => {
    const token = await jwt.signAsync({ sub: 1 });
    await request(app.getHttpServer())
      .get('/api/patients?q=123&limit=5')
      .set('Authorization', `Bearer ${token}`)
      .expect(200, []);
    expect(patientFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 5 }),
    );
    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ accion: 'SEARCH_PATIENTS' }),
      }),
    );
  });

  it('does not expose data if auditing fails', async () => {
    auditCreate.mockRejectedValueOnce(new Error('Audit unavailable'));
    const token = await jwt.signAsync({ sub: 1 });
    await request(app.getHttpServer())
      .get('/api/patients?q=123')
      .set('Authorization', `Bearer ${token}`)
      .expect(500);
    expect(patientFindMany).not.toHaveBeenCalled();
  });

  it('returns a usable token on login without exposing the password hash', async () => {
    findUnique.mockResolvedValue({
      id: 1,
      rol: 'admision',
      activo: true,
      passwordHash: await hash('test-password', 4),
    });
    const response = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'test', password: 'test-password' })
      .expect(200);
    expect(await jwt.verifyAsync(response.body.accessToken)).toMatchObject({
      sub: 1,
    });
    expect(response.body).not.toHaveProperty('passwordHash');
  });

  it('rejects invalid credentials', async () => {
    findUnique.mockResolvedValue(null);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'test', password: 'wrong' })
      .expect(401);
  });

  it('rejects invalid patient input before reaching persistence', async () => {
    const token = await jwt.signAsync({ sub: 1 });
    await request(app.getHttpServer())
      .post('/api/patients')
      .set('Authorization', `Bearer ${token}`)
      .send({ tipoDocumento: 'DNI', numeroDocumento: '123', unexpected: true })
      .expect(400);
  });
});
