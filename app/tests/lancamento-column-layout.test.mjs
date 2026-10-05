import test from "node:test";
import assert from "node:assert/strict";
import { COLUNAS_DEF, DEFAULT_COLUNAS_CONFIG, alignLegacyDefaultColumns, minColumnWidth } from "../src/components/lancamentos/colunasConfig.ts";
import { LANCAMENTO_FIELD_ORDER } from "../src/lib/lancamento-field-order.mjs";

const keys = config => [...config].sort((a, b) => a.order - b.order).map(col => col.key);

test("layout padrão mantém Direção, Categoria N1 e Conta N2 lado a lado", () => {
  const result = keys(alignLegacyDefaultColumns(DEFAULT_COLUNAS_CONFIG));
  const direction = result.indexOf("tipo");
  assert.deepEqual(result.slice(direction, direction + 3), ["tipo", "categoria", "contaId"]);
});

const oldKeys = [
  "seq", "dataLanc", "dataEmissao", "statusManual", "dataVencOriginal", "dataVencPlano",
  "fantasiaPadrao", "descricao", "dataEvento", "statusExtrato", "fornecedor", "banco",
  "valorPrevisto", "dataPagamento", "valor", "tipo", "categoria", "contaId",
  "statusAuto", "centroCusto", "dre", "cont", "vencA", "vencM", "vencD", "vencAM",
  "diasAtrasoOriginal", "diasAtrasoPlano", "rangeAtraso", "emissaoAM", "anotacao",
];
const oldWidths = [45, 160, 155, 120, 170, 180, 180, 250, 155, 85, 140, 140, 140,
  160, 145, 85, 160, 165, 155, 110, 100, 80, 65, 55, 55, 70, 80, 80, 85, 80, 180];
const oldDefault = () => oldKeys.map((key, order) => ({ key, order, visible: true, width: oldWidths[order] }));

test("novo usuário e restaurar padrão recebem a sequência oficial", () => {
  assert.deepEqual(keys(DEFAULT_COLUNAS_CONFIG), COLUNAS_DEF.map(col => col.key));
  assert.deepEqual(keys(DEFAULT_COLUNAS_CONFIG).filter(key => LANCAMENTO_FIELD_ORDER.includes(key)),
    LANCAMENTO_FIELD_ORDER.filter(key => COLUNAS_DEF.some(col => col.key === key)));
  assert.deepEqual(keys(DEFAULT_COLUNAS_CONFIG).slice(0, 9), ["seq", "descricao", "fantasiaPadrao",
    "tipo", "categoria", "contaId", "valorPrevisto", "valor", "dataLanc"]);
  assert.deepEqual(keys(DEFAULT_COLUNAS_CONFIG).slice(-8), ["vencA", "vencM", "vencD", "vencAM",
    "diasAtrasoOriginal", "diasAtrasoPlano", "rangeAtraso", "emissaoAM"]);
});

test("padrão anterior migra ordem e larguras de fábrica sem reexibir colunas ocultas", () => {
  const saved = oldDefault();
  saved.find(col => col.key === "dre").visible = false;
  const result = alignLegacyDefaultColumns(saved);
  assert.deepEqual(keys(result), keys(DEFAULT_COLUNAS_CONFIG));
  assert.equal(result.find(col => col.key === "descricao").width, 320);
  assert.equal(result.find(col => col.key === "contaId").width, 220);
  assert.equal(result.find(col => col.key === "dre").visible, false);
  assert.deepEqual(alignLegacyDefaultColumns(result), result);
});

test("larguras personalizadas sobrevivem à migração do padrão anterior", () => {
  const saved = oldDefault();
  saved.find(col => col.key === "descricao").width = 405;
  saved.find(col => col.key === "dataLanc").width = 205;
  const result = alignLegacyDefaultColumns(saved);
  assert.equal(result.find(col => col.key === "descricao").width, 405);
  assert.equal(result.find(col => col.key === "dataLanc").width, 205);
});

test("ordem personalizada não é substituída pelo novo padrão", () => {
  const saved = oldDefault();
  [saved[2].order, saved[7].order] = [saved[7].order, saved[2].order];
  saved.find(col => col.key === "contaId").visible = false;
  const result = alignLegacyDefaultColumns(saved);
  assert.deepEqual(keys(result), keys(saved));
  assert.equal(result.find(col => col.key === "contaId").visible, false);
});

test("chave antiga conta vira contaId sem mover as outras colunas personalizadas", () => {
  const custom = DEFAULT_COLUNAS_CONFIG.map(col => ({ ...col }));
  const account = custom.find(col => col.key === "contaId");
  account.key = "conta";
  account.width = 173;
  account.visible = false;
  const category = custom.find(col => col.key === "categoria");
  const direction = custom.find(col => col.key === "tipo");
  [category.order, direction.order] = [direction.order, category.order];

  const result = alignLegacyDefaultColumns(custom);
  assert.equal(result.length, COLUNAS_DEF.length);
  assert.equal(result.some(col => col.key === "conta"), false);
  assert.deepEqual(result.find(col => col.key === "contaId"), {
    key: "contaId", visible: false, order: account.order, width: 173,
  });
  assert.deepEqual(keys(result).slice(category.order, category.order + 3),
    ["categoria", "tipo", "contaId"]);
  assert.deepEqual(alignLegacyDefaultColumns(result), result);
});

test("configuração antiga sem Conta N2 recebe coluna movível após Categoria N1", () => {
  const incomplete = DEFAULT_COLUNAS_CONFIG.filter(col => col.key !== "contaId");
  const result = alignLegacyDefaultColumns(incomplete);
  assert.equal(result.length, COLUNAS_DEF.length);
  assert.equal(result.find(col => col.key === "contaId")?.visible, true);
  assert.equal(keys(result).indexOf("contaId"), keys(result).indexOf("categoria") + 1);
});

test("contaId oficial prevalece quando um alias antigo também estiver salvo", () => {
  const direct = DEFAULT_COLUNAS_CONFIG.find(col => col.key === "contaId");
  const result = alignLegacyDefaultColumns([
    ...DEFAULT_COLUNAS_CONFIG,
    { key: "Conta N5", visible: false, order: 0, width: 70 },
  ]);
  assert.equal(result.length, COLUNAS_DEF.length);
  assert.deepEqual(result.find(col => col.key === "contaId"), direct);
});

test("layouts antigos removem a coluna Ações e preservam as colunas de dados", () => {
  const antigo = [...DEFAULT_COLUNAS_CONFIG, { key: "acoes", visible: true, order: 31, width: 75 }];
  const result = alignLegacyDefaultColumns(antigo);
  assert.equal(result.some(col => col.key === "acoes"), false);
  assert.deepEqual(keys(result), keys(DEFAULT_COLUNAS_CONFIG));
});

test("layout salvo estreito preserva a ordem, mas respeita o mínimo da edição inline", () => {
  const saved = DEFAULT_COLUNAS_CONFIG.map(col => ({ ...col }));
  const date = saved.find(col => col.key === "dataPagamento");
  const account = saved.find(col => col.key === "contaId");
  const description = saved.find(col => col.key === "descricao");
  date.width = 90;
  account.width = 70;
  description.width = 210;
  [date.order, account.order] = [account.order, date.order];

  const result = alignLegacyDefaultColumns(saved);
  assert.deepEqual(keys(result), keys(saved));
  assert.equal(result.find(col => col.key === "dataPagamento")?.width, minColumnWidth(COLUNAS_DEF.find(col => col.key === "dataPagamento")));
  assert.equal(result.find(col => col.key === "contaId")?.width, minColumnWidth(COLUNAS_DEF.find(col => col.key === "contaId")));
  assert.equal(result.find(col => col.key === "descricao")?.width, 210);
});
