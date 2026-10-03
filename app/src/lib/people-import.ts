import * as XLSX from "xlsx";
import { PEOPLE_HEADERS } from "./people-import-template";

export type PeopleImportIssue = { aba: string; linha: number; campo: string; codigo: string; motivo: string };
export type PeopleImportRow = {
  linha: number; codigo: string; nome: string; cargo: string; codigoCC: string; email: string; telefone: string;
  acao?: "novo" | "atualizar" | "erro"; detalhes?: string[];
};
export type PeopleWorkbook = { pessoas: PeopleImportRow[]; errors: PeopleImportIssue[] };
export type PeopleImportPreview = PeopleWorkbook & { resumo: { totalLido: number; totalNovo: number; totalAtualizado: number; totalInvalido: number } };

const ABA = "PESSOAS";

export function parsePeopleWorkbook(bytes: Uint8Array): PeopleWorkbook {
  const workbook = XLSX.read(bytes, { type: "array", cellText: true });
  const errors: PeopleImportIssue[] = [];
  const sheet = workbook.Sheets[ABA];
  if (!sheet) return { pessoas: [], errors: [{ aba: ABA, linha: 0, campo: "ABA", codigo: "", motivo: "Aba PESSOAS ausente." }] };
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
  const cells = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: "", blankrows: true });
  const headers = (cells[0] || []).map(value => String(value).trim().toUpperCase());
  for (const field of PEOPLE_HEADERS) {
    const count = headers.filter(value => value === field).length;
    if (count !== 1) errors.push({ aba: ABA, linha: range.s.r + 1, campo: field, codigo: "", motivo: count ? `Coluna ${field} duplicada.` : `Coluna ${field} ausente.` });
  }
  if (errors.length) return { pessoas: [], errors };

  const pessoas = cells.slice(1).flatMap((cellsRow, index) => {
    const values = PEOPLE_HEADERS.map(field => String(cellsRow[headers.indexOf(field)] ?? "").trim());
    if (values.every(value => !value)) return [];
    const linha = range.s.r + index + 2;
    for (const field of ["CODIGO_PESSOA", "CODIGO_CC"] as const) {
      const cell = sheet[XLSX.utils.encode_cell({ r: range.s.r + index + 1, c: headers.indexOf(field) })];
      if (cell?.t === "n") errors.push({ aba: ABA, linha, campo: field, codigo: values[0], motivo: "Código numérico: formate como Texto para preservar zeros à esquerda." });
    }
    return [{ linha, codigo: values[0], nome: values[1], cargo: values[2], codigoCC: values[3], email: values[4], telefone: values[5] }];
  });
  if (!errors.length && !pessoas.length) errors.push({ aba: ABA, linha: 0, campo: "ARQUIVO", codigo: "", motivo: "Arquivo sem Pessoas para importar." });
  return { pessoas, errors };
}

export function validatePeopleWorkbookInput(input: PeopleWorkbook): PeopleImportIssue[] {
  const errors = [...input.errors];
  const counts = new Map<string, number>();
  for (const row of input.pessoas) if (row.codigo) counts.set(row.codigo, (counts.get(row.codigo) || 0) + 1);
  for (const row of input.pessoas) {
    const add = (campo: string, motivo: string) => errors.push({ aba: ABA, linha: row.linha, campo, codigo: row.codigo, motivo });
    if (!row.codigo) add("CODIGO_PESSOA", "Código obrigatório.");
    if (row.codigo.length > 20) add("CODIGO_PESSOA", "Código deve ter até 20 caracteres.");
    if (!row.nome) add("NOME", "Nome obrigatório.");
    if (row.codigo && (counts.get(row.codigo) || 0) > 1) add("CODIGO_PESSOA", "Código duplicado no arquivo.");
  }
  return errors;
}

export async function validatePeopleWorkbook(input: PeopleWorkbook, db: any): Promise<PeopleImportPreview> {
  const pessoas = input.pessoas.map(row => ({ ...row }));
  const errors = validatePeopleWorkbookInput(input);
  const codes = [...new Set(pessoas.map(row => row.codigo).filter(Boolean))];
  const ccCodes = [...new Set(pessoas.map(row => row.codigoCC).filter(Boolean))];
  const [existing, centers] = await Promise.all([
    codes.length ? db.pessoa.findMany({ where: { codigo: { in: codes } }, select: { codigo: true, nome: true, cargo: true, departamento: true, email: true, telefone: true, ativo: true } }) : [],
    ccCodes.length ? db.centroCusto.findMany({ where: { codigo: { in: ccCodes } }, select: { codigo: true, nome: true, ativo: true } }) : [],
  ]);
  const existingByCode = new Map<string, any>(existing.map((person: any) => [person.codigo, person]));
  const centersByCode = new Map<string, any>(centers.map((center: any) => [center.codigo, center]));

  for (const row of pessoas) {
    const old = existingByCode.get(row.codigo);
    if (old && !old.ativo) errors.push({ aba: ABA, linha: row.linha, campo: "CODIGO_PESSOA", codigo: row.codigo, motivo: "Código já existe inativo; não será reativado." });
    if (row.codigoCC && !centersByCode.get(row.codigoCC)?.ativo) errors.push({ aba: ABA, linha: row.linha, campo: "CODIGO_CC", codigo: row.codigo, motivo: "Centro de Custo não encontrado ou inativo neste tenant." });
    row.acao = errors.some(error => error.aba === ABA && error.linha === row.linha) ? "erro" : old ? "atualizar" : "novo";
    if (row.acao === "atualizar") {
      const current = { NOME: old.nome, CARGO: old.cargo || "", CODIGO_CC: old.departamento || "", EMAIL: old.email || "", TELEFONE: old.telefone || "" };
      const next = { NOME: row.nome, CARGO: row.cargo, CODIGO_CC: row.codigoCC ? centersByCode.get(row.codigoCC).nome : "", EMAIL: row.email, TELEFONE: row.telefone };
      row.detalhes = (Object.keys(next) as (keyof typeof next)[]).filter(key => current[key] !== next[key]).map(key => `${key === "CODIGO_CC" ? "Centro de Custo" : key}: ${current[key] || "—"} → ${next[key] || "—"}`);
      if (!row.detalhes.length) row.detalhes.push("Sem alterações");
    }
  }
  return { pessoas, errors, resumo: { totalLido: pessoas.length, totalNovo: pessoas.filter(row => row.acao === "novo").length,
    totalAtualizado: pessoas.filter(row => row.acao === "atualizar").length, totalInvalido: pessoas.filter(row => row.acao === "erro").length } };
}
