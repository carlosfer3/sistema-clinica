import { PrismaClient } from '@prisma/client';
import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, readdir, stat, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(import.meta.url);
const apiRoot = path.resolve(path.dirname(script), '..');
const repoRoot = path.resolve(apiRoot, '../..');
try { process.loadEnvFile(path.join(apiRoot, '.env')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const directory = path.resolve(process.env.BACKUP_DIR || path.join(repoRoot, 'backups'));
const taskName = 'SIGES-SR-Respaldo-Diario';
const quote = name => '"' + name.replaceAll('"', '""') + '"';
const xml = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const checksum = async file => createHash('sha256').update(await readFile(file)).digest('hex');

export function connection(database) {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL no está configurada.');
  const url = new URL(process.env.DATABASE_URL);
  const name = database || decodeURIComponent(url.pathname.slice(1));
  const schema = url.searchParams.get('schema') || 'public';
  const env = { ...process.env, PGHOST: url.hostname, PGPORT: url.port || '5432', PGDATABASE: name, PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGCONNECT_TIMEOUT: '10', PGAPPNAME: 'siges-backup' };
  if (url.searchParams.has('sslmode')) env.PGSSLMODE = url.searchParams.get('sslmode');
  url.pathname = '/' + name;
  return { env, url: url.toString(), name, schema };
}

export function tool(name) {
  if (process.env.PG_BIN) return path.join(process.env.PG_BIN, process.platform === 'win32' ? name + '.exe' : name);
  if (process.platform === 'win32') {
    for (const version of [18, 17, 16]) {
      const candidate = `C:\\Program Files\\PostgreSQL\\${version}\\bin\\${name}.exe`;
      if (existsSync(candidate)) return candidate;
    }
  }
  return name;
}

async function run(executable, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let errors = '';
    child.stderr.on('data', data => { errors += data.toString(); });
    child.stdout.resume();
    child.on('error', () => reject(new Error(`No se pudo iniciar ${path.basename(executable)}. Revisar PG_BIN.`)));
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`${path.basename(executable)} falló (${code}). ${errors.replaceAll(env.PGPASSWORD || '\0', '[REDACTED]')}`)));
  });
}

async function inventory(db, schema) {
  const tables = await db.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname = ${schema} ORDER BY tablename`;
  const result = {};
  for (const { tablename } of tables) {
    const [row] = await db.$queryRawUnsafe(`SELECT count(*)::text AS cantidad, md5(coalesce(string_agg(h, '' ORDER BY h), '')) AS huella FROM (SELECT md5(to_jsonb(t)::text) AS h FROM ${quote(schema)}.${quote(tablename)} t) fingerprints`);
    result[tablename] = row;
  }
  return result;
}

async function createBackup() {
  await mkdir(directory, { recursive: true });
  const source = connection();
  const id = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-') + '-' + randomUUID().slice(0, 8);
  const dump = path.join(directory, `siges-${id}.dump`);
  const pending = dump + '.partial';
  const db = new PrismaClient({ datasourceUrl: source.url });
  try {
    const manifest = await db.$transaction(async tx => {
      const [{ snapshot }] = await tx.$queryRaw`SELECT pg_export_snapshot() AS snapshot`;
      const tables = await inventory(tx, source.schema);
      const extensions = await tx.$queryRaw`SELECT e.extname FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE n.nspname = ${source.schema} ORDER BY e.extname`;
      await run(tool('pg_dump'), ['--no-password', '--format=custom', '--no-owner', '--no-privileges', `--schema=${source.schema}`, ...extensions.map(e => `--extension=${e.extname}`), `--snapshot=${snapshot}`, `--file=${pending}`], source.env);
      return { version: 1, creadoEn: new Date().toISOString(), esquema: source.schema, extensiones: extensions.map(e => e.extname), tablas: tables };
    }, { isolationLevel: 'RepeatableRead', timeout: 300000 });
    await rename(pending, dump);
    await writeFile(dump + '.json', JSON.stringify({ ...manifest, sha256: await checksum(dump) }, null, 2), { flag: 'wx', mode: 0o600 });
    console.log(`Respaldo completado: ${dump}`);
    return dump;
  } finally { await db.$disconnect(); }
}

async function selectedBackup(argument) {
  const files = (await readdir(directory)).filter(name => name.endsWith('.dump')).sort().reverse();
  const file = argument ? path.resolve(argument) : path.join(directory, files[0] || '');
  if (!files.length || path.dirname(file) !== directory || !file.endsWith('.dump')) throw new Error('Selecciona un respaldo .dump dentro de BACKUP_DIR.');
  return file;
}

async function verifyBackup(argument) {
  const file = await selectedBackup(argument);
  const manifest = JSON.parse(await readFile(file + '.json', 'utf8'));
  if (manifest.version !== 1 || manifest.sha256 !== await checksum(file)) throw new Error('El respaldo no supera la comprobación SHA-256.');
  const temporary = `siges_restore_test_${randomUUID().replaceAll('-', '')}`;
  const source = connection();
  const target = connection(temporary);
  if (target.name === source.name || !/^siges_restore_test_[a-f0-9]{32}$/.test(target.name)) throw new Error('Destino de restauración inseguro.');
  const admin = new PrismaClient({ datasourceUrl: source.url });
  let restored; let created = false;
  const restoreSql = path.join(directory, `${temporary}.sql`);
  try {
    await admin.$executeRawUnsafe(`CREATE DATABASE ${quote(temporary)} TEMPLATE template0`);
    created = true;
    restored = new PrismaClient({ datasourceUrl: target.url });
    // Only the empty schema in our newly created test database is removed.
    if (manifest.esquema === 'public') await restored.$executeRawUnsafe('DROP SCHEMA public');
    // The installed client can be newer than the server (e.g. client 18/server 16).
    // Generate SQL and remove only the newer client's unsupported session setting.
    await run(tool('pg_restore'), ['--no-owner', '--no-privileges', `--file=${restoreSql}`, file], target.env);
    const [{ version }] = await admin.$queryRaw`SELECT current_setting('server_version_num') AS version`;
    if (Number(version) < 170000) {
      const sql = await readFile(restoreSql, 'utf8');
      await writeFile(restoreSql, sql.replace(/^SET transaction_timeout = 0;\r?\n/m, ''), { mode: 0o600 });
    }
    await run(tool('psql'), ['--no-password', '--no-psqlrc', '--set=ON_ERROR_STOP=1', '--single-transaction', `--file=${restoreSql}`], target.env);
    const actual = await inventory(restored, manifest.esquema);
    if (JSON.stringify(actual) !== JSON.stringify(manifest.tablas)) throw new Error('Las tablas restauradas difieren de la instantánea original.');
    const report = { resultado: 'APROBADO', verificadoEn: new Date().toISOString(), archivo: path.basename(file), sha256: manifest.sha256, tablas: Object.keys(actual).length, registros: Object.values(actual).reduce((sum, row) => sum + Number(row.cantidad), 0), comparacion: 'Cantidad y huella de todas las filas por tabla: idénticas a la instantánea del respaldo.', baseTemporal: temporary };
    await writeFile(file + '.verification.json', JSON.stringify(report, null, 2), { mode: 0o600 });
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await restored?.$disconnect();
    await unlink(restoreSql).catch(error => { if (error.code !== 'ENOENT') throw error; });
    if (created) {
      // Only the newly created, random test database can reach this statement.
      await admin.$executeRawUnsafe(`DROP DATABASE ${quote(temporary)}`);
    }
    await admin.$disconnect();
  }
}

async function install() {
  if (process.platform !== 'win32') throw new Error('Usar cron en este sistema: 0 2 * * * node /ruta/apps/api/scripts/db-backup.mjs create');
  const identity = execFileSync('whoami.exe', ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8', windowsHide: true });
  const sid = identity.match(/S-1-\d+(?:-\d+)+/)?.[0];
  if (!sid) throw new Error('No se pudo identificar el usuario de Windows.');
  await mkdir(directory, { recursive: true });
  const taskFile = path.join(directory, 'daily-backup-task.xml');
  const time = process.env.BACKUP_TIME || '02:00';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('BACKUP_TIME debe usar HH:mm.');
  const definition = `<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
<RegistrationInfo><Description>Respaldo diario de SIGES SR. Recuperación al volver a iniciar sesión.</Description></RegistrationInfo>
<Triggers><CalendarTrigger><StartBoundary>2026-01-01T${time}:00</StartBoundary><Enabled>true</Enabled><ScheduleByDay><DaysInterval>1</DaysInterval></ScheduleByDay></CalendarTrigger></Triggers>
<Principals><Principal id="Author"><UserId>${sid}</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
<Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><StartWhenAvailable>true</StartWhenAvailable><ExecutionTimeLimit>PT15M</ExecutionTimeLimit><RestartOnFailure><Interval>PT15M</Interval><Count>3</Count></RestartOnFailure></Settings>
<Actions Context="Author"><Exec><Command>${xml(process.execPath)}</Command><Arguments>&quot;${xml(script)}&quot; create</Arguments><WorkingDirectory>${xml(apiRoot)}</WorkingDirectory></Exec></Actions>
</Task>`;
  await writeFile(taskFile, '\ufeff' + definition, { encoding: 'utf16le' });
  execFileSync('schtasks.exe', ['/Create', '/TN', taskName, '/XML', taskFile], { stdio: 'inherit', windowsHide: true });
  await unlink(taskFile);
  console.log(`Tarea diaria instalada a las ${time}, hora local. Requiere sesión de Windows iniciada y PostgreSQL disponible.`);
}

async function main() {
  switch (process.argv[2]) {
    case 'create': return createBackup();
    case 'verify': return verifyBackup(process.argv[3]);
    case 'install': return install();
    case 'status': {
      const files = (await readdir(directory)).filter(name => name.endsWith('.dump')).sort().reverse();
      if (!files.length) throw new Error('No hay respaldos.');
      const latest = path.join(directory, files[0]);
      const ageHours = (Date.now() - (await stat(latest)).mtimeMs) / 3600000;
      console.log(JSON.stringify({ archivo: path.basename(latest), antiguedadHoras: Number(ageHours.toFixed(2)), vigente: ageHours <= 24 }, null, 2));
      if (ageHours > 24) process.exitCode = 1;
      return;
    }
    default: throw new Error('Uso: db-backup.mjs create | verify [archivo] | install | status');
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === script) main().catch(error => { console.error(error.message); process.exitCode = 1; });
