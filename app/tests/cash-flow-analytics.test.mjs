import test from "node:test";
import assert from "node:assert/strict";
import { calcularFluxoCaixa } from "../src/lib/cash-flow.ts";
import { montarAnalisesFluxoCaixa } from "../src/lib/cash-flow-analytics.ts";

const tenantId = "tenant-a";
const contaReceita = { tenantId, tipo: "RECEITA", codigo: "01", descricao: "Vendas",
  categoriaId: "cat-in", categoria: { id: "cat-in", tenantId, codigo: "1", nome: "Receitas" } };
const contaDespesa = { tenantId, tipo: "DESPESA", codigo: "02", descricao: "Despesas gerais",
  categoriaId: "cat-out", categoria: { id: "cat-out", tenantId, codigo: "2", nome: "Despesas" } };
const row = (id, extra = {}) => ({ id, tenantId, status: "realizado", tipo: "ENTRADA", valor: "1.00",
  dataLanc: "2026-09-28", dataPagamento: "2026-09-28", dataVencPlano: null,
  valorPrevisto: null, contaId: "account-in", conta: contaReceita, ...extra });
const options = (inicio = "2026-09-28", fim = "2026-10-11", extra = {}) => ({
  tenantId, inicio, fim, dataReferencia: "2026-10-04", dataBase: "VENCIMENTO_PLANO", ...extra,
});

test("14-day and full-month series reconcile daily actual, planned and comparison values", () => {
  const rows = [
    row("opening", { dataPagamento: "2026-09-27", valor: "100.00" }),
    row("income", { valor: "9.75", valorPrevisto: "10.00", dataVencPlano: "2026-09-28" }),
    row("expense", { tipo: "SAIDA", valor: "4.25", valorPrevisto: "5.00", contaId: "account-out",
      conta: contaDespesa, dataPagamento: "2026-10-04", dataVencPlano: "2026-10-05" }),
    row("future", { status: "previsto", dataPagamento: null, valor: "1000.00",
      valorPrevisto: "2.50", dataVencPlano: "2026-10-10" }),
    row("cancel", { status: "cancelado", valor: "900.00", valorPrevisto: "900.00", dataVencPlano: "2026-10-03" }),
    row("legacy", { status: "realizado", dataPagamento: null, valor: "900.00" }),
    row("foreign", { tenantId: "tenant-b", valor: "900.00" }),
  ];
  const summary = calcularFluxoCaixa(rows, options());
  const result = montarAnalisesFluxoCaixa(summary, "DUAS_SEMANAS", "COMPARAR");
  assert.equal(result.dias.length, 14);
  assert.equal(result.saldoAnterior, "100.00");
  assert.equal(result.realizado.entradas, "9.75");
  assert.equal(result.realizado.saidas, "4.25");
  assert.equal(result.realizado.resultado, "5.50");
  assert.equal(result.previsto.entradas, "12.50");
  assert.equal(result.previsto.saidas, "5.00");
  assert.equal(result.variacao.resultado, "-2.00");
  assert.equal(result.dias[0].saldoRealAcumulado, "109.75");
  assert.equal(result.dias[0].resultadoPrevistoAcumulado, "10.00");
  assert.equal(result.dias[0].variacao, "-0.25");
  assert.equal(result.dias[13].saldoRealAcumulado, "105.50");
  assert.equal(result.dias[13].resultadoPrevistoAcumulado, "7.50");
  assert.equal(result.saldoFinal, summary.saldoFinal.total);
  assert(result.inconsistencias.some(item => item.id === "legacy"));
  assert(!result.realizado.componentes.some(item => item.id === "cancel" || item.id === "foreign" || item.id === "legacy"));

  const monthly = montarAnalisesFluxoCaixa(calcularFluxoCaixa(rows,
    options("2026-10-01", "2026-10-31")), "MENSAL", "PREVISTO");
  assert.equal(monthly.dias.length, 31);
  assert.equal(monthly.saldoAnterior, "109.75");
  assert.equal(monthly.dias[3].saldoRealAcumulado, "105.50");
  assert.equal(monthly.dias[4].previsto.saidas, "5.00");
  assert.equal(monthly.dias[9].previsto.entradas, "2.50");
  assert.equal(monthly.dias[30].resultadoPrevistoAcumulado, "-2.50");
});

test("composition uses only official Categoria N1 / Conta N2 and keeps transfers separate", () => {
  const transfer = row("transfer", { tipo: "ENTRADA", valor: "8.00", contaId: "transfer",
    conta: { ...contaReceita, tipo: "TRANSFERENCIA" } });
  const official = row("official", { valor: "12.34" });
  const legacy = row("legacy", { valor: "2.00", contaId: null, conta: null, categoria: "Texto legado" });
  const crossTenant = row("other", { tenantId: "tenant-b", valor: "999.00" });
  const result = montarAnalisesFluxoCaixa(calcularFluxoCaixa([transfer, official, legacy, crossTenant], options()),
    "DUAS_SEMANAS", "REALIZADO");
  const entries = result.composicao.entradas;
  assert.equal(entries.categorias.length, 1);
  assert.equal(entries.categorias[0].categoriaId, "cat-in");
  assert.equal(entries.categorias[0].entradas, "12.34");
  assert.equal(entries.categorias[0].contas[0].contaId, "account-in");
  assert.equal(entries.semClassificacao.entradas, "2.00");
  assert.equal(entries.transferencias.entradas, "8.00");
  assert.equal(result.realizado.entradas, "22.34");
});

test("empty historic and future months keep complete daily axes and zero balances", () => {
  for (const [inicio, fim, total] of [["2026-02-01", "2026-02-28", 28], ["2027-01-01", "2027-01-31", 31]]) {
    const result = montarAnalisesFluxoCaixa(calcularFluxoCaixa([], options(inicio, fim)), "MENSAL", "REALIZADO");
    assert.equal(result.dias.length, total);
    assert(result.dias.every(day => day.realizado.quantidade === 0 && day.saldoRealAcumulado === "0.00"));
  }
});
