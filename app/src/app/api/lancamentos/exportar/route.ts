import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/tenant";
import { toNumber } from "@/lib/formatters";
import { counterpartyDisplay } from "@/lib/counterparty";
import { counterpartInclude } from "@/lib/lancamento-counterparty";
import { hojeSaoPaulo, lerFiltrosLancamentos, statusCorresponde, whereLancamentos } from "@/lib/lancamento-filters";

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
  let filtros: ReturnType<typeof lerFiltrosLancamentos>;
  try { filtros = lerFiltrosLancamentos(searchParams); }
  catch (error: any) { return NextResponse.json({ error: error.message }, { status: 400 }); }
  const sortKey     = searchParams.get("sortKey") || "";
  const sortDir     = (searchParams.get("sortDir") || "desc") as "asc" | "desc";

  const where = whereLancamentos(filtros, session.tenantId, true);

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
  const candidatos = await db.lancamento.findMany({
    where,
    orderBy,
    include: counterpartInclude,
  });
  const lancamentos = candidatos.filter((row: any) => statusCorresponde(row, filtros.status, hojeSaoPaulo()));

  // Montar CSV
  const fmtBR = (d: Date | null | undefined) => {
    if (!d) return "";
    const dt = new Date(d);
    return `${String(dt.getUTCDate()).padStart(2, "0")}/${String(dt.getUTCMonth() + 1).padStart(2, "0")}/${dt.getUTCFullYear()}`;
  };

  const headers = [
    "Seq", "Data Lanç.", "Data Emissão", "Venc. Original", "Venc. Plano",
    "Data Evento", "Data Pagamento", "Descrição", "Fornecedor", "Fantasia",
    "Banco", "Direção", "Status", "Status Manual", "Status Extrato",
    "Valor Realizado", "Valor Previsto", "Centro de Custo", "Categoria N1",
    "DRE", "Conta N2", "Cont.", "Referência", "Anotação",
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
    l.clienteRef ? counterpartyDisplay(l.clienteRef) : l.fornecedorRef ? counterpartyDisplay(l.fornecedorRef) : (l.fantasiaPadrao || l.fornecedor || ""),
    l.banco ?? "",
    l.tipo ?? "",
    l.status ?? "",
    l.statusManual ?? "",
    l.statusExtrato ?? "",
    l.valor != null ? toNumber(l.valor) : "",
    l.valorPrevisto != null ? toNumber(l.valorPrevisto) : "",
    l.centroCusto ?? "",
    l.conta?.categoria?.tenantId === l.tenantId ? l.conta.categoria.codigo : l.categoria ?? "",
    l.dre ?? "",
    l.conta?.tenantId === l.tenantId ? `${l.conta.codigo ?? ""} – ${l.conta.descricao}` : "",
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
