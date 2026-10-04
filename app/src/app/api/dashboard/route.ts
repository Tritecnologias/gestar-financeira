import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/tenant";
import { toNumber } from "@/lib/formatters";
import { obterResumoFluxoCaixa } from "@/lib/cash-flow-service";
import type { KpiData } from "@/types";

// ── GET /api/dashboard ────────────────────────────────────────
// Retorna KPIs do mês atual para o tenant logado
export async function GET(req: NextRequest) {
  let db: any, session: any;
  try {
    ({ db, session } = await requireSession());
  } catch {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const ano = parseInt(searchParams.get("ano") || String(new Date().getFullYear()));
  const mes = parseInt(searchParams.get("mes") || String(new Date().getMonth() + 1));

  if (!Number.isInteger(ano) || !Number.isInteger(mes) || mes < 1 || mes > 12) {
    return NextResponse.json({ error: "Período inválido" }, { status: 400 });
  }
  const dataInicio = new Date(Date.UTC(ano, mes - 1, 1)).toISOString().slice(0, 10);
  const dataFim = new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10);

  // ⚡ tenantId injetado automaticamente em todas as queries via Extension
  const [resumo, totalLancamentos] = await Promise.all([
    obterResumoFluxoCaixa(db, { tenantId: session.tenantId, inicio: dataInicio, fim: dataFim,
      dataReferencia: dataFim, dataBase: "REALIZACAO" }),
    db.lancamento.count({ where: { tenantId: session.tenantId } }),
  ]);

  // Últimos 5 lançamentos para preview no dashboard
  const ultimosLancamentos = await db.lancamento.findMany({
    where: { tenantId: session.tenantId },
    orderBy: [{ dataLanc: "desc" }, { criadoEm: "desc" }],
    take: 5,
  });

  const entradasVal = toNumber(resumo.entradas.total);
  const saidasVal = toNumber(resumo.saidas.total);

  const kpi: KpiData = {
    entradas: entradasVal,
    saidas: saidasVal,
    saldo: toNumber(resumo.saldoPeriodo.total),
    totalLancamentos,
  };

  return NextResponse.json({
    kpi,
    periodo: { ano, mes },
    ultimosLancamentos: ultimosLancamentos.map((l: any) => ({
      id: l.id,
      dataLanc: l.dataLanc.toISOString().split("T")[0],
      descricao: l.descricao,
      valor: toNumber(l.valor),
      tipo: l.tipo,
      status: l.status,
      fornecedor: l.fornecedor,
    })),
  });
}
