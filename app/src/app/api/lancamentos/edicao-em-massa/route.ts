import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireEscrita } from "@/lib/tenant";
import { resolveAccountSelection } from "@/lib/lancamento-counterparty";

const FIELDS = new Set(["dataPagamento", "dataVencOriginal", "dataVencPlano", "categoria", "contaId", "statusManual", "centroCusto", "banco"]);
const DATES = new Set(["dataPagamento", "dataVencOriginal", "dataVencPlano"]);
type Changes = Record<string, string | null>;

function fail(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}

function parseChanges(value: unknown): Record<string, string | Date | null> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("Selecione os campos a alterar.");
  const entries = Object.entries(value as Changes);
  if (!entries.length || entries.some(([key]) => !FIELDS.has(key))) fail("Campo não permitido para edição em massa.");
  const result: Record<string, string | Date | null> = {};
  for (const [key, raw] of entries) {
    if (raw !== null && typeof raw !== "string") fail(`Valor inválido para ${key}.`);
    const text = raw?.trim() || null;
    if (DATES.has(key)) {
      if (text && !/^\d{4}-\d{2}-\d{2}$/.test(text)) fail(`Data inválida em ${key}.`);
      const date = text ? new Date(`${text}T00:00:00.000Z`) : null;
      if (text && (!date || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text)) fail(`Data inválida em ${key}.`);
      result[key] = date;
    } else {
      if (text && text.length > 255) fail(`Texto longo demais em ${key}.`);
      result[key] = text;
    }
  }
  return result;
}

function printable(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

export async function POST(req: NextRequest) {
  let session: Awaited<ReturnType<typeof requireEscrita>>["session"];
  try { ({ session } = await requireEscrita()); }
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
      if (rows.length !== ids.length) fail("Um ou mais lançamentos não existem neste tenant. Nenhuma alteração foi feita.", 409);

      let categoryCode: string | null | undefined;
      if (Object.hasOwn(changes, "categoria")) {
        categoryCode = changes.categoria as string | null;
        if (categoryCode) {
          const category = await tx.categoria.findFirst({ where: { tenantId, codigo: categoryCode, ativo: true } });
          if (!category) fail("Categoria N1 inexistente, inativa ou de outro tenant.");
        }
      }
      if (Object.hasOwn(changes, "statusManual") && changes.statusManual) {
        const status = await tx.statusManualTipo.findFirst({ where: { tenantId, codigo: changes.statusManual as string, ativo: true } });
        if (!status) fail("Status Manual inexistente ou inativo neste tenant.");
      }

      const prepared = [];
      for (const row of rows) {
        const data: Record<string, string | Date | null> = { ...changes };
        const accountId = Object.hasOwn(changes, "contaId") ? changes.contaId as string | null : row.contaId;
        if (accountId) {
          const resolved = await resolveAccountSelection(tx, tenantId, accountId, null, row.tipo, categoryCode);
          if (Object.hasOwn(changes, "contaId")) {
            data.contaId = accountId;
            data.categoria = resolved.categoria as string;
          } else if (categoryCode !== undefined) {
            data.categoria = resolved.categoria as string;
          }
        } else if (Object.hasOwn(changes, "contaId")) {
          data.contaId = null;
        }
        if (categoryCode === null && accountId) fail(`Lançamento #${row.seq}: Conta N2 exige Categoria N1.`);
        prepared.push({ row, data });
      }

      const before = Object.fromEntries(Object.keys(changes).map(key => {
        const values = new Set(rows.map(row => printable(key === "categoria" && row.conta?.tenantId === tenantId && row.conta.categoria?.tenantId === tenantId
          ? row.conta.categoria.codigo : (row as unknown as Record<string, unknown>)[key])));
        return [key, values.size === 1 ? [...values][0] : "múltiplos valores"];
      }));
      const after = Object.fromEntries(Object.keys(changes).map(key => [key, printable(changes[key])]));
      const implicitCategory = Object.hasOwn(changes, "contaId") && !Object.hasOwn(changes, "categoria") && changes.contaId
        ? printable(prepared[0].data.categoria) : null;
      if (mode === "preview") return { count: rows.length, before, after, implicitCategory, applied: false };

      for (const { row, data } of prepared) {
        const result = await tx.lancamento.updateMany({ where: { id: row.id, tenantId, atualizadoEm: row.atualizadoEm }, data });
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
      : error?.status ? error.message : "Falha na edição em massa. Nenhuma alteração foi gravada." }, { status: error?.status || (error?.code === "P2034" ? 409 : 500) });
  }
}
