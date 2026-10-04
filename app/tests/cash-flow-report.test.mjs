import test from "node:test";
import assert from "node:assert/strict";
import { calcularFluxoCaixa } from "../src/lib/cash-flow.ts";
import { montarRelatorio14Dias, segundaDaSemana, somarDias } from "../src/lib/cash-flow-report.ts";

const tenantId = "tenant-a";
const row = (id, extra = {}) => ({ id, tenantId, status: "realizado", tipo: "ENTRADA",
  valor: "0.01", dataLanc: "2026-09-28", dataPagamento: "2026-09-28",
  dataVencPlano: null, valorPrevisto: null, ...extra });
const opcoes = (extra = {}) => ({ tenantId, inicio: "2026-09-28", fim: "2026-10-11",
  dataReferencia: "2026-10-04", dataBase: "VENCIMENTO_PLANO", ...extra });

test("calendar has two complete Monday–Sunday weeks across month and year boundaries", () => {
  assert.equal(segundaDaSemana("2026-10-04"), "2026-09-28");
  assert.equal(somarDias("2026-12-28", 13), "2027-01-10");
  const report = montarRelatorio14Dias(calcularFluxoCaixa([], opcoes()), "REALIZADO");
  assert.equal(report.dias.length, 14);
  assert.equal(report.semanas[0].inicio, "2026-09-28");
  assert.equal(report.semanas[0].fim, "2026-10-04");
  assert.equal(report.semanas[1].inicio, "2026-10-05");
  assert.equal(report.semanas[1].fim, "2026-10-11");
  assert(report.dias.every(dia => dia.quantidade === 0 && dia.saldoAcumulado === "0.00"));
});

test("daily, weekly, drill-down and running balance reconcile to exact cents", () => {
  const entries = [
    row("opening", { valor: "100.00", dataLanc: "2026-09-27", dataPagamento: "2026-09-27" }),
    row("income", { valor: "10.01" }),
    row("expense", { tipo: "SAIDA", valor: "4.02", dataPagamento: "2026-10-04" }),
    row("next", { valor: "2.03", dataPagamento: "2026-10-05" }),
    row("cancel", { status: "cancelado", valor: "999.00" }),
    row("legacy", { status: "realizado", valor: "999.00", dataPagamento: null }),
    row("foreign", { tenantId: "tenant-b", valor: "999.00" }),
  ];
  const summary = calcularFluxoCaixa(entries, opcoes());
  const report = montarRelatorio14Dias(summary, "REALIZADO");
  assert.equal(report.saldoAnterior, "100.00");
  assert.equal(report.dias[0].entradas, "10.01");
  assert.equal(report.dias[0].saldoAcumulado, "110.01");
  assert.equal(report.dias[6].resultado, "-4.02");
  assert.equal(report.dias[6].saldoAcumulado, "105.99");
  assert.equal(report.semanas[0].resultado, "5.99");
  assert.equal(report.semanas[0].quantidade, 2);
  assert.deepEqual(report.semanas[0].componentes.map(item => item.id), ["income", "expense"]);
  assert.equal(report.semanas[1].resultado, "2.03");
  assert.equal(report.dias[13].saldoAcumulado, "108.02");
  assert.equal(report.dias[13].saldoAcumulado, summary.saldoFinal.total);
  assert(summary.inconsistencias.some(item => item.id === "legacy"));
});

test("forecast uses planned value and chosen date base, never actual value fallback", () => {
  const forecast = row("forecast", { status: "previsto", valor: "900.00",
    valorPrevisto: "7.25", dataVencPlano: "2026-10-02", dataPagamento: null });
  const realized = row("realized", { valor: "3.00", valorPrevisto: "4.00",
    dataPagamento: "2026-10-01", dataVencPlano: "2026-10-01" });
  const defaultReport = montarRelatorio14Dias(calcularFluxoCaixa([forecast, realized], opcoes()), "PREVISTO");
  assert.equal(defaultReport.dias[4].entradas, "7.25");
  assert.equal(defaultReport.dias[3].entradas, "4.00");
  assert.equal(defaultReport.semanas[0].entradas, "11.25");
  assert.equal(defaultReport.dias[4].componentes[0].id, "forecast");
  const launchBase = montarRelatorio14Dias(calcularFluxoCaixa([forecast, realized],
    opcoes({ dataBase: "DATA_LANCAMENTO" })), "PREVISTO");
  assert.equal(launchBase.dias[0].entradas, "11.25");
});
