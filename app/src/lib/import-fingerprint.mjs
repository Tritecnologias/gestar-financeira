import { createHash } from 'node:crypto';
import { IMPORT_CONTRACT, IMPORT_CONTRACT_VERSION } from './official-import-policy.mjs';
export function fingerprintRows(canonicalRows) {
  const serialized = canonicalRows.map(row => JSON.stringify(row)).sort();
  return createHash('sha256').update(JSON.stringify([IMPORT_CONTRACT, IMPORT_CONTRACT_VERSION, serialized])).digest('hex');
}
