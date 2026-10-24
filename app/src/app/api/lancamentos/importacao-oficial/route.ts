import { optimisticWhere, concurrencyConflict } from "@/lib/lancamento-version.mjs";
import { createHash, createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { parseOfficialWorkbook, planOfficialImport, type OfficialPlan } from "@/lib/lancamento-official-import";
import { officialFingerprint, operationReceipt, operationWhere } from "@/lib/import-operation";
import { boundedImportForm, MAX_FILE_BYTES, IMPORT_CONTRACT, IMPORT_CONTRACT_VERSION, importError } from "@/lib/official-import-policy.mjs";

export const runtime = "nodejs";
const TOKEN_LIFETIME_MS = 10 * 60 * 1000;
function signature(digest: string, tenantId: string, userId: string, expires: number): string {
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_CONFIGURATION");
  return createHmac("sha256", secret).update(`${IMPORT_CONTRACT}:${IMPORT_CONTRACT_VERSION}:${digest}:${tenantId}:${userId}:${expires}`).digest("hex");
}
function checkToken(token: string, digest: string, tenantId: string, userId: string): boolean {
  const parts = token.split(".");
  const [expiration, sent] = parts;
  const expires = Number(expiration);
  if (parts.length !== 2 || !Number.isSafeInteger(expires) || expires < Date.now() || !/^[0-9a-f]{64}$/.test(sent || "")) return false;
  return timingSafeEqual(Buffer.from(sent, "hex"), Buffer.from(signature(digest, tenantId, userId, expires), "hex"));
}
const view = (plan: OfficialPlan) => ({ rows: plan.rows, resumo: plan.resumo, errors: plan.errors });

export async function POST(req: NextRequest) {
  const requestId = randomUUID(), started = Date.now();
  let session: any, db: any, mode = "upload", rowCount = 0, payloadDigest: string | null = null;
  const reply = (body: Record<string, unknown>, status = 200, category = "SUCCESS") => {
    // Deliberately exclude filenames, digests, tokens, row content, values and exception messages.
    console.info(JSON.stringify({ requestId, flow: IMPORT_CONTRACT, tenantId: session?.tenantId ?? null,
      phase: mode, rows: rowCount, status, category, durationMs: Date.now() - started }));
    return NextResponse.json({ protocol: "10s-import-v1", requestId, ...body }, { status, headers: { "X-Request-Id": requestId, "Cache-Control": "no-store" } });
  };
  try {
    try { ({ db, session } = await requirePermission("fluxo.lancamentos.import")); }
    catch (e: any) { return reply({ safeMessage: e?.status === 403 ? "Sem permissão para importar neste tenant." : "Entre novamente para continuar." }, e?.status === 403 ? 403 : 401, "ACCESS"); }
    const form = await boundedImportForm(req);
    const file = form.get("file"); mode = String(form.get("mode") || "");
    if (!["preview", "confirm", "status"].includes(mode)) throw importError("Modo de importação inválido.");
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".xlsx") || !file.size) throw importError("Selecione um arquivo .xlsx válido e não vazio.");
    if (file.size > MAX_FILE_BYTES) throw importError("O XLSX deve ter no máximo 10 MiB.", 413, "SIZE");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const fileDigest = createHash("sha256").update(bytes).digest("hex");
    const rows = parseOfficialWorkbook(bytes); rowCount = rows.length;
    if (!rows.length) throw importError("A aba LANCAMENTOS não contém linhas de dados.");
    try { payloadDigest = officialFingerprint(rows); } catch (e) { if (mode !== "preview") throw e; }
    const receipt = payloadDigest ? await prisma.importOperation.findUnique({ where: operationWhere(session.tenantId, payloadDigest) }) : null;
    if (receipt) return reply({ ...operationReceipt(receipt), replayed: true }, 200, "REPLAY");
    if (mode === "status") return reply({ state: "UNCONFIRMED", safeMessage: "Resultado ainda não confirmado. A operação pode estar em andamento; reenvie somente o mesmo arquivo." }, 202, "UNCONFIRMED");
    if (mode === "preview") {
      const preview = await planOfficialImport(db, session.tenantId, rows);
      const expires = Date.now() + TOKEN_LIFETIME_MS;
      return reply({ preview: view(preview), state: preview.errors.length ? "INVALID" : "READY",
        ...(!preview.errors.length && payloadDigest ? { previewToken: `${expires}.${signature(payloadDigest, session.tenantId, session.id, expires)}` } : {}) });
    }
    if (!payloadDigest || !checkToken(String(form.get("previewToken") || ""), payloadDigest, session.tenantId, session.id)) {
      throw importError("Prévia expirada ou conteúdo alterado. Gere a prévia novamente.", 409, "PREVIEW");
    }
    const digest = payloadDigest;
    const completed = await prisma.$transaction(async tx => {
      const [lock] = await tx.$queryRaw<{ acquired: boolean }[]>`SELECT pg_try_advisory_xact_lock(hashtextextended(${`import:${session.tenantId}:${IMPORT_CONTRACT}:${IMPORT_CONTRACT_VERSION}:${digest}`}, 0)) AS acquired`;
      if (!lock.acquired) throw importError("Operação em andamento. Consulte o resultado antes de repetir.", 202, "PROCESSING");
      const previous = await tx.importOperation.findUnique({ where: operationWhere(session.tenantId, digest) });
      if (previous) return { receipt: previous, replayed: true };
      const plan = await planOfficialImport(tx, session.tenantId, rows);
      if (plan.errors.length) throw Object.assign(importError("A base mudou ou contém erros. Nenhum lançamento deste lote foi gravado.", plan.resumo.conflitos ? 409 : 422, "PLAN"), { preview: plan });
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`lancamento-seq:${session.tenantId}`}, 0))`;
      const max = await tx.lancamento.findFirst({ where: { tenantId: session.tenantId }, orderBy: { seq: "desc" }, select: { seq: true } });
      let nextSeq = (max?.seq || 0) + 1, created = 0, updated = 0;
      for (const change of plan.changes) {
        if (!change.id) {
          await tx.lancamento.create({ data: { ...change.data, tenantId: session.tenantId, seq: nextSeq++, criadoPor: session.id,
            importado: true, importadoEm: new Date() } as Prisma.LancamentoUncheckedCreateInput }); created++;
        } else {
          const written = await tx.lancamento.updateMany({ where: optimisticWhere(change.id, session.tenantId, change.version), data: change.data as Prisma.LancamentoUncheckedUpdateManyInput });
          if (written.count !== 1) concurrencyConflict(); updated++;
        }
      }
      const receipt = await tx.importOperation.create({ data: { tenantId: session.tenantId, contractType: IMPORT_CONTRACT,
        contractVersion: IMPORT_CONTRACT_VERSION, payloadDigest: digest, fileDigest, actorIdentityId: session.identityId ?? null,
        created, updated, unchanged: plan.resumo.inalterados, warnings: plan.resumo.avisos } });
      return { receipt, replayed: false };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 120000, maxWait: 10000 });
    return reply({ ...operationReceipt(completed.receipt), replayed: completed.replayed });
  } catch (e: any) {
    if (payloadDigest && session && mode === "confirm") {
      // Fresh snapshot after rollback/commit ambiguity; never retry the write blindly.
      try {
        const previous = await prisma.importOperation.findUnique({ where: operationWhere(session.tenantId, payloadDigest) });
        if (previous) return reply({ ...operationReceipt(previous), replayed: true }, 200, "RECOVERED");
      } catch { /* keep uncertain below */ }
    }
    if (e?.safeImportError) return reply({ safeMessage: e.message, ...(e.preview ? { preview: view(e.preview) } : {}),
      ...(e.status === 202 ? { state: "PROCESSING" } : {}) }, e.status, e.category);
    if (e?.status === 409 || e?.code === "P2034") return reply({ safeMessage: "Conflito de edição. Gere uma prévia atualizada; esta tentativa foi revertida." }, 409, "CONFLICT");
    if (mode === "confirm") return reply({ state: "UNCONFIRMED", safeMessage: "Resultado ainda não confirmado. Consulte a operação ou reenvie o mesmo arquivo." }, 503, "UNCONFIRMED");
    return reply({ safeMessage: "Não foi possível processar o arquivo. Tente novamente e informe o código de atendimento." }, 500, "INTERNAL");
  }
}