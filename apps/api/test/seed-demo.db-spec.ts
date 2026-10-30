import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';

describe('Demo seed (isolated PostgreSQL schema)', () => {
  const schema = `test_seed_${randomUUID().replaceAll('-', '')}`;
  const admin = new PrismaClient();
  let db: PrismaClient;
  let url: URL;
  let created = false;
  const runSeed = () =>
    execFileSync(process.execPath, ['prisma/seed-demo.mjs'], {
      env: {
        ...process.env,
        DATABASE_URL: url.toString(),
        DEMO_PASSWORD: 'fictitious-seed-password',
        NODE_ENV: 'test',
      },
      stdio: 'pipe',
      timeout: 30000,
    });

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    url = new URL(process.env.DATABASE_URL);
    url.searchParams.set('schema', schema);
    await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
    created = true;
    execFileSync(
      process.execPath,
      ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
      {
        env: { ...process.env, DATABASE_URL: url.toString() },
        stdio: 'pipe',
        timeout: 45000,
      },
    );
    db = new PrismaClient({ datasourceUrl: url.toString() });
  });

  afterAll(async () => {
    await db?.$disconnect();
    if (created)
      await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.$disconnect();
  });

  it('creates a repeatable agenda, preserving existing accounts and unrelated records', async () => {
    await db.usuario.create({
      data: {
        username: 'demo.medico',
        rol: 'medico',
        nombres: 'Nombre conservado',
        apellidos: 'Prueba',
        passwordHash: 'existing-hash',
      },
    });
    await db.consultorio.create({ data: { nombre: 'Consultorio ajeno' } });
    runSeed();
    const before = await db.horarioMedico.findMany({ orderBy: { id: 'asc' } });
    runSeed();
    expect(await db.horarioMedico.findMany({ orderBy: { id: 'asc' } })).toEqual(
      before,
    );
    expect(await db.usuario.count()).toBe(4);
    expect(await db.medico.count()).toBe(2);
    expect(await db.especialidad.count()).toBe(2);
    expect(await db.consultorio.count()).toBe(3);
    expect(before).toHaveLength(5);
    expect(
      before.map((s) => [
        s.diaSemana,
        s.horaInicio.toISOString().slice(11, 16),
        s.horaFin.toISOString().slice(11, 16),
        s.duracionCitaMin,
      ]),
    ).toEqual([
      [1, '08:00', '12:00', 20],
      [3, '08:00', '12:00', 20],
      [5, '08:00', '12:00', 20],
      [2, '09:00', '12:00', 30],
      [4, '09:00', '12:00', 30],
    ]);
    expect(
      await db.usuario.findUnique({ where: { username: 'demo.medico' } }),
    ).toMatchObject({
      nombres: 'Nombre conservado',
      passwordHash: 'existing-hash',
    });
    expect(await db.paciente.count()).toBe(0);
    expect(await db.cita.count()).toBe(0);
  });

  it('rolls back all additions when an existing demo schedule conflicts', async () => {
    const schedule = await db.horarioMedico.findFirstOrThrow();
    await db.horarioMedico.update({
      where: { id: schedule.id },
      data: { duracionCitaMin: 40 },
    });
    await db.usuario.delete({ where: { username: 'demo.enfermeria' } });
    expect(runSeed).toThrow();
    expect(
      await db.usuario.findUnique({ where: { username: 'demo.enfermeria' } }),
    ).toBeNull();
    expect(
      await db.horarioMedico.findUnique({ where: { id: schedule.id } }),
    ).toMatchObject({ duracionCitaMin: 40 });
  });
});
