import { fingerprintRows } from "./import-fingerprint.mjs";
import { canonicalCells, OFFICIAL_HEADERS, type OfficialFileRow } from "./lancamento-official-import";
import { IMPORT_CONTRACT, IMPORT_CONTRACT_VERSION, importError } from "./official-import-policy.mjs";

export function officialFingerprint(rows: OfficialFileRow[]): string {
  const canonical = rows.map(row => {
    const { cells, errors } = canonicalCells(row.cells);
    if (errors.length) throw importError(`Linha ${row.linha}: ${errors.join("; ")}`);
    return OFFICIAL_HEADERS.map(header => cells[header]);
  });
  return fingerprintRows(canonical);
}
export function operationWhere(tenantId: string, payloadDigest: string) {
  return { tenantId_contractType_contractVersion_payloadDigest: {
    tenantId, contractType: IMPORT_CONTRACT, contractVersion: IMPORT_CONTRACT_VERSION, payloadDigest,
  } };
}
export function operationReceipt(row: any) {
  return { operationId: row.id, completedAt: row.completedAt, state: "COMPLETED",
    result: { criados: row.created, atualizados: row.updated, inalterados: row.unchanged, avisos: row.warnings } };
}
