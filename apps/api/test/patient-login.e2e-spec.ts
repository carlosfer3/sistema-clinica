import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { hash } from 'bcryptjs';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/configure-app.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('Patient login with DNI or email (HTTP, mocked database)', () => {
  let app: INestApplication;
  let jwt: JwtService;
  let passwordHash: string;
  const patients = vi.fn();
  const account = vi.fn();
  const audit = vi.fn();
  const password = 'fictitious-test-password';
  const login = (identifier: string, secret = password) =>
    request(app.getHttpServer())
      .post('/api/auth/patient-login')
      .send({ identifier, password: secret });
  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-only-secret-with-at-least-32-characters';
    passwordHash = await hash(password, 4);
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({
        paciente: { findMany: patients },
        usuario: { findUnique: account },
        bitacoraAuditoria: { create: audit },
      })
      .compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    jwt = module.get(JwtService);
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => {
    vi.clearAllMocks();
    patients.mockResolvedValue([{ usuarioId: 7 }]);
    account.mockResolvedValue({
      id: 7,
      rol: 'paciente',
      activo: true,
      passwordHash,
    });
    audit.mockResolvedValue({ id: 1 });
  });
  it('uses exact DNI including leading zeroes and signs only the linked account', async () => {
    const result = await login(' 01234567 ').expect(200);
    expect(patients).toHaveBeenCalledWith({
      where: { tipoDocumento: 'DNI', numeroDocumento: '01234567' },
      select: { usuarioId: true },
      take: 2,
    });
    expect(account).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 7, rol: 'paciente', activo: true },
      }),
    );
    expect((await jwt.verifyAsync(result.body.accessToken)).sub).toBe(7);
    expect(result.body).not.toHaveProperty('passwordHash');
  });
  it('matches email case-insensitively without falling back to a username', async () => {
    await login(' PATIENT@example.test ').expect(200);
    expect(patients).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          correo: { equals: 'PATIENT@example.test', mode: 'insensitive' },
        },
      }),
    );
    expect(account).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ username: expect.anything() }),
      }),
    );
  });
  it.each(['demo.paciente', '1234', '123456789', 'invalid@', '', '   '])(
    'rejects identifiers other than DNI/email: %s',
    async (value) => {
      await login(value).expect(400);
      expect(patients).not.toHaveBeenCalled();
    },
  );
  it.each([
    { rows: [] },
    { rows: [{ usuarioId: null }] },
    { rows: [{ usuarioId: 7 }, { usuarioId: 8 }] },
  ])('rejects unknown, unlinked or ambiguous patients', async ({ rows }) => {
    patients.mockResolvedValue(rows);
    await login('patient@example.test').expect(401);
    expect(account).not.toHaveBeenCalled();
  });
  it('requires the password even when the DNI exists', async () => {
    await login('01234567', 'wrong-password').expect(401);
    await request(app.getHttpServer())
      .post('/api/auth/patient-login')
      .send({ identifier: '01234567' })
      .expect(400);
  });
  it.each([{ activo: false }, { rol: 'admision' }, { rol: 'medico' }])(
    'rejects disabled and staff accounts: %j',
    async (change) => {
      account.mockResolvedValue({
        id: 7,
        rol: 'paciente',
        activo: true,
        passwordHash,
        ...change,
      });
      await login('01234567').expect(401);
    },
  );
  it('rejects patient usernames on the staff login', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'demo.paciente', password })
      .expect(401);
  });
  it('rejects client identity overrides', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/patient-login')
      .send({ identifier: '01234567', password, pacienteId: 99 })
      .expect(400);
    expect(patients).not.toHaveBeenCalled();
  });
  it('does not issue a token when audit persistence fails', async () => {
    audit.mockRejectedValue(new Error('Audit unavailable'));
    await login('01234567').expect(500);
  });
});
