import test from "node:test";
import assert from "node:assert/strict";
import { calcularFluxoCaixa } from "../src/lib/cash-flow.ts";
import { lerResumoFluxoCaixa } from "../src/lib/cash-flow-response.ts";

const tenantId = "tenant-dev";
const opcoes = (inicio, fim = inicio) => ({ tenantId, inicio, fim, dataReferencia: "2026-10-04", dataBase: "REALIZACAO" });
const lancamento = (id, demais = {}) => ({
  id, tenantId, status: "realizado", tipo: "ENTRADA", valor: "1.00",
  dataLanc: "2026-10-01", dataPagamento: "2026-10-01", descricao: id,
  ...demais,
});
const base = lancamento("base", { dataLanc: "2026-09-30", dataPagamento: "2026-09-30", valor: "100.00" });
const entrada = lancamento("entrada", { dataLanc: "2026-10-02", dataPagamento: "2026-10-02", valor: "10.10" });
const saida = lancamento("saida", { dataLanc: "2026-10-03", dataPagamento: "2026-10-03", valor: "2.05", tipo: "SAIDA" });
const previsto = lancamento("previsto", { status: "previsto", dataPagamento: null, valor: "50.00",
  valorPrevisto: "50.00", dataVencPlano: "2026-10-03" });
const cancelado = lancamento("cancelado", { status: "cancelado", valor: "70.00", dataPagamento: "2026-10-03" });
const inconsistente = lancamento("inconsistente", { dataPagamento: null, valor: "90.00" });
const contaIncompativel = lancamento("conta-incompativel", { valor: "80.00", contaId: "conta-despesa",
  conta: { tenantId, tipo: "DESPESA" } });

test("A–D: os cinco KPIs vêm da mesma resposta do motor no período atual e histórico", () => {
  const registros = [base, entrada, saida];
  const atual = calcularFluxoCaixa(registros, opcoes("2026-10-01", "2026-10-04"));
  assert.equal(atual.saldoAnterior.total, "100.00");
  assert.equal(atual.entradas.total, "10.10");
  assert.equal(atual.saidas.total, "2.05");
  assert.equal(atual.saldoPeriodo.total, "8.05");
  assert.equal(atual.saldoFinal.total, "108.05");
  const historico = calcularFluxoCaixa(registros, opcoes("2026-09-01", "2026-09-30"));
  assert.equal(historico.saldoAnterior.total, "0.00");
  assert.equal(historico.saldoFinal.total, "100.00");
  assert.equal(historico.saldoFinal.total, atual.saldoAnterior.total);
});

test("E–F: saldo negativo e período sem movimentos preservam a posição", () => {
  const divida = lancamento("divida", { dataLanc: "2026-09-30", dataPagamento: "2026-09-30",
    tipo: "SAIDA", valor: "5000.00" });
  const resumo = calcularFluxoCaixa([divida], opcoes("2026-10-01", "2026-10-04"));
  assert.equal(resumo.saldoAnterior.total, "-5000.00");
  assert.equal(resumo.saldoPeriodo.total, "0.00");
  assert.equal(resumo.saldoFinal.total, "-5000.00");
  assert.deepEqual(resumo.serieCaixa, []);
});

test("G–L, N–O: inconsistência, cancelado e previsto ficam fora; drill-down e série reconciliam centavos", () => {
  const resumo = calcularFluxoCaixa([base, entrada, saida, previsto, cancelado, inconsistente, contaIncompativel],
    opcoes("2026-10-01", "2026-10-04"));
  assert.equal(resumo.saldoFinal.total, "108.05");
  assert.equal(resumo.previstoHistorico.entradas, "50.00");
  assert.equal(resumo.previsaoAberta.entradas, "50.00");
  assert(resumo.inconsistencias.some(item => item.id === "inconsistente" && item.problemas.includes("REALIZADO_SEM_DATA")));
  assert(resumo.inconsistencias.some(item => item.id === "conta-incompativel" && item.problemas.includes("DESPESA_COM_ENTRADA")));
  assert.deepEqual(resumo.entradas.componentes.map(item => item.id), ["entrada"]);
  assert.deepEqual(resumo.saidas.componentes.map(item => item.id), ["saida"]);
  assert.deepEqual(resumo.saldoAnterior.componentes.map(item => item.id), ["base"]);
  assert.deepEqual(resumo.saldoPeriodo.componentes.map(item => item.id), ["entrada", "saida"]);
  assert.deepEqual(resumo.saldoFinal.componentes.map(item => item.id), ["base", "entrada", "saida"]);
  assert.deepEqual(resumo.serieCaixa.map(item => [item.data, item.saldoAcumulado]),
    [["2026-10-02", "110.10"], ["2026-10-03", "108.05"]]);
  assert.equal(resumo.serieCaixa.at(-1).saldoAcumulado, resumo.saldoFinal.total);
  assert(resumo.ultimosLancamentos.some(item => item.id === "inconsistente" && item.dataFinanceira === null));
  assert(resumo.saldoFinal.componentes.every(item => item.id !== "cancelado" && item.id !== "previsto"));
});

test("M: erro HTTP ou payload inválido não vira saldo zero", async () => {
  await assert.rejects(lerResumoFluxoCaixa(new Response("erro", { status: 500 })), /Não foi possível carregar/);
  await assert.rejects(lerResumoFluxoCaixa(Response.json({ saldoFinal: { total: "0.00" } })), /dados inválidos/);
  const vazio = calcularFluxoCaixa([], opcoes("2026-10-01", "2026-10-04"));
  const resultado = await lerResumoFluxoCaixa(Response.json(vazio));
  assert.equal(resultado.saldoFinal.total, "0.00");
});
