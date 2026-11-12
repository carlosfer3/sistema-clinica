import { describe, it, expect } from 'vitest';
import { loadCatalog } from '../prisma/seed-cie10.mjs';
import { parseCatalog } from '../scripts/prepare-cie10.mjs';
describe('CIE-10 catalog', () => {
  it('checks the source checksum, unique codes, descriptions and chapter coverage', async () => {
    const rows = await loadCatalog();
    expect(rows.length).toBeGreaterThan(10000);
    const codes = new Set(rows.map((row: { codigo: string }) => row.codigo));
    expect(codes.size).toBe(rows.length);
    for (const code of ['A00', 'I10', 'J00', 'Z00.0']) expect(codes.has(code)).toBe(true);
  });
  it('normalizes public code notation and decodes HTML entities', () => {
    const parsed = parseCatalog('<tr><td>1</td><td>chapter</td><td>group</td><td>A00 - CATEGORÍA</td><td>A001 - DESCRIPCI&Oacute;N</td></tr>');
    expect(parsed.entries[1].codigo).toBe('A00.1');
  });
});
