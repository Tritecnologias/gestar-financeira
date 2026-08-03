import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/tenant";
import { toNumber } from "@/lib/formatters";

// ── GET /api/lancamentos/exportar ─────────────────────────────
// Exporta TODOS os lançamentos (sem paginação) para CSV.
// Aceita os mesmos filtros da listagem principal.
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
  const sortKey     = searchParams.get("sortKey") || "";
  const sortDir     = (searchParams.get("sortDir") || "desc") as "asc" | "desc";

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

  // Buscar TODOS os registros (sem paginação)
  const lancamentos = await db.lancamento.findMany({
    where,
    orderBy,
    include: { fornecedorRef: { select: { codigo: true, nome: true } } },
  });

  // Montar CSV
  const fmt = (d: Date | null | undefined) => d ? new Date(d).toISOString().split("T")[0] : "";
  const fmtBR = (d: Date | null | undefined) => {
    if (!d) return "";
    const dt = new Date(d);
    return `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`;
  };

  const headers = [
    "Seq", "Data Lanç.", "Data Emissão", "Venc. Original", "Venc. Plano",
    "Data Evento", "Data Pagamento", "Descrição", "Fornecedor", "Fantasia",
    "Banco", "Tipo", "Status", "Status Manual", "Status Extrato",
    "Valor Realizado", "Valor Previsto", "Centro de Custo", "Categoria",
    "DRE", "Conta", "Referência", "Anotação",
  ];

  const rows = lancamentos.map((l: any, i: number) => [
    l.seq ?? i + 1,
    fmtBR(l.dataLanc),
    fmtBR(l.dataEmissao),
    fmtBR(l.dataVencOriginal),
    fmtBR(l.dataVencPlano),
    fmtBR(l.dataEvento),
    fmtBR(l.dataPagamento),
    l.descricao ?? "",
    l.fornecedor ?? "",
    l.fornecedorRef ? `${l.fornecedorRef.codigo} – ${l.fornecedorRef.nome}` : (l.fantasiaPadrao ?? ""),
    l.banco ?? "",
    l.tipo ?? "",
    l.status ?? "",
    l.statusManual ?? "",
    l.statusExtrato ?? "",
    l.valor != null ? toNumber(l.valor) : "",
    l.valorPrevisto != null ? toNumber(l.valorPrevisto) : "",
    l.centroCusto ?? "",
    l.categoria ?? "",
    l.dre ?? "",
    l.cont ?? "",
    l.referencia ?? "",
    l.anotacao ?? "",
  ]);

  const csvContent = [
    headers.join(";"),
    ...rows.map((r: any[]) => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(";")),
  ].join("\n");

  const totalRegistros = lancamentos.length;

  return new NextResponse("\uFEFF" + csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="lancamentos_completo_${new Date().toISOString().slice(0, 10)}.csv"`,
      "X-Total-Registros": String(totalRegistros),
    },
  });
}
