import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "./permissions";
import { boundedImportForm, importError } from "./official-import-policy.mjs";
import { inspectStructureWorkbook } from "./structure-workbook.mjs";
import { structureFingerprint } from "./structure-fingerprint.mjs";

type Definition = {
  contract: "FINANCIAL" | "MANAGEMENT" | "PEOPLE" | "REGISTRATION" | "PRODUCT";
  permission: string;
  parse: (bytes: Uint8Array) => any;
  validate: (parsed: any, db: any, tenantId: string) => Promise<any>;
  locks?: (tenantId: string) => string[];
  apply: (tx: any, preview: any, tenantId: string) => Promise<any>;
};

export function structureImportRoute(def: Definition) {
  const contractType = `STRUCTURE_${def.contract}`, contractVersion = 1;
  const where = (tenantId: string, payloadDigest: string) => ({ tenantId_contractType_contractVersion_payloadDigest: { tenantId, contractType, contractVersion, payloadDigest } });
  const receipt = (r: any, replayed: boolean) => ({ ok: true, state: "COMPLETED", replayed, operationId: r.id, completedAt: r.completedAt,
    resumo: { totalNovo: r.created, totalAtualizado: r.updated, totalSemAlteracao: r.unchanged, totalAvisos: r.warnings,
      totalLido: r.created + r.updated + r.unchanged, totalInvalido: 0 } });
  const sign = (digest: string, tenant: string, actor: string, expires: number) => {
    const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
    if (!secret) throw new Error("AUTH_CONFIGURATION");
    return createHmac("sha256", secret).update(JSON.stringify([contractType,contractVersion,digest,tenant,actor,expires])).digest("hex");
  };
  return async function POST(req: NextRequest) {
    const requestId = randomUUID(), started = Date.now();
    let session: any, db: any, mode = "upload", payloadDigest = "", rows = 0;
    const reply = (body: any, status = 200, category = "SUCCESS") => {
      console.info(JSON.stringify({ requestId, flow: contractType, tenantId: session?.tenantId ?? null, phase: mode, rows, status, category, durationMs: Date.now() - started }));
      return NextResponse.json({ protocol: "10s-import-v1", requestId, ...body }, { status, headers: { "X-Request-Id": requestId, "Cache-Control": "no-store" } });
    };
    try {
      try { ({ db, session } = await requirePermission(def.permission)); }
      catch (e: any) { return reply({ safeMessage: e?.status === 403 ? "Sem permissão para importar neste tenant." : "Entre novamente para continuar." }, e?.status === 403 ? 403 : 401, "ACCESS"); }
      if (session.accessSource === "SUPPORT_GRANT" && session.supportLevel !== "OPERATIONAL") throw importError("Acesso de suporte somente leitura.",403,"ACCESS");
      if (!session.tenantSelecionado) throw importError("Selecione um tenant antes de gravar dados.",409,"ACCESS");
      const form = await boundedImportForm(req), file = form.get("file"); mode = String(form.get("mode") || "");
      if (!["preview","confirm","status"].includes(mode)) throw importError("Operação inválida.");
      if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".xlsx")) throw importError("Selecione um arquivo .xlsx válido.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      rows = inspectStructureWorkbook(bytes, def.contract).rows;
      let parsed;
      try { parsed = def.parse(bytes); } catch { throw importError("Não foi possível ler o arquivo XLSX."); }
      if (parsed.errors.length) {
        const preview = await def.validate(parsed,db,session.tenantId);
        return reply({ preview, state: "INVALID", safeMessage: "A planilha contém erros bloqueantes." },mode === "preview" ? 200 : 422,"PLAN");
      }
      payloadDigest = structureFingerprint(def.contract, parsed);
      const previous = await db.importOperation.findUnique({ where: where(session.tenantId, payloadDigest) });
      if (previous) return reply(receipt(previous, true), 200, "REPLAY");
      if (mode === "status") return reply({ state: "UNCONFIRMED", safeMessage: "Resultado ainda não confirmado. Reenvie somente o mesmo arquivo para consultar." }, 202, "UNCONFIRMED");
      if (mode === "preview") {
        const preview = await def.validate(parsed, db, session.tenantId), expires = Date.now() + 600000;
        return reply({ preview, state: preview.errors.length ? "INVALID" : "READY",
          ...(!preview.errors.length ? { previewToken: `${expires}.${sign(payloadDigest,session.tenantId,session.id,expires)}` } : {}) });
      }
      const parts = String(form.get("previewToken") || "").split("."), expires = Number(parts[0]), sent = parts[1];
      if (parts.length !== 2 || !Number.isSafeInteger(expires) || expires < Date.now() || !/^[a-f0-9]{64}$/.test(sent || "") ||
        !timingSafeEqual(Buffer.from(sent,"hex"), Buffer.from(sign(payloadDigest,session.tenantId,session.id,expires),"hex"))) throw importError("Prévia expirada ou arquivo alterado. Gere a prévia novamente.",409,"PREVIEW");
      const result = await db.$transaction(async (tx: any) => {
        const [lock] = await tx.$queryRaw`SELECT pg_try_advisory_xact_lock(hashtextextended(${`import:${session.tenantId}:${contractType}:${contractVersion}:${payloadDigest}`},0)) AS acquired`;
        if (!lock.acquired) throw importError("Operação em andamento. Reenvie o mesmo arquivo para consultar o resultado.",202,"PROCESSING");
        const old = await tx.importOperation.findUnique({ where: where(session.tenantId,payloadDigest) });
        if (old) return receipt(old,true);
        for (const key of (def.locks?.(session.tenantId) || []).sort()) await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${key},0))`;
        const preview = await def.validate(parsed,tx,session.tenantId);
        if (preview.errors.length) throw Object.assign(importError("A planilha contém erros bloqueantes. Nenhum cadastro deste lote foi gravado.",422,"PLAN"), { preview });
        const applied = await def.apply(tx,preview,session.tenantId);
        const s = preview.resumo;
        const saved = await tx.importOperation.create({ data: { tenantId: session.tenantId, contractType, contractVersion, payloadDigest,
          fileDigest: createHash("sha256").update(bytes).digest("hex"), actorIdentityId: session.identityId ?? null,
          created: s.totalNovo, updated: s.totalAtualizado, unchanged: s.totalSemAlteracao || 0, warnings: s.totalAvisos || 0 } });
        return { ...receipt(saved,false), ...applied };
      }, { isolationLevel: "Serializable", timeout: 120000, maxWait: 10000 });
      return reply(result);
    } catch (e: any) {
      if (db && payloadDigest && mode === "confirm") {
        try { const old = await db.importOperation.findUnique({ where: where(session.tenantId,payloadDigest) }); if (old) return reply(receipt(old,true),200,"RECOVERED"); } catch { /* preserve uncertainty */ }
      }
      if (e?.safeImportError) return reply({ safeMessage: e.message, ...(e.preview ? { preview: e.preview } : {}), ...(e.status === 202 ? { state: "PROCESSING" } : {}) },e.status,e.category);
      if (["P2002","P2034"].includes(e?.code)) return reply({ safeMessage: "Conflito de dados. Gere uma prévia atualizada; esta tentativa foi revertida." },409,"CONFLICT");
      if (mode === "confirm") return reply({ state: "UNCONFIRMED", safeMessage: "Resultado ainda não confirmado. Reenvie somente o mesmo arquivo para consultar; não crie uma cópia do lote." },503,"UNCONFIRMED");
      return reply({ safeMessage: "Não foi possível processar o arquivo. Informe o código de atendimento." },500,"INTERNAL");
    }
  };
}
