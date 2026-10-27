import { withAdvisoryAudit } from "@/lib/advisory-request";
import { optimisticWhere, versionToken, concurrencyConflict } from "@/lib/lancamento-version.mjs";
import { validateLancamentoLinks } from "@/lib/lancamento-validation";
import { normalizeLancamento } from "@/lib/lancamento-input.mjs";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";

const FIELDS = new Set(["dataPagamento", "dataVencOriginal", "dataVencPlano", "categoria", "contaId", "statusManual", "centroCusto", "banco"]);
type Changes = Record<string, string | null>;

function fail(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}

function parseChanges(value: unknown): Record<string, string | Date | null> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("Selecione os campos a alterar.");
  const entries = Object.entries(value as Changes);
  if (!entries.length || entries.some(([key]) => !FIELDS.has(key))) fail("Campo não permitido para edição em massa.");
  return normalizeLancamento(value);
}

function printable(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

async function advisoryPOST(req: NextRequest) {
  let session: Awaited<ReturnType<typeof requirePermission>>["session"];
  try { ({ session } = await requirePermission("fluxo.lancamentos.bulk_edit")); }
  catch (error: any) { return NextResponse.json({ error: error?.message || "Não autenticado" }, { status: error?.status || 401 }); }

  try {
    const body = await req.json();
    const { mode, ids } = body;
    if (mode !== "preview" && mode !== "apply") fail("Operação inválida.");
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 500 ||
      ids.some(id => typeof id !== "string" || !id.trim()) || new Set(ids).size !== ids.length) {
      fail("Selecione de 1 a 500 lançamentos distintos e carregados.");
    }
    const changes = parseChanges(body.changes);
    const tenantId = session.tenantId;

    const execute = async (tx: Prisma.TransactionClient) => {
      const rows = await tx.lancamento.findMany({ where: { tenantId, id: { in: ids } }, orderBy: { seq: "asc" },
        include: { conta: { select: { tenantId: true, categoria: { select: { tenantId: true, codigo: true } } } } } });
      if (rows.length !== ids.length) fail("Um ou mais lançamentos não existem neste tenant. Nenhuma alteração foi feita.", 404);

      const prepared = [];
      for (const row of rows) {
        if (mode === "apply" && optimisticWhere(row.id, tenantId, body.versions?.[row.id]).revisao !== row.revisao) concurrencyConflict();
        const data = await validateLancamentoLinks(tx, tenantId, { ...changes }, row);
        prepared.push({ row, data });
      }
      const versions = Object.fromEntries(rows.map(row => [row.id, versionToken(row.revisao)]));

      const before = Object.fromEntries(Object.keys(changes).map(key => {
        const values = new Set(rows.map(row => printable(key === "categoria" && row.conta?.tenantId === tenantId && row.conta.categoria?.tenantId === tenantId
          ? row.conta.categoria.codigo : (row as unknown as Record<string, unknown>)[key])));
        return [key, values.size === 1 ? [...values][0] : "múltiplos valores"];
      }));
      const after = Object.fromEntries(Object.keys(changes).map(key => [key, printable(changes[key])]));
      const implicitCategory = Object.hasOwn(changes, "contaId") && !Object.hasOwn(changes, "categoria") && changes.contaId
        ? printable(prepared[0].data.categoria) : null;
      if (mode === "preview") return { count: rows.length, versions, before, after, implicitCategory, applied: false };

      for (const { row, data } of prepared) {
        const result = await tx.lancamento.updateMany({ where: optimisticWhere(row.id, tenantId, body.versions?.[row.id]), data });
        if (result.count !== 1) fail(`Lançamento #${row.seq} mudou durante a operação. Nenhuma alteração foi gravada.`, 409);
      }
      return { count: rows.length, before, after, implicitCategory, applied: true };
    };

    const result = mode === "apply"
      ? await prisma.$transaction(execute, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 60000 })
      : await prisma.$transaction(execute, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 10000, timeout: 30000 });
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error?.code === "P2034" ? "Conflito de edição simultânea. Nenhuma alteração foi gravada; revise a prévia e tente novamente."
      : error?.status ? error.message : error instanceof SyntaxError ? "Envie um JSON válido." : "Falha na edição em massa. Nenhuma alteração foi gravada." }, { status: error?.status || (error?.code === "P2034" ? 409 : error instanceof SyntaxError ? 400 : 500) });
  }
}

export const POST = withAdvisoryAudit("/api/lancamentos/edicao-em-massa", "POST", advisoryPOST);
