import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/tenant";
import { counterpartInclude } from "@/lib/lancamento-counterparty";
import { createOfficialWorkbook } from "@/lib/lancamento-official-import";
import { hojeSaoPaulo, lerFiltrosLancamentos, statusCorresponde, whereLancamentos } from "@/lib/lancamento-filters";

export async function GET(req: NextRequest) {
  let db: any, session: any;
  try { ({ db, session } = await requireSession()); }
  catch { return NextResponse.json({ error: "Não autenticado" }, { status: 401 }); }
  let filters: ReturnType<typeof lerFiltrosLancamentos>;
  try { filters = lerFiltrosLancamentos(new URL(req.url).searchParams); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Filtros inválidos" }, { status: 400 }); }
  const candidates = await db.lancamento.findMany({
    where: whereLancamentos(filters, session.tenantId, true),
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
