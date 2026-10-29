/** Bound untrusted input before allocating/parsing it. No payload enters errors or logs. */
export async function readExperimentBody(req: Request) {
  const fail = (status: number) => Object.assign(new Error("Requisição inválida."), { status });
  if (req.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw fail(415);
  const length = req.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > 2048)) throw fail(413);
  const reader = req.body?.getReader();
  if (!reader) throw fail(400);
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 2048) { await reader.cancel(); throw fail(413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw Error();
    return value;
  } catch { throw fail(400); }
}
