import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/permissions";
import { counterpartInclude } from "@/lib/lancamento-counterparty";
import { createOfficialWorkbook } from "@/lib/lancamento-official-import";
import { hojeSaoPaulo, lerFiltrosLancamentos, statusCorresponde, whereLancamentos } from "@/lib/lancamento-filters";
import { CARDS_LANCAMENTO, type CardLancamento } from "@/lib/lancamento-card-filter";
import { consultarIdsDoCard } from "@/lib/lancamento-card-query";

export async function GET(req: NextRequest) {
  let db: any, session: any;
  try { ({ db, session } = await requirePermission("fluxo.lancamentos.import")); }
  catch (error: any) { return NextResponse.json({ error: error?.message || "Não autenticado" }, { status: error?.status || 401 }); }
  const params = new URL(req.url).searchParams;
  let filters: ReturnType<typeof lerFiltrosLancamentos>;
  try { filters = lerFiltrosLancamentos(params); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Filtros inválidos" }, { status: 400 }); }
  const card = params.get("card");
  if (card && !CARDS_LANCAMENTO.includes(card as CardLancamento)) {
    return NextResponse.json({ error: "Indicador inválido." }, { status: 400 });
  }
  const where = whereLancamentos(filters, session.tenantId, !card);
  if (card) {
    const ids = await consultarIdsDoCard(db, filters, session.tenantId, card as CardLancamento, hojeSaoPaulo());
    where.id = { in: ids };
  }
  const candidates = await db.lancamento.findMany({
    where,
    orderBy: [{ dataLanc: "desc" }, { seq: "desc" }],
    include: counterpartInclude,
  });
  const records = candidates.filter((row: any) => statusCorresponde(row, filters.status, hojeSaoPaulo()));
  const workbook = createOfficialWorkbook(records);
  return new NextResponse(workbook, { headers: {
    "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "Content-Disposition": 'attachment; filename="lancamentos_10s.xlsx"',
    "Cache-Control": "private, no-store",
    "X-Total-Registros": String(records.length),
  } });
}
