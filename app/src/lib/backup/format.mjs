import { createHash } from 'node:crypto';
import { TABLES, COLUMNS } from './catalog.mjs';

export const LEGACY_VERSION = '10s-tenant-backup/1';
export const VERSION = '10s-tenant-backup/3';
// Separate from XLSX. A bounded JSON upload also avoids decompression bombs.
export const MAX_BYTES = 8 * 1024 * 1024;
export function fail(code, message = 'Backup incompatível ou inválido.', status = 400) {
  throw Object.assign(new Error(message), { code, status });
}
export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
}
export const digest = value => createHash('sha256').update(canonical(value)).digest('hex');
export function seal(body) { return { ...body, checksum: digest(body) }; }
function validateShape(input, tenantId) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('FORMAT');
  const { checksum, ...body } = input;
  if (body.format !== VERSION) fail('VERSION', 'Backup de outra geração não é compatível com esta instalação PG18. Use um backup novo desta instalação.', 409);
  if (checksum !== digest(body)) fail('CHECKSUM', 'Integridade do backup não confirmada.');
  if (body.tenant?.id !== tenantId) fail('TENANT', 'O backup pertence a outra empresa.', 409);
  if (canonical(Object.keys(body.sections ?? {}).sort()) !== canonical([...TABLES].sort())) fail('SECTIONS');
  for (const table of TABLES) {
    const section = body.sections[table];
    if (!Array.isArray(section.rows) || section.count !== section.rows.length || section.checksum !== digest(section.rows)) fail('SECTION_CHECKSUM');
    const ids = new Set();
    for (const row of section.rows) {
      if (row.tenant_id !== tenantId || typeof row.id !== 'string' || ids.has(row.id)) fail('ROW_TENANT_ID');
      ids.add(row.id);
      if (canonical(Object.keys(row).sort()) !== canonical(COLUMNS[table])) fail('COLUMNS');
    }
  }
  if (!Array.isArray(body.files) || !Array.isArray(body.migrations) || !body.references) fail('MANIFEST');
  if (body.format === VERSION && (!body.historicalReferences || typeof body.historicalReferences !== 'object' || Array.isArray(body.historicalReferences))) fail('HISTORY_PROOF', 'Manifesto autenticado ausente no backup.', 409);
  for (const f of body.files) {
    if (!/^[0-9a-f-]{36}\.pdf$/.test(f.key) || !/^[0-9a-f]{64}$/.test(f.sha256) || !Number.isSafeInteger(f.size) || f.size < 5) fail('FILE_REFERENCE');
  }
  return input;
}
export function validate(input, tenantId) {
  try { return validateShape(input, tenantId); }
  catch (e) { if (e.status) throw e; fail('FORMAT', 'Estrutura do arquivo de backup inválida.'); }
}
export function parse(bytes, tenantId) {
  if (bytes.length > MAX_BYTES) fail('SIZE', 'Backup excede o limite de 8 MB.', 413);
  let value;
  try { value = JSON.parse(bytes.toString('utf8')); } catch { fail('JSON', 'Arquivo de backup inválido.'); }
  return validate(value, tenantId);
}
