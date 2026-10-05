import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { parseOfficialWorkbook, planOfficialImport, type OfficialPlan } from "@/lib/lancamento-official-import";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const TOKEN_LIFETIME_MS = 10 * 60 * 1000;
function signature(digest: string, tenantId: string, userId: string, expires: number): string {
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  if (!secret) throw new Error("Segredo de autenticação indisponível.");
  return createHmac("sha256", secret).update(`${digest}:${tenantId}:${userId}:${expires}`).digest("hex");
}
function checkToken(token: string, digest: string, tenantId: string, userId: string): boolean {
  const [expiration, sent] = token.split(".");
  const expires = Number(expiration);
  if (!Number.isSafeInteger(expires) || expires < Date.now() || !/^[0-9a-f]{64}$/.test(sent || "")) return false;
  const expected = signature(digest, tenantId, userId, expires);
  return timingSafeEqual(Buffer.from(sent, "hex"), Buffer.from(expected, "hex"));
}

export async function POST(req: NextRequest) {
  let db: any, session: any;
  try { ({ db, session } = await requirePermission("fluxo.lancamentos.import")); }
  catch (error: any) { return NextResponse.json({ error: error?.message || "Não autorizado" }, { status: error?.status || 401 }); }
  let form: FormData;
  try { form = await req.formData(); }
  catch { return NextResponse.json({ error: "Envie um arquivo XLSX válido." }, { status: 400 }); }
  const file = form.get("file");
  const mode = form.get("mode");
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".xlsx") || file.size > MAX_FILE_SIZE || !file.size) {
    return NextResponse.json({ error: "Selecione um XLSX de até 10 MB." }, { status: 400 });
  }
  if (mode !== "preview" && mode !== "confirm") return NextResponse.json({ error: "Modo inválido." }, { status: 400 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const digest = createHash("sha256").update(bytes).digest("hex");
  let rows: ReturnType<typeof parseOfficialWorkbook>;
  try { rows = parseOfficialWorkbook(bytes); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Não foi possível ler o XLSX." }, { status: 400 }); }
  if (mode === "preview") {
    const preview = await planOfficialImport(db, session.tenantId, rows);
    const expires = Date.now() + TOKEN_LIFETIME_MS;
    return NextResponse.json({ preview: { rows: preview.rows, resumo: preview.resumo, errors: preview.errors },
      previewToken: `${expires}.${signature(digest, session.tenantId, session.id, expires)}` });
  }
  if (!checkToken(String(form.get("previewToken") || ""), digest, session.tenantId, session.id)) {
    return NextResponse.json({ error: "Prévia expirada ou arquivo alterado. Gere a prévia novamente." }, { status: 409 });
  }
  try {
    const result = await prisma.$transaction(async tx => {
      // Every read and write inside this transaction includes the authenticated tenantId.
      const plan = await planOfficialImport(tx, session.tenantId, rows);
      if (plan.errors.length) throw Object.assign(new Error("A base mudou ou contém erros. Nenhum lançamento foi gravado."), { preview: plan });
      const max = await tx.lancamento.findFirst({ where: { tenantId: session.tenantId }, orderBy: { seq: "desc" }, select: { seq: true } });
      let nextSeq = (max?.seq || 0) + 1;
      let created = 0, updated = 0;
      for (const change of plan.changes) {
        if (!change.id) {
          await tx.lancamento.create({ data: { ...change.data, tenantId: session.tenantId, seq: nextSeq++, criadoPor: session.id,
            importado: true, importadoEm: new Date() } as Prisma.LancamentoUncheckedCreateInput });
          created++;
        } else {
          const written = await tx.lancamento.updateMany({ where: { id: change.id, tenantId: session.tenantId, atualizadoEm: new Date(change.version) }, data: change.data as Prisma.LancamentoUncheckedUpdateManyInput });
          if (written.count !== 1) throw new Error("CONFLITO — REGISTRO ALTERADO APÓS A EXPORTAÇÃO. Nenhum lançamento foi gravado.");
          updated++;
        }
      }
      return { criados: created, atualizados: updated, inalterados: plan.resumo.inalterados, avisos: plan.resumo.avisos };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 120000, maxWait: 10000 });
    return NextResponse.json({ result });
  } catch (error: any) {
    const plan = error?.preview as OfficialPlan | undefined;
    return NextResponse.json({ error: error?.message || "Falha ao confirmar. A transação foi revertida.",
      ...(plan ? { preview: { rows: plan.rows, resumo: plan.resumo, errors: plan.errors } } : {}) }, { status: 409 });
  }
}
