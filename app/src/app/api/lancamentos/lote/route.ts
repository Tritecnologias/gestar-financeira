import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireEscrita } from "@/lib/tenant";
import { parseDateOnly, toLancamentoDTO } from "@/lib/lancamento";
import { counterpartInclude, resolveAccountSelection, resolveCounterpartyLink } from "@/lib/lancamento-counterparty";

type Row = Record<string, unknown>;

function rowError(index: number, message: string, status = 400): Error & { status: number; row: number } {
  return Object.assign(new Error(`Lançamento ${index + 1}: ${message}`), { status, row: index + 1 });
}

function amount(value: unknown, index: number, label: string, required: boolean): number | null {
  if (value === null || value === undefined || value === "" ||
    (typeof value === "string" && !value.trim())) {
    if (required) throw rowError(index, `${label} é obrigatório.`);
    return null;
  }
  const parsed = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(parsed)) throw rowError(index, `${label} inválido.`);
  if (Math.abs(parsed) >= 10_000_000_000_000) throw rowError(index, `${label} excede o limite permitido.`);
  return parsed;
}

function optionalText(value: unknown, index: number, label: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw rowError(index, `${label} inválido.`);
  return value;
}

function date(value: unknown, index: number, label: string, required = false): Date | null {
  if (value === null || value === undefined || value === "") {
    if (required) throw rowError(index, `${label} é obrigatória.`);
    return null;
  }
  if (typeof value !== "string" && typeof value !== "number") throw rowError(index, `${label} inválida.`);
  const parsed = parseDateOnly(value);
  if (!parsed || Number.isNaN(parsed.getTime())) throw rowError(index, `${label} inválida.`);
  return parsed;
}

export async function POST(req: NextRequest) {
  let session: Awaited<ReturnType<typeof requireEscrita>>["session"];
  try { ({ session } = await requireEscrita()); }
  catch (error: any) { return NextResponse.json({ error: error?.message || "Não autenticado" }, { status: error?.status || 401 }); }

  let rows: unknown;
  try { ({ lancamentos: rows } = await req.json()); }
  catch { return NextResponse.json({ error: "Envie os lançamentos em JSON." }, { status: 400 }); }
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 100) {
    return NextResponse.json({ error: "Informe de 1 a 100 lançamentos." }, { status: 400 });
  }

  try {
    const created = await prisma.$transaction(async tx => {
      // A linha rápida e este lote compartilham a trava, para não reservar a mesma seq.
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`lancamento-seq:${session.tenantId}`}, 0))`;

      // Validar todas as linhas antes da primeira escrita. Uma falha de constraint
      // posterior também reverte a transação inteira.
      const prepared = [];
      for (const [index, raw] of rows.entries()) {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw rowError(index, "dados inválidos.");
        const row = raw as Row;
        if (typeof row.descricao !== "string" || !row.descricao.trim()) throw rowError(index, "Descrição é obrigatória.");
        if (row.tipo !== "ENTRADA" && row.tipo !== "SAIDA") throw rowError(index, "Direção inválida.");
        if (row.status !== undefined && !["realizado", "previsto", "cancelado"].includes(String(row.status))) {
          throw rowError(index, "Status Base inválido.");
        }
        const dataLanc = date(row.dataLanc, index, "Data de lançamento", true)!;
        const dataEmissao = date(row.dataEmissao, index, "Data de emissão");
        const dataVencOriginal = date(row.dataVencOriginal, index, "Vencimento original");
        const dataVencPlano = date(row.dataVencPlano || row.dataVencOriginal, index, "Vencimento plano");
        const dataEvento = date(row.dataEvento, index, "Data do evento");
        const dataPagamento = date(row.dataPagamento, index, "Data de realização");
        const valor = amount(row.valor, index, "Valor Realizado", true)!;
        const valorPrevisto = amount(row.valorPrevisto, index, "Valor Previsto", false);
        const categoria = optionalText(row.categoria, index, "Categoria N1");

        let counterpart: Record<string, unknown>, account: Record<string, unknown>;
        try {
          counterpart = await resolveCounterpartyLink(tx, session.tenantId, {
            clienteId: row.clienteId ?? null, fornecedorId: row.fornecedorId ?? null,
          });
          account = await resolveAccountSelection(tx, session.tenantId, row.contaId ?? null, undefined, row.tipo, categoria);
        } catch (error: any) { throw rowError(index, error?.message || "Classificação ou contraparte inválida.", error?.status || 400); }

        prepared.push({
          tenantId: session.tenantId,
          dataLanc, dataEmissao, dataVencOriginal, dataVencPlano, dataEvento, dataPagamento,
          descricao: row.descricao.trim(), valor, valorPrevisto,
          tipo: row.tipo, status: row.status || "realizado",
          statusManual: optionalText(row.statusManual, index, "Status Manual"),
          statusExtrato: optionalText(row.statusExtrato, index, "Extrato"),
          banco: optionalText(row.banco, index, "Banco"),
          fornecedor: optionalText(row.fornecedor, index, "Empresa"),
          fornecedorId: row.fornecedorId || null, clienteId: row.clienteId || null,
          fantasiaPadrao: null, ...counterpart,
          centroCusto: optionalText(row.centroCusto, index, "Centro de Custo"),
          referencia: optionalText(row.referencia, index, "Referência"),
          contaId: row.contaId || null, categoria, ...account,
          dre: optionalText(row.dre, index, "DRE"),
          cont: optionalText(row.cont, index, "Cont."),
          anotacao: optionalText(row.anotacao, index, "Anotação"),
          criadoPor: session.id,
        });
      }

      const last = await tx.lancamento.findFirst({
        where: { tenantId: session.tenantId }, orderBy: { seq: "desc" }, select: { seq: true },
      });
      let seq = (last?.seq ?? 0) + 1;
      const result = [];
      for (const [index, data] of prepared.entries()) {
        try {
          result.push(await tx.lancamento.create({ data: { ...data, seq: seq++ } as Prisma.LancamentoUncheckedCreateInput,
            include: counterpartInclude }));
        } catch (error: any) {
          if (error?.code === "P2034") throw error;
          throw rowError(index, "não foi possível gravar esta linha. Nenhum lançamento foi criado.", 500);
        }
      }
      return result;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 60000 });

    return NextResponse.json({ data: created.map(item => toLancamentoDTO(item, item.seq)), criados: created.length }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.code === "P2034" ? "Criação simultânea detectada. Tente novamente; nenhum lançamento foi gravado."
      : error?.status ? error.message : "Falha na criação. Nenhum lançamento foi gravado.", row: error?.row },
    { status: error?.status || (error?.code === "P2034" ? 409 : 500) });
  }
}
