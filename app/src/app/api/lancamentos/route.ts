import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/tenant";
import { toNumber } from "@/lib/formatters";
import type { PaginatedResponse, LancamentoDTO, StatusAuto } from "@/types";

// ── Utilitário: calcula campos derivados do lançamento ────────
function calcularCamposDerivados(l: any): Partial<LancamentoDTO> {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const diasAtrasoOriginal = l.dataVencOriginal && !l.dataPagamento
    ? Math.floor((hoje.getTime() - new Date(l.dataVencOriginal).getTime()) / 86400000)
    : 0;

  const diasAtrasoPlano = l.dataVencPlano && !l.dataPagamento
    ? Math.floor((hoje.getTime() - new Date(l.dataVencPlano).getTime()) / 86400000)
    : 0;

  const getRangeAtraso = (dias: number, pago: boolean): string => {
    if (pago)             return "Pago";
    if (!l.dataVencPlano) return "Sem venc.";
    if (dias <= 0)        return "No prazo";
    if (dias <= 30)       return "01-30 dias";
    if (dias <= 60)       return "31-60 dias";
    if (dias <= 90)       return "61-90 dias";
    return "90+ dias";
  };

  const getStatusAuto = (): StatusAuto => {
    if (l.dataPagamento && l.valor > 0) return "PAGO";
    if (l.dataVencPlano && new Date(l.dataVencPlano) < hoje && !l.dataPagamento) return "ATRASADO";
    if (l.dataVencPlano && new Date(l.dataVencPlano) >= hoje && !l.dataPagamento) return "A VENCER";
    return "PREVISTO";
  };

  const vencPlano = l.dataVencPlano ? new Date(l.dataVencPlano) : null;
  const emissao   = l.dataEmissao   ? new Date(l.dataEmissao)   : null;
  const pago = !!l.dataPagamento;

  return {
    diasAtrasoOriginal,
    diasAtrasoPlano,
    rangeAtraso:   getRangeAtraso(diasAtrasoPlano, pago),
    statusAuto:    getStatusAuto(),
    vencA:  vencPlano ? vencPlano.getFullYear() : null,
    vencM:  vencPlano ? vencPlano.getMonth() + 1 : null,
    vencD:  vencPlano ? vencPlano.getDate() : null,
    vencAM: vencPlano ? `${String(vencPlano.getFullYear()).slice(2)}_${String(vencPlano.getMonth() + 1).padStart(2, "0")}` : null,
    emissaoAM: emissao ? `${String(emissao.getFullYear()).slice(2)}_${String(emissao.getMonth() + 1).padStart(2, "0")}` : null,
  };
}

// ── Serializar lançamento completo para DTO ────────────────────
function toLancamentoDTO(l: any, seq: number): LancamentoDTO {
  const derivados = calcularCamposDerivados(l);
  const fmt = (d: Date | null | undefined) => d ? new Date(d).toISOString().split("T")[0] : null;

  return {
    id:          l.id,
    seq:         l.seq ?? seq,
    tenantId:    "", // Não expor internamente
    dataLanc:         fmt(l.dataLanc)!,
    dataEmissao:      fmt(l.dataEmissao),
    dataVencOriginal: fmt(l.dataVencOriginal),
    dataVencPlano:    fmt(l.dataVencPlano),
    dataEvento:       fmt(l.dataEvento),
    dataPagamento:    fmt(l.dataPagamento),
    valor:         toNumber(l.valor),
    valorPrevisto: l.valorPrevisto ? toNumber(l.valorPrevisto) : null,
    banco:         l.banco,
    tipo:          l.tipo,
    status:        l.status,
    statusManual:  l.statusManual,
    statusExtrato: l.statusExtrato,
    statusAuto:    (derivados.statusAuto ?? "PREVISTO") as StatusAuto,
    descricao:      l.descricao,
    fornecedor:     l.fornecedor,
    fornecedorId:   l.fornecedorId,
    fantasiaPadrao: l.fornecedorRef ? `${l.fornecedorRef.codigo} – ${l.fornecedorRef.nome}` : l.fantasiaPadrao,
    centroCusto:    l.centroCusto,
    referencia:     l.referencia,
    contaId:        l.contaId,
    categoria:      l.categoria,
    dre:            l.dre,
    cont:           l.cont,
    anotacao:       l.anotacao,
    diasAtrasoOriginal: derivados.diasAtrasoOriginal ?? 0,
    diasAtrasoPlano:    derivados.diasAtrasoPlano    ?? 0,
    rangeAtraso:        derivados.rangeAtraso        ?? "Sem venc.",
    vencA:  derivados.vencA  ?? null,
    vencM:  derivados.vencM  ?? null,
    vencD:  derivados.vencD  ?? null,
    vencAM: derivados.vencAM ?? null,
    emissaoAM: derivados.emissaoAM ?? null,
    criadoEm: l.criadoEm?.toISOString(),
  };
}

// ── GET /api/lancamentos ──────────────────────────────────────
export async function GET(req: NextRequest) {
  let db: any, session: any;
  try {
    ({ db, session } = await requireSession());
  } catch {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const tipo        = searchParams.get("tipo") || "";
  const status      = searchParams.get("status") || "";
  const statusManual = searchParams.get("statusManual") || "";
  const centroCusto = searchParams.get("centroCusto") || "";
  const fornecedor  = searchParams.get("fornecedor") || "";
  const busca       = searchParams.get("busca") || "";
  const dataInicio  = searchParams.get("dataInicio") || "";
  const dataFim     = searchParams.get("dataFim") || "";
  const pagina      = parseInt(searchParams.get("pagina") || "1");
  const porPagina   = Math.min(200, Math.max(1, parseInt(searchParams.get("porPagina") || "50")));
  const sortKey     = searchParams.get("sortKey") || "";
  const sortDir     = (searchParams.get("sortDir") || "desc") as "asc" | "desc";

  // ⚡ Sem tenantId manual — o db já filtra automaticamente via Extension
  const where: any = {};
  if (tipo)        where.tipo = tipo;
  if (status)      where.status = status;
  if (statusManual) where.statusManual = statusManual;
  if (centroCusto) where.centroCusto = centroCusto;
  if (fornecedor)  where.fornecedor = { contains: fornecedor, mode: "insensitive" };
  if (dataInicio || dataFim) {
    where.dataLanc = {};
    if (dataInicio) where.dataLanc.gte = new Date(dataInicio);
    if (dataFim)    where.dataLanc.lte = new Date(dataFim);
  }
  if (busca) {
    where.OR = [
      { descricao:    { contains: busca, mode: "insensitive" } },
      { fornecedor:   { contains: busca, mode: "insensitive" } },
      { centroCusto:  { contains: busca, mode: "insensitive" } },
      { referencia:   { contains: busca, mode: "insensitive" } },
      { anotacao:     { contains: busca, mode: "insensitive" } },
      { statusManual: { contains: busca, mode: "insensitive" } },
    ];
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
    dre:              { dre:              sortDir },
    cont:             { cont:             sortDir },
    anotacao:         { anotacao:         sortDir },
  };

  const orderBy = SORT_MAP[sortKey]
    ? [SORT_MAP[sortKey], { seq: "desc" as const }]
    : [{ dataLanc: "desc" as const }, { seq: "desc" as const }];

  const [total, lancamentos] = await Promise.all([
    db.lancamento.count({ where }),
    db.lancamento.findMany({
      where,
      orderBy,
      skip: (pagina - 1) * porPagina,
      take: porPagina,
      include: { fornecedorRef: { select: { codigo: true, nome: true } } },
    }),
  ]);

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
    ({ db, session } = await requireSession());
  } catch {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const body = await req.json();
  const {
    dataLanc, descricao, valor, tipo, status,
    fornecedor, fornecedorId, centroCusto, referencia, contaId,
    dataEmissao, dataVencOriginal, dataVencPlano, dataEvento, dataPagamento,
    statusManual, statusExtrato, valorPrevisto, banco,
    fantasiaPadrao, categoria, dre, cont, anotacao,
  } = body;

  if (!dataLanc || !descricao || !valor || !tipo) {
    return NextResponse.json({ error: "Campos obrigatórios: dataLanc, descricao, valor, tipo" }, { status: 400 });
  }

  const d = (v?: string) => v ? new Date(v) : null;

  // ⚡ tenantId injetado automaticamente pelo Extension no create
  const lancamento = await db.lancamento.create({
    data: {
      dataLanc:         new Date(dataLanc),
      dataEmissao:      d(dataEmissao),
      dataVencOriginal: d(dataVencOriginal),
      dataVencPlano:    d(dataVencPlano),
      dataEvento:       d(dataEvento),
      dataPagamento:    d(dataPagamento),
      descricao:        descricao.trim(),
      valor:            parseFloat(valor),
      valorPrevisto:    valorPrevisto ? parseFloat(valorPrevisto) : null,
      tipo,
      status:           status || "realizado",
      statusManual:     statusManual  || null,
      statusExtrato:    statusExtrato || null,
      banco:            banco         || null,
      fornecedor:       fornecedor    || null,
      fornecedorId:     fornecedorId  || null,
      fantasiaPadrao:   fantasiaPadrao|| null,
      centroCusto:      centroCusto   || null,
      referencia:       referencia    || null,
      contaId:          contaId       || null,
      categoria:        categoria     || null,
      dre:              dre           || null,
      cont:             cont          || null,
      anotacao:         anotacao      || null,
      criadoPor:        session.id,
    },
    include: { fornecedorRef: { select: { codigo: true, nome: true } } },
  });

  return NextResponse.json(toLancamentoDTO(lancamento, lancamento.seq), { status: 201 });
}
