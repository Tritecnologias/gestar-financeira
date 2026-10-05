import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import {
  OFFICIAL_HEADERS, createOfficialWorkbook, parseOfficialWorkbook,
  recordCells, planOfficialImport,
} from "../src/lib/lancamento-official-import.ts";

const tenant = "tenant-a";
const otherTenant = "tenant-b";
const id = "11111111-1111-4111-8111-111111111111";
const foreignId = "22222222-2222-4222-8222-222222222222";
const categoria = { id: "cat-a", tenantId: tenant, codigo: "01", ativo: true };
const conta = { id: "conta-a", tenantId: tenant, codigo: "001", ativo: true,
  categoriaId: categoria.id, categoria, tipo: "RECEITA" };
const existing = { id, tenantId: tenant, atualizadoEm: new Date("2026-10-04T12:34:56.789Z"),
  dataLanc: new Date("2026-10-04T12:00:00.000Z"), descricao: "Teste", tipo: "ENTRADA",
  status: "realizado", valor: "9750.00", valorPrevisto: "10000.00",
  dataPagamento: new Date("2026-10-04T12:00:00.000Z"), contaId: conta.id, conta,
  categoria: "01", clienteRef: null, fornecedorRef: null };

function mockDb() {
  return {
    lancamento: {
      findMany: async ({ where }) => [existing].filter(row => row.tenantId === where.tenantId && where.id.in.includes(row.id)),
      findFirst: async () => null,
    },
    categoria: { findMany: async ({ where }) => where.tenantId === tenant ? [categoria] : [] },
    planoContas: { findMany: async ({ where }) => where.tenantId === tenant ? [conta] : [] },
    cliente: { findMany: async () => [] }, fornecedor: { findMany: async () => [] },
    statusManualTipo: { findMany: async () => [] },
  };
}
const row = (cells, linha = 2) => ({ linha, cells: { ...recordCells(existing), ...cells } });

test("XLSX oficial mantém ID, versão, códigos com zeros e dia civil", () => {
  const parsed = parseOfficialWorkbook(new Uint8Array(createOfficialWorkbook([existing])));
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].cells.REGISTRO_ID, id);
  assert.equal(parsed[0].cells.REGISTRO_VERSAO, existing.atualizadoEm.toISOString());
  assert.equal(parsed[0].cells.CONTA_N2, "001");
  assert.equal(parsed[0].cells.DATA_LANCAMENTO, "2026-10-04");
  assert.equal(parsed[0].cells.VALOR_PREVISTO, "10000.00");
  assert.equal(Object.keys(parsed[0].cells).length, OFFICIAL_HEADERS.length);
  assert.deepEqual(parseOfficialWorkbook(new Uint8Array(createOfficialWorkbook([]))), []);
});

test("reimportação idêntica é inalterada; descrição e valor viram update por ID", async () => {
  const same = await planOfficialImport(mockDb(), tenant, [row({})]);
  assert.deepEqual(same.resumo, { novos: 0, alterados: 0, inalterados: 1, erros: 0, conflitos: 0, avisos: 0 });
  assert.equal(same.changes.length, 0);
  const changed = await planOfficialImport(mockDb(), tenant, [row({ DESCRICAO: "Teste atualizado", VALOR_REALIZADO: "9751,25" })]);
  assert.equal(changed.rows[0].acao, "ALTERADO");
  assert.deepEqual(changed.rows[0].diferencas.map(diff => diff.campo), ["DESCRICAO", "VALOR_REALIZADO"]);
  assert.equal(changed.changes[0].id, id);
  assert.equal(changed.changes[0].data.valor, "9751.25");
  assert.equal(changed.changes[0].data.tenantId, undefined);
  assert.equal(changed.changes[0].data.atualizadoEm, undefined);
});

test("linha sem ID cria; ID inválido ou de outro tenant nunca cria", async () => {
  const fresh = row({ REGISTRO_ID: "", REGISTRO_VERSAO: "", DESCRICAO: "Novo" });
  const created = await planOfficialImport(mockDb(), tenant, [fresh]);
  assert.equal(created.rows[0].acao, "NOVO");
  assert.equal(created.changes[0].id, null);
  for (const badId of ["invalido", foreignId]) {
    const bad = await planOfficialImport(mockDb(), tenant, [row({ REGISTRO_ID: badId })]);
    assert.equal(bad.rows[0].acao, "ERRO");
    assert.equal(bad.changes.length, 0);
    assert.match(bad.errors[0].motivo, /REGISTRO_ID/);
  }
});

test("versão obsoleta, categoria, conta e direção inválidas bloqueiam", async () => {
  const scenarios = [
    [{ REGISTRO_VERSAO: "2026-10-03T12:00:00.000Z" }, "CONFLITO"],
    [{ CATEGORIA_N1: "99" }, "ERRO"],
    [{ CONTA_N2: "999" }, "ERRO"],
    [{ DIRECAO: "SAIDA" }, "ERRO"],
    [{ DATA_LANCAMENTO: "31/02/2026" }, "ERRO"],
    [{ VALOR_REALIZADO: "abc" }, "ERRO"],
  ];
  for (const [cells, action] of scenarios) {
    const result = await planOfficialImport(mockDb(), tenant, [row(cells)]);
    assert.equal(result.rows[0].acao, action);
    assert.equal(result.changes.length, 0);
  }
});

test("uma conta não pode ser vinculada à categoria de outro tenant", async () => {
  const db = mockDb();
  db.categoria.findMany = async () => [{ id: "cat-b", tenantId: otherTenant, codigo: "01", ativo: true }];
  const result = await planOfficialImport(db, tenant, [row({})]);
  assert.equal(result.rows[0].acao, "ERRO");
});

test("ausência da linha não gera exclusão e data DD/MM/AAAA não muda de dia", async () => {
  const none = await planOfficialImport(mockDb(), tenant, []);
  assert.equal(none.changes.length, 0);
  const result = await planOfficialImport(mockDb(), tenant, [row({ DATA_LANCAMENTO: "04/10/2026", DESCRICAO: "Novo dia" })]);
  assert.equal(result.rows[0].acao, "ALTERADO");
  assert.equal(result.changes[0].data.dataLanc.toISOString().slice(0, 10), "2026-10-04");
});

test("possível duplicidade de novo registro gera aviso sem transformar CREATE em UPDATE", async () => {
  const db = mockDb();
  db.lancamento.findFirst = async () => ({ id });
  const result = await planOfficialImport(db, tenant, [row({ REGISTRO_ID: "", REGISTRO_VERSAO: "" })]);
  assert.equal(result.rows[0].acao, "NOVO");
  assert.equal(result.resumo.avisos, 1);
  assert.equal(result.changes[0].id, null);
});

test("erro na última linha é visível no plano integral e impede confirmação", async () => {
  const result = await planOfficialImport(mockDb(), tenant, [
    row({ REGISTRO_ID: "", REGISTRO_VERSAO: "", DESCRICAO: "Válido" }),
    row({ REGISTRO_ID: "", REGISTRO_VERSAO: "", DESCRICAO: "Inválido", CONTA_N2: "999" }, 3),
  ]);
  assert.equal(result.rows.length, 2);
  assert.equal(result.resumo.novos, 1);
  assert.equal(result.resumo.erros, 1);
  assert.equal(result.errors[0].linha, 3);
  assert.equal(result.errors.length > 0, true);
});

test("arquivo legado sem REGISTRO_ID não é interpretado como atualização", () => {
  const old = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(old, XLSX.utils.aoa_to_sheet([["DESCRICAO", "VALOR"], ["Antigo", "1,00"]]), "LANCAMENTOS");
  assert.throws(() => parseOfficialWorkbook(new Uint8Array(XLSX.write(old, { type: "array", bookType: "xlsx" }))), /Cabeçalhos incompatíveis/);
});
