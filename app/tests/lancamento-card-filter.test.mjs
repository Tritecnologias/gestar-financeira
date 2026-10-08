import test from "node:test";
import assert from "node:assert/strict";
import { calcularFluxoCaixa } from "../src/lib/cash-flow.ts";
import { idsDoCard } from "../src/lib/lancamento-card-filter.ts";

const tenantId = "dev-a";
const base = { tenantId, status: "realizado", tipo: "ENTRADA", valor: "10.00",
  dataLanc: "2026-10-01", dataPagamento: "2026-10-01" };
const entries = [
  { ...base, id: "anterior", dataPagamento: "2026-09-30" },
  { ...base, id: "entrada" },
  { ...base, id: "saida", tipo: "SAIDA", valor: "4.00" },
  { ...base, id: "receber", status: "previsto", dataPagamento: null,
    valorPrevisto: "8.00", dataVencPlano: "2026-10-02" },
  { ...base, id: "pagar", status: "previsto", tipo: "SAIDA", dataPagamento: null,
    valorPrevisto: "5.00", dataVencPlano: "2026-10-02" },
];

test("sete filtros usam exatamente os componentes do motor financeiro", () => {
  const resumo = calcularFluxoCaixa(entries, {
    tenantId, inicio: "2026-10-01", fim: "2026-10-04", dataReferencia: "2026-10-04",
  });
  assert.deepEqual(idsDoCard(resumo, "saldoAnterior"), ["anterior"]);
  assert.deepEqual(idsDoCard(resumo, "entradas"), ["entrada"]);
  assert.deepEqual(idsDoCard(resumo, "saidas"), ["saida"]);
  assert.deepEqual(idsDoCard(resumo, "aReceber"), ["receber"]);
  assert.deepEqual(idsDoCard(resumo, "aPagar"), ["pagar"]);
  assert.deepEqual(idsDoCard(resumo, "saldoPeriodo"), ["entrada", "saida"]);
  assert.deepEqual(idsDoCard(resumo, "saldoFinal"), ["anterior", "entrada", "saida"]);
  assert.equal(resumo.saldoFinal.total, "16.00");
});
