import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

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
      username: 'demo.enfermeria',
      rol: 'enfermeria',
      nombres: 'Enfermeria',
      apellidos: 'Ficticia',
    },
  ];
  await prisma.$transaction(
    users.map((user) =>
      prisma.usuario.upsert({
        where: { username: user.username },
        update: {},
        create: { ...user, passwordHash },
      }),
    ),
  );
  console.log(
    'Demo accounts available: demo.admision, demo.medico, demo.enfermeria',
  );
  console.log(
    'Existing accounts and passwords were preserved. Use fictitious data only.',
  );
} finally {
  await prisma.$disconnect();
}
