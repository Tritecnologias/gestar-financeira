import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/tenant";
import { toNumber } from "@/lib/formatters";
import type { KpiData } from "@/types";

// ── GET /api/dashboard ────────────────────────────────────────
// Retorna KPIs do mês atual para o tenant logado
export async function GET(req: NextRequest) {
  let db: any;
  try {
    ({ db } = await requireSession());
  } catch {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const ano = parseInt(searchParams.get("ano") || String(new Date().getFullYear()));
  const mes = parseInt(searchParams.get("mes") || String(new Date().getMonth() + 1));

  const dataInicio = new Date(ano, mes - 1, 1);
  const dataFim = new Date(ano, mes, 0); // último dia do mês

  // ⚡ tenantId injetado automaticamente em todas as queries via Extension
  const [entradas, saidas, totalLancamentos] = await Promise.all([
    db.lancamento.aggregate({
      where: { tipo: "ENTRADA", dataLanc: { gte: dataInicio, lte: dataFim } },
      _sum: { valor: true },
      _count: true,
    }),
    db.lancamento.aggregate({
      where: { tipo: "SAIDA", dataLanc: { gte: dataInicio, lte: dataFim } },
      _sum: { valor: true },
    }),
    db.lancamento.count({ where: {} }),
  ]);

  // Últimos 5 lançamentos para preview no dashboard
  const ultimosLancamentos = await db.lancamento.findMany({
    where: {},
    orderBy: [{ dataLanc: "desc" }, { criadoEm: "desc" }],
    take: 5,
  });

  const entradasVal = toNumber(entradas._sum.valor);
  const saidasVal = toNumber(saidas._sum.valor);

  const kpi: KpiData = {
    entradas: entradasVal,
    saidas: saidasVal,
    saldo: entradasVal - saidasVal,
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
