import * as XLSX from "xlsx";
import { FINANCIAL_ACCOUNT_TYPES } from "@/lib/financial-account-types";

export type FinancialIssue = { aba: string; linha: number; campo: string; codigo: string; motivo: string };
export type FinancialRow = { linha: number; codigo: string; descricao: string; codigoCategoria?: string; tipo?: string; acao?: "novo" | "atualizar" | "erro"; detalhes?: string[] };
export type FinancialWorkbook = { categorias: FinancialRow[]; contas: FinancialRow[]; errors: FinancialIssue[] };
export type FinancialPreview = FinancialWorkbook & { resumo: {
  totalLido: number; totalNovo: number; totalAtualizado: number; totalInvalido: number;
  categorias: { novos: number; atualizacoes: number; erros: number };
  contas: { novos: number; atualizacoes: number; erros: number };
} };

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
  const issue = (aba: string, row: FinancialRow, campo: string, motivo: string) => errors.push({ aba, linha: row.linha, campo, codigo: row.codigo, motivo });
  const categoryCodes = [...new Set([...categorias.map(row => row.codigo), ...contas.map(row => row.codigoCategoria || "")].filter(Boolean))];
  const accountCodes = [...new Set(contas.map(row => row.codigo).filter(Boolean))];
  const existingCategories = categoryCodes.length ? await db.categoria.findMany({ where: { codigo: { in: categoryCodes } }, select: { id: true, codigo: true, nome: true, ativo: true } }) : [];
  const existingAccounts = accountCodes.length ? await db.planoContas.findMany({ where: { codigo: { in: accountCodes } }, select: { id: true, codigo: true, descricao: true, categoriaId: true, tipo: true, ativo: true } }) : [];
  const previousIds = [...new Set(existingAccounts.map((row: any) => row.categoriaId).filter(Boolean))];
  const previousCategories = previousIds.length ? await db.categoria.findMany({ where: { id: { in: previousIds } }, select: { id: true, codigo: true } }) : [];
  const oldCodeById = new Map<string, string>(previousCategories.map((row: any) => [row.id, row.codigo]));
  const catsByCode = new Map<string, any>(existingCategories.map((row: any) => [row.codigo, row]));
  const accountsByCode = new Map<string, any>(existingAccounts.map((row: any) => [row.codigo, row]));
  const accountCodeCounts = new Map<string, number>();
  for (const row of existingAccounts) accountCodeCounts.set(row.codigo, (accountCodeCounts.get(row.codigo) || 0) + 1);

  for (const row of categorias) if (catsByCode.get(row.codigo)?.ativo === false) issue(CATEGORY, row, "CODIGO_CATEGORIA", "Código existente inativo; não será reativado.");
  for (const row of contas) {
    const old = accountsByCode.get(row.codigo);
    if (old?.ativo === false) issue(ACCOUNT, row, "CODIGO_CONTA", "Código existente inativo; não será reativado.");
    if ((accountCodeCounts.get(row.codigo) || 0) > 1) issue(ACCOUNT, row, "CODIGO_CONTA", "Código duplicado no cadastro atual; atualização ambígua.");
    if (row.codigoCategoria) {
      const fromFile = categorias.filter(cat => cat.codigo === row.codigoCategoria);
      if (fromFile.length) {
        if (fromFile.some(cat => errors.some(error => error.aba === CATEGORY && error.linha === cat.linha))) issue(ACCOUNT, row, "CODIGO_CATEGORIA", "Categoria inválida na aba CATEGORIAS_N1.");
      } else if (!catsByCode.get(row.codigoCategoria)?.ativo) issue(ACCOUNT, row, "CODIGO_CATEGORIA", "Categoria não encontrada ou inativa neste tenant.");
    }
  }
  for (const row of categorias) {
    const old = catsByCode.get(row.codigo);
    row.acao = errors.some(error => error.aba === CATEGORY && error.linha === row.linha) ? "erro" : old ? "atualizar" : "novo";
    if (row.acao === "atualizar") row.detalhes = old.nome === row.descricao ? ["Sem mudança de descrição"] : [`Descrição: ${old.nome} → ${row.descricao}`];
  }
  for (const row of contas) {
    const old = accountsByCode.get(row.codigo);
    row.acao = errors.some(error => error.aba === ACCOUNT && error.linha === row.linha) ? "erro" : old ? "atualizar" : "novo";
    if (row.acao === "atualizar") {
      const currentCategory = old.categoriaId ? oldCodeById.get(old.categoriaId) || "Categoria indisponível" : "Sem Categoria";
      row.detalhes = [];
      if (old.descricao !== row.descricao) row.detalhes.push(`Descrição: ${old.descricao} → ${row.descricao}`);
      if (currentCategory !== row.codigoCategoria) row.detalhes.push(`Categoria: ${currentCategory} → ${row.codigoCategoria}`);
      if (old.tipo !== row.tipo) row.detalhes.push(`Tipo: ${old.tipo} → ${row.tipo}`);
      if (!row.detalhes.length) row.detalhes.push("Sem mudanças");
    }
  }
  const tally = (rows: FinancialRow[]) => ({ novos: rows.filter(row => row.acao === "novo").length, atualizacoes: rows.filter(row => row.acao === "atualizar").length, erros: rows.filter(row => row.acao === "erro").length });
  const cats = tally(categorias), accounts = tally(contas);
  return { categorias, contas, errors, resumo: { totalLido: categorias.length + contas.length, totalNovo: cats.novos + accounts.novos, totalAtualizado: cats.atualizacoes + accounts.atualizacoes, totalInvalido: cats.erros + accounts.erros, categorias: cats, contas: accounts } };
}
