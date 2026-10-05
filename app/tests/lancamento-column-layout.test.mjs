import test from "node:test";
import assert from "node:assert/strict";
import { COLUNAS_DEF, DEFAULT_COLUNAS_CONFIG, alignLegacyDefaultColumns } from "../src/components/lancamentos/colunasConfig.ts";

const keys = config => [...config].sort((a, b) => a.order - b.order).map(col => col.key);

test("layout padrão mantém Direção, Categoria N1 e Conta N2 lado a lado", () => {
  const result = keys(alignLegacyDefaultColumns(DEFAULT_COLUNAS_CONFIG));
  const direction = result.indexOf("tipo");
  assert.deepEqual(result.slice(direction, direction + 3), ["tipo", "categoria", "contaId"]);
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
