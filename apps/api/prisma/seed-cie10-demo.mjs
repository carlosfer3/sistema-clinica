import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

if (process.env.NODE_ENV === 'production') throw new Error('Demo catalog is not allowed in production');
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
// Minimal demonstration subset, not the complete classification.
// WHO ICD-10: https://icd.who.int/browse10/2019/en
// J00: https://www.paho.org/sites/default/files/2022-04/REVELAC-Generic-Protocol-COVID-19_vaccine_effectiveness_e.pdf
// Z00.0: https://classbrowser.nhs.uk/ICD-10-5TH-Edition/vol1/block-z00-z13.htm
const entries = [
  { codigo: 'J00', descripcion: 'Rinofaringitis aguda [resfriado común]' },
  { codigo: 'Z00.0', descripcion: 'Examen médico general' },
];
const db = new PrismaClient();
try {
  await db.$transaction(entries.map(entry => db.cie10.upsert({ where: { codigo: entry.codigo }, create: entry, update: {} })));
  console.log('Demo CIE-10 catalog ready: J00 and Z00.0. Existing descriptions are preserved; no patient data created.');
} finally { await db.$disconnect(); }
