import { PrismaClient } from '@prisma/client';
import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { connection, tool } from './db-backup.mjs';

const source = connection();
const directory = fileURLToPath(new URL('../../../docs/database/', import.meta.url));
await mkdir(directory, { recursive: true });
const db = new PrismaClient({ datasourceUrl: source.url });
try {
  const extensions = await db.$queryRaw`SELECT e.extname FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace WHERE n.nspname = ${source.schema}`;
  const result = spawnSync(tool('pg_dump'), ['--no-password', '--schema-only', '--no-owner', '--no-privileges', `--schema=${source.schema}`, ...extensions.map(e => `--extension=${e.extname}`)], { env: source.env, encoding: 'utf8', windowsHide: true, maxBuffer: 20 * 1024 * 1024 });
  if (result.status !== 0) throw new Error('No se pudo exportar el esquema.');
  const [{ version }] = await db.$queryRaw`SELECT current_setting('server_version_num') AS version`;
  let sql = result.stdout.replace(/^\\(?:un)?restrict .*\r?\n/gm, '');
  if (Number(version) < 170000) sql = sql.replace(/^SET transaction_timeout = 0;\r?\n/m, '');
  await writeFile(path.join(directory, 'schema.sql'), sql, 'utf8');
  const columns = await db.$queryRaw`SELECT table_name, column_name, data_type, udt_name, character_maximum_length, is_nullable, column_default FROM information_schema.columns WHERE table_schema=${source.schema} ORDER BY table_name, ordinal_position`;
  const enums = await db.$queryRaw`SELECT t.typname, e.enumlabel FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname=${source.schema} ORDER BY t.typname,e.enumsortorder`;
  const indexes = await db.$queryRaw`SELECT t.relname AS tabla, i.indisprimary AS primaria, array_agg(a.attname ORDER BY k.ord) AS columnas FROM pg_index i JOIN pg_class t ON t.oid=i.indrelid JOIN pg_namespace n ON n.oid=t.relnamespace CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(attnum,ord) JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=k.attnum WHERE n.nspname=${source.schema} AND i.indisunique GROUP BY t.relname,i.indexrelid,i.indisprimary ORDER BY t.relname,i.indexrelid`;
  const refs = await db.$queryRaw`SELECT s.relname AS origen, a.attname AS columna, d.relname AS destino, b.attname AS referencia FROM pg_constraint c JOIN pg_class s ON s.oid=c.conrelid JOIN pg_namespace n ON n.oid=s.relnamespace JOIN pg_class d ON d.oid=c.confrelid CROSS JOIN LATERAL generate_subscripts(c.conkey,1) k(pos) JOIN pg_attribute a ON a.attrelid=s.oid AND a.attnum=c.conkey[k.pos] JOIN pg_attribute b ON b.attrelid=d.oid AND b.attnum=c.confkey[k.pos] WHERE c.contype='f' AND n.nspname=${source.schema} ORDER BY s.relname,a.attname`;
  let output = '// Generado desde PostgreSQL por npm run docs:schema. Sin datos personales.\n// CHECK, triggers, exclusiones GiST y funciones: ver schema.sql.\n';
  for (const name of [...new Set(enums.map(e => e.typname))]) output += `\nEnum "${name}" {\n${enums.filter(e => e.typname === name).map(e => `  "${e.enumlabel}"`).join('\n')}\n}\n`;
  for (const table of [...new Set(columns.map(c => c.table_name))]) {
    output += `\nTable "${table}" {\n`;
    for (const column of columns.filter(c => c.table_name === table)) {
      const type = column.data_type === 'USER-DEFINED' ? `"${column.udt_name}"` : column.character_maximum_length ? `varchar(${column.character_maximum_length})` : `"${column.data_type}"`;
      output += `  "${column.column_name}" ${type}${column.is_nullable === 'NO' ? ' [not null]' : ''}\n`;
    }
    output += '  indexes {\n';
    for (const index of indexes.filter(i => i.tabla === table)) output += `    (${index.columnas.map(c => `"${c}"`).join(', ')}) [${index.primaria ? 'pk' : 'unique'}]\n`;
    output += '  }\n}\n';
  }
  for (const ref of refs) output += `\nRef: "${ref.origen}"."${ref.columna}" > "${ref.destino}"."${ref.referencia}"`;
  await writeFile(path.join(directory, 'schema.dbml'), output + '\n', 'utf8');
  console.log(`Modelo exportado: ${new Set(columns.map(c => c.table_name)).size} tablas.`);
} finally { await db.$disconnect(); }
