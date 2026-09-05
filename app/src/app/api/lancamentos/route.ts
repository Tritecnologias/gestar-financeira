import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireEscrita } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { parseDateOnly, toLancamentoDTO } from "@/lib/lancamento";
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
      { descricao:      { contains: busca, mode: "insensitive" } },
      { fornecedor:     { contains: busca, mode: "insensitive" } },
      { fantasiaPadrao: { contains: busca, mode: "insensitive" } },
      { centroCusto:    { contains: busca, mode: "insensitive" } },
      { referencia:     { contains: busca, mode: "insensitive" } },
      { anotacao:       { contains: busca, mode: "insensitive" } },
      { statusManual:   { contains: busca, mode: "insensitive" } },
      { banco:          { contains: busca, mode: "insensitive" } },
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
    ({ db, session } = await requireEscrita());
  } catch (e: any) {
    const status = e?.status ?? 401;
    return NextResponse.json({ error: e?.message ?? "Não autenticado" }, { status });
  }

  const body = await req.json();
  const {
    dataLanc, descricao, valor, tipo, status,
    fornecedor, fornecedorId, centroCusto, referencia, contaId,
    dataEmissao, dataVencOriginal, dataVencPlano, dataEvento, dataPagamento,
    statusManual, statusExtrato, valorPrevisto, banco,
    fantasiaPadrao, categoria, dre, cont, anotacao,
  } = body;

  // valor === 0 é válido; só rejeita ausente/inválido
  const valorNum = parseFloat(valor);
  if (!dataLanc || !descricao || valor === undefined || valor === null || Number.isNaN(valorNum) || !tipo) {
    return NextResponse.json({ error: "Campos obrigatórios: dataLanc, descricao, valor, tipo" }, { status: 400 });
  }


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
        dataVencPlano:    parseDateOnly(dataVencPlano),
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
  });

  return NextResponse.json(toLancamentoDTO(lancamento, lancamento.seq), { status: 201 });
}
