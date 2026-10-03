import * as XLSX from "xlsx";
import { REGISTRATION_HEADERS } from "./registration-import-template";

export type RegistrationSection = "CLIENTES" | "FORNECEDORES";
export type RegistrationIssue = { aba: RegistrationSection | "INSTRUCOES"; linha: number; campo: string; codigo: string; motivo: string };
export type RegistrationRow = {
  linha: number; codigo: string; tipoPessoa: string; nome: string; nomeFantasia: string; documento: string;
  email: string; telefone: string; endereco: string; codigoCategoria: string; codigoConta: string;
  acao?: "novo" | "atualizar" | "igual" | "erro"; detalhes?: string[]; avisos?: string[]; sugestoes?: string[];
};
export type RegistrationWorkbook = { clientes: RegistrationRow[]; fornecedores: RegistrationRow[]; errors: RegistrationIssue[] };
export type RegistrationCounts = { novos: number; atualizacoes: number; semAlteracao: number; erros: number; avisos: number };
export type RegistrationPreview = RegistrationWorkbook & {
  warnings: RegistrationIssue[]; suggestions: RegistrationIssue[];
  resumo: { totalLido: number; totalNovo: number; totalAtualizado: number; totalSemAlteracao: number; totalErros: number;
    clientes: RegistrationCounts; fornecedores: RegistrationCounts; ausentes: { clientes: number; fornecedores: number } };
};

type Existing = { id: string; codigo: string; nome: string; tipoPessoa: string | null; nomeFantasia: string | null;
  documento: string | null; email: string | null; telefone: string | null; endereco: string | null;
  contaPadraoId: string | null; ativo: boolean };
type Account = { id: string; codigo: string | null; categoriaId: string | null; tenantId: string; ativo: boolean };
type Category = { id: string; codigo: string; tenantId: string; ativo: boolean };

const sections = ["CLIENTES", "FORNECEDORES"] as const;
const labels: Record<string, string> = {
  tipoPessoa: "Tipo de pessoa", nome: "Nome / Razão Social", nomeFantasia: "Nome Fantasia / Abreviado",
  documento: "Documento", email: "Email", telefone: "Telefone", endereco: "Endereço",
};
const key = (value: string) => value.trim().toLocaleUpperCase("pt-BR");
const nameKey = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim();
const documentKey = (value: string) => value.replace(/[^\p{L}\p{N}]/gu, "").toLocaleUpperCase("pt-BR");
const issue = (aba: RegistrationIssue["aba"], linha: number, campo: string, codigo: string, motivo: string): RegistrationIssue => ({ aba, linha, campo, codigo, motivo });

export function parseRegistrationWorkbook(bytes: Uint8Array): RegistrationWorkbook {
  const workbook = XLSX.read(bytes, { type: "array", cellText: true });
  const errors: RegistrationIssue[] = [];
  if (!workbook.Sheets.INSTRUCOES) errors.push(issue("INSTRUCOES", 0, "ABA", "", "Aba INSTRUCOES ausente."));
  const parseSheet = (section: RegistrationSection): RegistrationRow[] => {
    const sheet = workbook.Sheets[section];
    if (!sheet) { errors.push(issue(section, 0, "ABA", "", `Aba ${section} ausente.`)); return []; }
    const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
    const cells = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: "", blankrows: true });
    const headers = (cells[0] || []).map(value => String(value).trim().toUpperCase());
    for (const field of REGISTRATION_HEADERS) {
      const count = headers.filter(value => value === field).length;
      if (count !== 1) errors.push(issue(section, range.s.r + 1, field, "", count ? `Coluna ${field} duplicada.` : `Coluna ${field} ausente.`));
    }
    if (REGISTRATION_HEADERS.some(field => headers.filter(value => value === field).length !== 1)) return [];
    return cells.slice(1).flatMap((line, index) => {
      const values = REGISTRATION_HEADERS.map(field => String(line[headers.indexOf(field)] ?? "").trim());
      if (values.every(value => !value)) return [];
      const linha = range.s.r + index + 2;
      for (const field of ["CODIGO", "CODIGO_CATEGORIA", "CODIGO_CONTA"] as const) {
        const cell = sheet[XLSX.utils.encode_cell({ r: range.s.r + index + 1, c: headers.indexOf(field) })];
        if (cell?.t === "n") errors.push(issue(section, linha, field, values[0], "Código numérico: formate como Texto para preservar zeros à esquerda."));
      }
      const [codigo, tipoPessoa, nome, nomeFantasia, documento, email, telefone, endereco, codigoCategoria, codigoConta] = values;
      return [{ linha, codigo, tipoPessoa, nome, nomeFantasia, documento, email, telefone, endereco, codigoCategoria, codigoConta }];
    });
  };
  return { clientes: parseSheet("CLIENTES"), fornecedores: parseSheet("FORNECEDORES"), errors };
}

export function validateRegistrationWorkbookInput(input: RegistrationWorkbook) {
  const errors = [...input.errors];
  for (const section of sections) {
    const rows = section === "CLIENTES" ? input.clientes : input.fornecedores;
    const counts = new Map<string, number>();
    for (const row of rows) if (row.codigo) counts.set(key(row.codigo), (counts.get(key(row.codigo)) || 0) + 1);
    for (const row of rows) {
      const add = (campo: string, motivo: string) => errors.push(issue(section, row.linha, campo, row.codigo, motivo));
      if (!row.codigo) add("CODIGO", "Código obrigatório.");
      if (row.codigo.length > 20) add("CODIGO", "Código deve ter até 20 caracteres.");
      if (row.codigo && (counts.get(key(row.codigo)) || 0) > 1) add("CODIGO", "Código duplicado na mesma aba.");
      if (!row.nome) add("NOME", "Nome / Razão Social obrigatório.");
      if (row.tipoPessoa && row.tipoPessoa !== "PF" && row.tipoPessoa !== "PJ") add("TIPO_PESSOA", "Use PF ou PJ, ou deixe vazio.");
      if (!!row.codigoCategoria !== !!row.codigoConta) add("PLANO_DE_CONTAS", "Informe juntos CODIGO_CATEGORIA e CODIGO_CONTA, ou deixe ambos vazios.");
    }
  }
  return errors;
}

function indexed<T extends { codigo: string | null }>(records: T[]) {
  const map = new Map<string, T[]>();
  for (const record of records) if (record.codigo) map.set(key(record.codigo), [...(map.get(key(record.codigo)) || []), record]);
  return map;
}

export async function validateRegistrationWorkbook(input: RegistrationWorkbook, db: any, tenantId: string): Promise<RegistrationPreview> {
  const clientes = input.clientes.map(row => ({ ...row }));
  const fornecedores = input.fornecedores.map(row => ({ ...row }));
  const errors = validateRegistrationWorkbookInput(input);
  const warnings: RegistrationIssue[] = [];
  const suggestions: RegistrationIssue[] = [];
  const [existingClients, existingSuppliers, accounts, categories] = await Promise.all([
    db.cliente.findMany({ select: { id: true, codigo: true, nome: true, tipoPessoa: true, nomeFantasia: true, documento: true, email: true, telefone: true, endereco: true, contaPadraoId: true, ativo: true } }),
    db.fornecedor.findMany({ select: { id: true, codigo: true, nome: true, tipoPessoa: true, nomeFantasia: true, documento: true, email: true, telefone: true, endereco: true, contaPadraoId: true, ativo: true } }),
    db.planoContas.findMany({ select: { id: true, codigo: true, categoriaId: true, tenantId: true, ativo: true } }),
    db.categoria.findMany({ select: { id: true, codigo: true, tenantId: true, ativo: true } }),
  ]) as [Existing[], Existing[], Account[], Category[]];
  const categoriesById = new Map(categories.map(cat => [cat.id, cat]));
  const accountsById = new Map(accounts.map(account => [account.id, account]));
  const accountsByCode = indexed(accounts);
  const currentCode = (accountId: string | null) => {
    if (!accountId) return { categoria: "", conta: "" };
    const account = accountsById.get(accountId);
    const category = account?.categoriaId ? categoriesById.get(account.categoriaId) : null;
    return { categoria: category?.codigo || "", conta: account?.codigo || "" };
  };

  for (const section of sections) {
    const rows = section === "CLIENTES" ? clientes : fornecedores;
    const existing = section === "CLIENTES" ? existingClients : existingSuppliers;
    const existingByCode = indexed(existing);
    for (const row of rows) {
      const addError = (campo: string, motivo: string) => errors.push(issue(section, row.linha, campo, row.codigo, motivo));
      const addWarning = (campo: string, motivo: string) => { warnings.push(issue(section, row.linha, campo, row.codigo, motivo)); (row.avisos ||= []).push(motivo); };
      const addSuggestion = (campo: string, motivo: string) => { suggestions.push(issue(section, row.linha, campo, row.codigo, motivo)); (row.sugestoes ||= []).push(motivo); };
      const matches = existingByCode.get(key(row.codigo)) || [];
      if (matches.length > 1) addError("CODIGO", "Código ambíguo entre cadastros existentes neste tenant.");
      const old = matches.length === 1 ? matches[0] : undefined;
      if (old && !old.ativo) addError("CODIGO", "Código existente inativo; não será reativado.");
      if (row.codigoConta && row.codigoCategoria) {
        const matchingAccounts = accountsByCode.get(key(row.codigoConta)) || [];
        if (matchingAccounts.length !== 1 || !matchingAccounts[0].ativo || matchingAccounts[0].tenantId !== tenantId) {
          addError("CODIGO_CONTA", matchingAccounts.length > 1 ? "Código de Conta ambíguo neste tenant." : "Conta N2 inexistente, inativa ou de outro tenant.");
        } else {
          const account = matchingAccounts[0];
          const category = account.categoriaId ? categoriesById.get(account.categoriaId) : null;
          if (!category || !category.ativo || category.tenantId !== tenantId) addError("CODIGO_CATEGORIA", "Categoria N1 da Conta inexistente, inativa ou de outro tenant.");
          else if (key(category.codigo) !== key(row.codigoCategoria)) addError("CODIGO_CATEGORIA", `Categoria informada não corresponde à Conta N2 ${row.codigoConta}.`);
        }
      }
      row.acao = errors.some(error => error.aba === section && error.linha === row.linha) ? "erro" : old ? "atualizar" : "novo";
      if (row.acao === "atualizar" && old) {
        const nextFields = { tipoPessoa: row.tipoPessoa, nome: row.nome, nomeFantasia: row.nomeFantasia,
          documento: row.documento, email: row.email, telefone: row.telefone, endereco: row.endereco };
        const current = currentCode(old.contaPadraoId);
        row.detalhes = (Object.keys(nextFields) as (keyof typeof nextFields)[])
          .filter(field => (old[field] || "") !== nextFields[field])
          .map(field => `${labels[field]}: ${old[field] || "—"} → ${nextFields[field] || "—"}`);
        if (key(current.categoria) !== key(row.codigoCategoria) || key(current.conta) !== key(row.codigoConta)) {
          row.detalhes.push(`Plano de Contas: ${current.categoria || "—"} / ${current.conta || "—"} → ${row.codigoCategoria || "—"} / ${row.codigoConta || "—"}`);
        }
        if (!row.detalhes.length) row.acao = "igual";
        else {
          if ((old.nome || "") !== row.nome) addWarning("NOME", "Nome / Razão Social será alterado.");
          if ((old.documento || "") !== row.documento) addWarning("DOCUMENTO", "Documento será alterado.");
          if (key(current.categoria) !== key(row.codigoCategoria) || key(current.conta) !== key(row.codigoConta)) addWarning("PLANO_DE_CONTAS", "Classificação financeira padrão será alterada.");
        }
      }
      if (row.acao === "novo") {
        if (row.documento && (existing.some(candidate => candidate.ativo && key(candidate.codigo) !== key(row.codigo) && documentKey(candidate.documento || "") === documentKey(row.documento)) ||
          rows.some(candidate => candidate !== row && key(candidate.codigo) !== key(row.codigo) && documentKey(candidate.documento) === documentKey(row.documento)))) {
          addWarning("DOCUMENTO", "Possível cadastro existente com o mesmo documento. Revise antes de confirmar.");
        }
        if (row.nome && (existing.some(candidate => candidate.ativo && key(candidate.codigo) !== key(row.codigo) && nameKey(candidate.nome) === nameKey(row.nome)) ||
          rows.some(candidate => candidate !== row && key(candidate.codigo) !== key(row.codigo) && nameKey(candidate.nome) === nameKey(row.nome)))) {
          addSuggestion("NOME", "Nome semelhante a cadastro ativo. Confirme se é uma inclusão distinta.");
        }
      }
    }
  }
  const counts = (rows: RegistrationRow[]): RegistrationCounts => ({
    novos: rows.filter(row => row.acao === "novo").length,
    atualizacoes: rows.filter(row => row.acao === "atualizar").length,
    semAlteracao: rows.filter(row => row.acao === "igual").length,
    erros: errors.filter(error => rows.some(row => row.linha === error.linha && (rows === clientes ? error.aba === "CLIENTES" : error.aba === "FORNECEDORES"))).length,
    avisos: warnings.filter(warning => rows.some(row => row.linha === warning.linha && (rows === clientes ? warning.aba === "CLIENTES" : warning.aba === "FORNECEDORES"))).length,
  });
  const importedCodes = (rows: RegistrationRow[]) => new Set(rows.map(row => key(row.codigo)));
  return { clientes, fornecedores, errors, warnings, suggestions,
    resumo: { totalLido: clientes.length + fornecedores.length,
      totalNovo: [...clientes, ...fornecedores].filter(row => row.acao === "novo").length,
      totalAtualizado: [...clientes, ...fornecedores].filter(row => row.acao === "atualizar").length,
      totalSemAlteracao: [...clientes, ...fornecedores].filter(row => row.acao === "igual").length,
      totalErros: errors.length, clientes: counts(clientes), fornecedores: counts(fornecedores),
      ausentes: { clientes: existingClients.filter(row => row.ativo && !importedCodes(clientes).has(key(row.codigo))).length,
        fornecedores: existingSuppliers.filter(row => row.ativo && !importedCodes(fornecedores).has(key(row.codigo))).length } },
  };
}
