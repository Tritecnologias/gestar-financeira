import { inflateRawSync } from 'node:zlib';
import { importError, MAX_FILE_BYTES } from './official-import-policy.mjs';
const MAX_EXPANDED = 64 * 1024 * 1024;
const MAX_ENTRIES = 512;
function fail() { throw importError('XLSX inválido ou estrutura excede os limites de segurança.'); }

/** Inspect every ZIP entry and bound actual expansion before SheetJS. ZIP64/encryption are unsupported. */
export function inspectXlsxEnvelope(bytes) {
  if (!bytes.length) throw importError('Arquivo vazio.');
  if (bytes.length > MAX_FILE_BYTES) throw importError('O XLSX deve ter no máximo 10 MiB.', 413, 'SIZE');
  const b = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (b.length < 22 || b.readUInt32LE(0) !== 0x04034b50) fail();
  let end = -1;
  for (let p = b.length - 22; p >= Math.max(0, b.length - 65557); p--) {
    if (b.readUInt32LE(p) === 0x06054b50 && p + 22 + b.readUInt16LE(p + 20) === b.length) { end = p; break; }
  }
  if (end < 0 || b.readUInt16LE(end + 4) || b.readUInt16LE(end + 6)) fail();
  const n = b.readUInt16LE(end + 10), size = b.readUInt32LE(end + 12), start = b.readUInt32LE(end + 16);
  if (!n || n > MAX_ENTRIES || n !== b.readUInt16LE(end + 8) || start + size !== end) fail();
  const names = new Set(); let expanded = 0, p = start, worksheets = 0;
  for (let i = 0; i < n; i++) {
    if (p + 46 > end || b.readUInt32LE(p) !== 0x02014b50) fail();
    const flags = b.readUInt16LE(p + 8), method = b.readUInt16LE(p + 10), compressed = b.readUInt32LE(p + 20), actual = b.readUInt32LE(p + 24);
    const nameLen = b.readUInt16LE(p + 28), extra = b.readUInt16LE(p + 30), comment = b.readUInt16LE(p + 32), offset = b.readUInt32LE(p + 42);
    if (p + 46 + nameLen + extra + comment > end || flags & 1 || ![0, 8].includes(method) || actual > MAX_EXPANDED - expanded) fail();
    const name = b.toString('utf8', p + 46, p + 46 + nameLen);
    if (!name || names.has(name) || name.includes('..') || name.startsWith('/') || name.includes('\\')) fail();
    names.add(name);
    if (offset + 30 > start || b.readUInt32LE(offset) !== 0x04034b50 || b.readUInt16LE(offset + 8) !== method) fail();
    const localNameLen = b.readUInt16LE(offset + 26), dataStart = offset + 30 + localNameLen + b.readUInt16LE(offset + 28);
    if (dataStart + compressed > start || b.toString('utf8', offset + 30, offset + 30 + localNameLen) !== name) fail();
    let data;
    try { data = method === 0 ? b.subarray(dataStart, dataStart + compressed) : inflateRawSync(b.subarray(dataStart, dataStart + compressed), { maxOutputLength: Math.min(MAX_EXPANDED - expanded, actual) + 1 }); }
    catch { fail(); }
    if (data.length !== actual) fail();
    expanded += data.length;
    if (/vbaProject|externalLinks/i.test(name)) fail();
    if (name === '[Content_Types].xml' && !data.toString().includes('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml')) fail();
    // Prevent huge sparse ranges BEFORE conversion into a SheetJS matrix.
    if (/^xl\/worksheets\/[^/]+\.xml$/.test(name)) {
      if (++worksheets > 2) throw importError('Use somente LANCAMENTOS e, opcionalmente, INSTRUCOES.');
      const xml = data.toString('utf8');
      if (/<!DOCTYPE|<!ENTITY/i.test(xml)) fail();
      const refs = xml.matchAll(/\b(?:r|ref)="([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?"/g);
      let cells = 0;
      for (const m of refs) {
        for (const [letters, row] of [[m[1], m[2]], [m[3], m[4]]]) if (letters) {
          const col = [...letters].reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0);
          if (col > 64 || Number(row) > 10001) throw importError('Planilha excede 10.000 linhas de dados ou 64 colunas.');
        }
        if (++cells > 650000) fail();
      }
    }
    p += 46 + nameLen + extra + comment;
  }
  if (p !== end || !names.has('[Content_Types].xml') || !names.has('xl/workbook.xml')) fail();
  return { entries: n, expandedBytes: expanded };
}
