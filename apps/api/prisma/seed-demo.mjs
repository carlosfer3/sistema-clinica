import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

if (process.env.NODE_ENV === 'production') {
  throw new Error('Demo data must not be seeded in production');
}

const password = process.env.DEMO_PASSWORD;
if (
  !password ||
  password.length < 12 ||
  Buffer.byteLength(password, 'utf8') > 72
) {
  throw new Error(
    'Set DEMO_PASSWORD to 12 or more characters and at most 72 UTF-8 bytes',
  );
}

const prisma = new PrismaClient();
try {
  const passwordHash = await hash(password, 12);
  const users = [
    {
      username: 'demo.admision',
      rol: 'admision',
      nombres: 'Admision',
      apellidos: 'Ficticia',
    },
    {
      username: 'demo.medico',
      rol: 'medico',
      nombres: 'Medico',
      apellidos: 'Ficticio',
    },
    {
      username: 'demo.medico.pediatria',
      rol: 'medico',
      nombres: 'Medico Pediatria',
      apellidos: 'Ficticio',
    },
    {
      username: 'demo.enfermeria',
      rol: 'enfermeria',
      nombres: 'Enfermeria',
      apellidos: 'Ficticia',
    },
  ];
  const doctors = [
    {
      username: 'demo.medico',
      specialty: 'Medicina General (DEMO)',
      cmp: 'DEMO0001',
      room: 'Consultorio DEMO 1',
      days: [1, 3, 5],
      start: '08:00',
      end: '12:00',
      duration: 20,
    },
    {
      username: 'demo.medico.pediatria',
      specialty: 'Pediatria (DEMO)',
      cmp: 'DEMO0002',
      room: 'Consultorio DEMO 2',
      days: [2, 4],
      start: '09:00',
      end: '12:00',
      duration: 30,
    },
  ];
  // TIME values use a fixed UTC anchor, preserving America/Lima wall-clock hours.
  const time = (value) => new Date(`1970-01-01T${value}:00.000Z`);
  await prisma.$transaction(
    async (tx) => {
      const accounts = new Map();
      for (const user of users) {
        const account = await tx.usuario.upsert({
          where: { username: user.username },
          update: {},
          create: { ...user, passwordHash },
        });
        if (account.rol !== user.rol || !account.activo) {
          throw new Error(
            `Demo account ${user.username} has an incompatible role or is inactive`,
          );
        }
        accounts.set(user.username, account);
      }
      for (const fixture of doctors) {
        const specialty = await tx.especialidad.upsert({
          where: { nombre: fixture.specialty },
          update: {},
          create: {
            nombre: fixture.specialty,
            descripcion: 'Datos ficticios para desarrollo local',
          },
        });
        const room = await tx.consultorio.upsert({
          where: { nombre: fixture.room },
          update: {},
          create: { nombre: fixture.room },
        });
        if (!room.activo)
          throw new Error(`Demo room ${fixture.room} is inactive`);
        const doctor = await tx.medico.upsert({
          where: { usuarioId: accounts.get(fixture.username).id },
          update: {},
          create: {
            usuarioId: accounts.get(fixture.username).id,
            especialidadId: specialty.id,
            cmp: fixture.cmp,
          },
        });
        if (
          doctor.cmp !== fixture.cmp ||
          doctor.especialidadId !== specialty.id
        ) {
          throw new Error(
            `Demo doctor ${fixture.username} has incompatible existing data`,
          );
        }
        for (const day of fixture.days) {
          const schedule = await tx.horarioMedico.upsert({
            where: {
              medicoId_diaSemana_horaInicio: {
                medicoId: doctor.id,
                diaSemana: day,
                horaInicio: time(fixture.start),
              },
            },
            update: {},
            create: {
              medicoId: doctor.id,
              consultorioId: room.id,
              diaSemana: day,
              horaInicio: time(fixture.start),
              horaFin: time(fixture.end),
              duracionCitaMin: fixture.duration,
            },
          });
          if (
            schedule.consultorioId !== room.id ||
            schedule.horaFin.getTime() !== time(fixture.end).getTime() ||
            schedule.duracionCitaMin !== fixture.duration
          ) {
            throw new Error(
              `Demo schedule for ${fixture.username}, day ${day}, has incompatible existing data`,
            );
          }
        }
      }
    },
    { timeout: 15000 },
  );
  console.log(
    'Demo accounts available: demo.admision, demo.medico, demo.medico.pediatria, demo.enfermeria',
  );
  console.log(
    'Demo agenda available: 2 specialties, 2 doctors, 2 rooms and 5 weekly blocks. No patients or appointments created.',
  );
  console.log(
    'Existing accounts and passwords were preserved. Use fictitious data only.',
  );
} finally {
  await prisma.$disconnect();
}
