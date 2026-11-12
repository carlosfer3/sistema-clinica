import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const sourceUrl = 'https://oite.rischota.gob.pe/modulos/php/llenarcodigos.php';
const decode = value => value.replace(/<[^>]*>/g, '').replace(/&#(x[0-9a-f]+|\d+);/gi, (_, n) => String.fromCodePoint(n[0].toLowerCase() === 'x' ? parseInt(n.slice(1), 16) : Number(n))).replace(/&(amp|quot|apos|lt|gt|nbsp);/g, (_, n) => ({ amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' })[n]).replace(/\s+/g, ' ').trim();
export function parseCatalog(html) {
  const entries = [];
  const rows = [...html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  let count = 0;
  for (const row of rows) {
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(c => decode(c[1]));
    if (cells.length !== 5) continue;
    count++;
    for (const value of cells.slice(3)) {
      const match = /^([A-Z][0-9]{2}(?:\.?[0-9A-Z]{1,4})?)\s+-\s+(.+)$/.exec(value);
      if (!match) throw new Error(`Código sin formato reconocido: ${value}`);
      const raw = match[1].replace('.', '');
      const codigo = raw.length > 3 ? `${raw.slice(0, 3)}.${raw.slice(3)}` : raw;
      if (match[2].length > 250) throw new Error(`Descripción demasiado larga: ${codigo}`);
      entries.push({ codigo, descripcion: match[2] });
    }
  }
  return { count, entries };
}

async function main() {
  const directory = fileURLToPath(new URL('../prisma/catalog/', import.meta.url));
  await mkdir(directory, { recursive: true });
  const entries = new Map(); const sources = [];
  const prefixes = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].flatMap(letter => Array.from({ length: 10 }, (_, n) => letter + n));
  // Small, sequential requests respect the public lookup and avoid its 1000-row search cap.
  for (const prefix of prefixes) {
    const response = await fetch(sourceUrl, { method: 'POST', body: new URLSearchParams({ texto: prefix }), signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Fuente no disponible (${response.status}) para ${prefix}`);
    const html = await response.text();
    const parsed = parseCatalog(html);
    if (parsed.count >= 1000) throw new Error(`Respuesta truncada para ${prefix}; dividir la búsqueda antes de importar.`);
    for (const entry of parsed.entries) {
      const previous = entries.get(entry.codigo);
      if (previous && previous.descripcion !== entry.descripcion) throw new Error(`Descripción contradictoria para ${entry.codigo}`);
      entries.set(entry.codigo, entry);
    }
    sources.push({ prefix, filas: parsed.count, sha256: createHash('sha256').update(html).digest('hex') });
    if (prefix.endsWith('9')) console.log(`Consultado capítulo ${prefix[0]}: ${entries.size} códigos acumulados`);
  }
  if (entries.size < 10000 || !entries.has('Z00.0') || !entries.has('J00')) throw new Error('Cobertura insuficiente del catálogo.');
  const output = JSON.stringify([...entries.values()].sort((a, b) => a.codigo.localeCompare(b.codigo)), null, 2) + '\n';
  await writeFile(path.join(directory, 'cie10-ris-chota.json'), output);
  await writeFile(path.join(directory, 'cie10-source.json'), JSON.stringify({ publicacion: 'RIS Chota — Consulta de la Clasificación de Enfermedades MINSA', pagina: 'https://oite.rischota.gob.pe/modulos/codigos.php', endpoint: sourceUrl, descargadoEn: new Date().toISOString(), registros: entries.size, sha256: createHash('sha256').update(output).digest('hex'), normalizacion: 'Inserción de punto después del tercer carácter. Categorías y subcategorías; se preservan las descripciones publicadas.', consultas: sources }, null, 2) + '\n');
  console.log(`Catálogo preparado: ${entries.size} códigos.`);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
