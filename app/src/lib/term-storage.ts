import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";

export const MAX_TERM_PDF_BYTES = 10 * 1024 * 1024;

function storageDirectory() {
  const configured = process.env.TERM_STORAGE_DIR;
  if (process.env.NODE_ENV === "production" && !configured) {
    throw new Error("TERM_STORAGE_DIR deve apontar para um volume privado e persistente.");
  }
  if (configured && !isAbsolute(configured)) throw new Error("TERM_STORAGE_DIR deve ser um caminho absoluto.");
  const directory = configured || join(/*turbopackIgnore: true*/ process.cwd(), ".private", "terms");
  for (const forbidden of [join(/*turbopackIgnore: true*/ process.cwd(), "public"), join(/*turbopackIgnore: true*/ process.cwd(), ".next")]) {
    const child = relative(forbidden, directory);
    if (!child.startsWith("..") && !isAbsolute(child)) throw new Error("O armazenamento de termos não pode ser público.");
  }
  return directory;
}

export function termPdfHash(bytes: Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function saveTermPdf(file: File) {
  if (file.type !== "application/pdf" || file.size < 5 || file.size > MAX_TERM_PDF_BYTES) {
    throw Object.assign(new Error("Envie um PDF de até 10 MB."), { status: 400 });
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.subarray(0, 5).toString() !== "%PDF-") {
    throw Object.assign(new Error("O arquivo não é um PDF válido."), { status: 400 });
  }
  const storageKey = `${randomUUID()}.pdf`;
  const directory = storageDirectory();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(join(/*turbopackIgnore: true*/ directory, storageKey), bytes, { flag: "wx", mode: 0o600 });
  return { storageKey, mimeType: "application/pdf", byteSize: bytes.length, sha256: termPdfHash(bytes) };
}

export async function readTermPdf(storageKey: string, expectedHash: string) {
  if (!/^[0-9a-f-]{36}\.pdf$/.test(storageKey)) throw new Error("Referência de arquivo inválida.");
  const bytes = await readFile(join(/*turbopackIgnore: true*/ storageDirectory(), storageKey));
  if (termPdfHash(bytes) !== expectedHash) throw new Error("Integridade do PDF não confirmada.");
  return bytes;
}

export async function discardTermPdf(storageKey: string) {
  if (/^[0-9a-f-]{36}\.pdf$/.test(storageKey)) await unlink(join(/*turbopackIgnore: true*/ storageDirectory(), storageKey)).catch(() => {});
}
