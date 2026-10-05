import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireEscrita } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { parseDateOnly, toLancamentoDTO } from "@/lib/lancamento";
import { counterpartInclude, resolveAccountSelection, resolveCounterpartyLink } from "@/lib/lancamento-counterparty";
import { hojeSaoPaulo, lerFiltrosLancamentos, statusCorresponde, whereLancamentos } from "@/lib/lancamento-filters";
import { CARDS_LANCAMENTO, type CardLancamento } from "@/lib/lancamento-card-filter";
import { consultarIdsDoCard } from "@/lib/lancamento-card-query";
import type { PaginatedResponse, LancamentoDTO } from "@/types";

// ── GET /api/lancamentos ──────────────────────────────────────
export async function GET(req: NextRequest) {
  let db: any, session: any;
  try {
    ({ db, session } = await requireSession());
  } catch {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  let filtros: ReturnType<typeof lerFiltrosLancamentos>;
  try { filtros = lerFiltrosLancamentos(searchParams); }
  catch (error: any) { return NextResponse.json({ error: error.message }, { status: 400 }); }
  const pagina      = parseInt(searchParams.get("pagina") || "1");
  const porPagina   = Math.min(500, Math.max(1, parseInt(searchParams.get("porPagina") || "50")));
  const sortKey     = searchParams.get("sortKey") || "";
  const sortDir     = (searchParams.get("sortDir") || "desc") as "asc" | "desc";
  const card = searchParams.get("card");
  if (card && !CARDS_LANCAMENTO.includes(card as CardLancamento)) {
    return NextResponse.json({ error: "Indicador inválido." }, { status: 400 });
  }

  const where = whereLancamentos(filtros, session.tenantId, !card);
  if (card) {
    const ids = await consultarIdsDoCard(db, filtros, session.tenantId, card as CardLancamento, hojeSaoPaulo());
    where.id = { in: ids };
  }

  // ── Mapeamento sortKey (DTO) → campo Prisma ─────────────────
  const SORT_MAP: Record<string, any> = {
    seq:              { seq:              sortDir },
    dataLanc:         { dataLanc:         sortDir },
    dataEmissao:      { dataEmissao:      sortDir },
    dataVencOriginal: { dataVencOriginal: sortDir },
    dataVencPlano:    { dataVencPlano:    sortDir },
    dataEvento:       { dataEvento:       sortDir },
    dataPagamento:    { dataPagamento:    sortDir },
    valor:            { valor:            sortDir },
    valorPrevisto:    { valorPrevisto:    sortDir },
    descricao:        { descricao:        sortDir },
    fornecedor:       { fornecedor:       sortDir },
    fantasiaPadrao:   { fantasiaPadrao:   sortDir },
    banco:            { banco:            sortDir },
    tipo:             { tipo:             sortDir },
    status:           { status:           sortDir },
    statusManual:     { statusManual:     sortDir },
    statusExtrato:    { statusExtrato:    sortDir },
    centroCusto:      { centroCusto:      sortDir },
    categoria:        { categoria:        sortDir },
    contaId:          { conta: { codigo: sortDir } },
    dre:              { dre:              sortDir },
    cont:             { cont:             sortDir },
    anotacao:         { anotacao:         sortDir },
  };

  const orderBy = SORT_MAP[sortKey]
    ? [SORT_MAP[sortKey], { seq: "desc" as const }]
    : [{ dataLanc: "desc" as const }, { seq: "desc" as const }];

  let total: number;
  let lancamentos: any[];
  if (filtros.status) {
    const candidatos = await db.lancamento.findMany({ where, orderBy, include: counterpartInclude });
    const selecionados = candidatos.filter((row: any) => statusCorresponde(row, filtros.status, hojeSaoPaulo()));
    total = selecionados.length;
    lancamentos = selecionados.slice((pagina - 1) * porPagina, pagina * porPagina);
  } else {
    [total, lancamentos] = await Promise.all([
      db.lancamento.count({ where }),
      db.lancamento.findMany({ where, orderBy, skip: (pagina - 1) * porPagina,
        take: porPagina, include: counterpartInclude }),
    ]);
  }

  const data = lancamentos.map((l: any, i: number) =>
    toLancamentoDTO(l, (pagina - 1) * porPagina + i + 1)
  );

  return NextResponse.json({
    data, total, pagina, porPagina,
    totalPaginas: Math.ceil(total / porPagina),
  } satisfies PaginatedResponse<LancamentoDTO>);
}

// ── POST /api/lancamentos ─────────────────────────────────────
export async function POST(req: NextRequest) {
  let db: any, session: any;
  try {
    ({ db, session } = await requireEscrita());
  } catch (e: any) {
    const status = e?.status ?? 401;
    return NextResponse.json({ error: e?.message ?? "Não autenticado" }, { status });
  }

  const body = await req.json();
  const {
    dataLanc, descricao, valor, tipo, status,
    fornecedor, fornecedorId, clienteId, centroCusto, referencia, contaId,
    dataEmissao, dataVencOriginal, dataVencPlano, dataEvento, dataPagamento,
    statusManual, statusExtrato, valorPrevisto, banco,
    fantasiaPadrao, categoria, dre, cont, anotacao,
  } = body;

  // valor === 0 é válido; só rejeita ausente/inválido
  const valorNum = parseFloat(valor);
  if (!dataLanc || !descricao || valor === undefined || valor === null || Number.isNaN(valorNum) || !tipo) {
    return NextResponse.json({ error: "Campos obrigatórios: dataLanc, descricao, valor, tipo" }, { status: 400 });
  }

  let counterpart: Record<string, unknown>, account: Record<string, unknown>;
  try {
    counterpart = await resolveCounterpartyLink(db, session.tenantId, { clienteId, fornecedorId });
    account = await resolveAccountSelection(db, session.tenantId, contaId, undefined, tipo, categoria);
  }
  catch (error: any) { return NextResponse.json({ error: error.message }, { status: error.status || 400 }); }


  // ⚡ seq calculado por tenant dentro de uma transação para garantir unicidade.
  // MAX(seq) + 1 filtrado pelo tenantId — cada tenant tem sua própria sequência.
  const lancamento = await prisma.$transaction(async (tx) => {
    const resultado = await tx.$queryRaw<{ nextseq: number }[]>`
      SELECT COALESCE(MAX(seq), 0) + 1 AS nextseq
      FROM lancamentos
      WHERE tenant_id = ${session.tenantId}
    `;
    const nextSeq = Number(resultado[0].nextseq);

    return tx.lancamento.create({
      data: {
        seq:              nextSeq,
        tenantId:         session.tenantId,
        dataLanc:         parseDateOnly(dataLanc) ?? new Date(),
        dataEmissao:      parseDateOnly(dataEmissao),
        dataVencOriginal: parseDateOnly(dataVencOriginal),
        dataVencPlano:    parseDateOnly(dataVencPlano || dataVencOriginal),
        dataEvento:       parseDateOnly(dataEvento),
        dataPagamento:    parseDateOnly(dataPagamento),
        descricao:        descricao.trim(),
        valor:            valorNum,
        valorPrevisto:    valorPrevisto ? parseFloat(valorPrevisto) : null,
        tipo,
        status:           status || "realizado",
        statusManual:     statusManual  || null,
        statusExtrato:    statusExtrato || null,
        banco:            banco         || null,
        fornecedor:       fornecedor    || null,
        fornecedorId:     fornecedorId  || null,
        clienteId:        clienteId || null,
        fantasiaPadrao:   fantasiaPadrao|| null,
        ...counterpart,
        centroCusto:      centroCusto   || null,
        referencia:       referencia    || null,
        contaId:          contaId       || null,
        categoria:        categoria     || null,
        ...account,
        dre:              dre           || null,
        cont:             cont          || null,
        anotacao:         anotacao      || null,
        criadoPor:        session.id,
      },
      include: counterpartInclude,
    });
  });

  return NextResponse.json(toLancamentoDTO(lancamento, lancamento.seq), { status: 201 });
}
