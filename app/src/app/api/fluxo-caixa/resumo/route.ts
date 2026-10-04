import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/tenant";
import { obterResumoFluxoCaixa } from "@/lib/cash-flow-service";
import { dataCivil, type DataBaseFinanceira, type FiltrosFinanceiros } from "@/lib/cash-flow";

const DATA_BASES: DataBaseFinanceira[] = [
  "DATA_LANCAMENTO", "DATA_EMISSAO", "VENCIMENTO_ORIGINAL", "VENCIMENTO_PLANO", "REALIZACAO",
];
const FILTER_KEYS = ["status", "statusManual", "tipo", "contaId", "categoria", "clienteId",
  "fornecedorId", "fornecedor", "centroCusto", "banco", "dre"] as const;

export async function GET(req: NextRequest) {
  let context: Awaited<ReturnType<typeof requireSession>>;
  try {
    context = await requireSession();
  } catch {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  const params = req.nextUrl.searchParams;
  const inicio = params.get("inicio") ?? "";
  const fim = params.get("fim") ?? "";
  const dataReferencia = params.get("dataReferencia") ?? new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  const dataBase = params.get("dataBase") ?? "REALIZACAO";
  if (!dataCivil(inicio) || !dataCivil(fim) || inicio > fim || !dataCivil(dataReferencia) ||
    !DATA_BASES.includes(dataBase as DataBaseFinanceira)) {
    return NextResponse.json({ error: "Período, data de referência ou data-base inválido." }, { status: 400 });
  }
  const filtros: FiltrosFinanceiros = {};
  for (const key of FILTER_KEYS) {
    const value = params.get(key);
    if (value) (filtros as Record<string, string>)[key] = value;
  }
  try {
    const resumo = await obterResumoFluxoCaixa(context.db, {
      tenantId: context.session.tenantId, inicio, fim, dataReferencia,
      dataBase: dataBase as DataBaseFinanceira, filtros,
    });
    return NextResponse.json(resumo);
  } catch {
    return NextResponse.json({ error: "Não foi possível calcular o fluxo de caixa." }, { status: 500 });
  }
}
