import test from "node:test";
import assert from "node:assert/strict";
import { calcularFluxoCaixa, problemaContaDirecao, problemaTipoConta } from "../src/lib/cash-flow.ts";

const tenantId = "tenant-a";
const options = (inicio, fim = inicio, extra = {}) => ({ tenantId, inicio, fim, dataReferencia: "2026-01-31", ...extra });
const entry = (id, more = {}) => ({
  id, tenantId, seq: 1, status: "realizado", tipo: "ENTRADA", valor: "1.00",
  dataLanc: "2026-01-01", dataPagamento: "2026-01-01",
  valorPrevisto: null, dataVencPlano: null, dataVencOriginal: null, ...more,
});

const initial = entry("A", { valor: "100000.00" });
const income = entry("B", { seq: 2, dataLanc: "2026-01-02", dataPagamento: "2026-01-02", valor: "10000.00" });
const expense = entry("C", { seq: 3, dataLanc: "2026-01-03", dataPagamento: "2026-01-03", tipo: "SAIDA", valor: "4000.00" });
const forecast = entry("D", { seq: 4, status: "previsto", dataLanc: "2026-01-04", dataPagamento: null,
  valor: "20000.00", valorPrevisto: "20000.00", dataVencPlano: "2026-01-04" });
const finalSettlement = entry("E", { seq: 5, dataLanc: "2026-01-05", dataPagamento: "2026-01-05",
  valor: "9750.00", valorPrevisto: "10000.00", dataVencPlano: "2026-01-05" });
const canceled = entry("F", { seq: 6, status: "cancelado", dataLanc: "2026-01-06",
  dataPagamento: "2026-01-06", valor: "8000.00", valorPrevisto: "8000.00", dataVencPlano: "2026-01-06" });
const rescheduled = entry("G", { seq: 7, status: "previsto", tipo: "SAIDA", dataPagamento: null,
  dataLanc: "2026-01-07", valor: "3000.00", valorPrevisto: "3000.00",
  dataVencOriginal: "2026-10-10", dataVencPlano: "2026-10-25" });
const retroactive = entry("H", { seq: 8, dataLanc: "2026-01-08", dataPagamento: "2026-01-02", valor: "2000.00" });

test("A–C: ajuste, entrada, saída e saldo 106.000", () => {
  const entries = [initial, income, expense];
  assert.equal(calcularFluxoCaixa(entries, options("2026-01-01")).saldoFinal.total, "100000.00");
  const b = calcularFluxoCaixa(entries, options("2026-01-02"));
  assert.equal(b.saldoAnterior.total, "100000.00");
  assert.equal(b.saldoFinal.total, "110000.00");
  const c = calcularFluxoCaixa(entries, options("2026-01-03"));
  assert.equal(c.saldoAnterior.total, "110000.00");
  assert.equal(c.saidas.total, "4000.00");
  assert.equal(c.saldoPeriodo.total, "-4000.00");
  assert.equal(c.saldoFinal.total, "106000.00");
});

test("D–G: previsão, quitação final com variação, cancelamento e plano renegociado", () => {
  const entries = [initial, income, expense, forecast, finalSettlement, canceled, rescheduled];
  const d = calcularFluxoCaixa(entries, options("2026-01-04"));
  assert.equal(d.saldoFinal.total, "106000.00");
  assert.equal(d.previsaoAberta.entradas, "20000.00");
  assert.equal(d.variacoes.length, 0);
  const e = calcularFluxoCaixa(entries, options("2026-01-05"));
  assert.equal(e.saldoFinal.total, "115750.00");
  assert.equal(e.previstoHistorico.entradas, "10000.00");
  assert.equal(e.previsaoAberta.entradas, "0.00");
  assert.deepEqual(e.variacoes.find(item => item.id === "E"), {
    id: "E", previsto: "10000.00", realizado: "9750.00", diferenca: "-250.00", aberto: "0.00",
  });
  const f = calcularFluxoCaixa(entries, options("2026-01-06"));
  assert.equal(f.saldoFinal.total, "115750.00");
  assert.equal(f.previstoHistorico.saldo, "0.00");
  assert.deepEqual(f.inconsistencias.find(item => item.id === "F")?.problemas, ["CANCELADO_COM_REALIZACAO"]);
  const october = calcularFluxoCaixa(entries, options("2026-10-25"));
  assert.equal(october.previstoHistorico.saidas, "3000.00");
  assert.equal(october.previsaoAberta.saidas, "3000.00");
  assert.equal(calcularFluxoCaixa(entries, options("2026-10-10")).previstoHistorico.saidas, "0.00");
});

test("H–J: data retroativa, período vazio e saldo anterior negativo", () => {
  const entries = [initial, income, expense, forecast, finalSettlement, canceled, rescheduled, retroactive];
  const jan2 = calcularFluxoCaixa(entries, options("2026-01-02"));
  assert.equal(jan2.entradas.total, "12000.00");
  assert.equal(jan2.saldoFinal.total, "112000.00");
  const jan9 = calcularFluxoCaixa(entries, options("2026-01-09"));
  assert.equal(jan9.saldoAnterior.total, "117750.00");
  assert.equal(jan9.saldoPeriodo.total, "0.00");
  assert.equal(jan9.saldoFinal.total, "117750.00");
  const negative = [entry("J0", { tipo: "SAIDA", valor: "5000.00" }),
    entry("J1", { dataLanc: "2026-01-10", dataPagamento: "2026-01-10", valor: "1000.00" })];
  const j = calcularFluxoCaixa(negative, options("2026-01-10"));
  assert.equal(j.saldoAnterior.total, "-5000.00");
  assert.equal(j.saldoFinal.total, "-4000.00");
});

test("reconciliação diária e mensal sob o mesmo filtro", () => {
  const entries = [initial, income, expense, finalSettlement, retroactive];
  const jan1 = calcularFluxoCaixa(entries, options("2026-01-01"));
  const jan2 = calcularFluxoCaixa(entries, options("2026-01-02"));
  assert.equal(jan1.saldoFinal.total, jan2.saldoAnterior.total);
  const january = calcularFluxoCaixa(entries, options("2026-01-01", "2026-01-31"));
  const february = calcularFluxoCaixa(entries, options("2026-02-01", "2026-02-28"));
  assert.equal(january.saldoFinal.total, february.saldoAnterior.total);
  assert.equal(january.saldoFinal.componentes.length, 5);
});

test("inconsistências não são corrigidas nem viram caixa por inferência", () => {
  const legacy = entry("legacy", { dataPagamento: null, dataLanc: "2026-01-02" });
  const undated = entry("undated", { status: "previsto", dataPagamento: null,
    valorPrevisto: "5.00", dataVencPlano: null });
  const zero = entry("zero", { status: "previsto", dataPagamento: null,
    valorPrevisto: "0.00", dataVencPlano: "2026-01-05" });
  const manual = entry("manual", { status: "previsto", statusManual: "PAGO", dataPagamento: null,
    valorPrevisto: "4.00", dataVencPlano: "2026-01-05" });
  const contradictory = entry("contradictory", { status: "previsto", dataPagamento: "2026-01-05",
    valorPrevisto: "10.00", dataVencPlano: "2026-01-05" });
  const summary = calcularFluxoCaixa([legacy, undated, zero, manual, contradictory],
    options("2026-01-01", "2026-01-31"));
  assert.equal(summary.saldoFinal.total, "0.00");
  assert.equal(summary.previsaoAberta.entradas, "4.00");
  assert.equal(summary.classificacoes.find(item => item.id === "undated")?.status, "PREVISTO");
  assert.equal(summary.classificacoes.find(item => item.id === "legacy")?.status, "INCONSISTENTE");
  assert(summary.inconsistencias.find(item => item.id === "legacy")?.problemas.includes("REALIZADO_SEM_DATA"));
  assert(summary.inconsistencias.find(item => item.id === "zero")?.problemas.includes("VALOR_PREVISTO_INVALIDO"));
  assert(summary.inconsistencias.find(item => item.id === "manual")?.problemas.includes("STATUS_MANUAL_PAGO_SEM_REALIZACAO"));
  assert(summary.inconsistencias.find(item => item.id === "contradictory")?.problemas.includes("PREVISTO_COM_REALIZACAO"));
  assert.equal(legacy.dataPagamento, null);
});

test("Conta N2 sinaliza direção incompatível e transferência sem pareamento", () => {
  const revenueExpense = entry("revenue-expense", { tipo: "SAIDA", contaId: "n2",
    conta: { tipo: "RECEITA", tenantId } });
  const expenseRevenue = entry("expense-revenue", { tipo: "ENTRADA", contaId: "n2b",
    conta: { tipo: "DESPESA", tenantId } });
  const transfer = entry("transfer", { contaId: "n2c", conta: { tipo: "TRANSFERENCIA", tenantId } });
  assert.equal(problemaContaDirecao(revenueExpense), "RECEITA_COM_SAIDA");
  assert.equal(problemaContaDirecao(expenseRevenue), "DESPESA_COM_ENTRADA");
  assert.equal(problemaTipoConta("RECEITA", "ENTRADA"), null);
  assert.equal(problemaTipoConta("DESPESA", "SAIDA"), null);
  assert.equal(problemaTipoConta("TRANSFERENCIA", "SAIDA"), "TRANSFERENCIA_SEM_PAREAMENTO");
  assert.equal(problemaContaDirecao(entry("missing", { contaId: "removed" })), "CONTA_VINCULADA_INEXISTENTE");
  const summary = calcularFluxoCaixa([revenueExpense, expenseRevenue, transfer], options("2026-01-01"));
  assert.equal(summary.inconsistencias.length, 3);
  assert.equal(summary.operacional.componentes.some(item => item.id === "transfer"), false);
  assert.equal(summary.realizado.componentes.some(item => item.id === "transfer"), true);
  const invalidForecast = entry("invalid-forecast", { status: "previsto", tipo: "SAIDA",
    dataPagamento: null, dataVencPlano: "2026-01-01", valorPrevisto: "50.00",
    contaId: "n2", conta: { tipo: "RECEITA", tenantId } });
  const forecastSummary = calcularFluxoCaixa([invalidForecast], options("2026-01-01"));
  assert.equal(forecastSummary.previstoHistorico.saidas, "50.00");
  assert.equal(forecastSummary.previsaoAberta.saidas, "0.00");
});

test("data-base controla recorte/agrupamento/detalhe; caixa continua na realização", () => {
  const summary = calcularFluxoCaixa([retroactive], options("2026-01-08", "2026-01-08",
    { dataBase: "DATA_LANCAMENTO" }));
  assert.equal(summary.saldoAnterior.total, "2000.00");
  assert.equal(summary.entradas.total, "0.00");
  assert.equal(summary.consulta.realizado.entradas, "2000.00");
  assert.equal(summary.consulta.realizadoPorData[0].data, "2026-01-08");
  assert.deepEqual(summary.consulta.realizadoPorData[0].componentes.map(item => item.id), ["H"]);
  assert.equal(calcularFluxoCaixa([retroactive], options("2026-01-08", "2026-01-08",
    { dataBase: "REALIZACAO" })).consulta.realizado.entradas, "0.00");
});

test("filtros e tenant são aplicados também ao histórico do saldo anterior", () => {
  const a = entry("a", { categoria: "X", valor: "100.00" });
  const b = entry("b", { categoria: "Y", valor: "500.00" });
  const current = entry("current", { categoria: "X", valor: "10.00",
    dataLanc: "2026-01-02", dataPagamento: "2026-01-02" });
  const foreign = entry("foreign", { tenantId: "tenant-b", categoria: "X", valor: "9000.00" });
  const summary = calcularFluxoCaixa([a, b, current, foreign], options("2026-01-02", "2026-01-02",
    { filtros: { categoria: "X" } }));
  assert.equal(summary.saldoAnterior.total, "100.00");
  assert.equal(summary.saldoFinal.total, "110.00");
  assert.deepEqual(summary.saldoFinal.componentes.map(item => item.id), ["a", "current"]);
  assert.equal(calcularFluxoCaixa([a, b, current, foreign],
    { tenantId: "tenant-b", inicio: "2026-01-01", fim: "2026-01-02", dataReferencia: "2026-01-31" }).saldoFinal.total,
    "9000.00");
});

test("filtro por status financeiro derivado usa a mesma classificação do motor", () => {
  const overdue = entry("overdue", { status: "previsto", dataPagamento: null,
    valorPrevisto: "25.00", dataVencPlano: "2026-01-01" });
  const selected = calcularFluxoCaixa([overdue, income], options("2026-01-01", "2026-01-31",
    { filtros: { status: "ATRASADO" } }));
  assert.deepEqual(selected.classificacoes.map(item => item.id), ["overdue"]);
  assert.equal(selected.previsaoAberta.entradas, "25.00");
  assert.equal(selected.saldoFinal.total, "0.00");
});

test("Categoria N1 de Conta N2 vinculada prevalece sobre texto legado", () => {
  const linked = entry("linked", { contaId: "account", categoria: "LEGADO",
    conta: { tipo: "RECEITA", tenantId, categoria: { codigo: "N1", tenantId } } });
  const official = calcularFluxoCaixa([linked], options("2026-01-01", "2026-01-01",
    { filtros: { categoria: "N1" } }));
  assert.equal(official.saldoFinal.total, "1.00");
  const oldText = calcularFluxoCaixa([linked], options("2026-01-01", "2026-01-01",
    { filtros: { categoria: "LEGADO" } }));
  assert.equal(oldText.saldoFinal.total, "0.00");
});

test("somatório decimal preserva centavos", () => {
  const cents = [entry("ten", { valor: "0.10" }), entry("twenty", { valor: "0.20" })];
  assert.equal(calcularFluxoCaixa(cents, options("2026-01-01")).entradas.total, "0.30");
});
