import { withAdvisoryAudit } from "@/lib/advisory-request";
import { businessAuthor } from "@/lib/business-author";
import { prepareLancamento, lancamentoError } from "@/lib/lancamento-validation";
import { NextRequest, NextResponse } from "next/server";
import { requirePermission, hasPermission } from "@/lib/permissions";
import { prisma } from "@/lib/db";
import { toLancamentoDTO } from "@/lib/lancamento";
import { counterpartInclude } from "@/lib/lancamento-counterparty";
import { hojeSaoPaulo, lerFiltrosLancamentos, statusCorresponde, whereLancamentos } from "@/lib/lancamento-filters";
import { CARDS_LANCAMENTO, type CardLancamento } from "@/lib/lancamento-card-filter";
import { consultarIdsDoCard } from "@/lib/lancamento-card-query";
import type { PaginatedResponse, LancamentoDTO } from "@/types";
import { Prisma } from "@prisma/client";

// ── GET /api/lancamentos ──────────────────────────────────────
async function advisoryGET(req: NextRequest) {
  let db: any, session: any, context: Awaited<ReturnType<typeof requirePermission>>;
  try {
    context = await requirePermission("fluxo.lancamentos.view");
    ({ db, session } = context);
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Não autenticado" }, { status: error?.status || 401 });
  }

  const canSeeBalances = await hasPermission("fluxo.visao.saldos", context);
  const { searchParams } = new URL(req.url);
  let filtros: ReturnType<typeof lerFiltrosLancamentos>;
  try { filtros = lerFiltrosLancamentos(searchParams); }
  catch (error: any) { return NextResponse.json({ error: error.message }, { status: 400 }); }
  const pagina      = Number(searchParams.get("pagina") || "1");
  const tudo        = searchParams.get("porPagina") === "all";
  const pageSize = tudo ? 500 : Number(searchParams.get("porPagina") || "50");
  if (!Number.isSafeInteger(pagina) || pagina < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 ||
      (searchParams.has("sortDir") && !["asc", "desc"].includes(searchParams.get("sortDir")!))) {
    return NextResponse.json({ error: "Paginação ou ordenação inválida." }, { status: 400 });
  }
  const porPagina = Math.min(500, pageSize);
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
  let valorPrevisto = new Prisma.Decimal(0);
  let valorRealizado = new Prisma.Decimal(0);
  if (filtros.status) {
    const candidatos = await db.lancamento.findMany({ where, orderBy, include: counterpartInclude });
    const selecionados = candidatos.filter((row: any) => statusCorresponde(row, filtros.status, hojeSaoPaulo()));
    total = selecionados.length;
    for (const row of selecionados) {
      valorPrevisto = valorPrevisto.plus(row.valorPrevisto ?? 0);
      valorRealizado = valorRealizado.plus(row.valor ?? 0);
    }
    lancamentos = tudo ? selecionados : selecionados.slice((pagina - 1) * porPagina, pagina * porPagina);
  } else {
    const [count, rows, sums] = await Promise.all([
      db.lancamento.count({ where }),
      db.lancamento.findMany({ where, orderBy,
        ...(!tudo ? { skip: (pagina - 1) * porPagina, take: porPagina } : {}),
        include: counterpartInclude }),
      db.lancamento.aggregate({ where, _sum: { valorPrevisto: true, valor: true } }),
    ]);
    total = count;
    lancamentos = rows;
    valorPrevisto = sums._sum.valorPrevisto ?? valorPrevisto;
    valorRealizado = sums._sum.valor ?? valorRealizado;
  }

  const data = lancamentos.map((l: any, i: number) =>
    toLancamentoDTO(l, (tudo ? 0 : (pagina - 1) * porPagina) + i + 1)
  );

  return NextResponse.json({
    data, total, pagina: tudo ? 1 : pagina, porPagina: tudo ? total : porPagina,
    totalPaginas: tudo ? 1 : Math.ceil(total / porPagina),
    totais: canSeeBalances ? { valorPrevisto: valorPrevisto.toFixed(2), valorRealizado: valorRealizado.toFixed(2), cont: total } : { cont: total },
  } satisfies PaginatedResponse<LancamentoDTO> & { totais: { valorPrevisto?: string; valorRealizado?: string; cont: number } });
}

// Single creation and batch creation share the same validation and sequence lock.
async function advisoryPOST(req: NextRequest) {
  let session: any;
  try { ({ session } = await requirePermission("fluxo.lancamentos.create")); }
  catch (error: any) { return NextResponse.json({ error: error.message }, { status: error.status || 401 }); }
  try {
    const body = await req.json();
    const row = await prisma.$transaction(async tx => {
      const data = await prepareLancamento(tx, session.tenantId, body);
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`lancamento-seq:${session.tenantId}`}, 0))`;
      const last = await tx.lancamento.findFirst({ where: { tenantId: session.tenantId }, orderBy: { seq: "desc" }, select: { seq: true } });
      return tx.lancamento.create({ data: { ...data, tenantId: session.tenantId, seq: (last?.seq ?? 0) + 1,
        ...businessAuthor(session) } as Prisma.LancamentoUncheckedCreateInput, include: counterpartInclude });
    });
    return NextResponse.json(toLancamentoDTO(row), { status: 201 });
  } catch (error) { const result = lancamentoError(error); return NextResponse.json({ error: result.error }, { status: result.status }); }
}

export const GET = withAdvisoryAudit("/api/lancamentos", "GET", advisoryGET);
export const POST = withAdvisoryAudit("/api/lancamentos", "POST", advisoryPOST);
