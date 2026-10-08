import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// Node's test runner needs the extension that Next/TypeScript resolves automatically.
registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier === "./cash-flow" && context.parentURL?.endsWith("/lancamento-filters.ts")) {
    return nextResolve("./cash-flow.ts", context);
  }
  return nextResolve(specifier, context);
} });
const { lerFiltrosLancamentos, statusCorresponde, whereLancamentos } =
  await import("../src/lib/lancamento-filters.ts");

const tenantId = "tenant-dev";
const query = (parameters) => lerFiltrosLancamentos(new URLSearchParams(parameters));

test("data-base e período selecionam o campo correto para lista e exportação", () => {
  for (const [base, field] of [
    ["DATA_LANCAMENTO", "dataLanc"], ["DATA_EMISSAO", "dataEmissao"],
    ["VENCIMENTO_ORIGINAL", "dataVencOriginal"], ["VENCIMENTO_PLANO", "dataVencPlano"],
    ["REALIZACAO", "dataPagamento"],
  ]) {
    const filters = query({ dataBase: base, inicio: "2026-10-01", fim: "2026-10-31" });
    const where = whereLancamentos(filters, tenantId, true);
    assert.equal(where.tenantId, tenantId);
    assert.deepEqual(where[field], {
      gte: new Date("2026-10-01T00:00:00.000Z"),
      lte: new Date("2026-10-31T00:00:00.000Z"),
    });
    assert.equal(whereLancamentos(filters, tenantId, false)[field], undefined);
  }
  assert.throws(() => query({ dataBase: "DESCONHECIDA" }), /Data-base/);
  assert.throws(() => query({ inicio: "2026-10-31", fim: "2026-10-01" }), /período/);
  assert.throws(() => query({ inicio: "2026-02-30" }), /período/);
});

test("busca e dimensões compartilham seleção restrita ao tenant", () => {
  const where = whereLancamentos(query({ busca: "  Acme  ", categoria: "01", contaId: "conta-1",
    clienteId: "cliente-1", statusManual: "PAGO", tipo: "ENTRADA" }), tenantId, true);
  assert.equal(where.tenantId, tenantId);
  assert.equal(where.contaId, "conta-1");
  assert.equal(where.clienteId, "cliente-1");
  assert.equal(where.statusManual, "PAGO");
  assert.equal(where.tipo, "ENTRADA");
  assert.equal(where.AND.length, 2);
  assert(where.AND[0].OR.some(condition => condition.conta?.is?.categoria?.is?.tenantId === tenantId));
  assert(where.AND[0].OR.some(condition => condition.contaId === null && condition.categoria === "01"));
  assert(where.AND[1].OR.some(condition => condition.anotacao?.contains === "Acme"));
  assert(where.AND[1].OR.some(condition => condition.clienteRef?.is?.nome?.contains === "Acme"));
  assert(where.AND[1].OR.some(condition => condition.fornecedorRef?.is?.nomeFantasia?.contains === "Acme"));
});

test("status financeiro é derivado; realizado sem data permanece inconsistente", () => {
  const row = { id: "legacy", tenantId, status: "realizado", tipo: "ENTRADA", valor: "10.00",
    dataLanc: "2026-10-04", dataPagamento: null };
  assert.equal(statusCorresponde(row, "INCONSISTENTE", "2026-10-04"), true);
  assert.equal(statusCorresponde(row, "REALIZADO", "2026-10-04"), false);
  assert.equal(statusCorresponde({ ...row, dataPagamento: "2026-10-04" }, "REALIZADO", "2026-10-04"), true);
});
