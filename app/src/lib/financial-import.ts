import * as XLSX from "xlsx";
import { FINANCIAL_ACCOUNT_TYPES } from "@/lib/financial-account-types";
import { categoryCandidatesFromCode, createDescriptionLookup } from "@/lib/financial-import-insights";

export type FinancialIssue = { aba: string; linha: number; campo: string; codigo: string; motivo: string };
export type FinancialRow = { linha: number; codigo: string; descricao: string; codigoCategoria?: string; tipo?: string; acao?: "novo" | "atualizar" | "igual" | "erro"; detalhes?: string[]; avisos?: string[]; sugestoes?: string[] };
export type FinancialWorkbook = { categorias: FinancialRow[]; contas: FinancialRow[]; errors: FinancialIssue[] };
export type FinancialPreview = FinancialWorkbook & {
  warnings: FinancialIssue[]; suggestions: FinancialIssue[];
  resumo: {
    totalLido: number; totalNovo: number; totalAtualizado: number; totalSemAlteracao: number;
    totalInvalido: number; totalErros: number; totalAvisos: number; totalSugestoes: number;
    ausentes: { categorias: number; contas: number };
    categorias: { novos: number; atualizacoes: number; semAlteracao: number; avisos: number; erros: number };
    contas: { novos: number; atualizacoes: number; semAlteracao: number; avisos: number; erros: number };
  };
};

const CATEGORY = "CATEGORIAS_N1";
const ACCOUNT = "CONTAS_N2";

export function parseFinancialWorkbook(bytes: Uint8Array): FinancialWorkbook {
  const workbook = XLSX.read(bytes, { type: "array", cellText: true });
  const errors: FinancialIssue[] = [];
  function sheet(name: string, columns: string[]): FinancialRow[] {
    const worksheet = workbook.Sheets[name];
    if (!worksheet) { errors.push({ aba: name, linha: 0, campo: "ABA", codigo: "", motivo: `Aba ${name} ausente.` }); return []; }
    const cells = XLSX.utils.sheet_to_json<string[]>(worksheet, { header: 1, raw: false, defval: "", blankrows: true });
    const headers = (cells[0] || []).map(value => String(value).trim().toUpperCase());
    for (const column of columns) {
      if (!headers.includes(column)) errors.push({ aba: name, linha: 1, campo: column, codigo: "", motivo: `Coluna ${column} ausente.` });
      if (headers.filter(value => value === column).length > 1) errors.push({ aba: name, linha: 1, campo: column, codigo: "", motivo: `Coluna ${column} duplicada.` });
    }
    if (columns.some(column => headers.filter(value => value === column).length !== 1)) return [];
    return cells.slice(1).flatMap((cellsRow, index) => {
      const values = columns.map(column => String(cellsRow[headers.indexOf(column)] ?? "").trim());
      if (values.every(value => !value)) return [];
      return [{ linha: index + 2, codigo: values[0], descricao: values[1],
        ...(name === ACCOUNT ? { codigoCategoria: values[2], tipo: values[3] } : {}) }];
    });
  }
  const categorias = sheet(CATEGORY, ["CODIGO_CATEGORIA", "DESCRICAO_CATEGORIA"]);
  const contas = sheet(ACCOUNT, ["CODIGO_CONTA", "DESCRICAO_CONTA", "CODIGO_CATEGORIA", "TIPO_CONTA"]);
  if (!errors.length && !categorias.length && !contas.length) errors.push({ aba: CATEGORY, linha: 0, campo: "ARQUIVO", codigo: "", motivo: "Arquivo sem registros para importar." });
  return { categorias, contas, errors };
}

export function validateFinancialWorkbookInput(input: FinancialWorkbook): FinancialIssue[] {
  const errors = [...input.errors];
  const issue = (aba: string, row: FinancialRow, campo: string, motivo: string) => errors.push({ aba, linha: row.linha, campo, codigo: row.codigo, motivo });
  for (const [aba, rows, codeField, descriptionField] of [
    [CATEGORY, input.categorias, "CODIGO_CATEGORIA", "DESCRICAO_CATEGORIA"],
    [ACCOUNT, input.contas, "CODIGO_CONTA", "DESCRICAO_CONTA"],
  ] as const) {
    const occurrences = new Map<string, number>();
    for (const row of rows) if (row.codigo) occurrences.set(row.codigo, (occurrences.get(row.codigo) || 0) + 1);
    for (const row of rows) {
      if (!row.codigo) issue(aba, row, codeField, "Código obrigatório.");
      if (!row.descricao) issue(aba, row, descriptionField, "Descrição obrigatória.");
      if (row.codigo && (occurrences.get(row.codigo) || 0) > 1) issue(aba, row, codeField, "Código duplicado no arquivo.");
    }
  }
  for (const row of input.contas) {
    if (!row.codigoCategoria) issue(ACCOUNT, row, "CODIGO_CATEGORIA", "Categoria obrigatória.");
    if (!FINANCIAL_ACCOUNT_TYPES.includes(row.tipo as typeof FINANCIAL_ACCOUNT_TYPES[number])) issue(ACCOUNT, row, "TIPO_CONTA", "Tipo inválido. Use RECEITA, DESPESA ou TRANSFERENCIA.");
  }
  return errors;
}

export async function validateFinancialWorkbook(input: FinancialWorkbook, db: any): Promise<FinancialPreview> {
  const categorias = input.categorias.map(row => ({ ...row }));
  const contas = input.contas.map(row => ({ ...row }));
  const errors = validateFinancialWorkbookInput(input);
  const warnings: FinancialIssue[] = [], suggestions: FinancialIssue[] = [];
  const invalidCategoryLines = new Set(errors.filter(error => error.aba === CATEGORY).map(error => error.linha));
  const invalidAccountLines = new Set(errors.filter(error => error.aba === ACCOUNT).map(error => error.linha));
  const issue = (aba: string, row: FinancialRow, campo: string, motivo: string) => {
    errors.push({ aba, linha: row.linha, campo, codigo: row.codigo, motivo });
    (aba === CATEGORY ? invalidCategoryLines : invalidAccountLines).add(row.linha);
  };
  const insight = (list: FinancialIssue[], key: "avisos" | "sugestoes", aba: string, row: FinancialRow, campo: string, motivo: string) => {
    list.push({ aba, linha: row.linha, campo, codigo: row.codigo, motivo });
    (row[key] ||= []).push(motivo);
  };
  type ExistingCategory = { id: string; codigo: string; nome: string; ativo: boolean };
  type ExistingAccount = { id: string; codigo: string | null; descricao: string; categoriaId: string | null; tipo: string; ativo: boolean };
  const [existingCategories, existingAccounts]: [ExistingCategory[], ExistingAccount[]] = await Promise.all([
    db.categoria.findMany({ select: { id: true, codigo: true, nome: true, ativo: true } }),
    db.planoContas.findMany({ select: { id: true, codigo: true, descricao: true, categoriaId: true, tipo: true, ativo: true } }),
  ]);
  const catsByCode = new Map(existingCategories.map(row => [row.codigo, row]));
  const catsById = new Map(existingCategories.map(row => [row.id, row]));
  const accountsByCode = new Map(existingAccounts.filter(row => row.codigo).map(row => [row.codigo!, row]));
  const accountCodeCounts = new Map<string, number>();
  for (const row of existingAccounts) if (row.codigo) accountCodeCounts.set(row.codigo, (accountCodeCounts.get(row.codigo) || 0) + 1);
  const fileCategoriesByCode = new Map<string, FinancialRow[]>();
  for (const row of categorias) {
    const sameCode = fileCategoriesByCode.get(row.codigo) || [];
    sameCode.push(row);
    fileCategoriesByCode.set(row.codigo, sameCode);
  }

  for (const row of categorias) if (catsByCode.get(row.codigo)?.ativo === false) issue(CATEGORY, row, "CODIGO_CATEGORIA", "Código existente inativo; não será reativado.");
  for (const row of contas) {
    const old = accountsByCode.get(row.codigo);
    if (old?.ativo === false) issue(ACCOUNT, row, "CODIGO_CONTA", "Código existente inativo; não será reativado.");
    if ((accountCodeCounts.get(row.codigo) || 0) > 1) issue(ACCOUNT, row, "CODIGO_CONTA", "Código duplicado no cadastro atual; atualização ambígua.");
    if (row.codigoCategoria) {
      const fromFile = fileCategoriesByCode.get(row.codigoCategoria) || [];
      if (fromFile.length && fromFile.some(cat => invalidCategoryLines.has(cat.linha))) issue(ACCOUNT, row, "CODIGO_CATEGORIA", "Categoria inválida na aba CATEGORIAS_N1.");
      else if (!fromFile.length && !catsByCode.get(row.codigoCategoria)?.ativo) issue(ACCOUNT, row, "CODIGO_CATEGORIA", catsByCode.has(row.codigoCategoria) ? "Categoria inativa neste tenant." : "Categoria não encontrada neste tenant.");
    }
  }
  for (const row of categorias) {
    const old = catsByCode.get(row.codigo);
    row.acao = invalidCategoryLines.has(row.linha) ? "erro" : !old ? "novo" : old.nome === row.descricao ? "igual" : "atualizar";
    if (row.acao === "atualizar") {
      row.detalhes = [`Descrição — antes: ${old!.nome} → depois: ${row.descricao}`];
      insight(warnings, "avisos", CATEGORY, row, "DESCRICAO_CATEGORIA", "Descrição existente será alterada. Confira o antes/depois.");
    }
  }
  for (const row of contas) {
    const old = accountsByCode.get(row.codigo);
    const currentCategory = old?.categoriaId ? catsById.get(old.categoriaId)?.codigo || "Categoria indisponível" : "Sem Categoria";
    row.acao = invalidAccountLines.has(row.linha) ? "erro" : !old ? "novo" : old.descricao === row.descricao && currentCategory === row.codigoCategoria && old.tipo === row.tipo ? "igual" : "atualizar";
    if (row.acao === "atualizar" && old) {
      row.detalhes = [];
      if (old.descricao !== row.descricao) {
        row.detalhes.push(`Descrição — antes: ${old.descricao} → depois: ${row.descricao}`);
        insight(warnings, "avisos", ACCOUNT, row, "DESCRICAO_CONTA", "Descrição existente será alterada. Confira o antes/depois.");
      }
      if (currentCategory !== row.codigoCategoria) {
        row.detalhes.push(`Categoria — antes: ${currentCategory} → depois: ${row.codigoCategoria}`);
        insight(warnings, "avisos", ACCOUNT, row, "CODIGO_CATEGORIA", "Conta será movida para outra Categoria.");
      }
      if (old.tipo !== row.tipo) {
        row.detalhes.push(`Tipo — antes: ${old.tipo} → depois: ${row.tipo}`);
        insight(warnings, "avisos", ACCOUNT, row, "TIPO_CONTA", "Tipo da Conta será alterado.");
      }
    }
  }

  const fileCategoryCodes = new Set(categorias.map(row => row.codigo).filter(Boolean));
  const fileAccountCodes = new Set(contas.map(row => row.codigo).filter(Boolean));
  const categoryDescriptionMatches = createDescriptionLookup([
    ...existingCategories.filter(row => row.ativo && !fileCategoryCodes.has(row.codigo)).map(row => ({ codigo: row.codigo, descricao: row.nome })),
    ...categorias.filter(row => row.acao !== "erro"),
  ]);
  const accountDescriptionMatches = createDescriptionLookup([
    ...existingAccounts.filter(row => row.ativo && row.codigo && !fileAccountCodes.has(row.codigo)).map(row => ({ codigo: row.codigo!, descricao: row.descricao, codigoCategoria: row.categoriaId ? catsById.get(row.categoriaId)?.codigo : undefined })),
    ...contas.filter(row => row.acao !== "erro"),
  ]);
  for (const row of categorias) {
    if (row.acao === "erro") continue;
    for (const other of categoryDescriptionMatches(row)) insight(warnings, "avisos", CATEGORY, row, "DESCRICAO_CATEGORIA", `Descrição igual ou semelhante à Categoria ${other.codigo}, com código diferente. Nenhum cadastro será mesclado.`);
  }
  for (const row of contas) {
    if (row.acao === "erro") {
      if (!row.codigoCategoria && row.codigo) {
        const candidates = categoryCandidatesFromCode(row.codigo, catsByCode);
        if (candidates.length === 1) insight(suggestions, "sugestoes", ACCOUNT, row, "CODIGO_CATEGORIA", `Possível Categoria: ${candidates[0].codigo} | ${candidates[0].nome}. Corrija o Excel; nada será preenchido automaticamente.`);
      }
      continue;
    }
    for (const other of accountDescriptionMatches(row)) {
      const context = other.codigoCategoria && other.codigoCategoria !== row.codigoCategoria ? ` em outra Categoria (${other.codigoCategoria})` : "";
      insight(warnings, "avisos", ACCOUNT, row, "DESCRICAO_CONTA", `Descrição igual ou semelhante à Conta ${other.codigo}${context}, com código diferente. Nenhum cadastro será mesclado.`);
    }
    if (row.codigo.includes(".") && row.codigoCategoria && !row.codigo.startsWith(`${row.codigoCategoria}.`)) {
      insight(warnings, "avisos", ACCOUNT, row, "CODIGO_CONTA", `O prefixo de ${row.codigo} aparentemente não corresponde à Categoria ${row.codigoCategoria}. Confira o vínculo; ele não será alterado automaticamente.`);
    }
  }
  const tally = (rows: FinancialRow[], aba: string) => ({
    novos: rows.filter(row => row.acao === "novo").length,
    atualizacoes: rows.filter(row => row.acao === "atualizar").length,
    semAlteracao: rows.filter(row => row.acao === "igual").length,
    avisos: warnings.filter(item => item.aba === aba).length,
    erros: errors.filter(item => item.aba === aba).length,
  });
  const cats = tally(categorias, CATEGORY), accounts = tally(contas, ACCOUNT);
  return { categorias, contas, errors, warnings, suggestions, resumo: {
    totalLido: categorias.length + contas.length, totalNovo: cats.novos + accounts.novos,
    totalAtualizado: cats.atualizacoes + accounts.atualizacoes,
    totalSemAlteracao: cats.semAlteracao + accounts.semAlteracao,
    totalInvalido: categorias.filter(row => row.acao === "erro").length + contas.filter(row => row.acao === "erro").length,
    totalErros: errors.length, totalAvisos: warnings.length, totalSugestoes: suggestions.length,
    ausentes: {
      categorias: existingCategories.filter(row => row.ativo && !fileCategoryCodes.has(row.codigo)).length,
      contas: existingAccounts.filter(row => row.ativo && !fileAccountCodes.has(row.codigo || "")).length,
    },
    categorias: cats, contas: accounts,
  } };
}
