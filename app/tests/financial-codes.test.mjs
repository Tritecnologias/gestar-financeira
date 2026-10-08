import test from "node:test";
import assert from "node:assert/strict";
import {
  accountCategoryPrefix, accountCodeBelongsToCategory, nextAccountCode,
  validNewCategoryCode, validNewAccountCode,
} from "../src/lib/financial-codes.ts";
import { buildFinancialTree } from "../src/lib/financial-tree.ts";

test("N1 novo aceita apenas código manual de dois dígitos", () => {
  for (const code of ["01", "05", "12", "49", "99", "00"]) assert.equal(validNewCategoryCode(code), true);
  for (const code of ["", "1", "100", "PF01", "1A", " 05", "05 "]) assert.equal(validNewCategoryCode(code), false);
});

test("N2 mantém sequência independente, gaps, inativos e passa de 99", () => {
  assert.equal(nextAccountCode("05", []), "05.01");
  assert.equal(nextAccountCode("05", ["05.01", "05.03", "06.08", "05.04", null]), "05.05");
  assert.equal(nextAccountCode("06", ["05.01", "06.08"]), "06.09");
  assert.equal(nextAccountCode("05", ["05.99"]), "05.100");
  assert.equal(nextAccountCode("05", ["05.100"]), "05.101");
});

test("N1 legado permanece intacto; novo N2 usa dois dígitos e maior sufixo histórico", () => {
  assert.equal(accountCategoryPrefix("5"), "05");
  assert.equal(accountCategoryPrefix("PF01"), "PF01");
  assert.equal(nextAccountCode("5", ["5.92323", "05.04", "05.99"]), "05.92324");
  assert.equal(accountCodeBelongsToCategory("5.92323", "5"), true);
  assert.equal(accountCodeBelongsToCategory("05.92324", "5"), true);
  assert.equal(validNewAccountCode("05.92324", "5"), true);
  assert.equal(validNewAccountCode("5.92324", "5"), false);
});

test("importação exige N1 novo de dois dígitos e N2 estrutural", () => {
  assert.equal(validNewCategoryCode("01"), true);
  assert.equal(validNewCategoryCode("100"), false);
  assert.equal(validNewCategoryCode("1"), false);
  assert.equal(validNewCategoryCode("PF01"), false);
  assert.equal(validNewAccountCode("05.01", "05"), true);
  assert.equal(validNewAccountCode("05.100", "05"), true);
  assert.equal(validNewAccountCode("05.1", "05"), false);
  assert.equal(validNewAccountCode("07.01", "05"), false);
  assert.equal(validNewAccountCode("05.00", "05"), false);
});

test("árvore ordena N1 numericamente e N2 por sufixo dentro do pai", () => {
  const categories = ["05", "01", "09", "03"].map(codigo => ({ id: codigo, codigo, nome: codigo }));
  const accounts = ["05.100", "05.9", "05.10", "05.02", "01.03", "05.49", "05.01"].map(codigo => ({
    id: codigo, codigo, descricao: codigo, tipo: "DESPESA", categoriaId: codigo.startsWith("01") ? "01" : "05",
  }));
  const tree = buildFinancialTree(categories, accounts, { busca: "", categoriaId: "", tipo: "" });
  assert.deepEqual(tree.grouped.map(group => group.cat.codigo), ["01", "03", "05", "09"]);
  assert.deepEqual(tree.grouped.find(group => group.cat.codigo === "05")?.children.map(row => row.codigo),
    ["05.01", "05.02", "05.9", "05.10", "05.49", "05.100"]);
});
