export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_BODY_BYTES = MAX_FILE_BYTES + 64 * 1024;
export const MAX_DATA_ROWS = 10000;
export const IMPORT_CONTRACT = 'LANCAMENTOS_OFFICIAL';
// Frozen canonical algorithm. An upgrade MUST reconcile existing receipts before enabling another version.
export const IMPORT_CONTRACT_VERSION = 1;
export function importError(message, status = 400, category = 'VALIDATION') {
  return Object.assign(new Error(message), { status, category, safeImportError: true });
}

/** Bound the actual request stream BEFORE multipart allocation; Content-Length alone is not trusted. */
export async function boundedImportForm(request) {
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length)))) throw importError('Tamanho de envio inválido.');
  if (length && Number(length) > MAX_BODY_BYTES) throw importError('O XLSX deve ter no máximo 10 MiB.', 413, 'SIZE');
  const contentType = request.headers.get('content-type') || '';
  if (!/^multipart\/form-data;.*boundary=/i.test(contentType)) throw importError('Envie o arquivo pelo formulário XLSX.');
  if (!request.body) throw importError('Arquivo vazio.');
  const reader = request.body.getReader();
  const chunks = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) { await reader.cancel(); throw importError('O XLSX deve ter no máximo 10 MiB.', 413, 'SIZE'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return await new Response(new Blob(chunks), { headers: { 'Content-Type': contentType } }).formData(); }
  catch { throw importError('Envio multipart inválido. Selecione novamente o XLSX.'); }
}
