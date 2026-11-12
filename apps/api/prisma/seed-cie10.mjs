import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export async function loadCatalog() {
  const directory = new URL('./catalog/', import.meta.url);
  const raw = await readFile(new URL('cie10-ris-chota.json', directory), 'utf8');
  const metadata = JSON.parse(await readFile(new URL('cie10-source.json', directory), 'utf8'));
  if (metadata.sha256 !== createHash('sha256').update(raw).digest('hex')) throw new Error('El catálogo no coincide con su SHA-256.');
  const entries = JSON.parse(raw);
  if (entries.length !== metadata.registros || entries.length < 10000) throw new Error('Catálogo incompleto.');
  const codes = new Set();
  for (const entry of entries) {
    if (!/^[A-Z][0-9]{2}(\.[0-9A-Z]{1,4})?$/.test(entry.codigo) || typeof entry.descripcion !== 'string' || !entry.descripcion.trim() || entry.descripcion.length > 250 || codes.has(entry.codigo)) throw new Error('Entrada inválida o duplicada en el catálogo.');
    codes.add(entry.codigo);
  }
  return entries;
}
export async function seedCatalog(db) {
  const entries = await loadCatalog();
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(917253)::text AS locked`;
    let inserted = 0;
    for (let i = 0; i < entries.length; i += 500) inserted += (await tx.cie10.createMany({ data: entries.slice(i, i + 500), skipDuplicates: true })).count;
    return { fuente: entries.length, insertados: inserted, existentes: entries.length - inserted };
  }, { timeout: 60000 });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const db = new PrismaClient();
  try { console.log(JSON.stringify(await seedCatalog(db))); } finally { await db.$disconnect(); }
}
