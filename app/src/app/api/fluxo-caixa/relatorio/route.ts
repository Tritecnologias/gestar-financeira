import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/tenant";
import { dataCivil, type DataBaseFinanceira, type FiltrosFinanceiros } from "@/lib/cash-flow";
import { montarRelatorio14Dias, segundaDaSemana, somarDias } from "@/lib/cash-flow-report";
import { obterResumoFluxoCaixa } from "@/lib/cash-flow-service";

const BASES_PREVISTO: DataBaseFinanceira[] = [
  "DATA_LANCAMENTO", "DATA_EMISSAO", "VENCIMENTO_ORIGINAL", "VENCIMENTO_PLANO", "REALIZACAO",
];

export async function GET(req: NextRequest) {
  let context: Awaited<ReturnType<typeof requireSession>>;
  try { context = await requireSession(); }
  catch { return NextResponse.json({ error: "Não autenticado" }, { status: 401 }); }

  const params = req.nextUrl.searchParams;
  const inicio = params.get("inicio") || "";
  const medida = params.get("medida") || "REALIZADO";
  const dataBase = medida === "REALIZADO" ? "REALIZACAO" : params.get("dataBase") || "VENCIMENTO_PLANO";
  const dataReferencia = params.get("dataReferencia") || new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  if (!dataCivil(inicio) || inicio !== segundaDaSemana(inicio) || !dataCivil(dataReferencia) ||
    (medida !== "REALIZADO" && medida !== "PREVISTO") ||
    !BASES_PREVISTO.includes(dataBase as DataBaseFinanceira)) {
    return NextResponse.json({ error: "Período, medida ou data-base inválido." }, { status: 400 });
  }
  const filtros: FiltrosFinanceiros = {};
  if (params.get("statusManual")) filtros.statusManual = params.get("statusManual")!;
  if (params.get("status")) filtros.status = params.get("status")!;
  try {
    const resumo = await obterResumoFluxoCaixa(context.db, {
      tenantId: context.session.tenantId, inicio, fim: somarDias(inicio, 13), dataReferencia,
      dataBase: dataBase as DataBaseFinanceira, filtros,
    });
    return NextResponse.json(montarRelatorio14Dias(resumo, medida));
  } catch {
    return NextResponse.json({ error: "Não foi possível calcular o relatório financeiro." }, { status: 500 });
  }
}
