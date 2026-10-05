import * as XLSX from "xlsx";
import { LANCAMENTO_FIELD_ORDER } from "./lancamento-field-order.mjs";

const headersByField = {
  descricao: ["DESCRICAO"], fantasiaPadrao: ["CLIENTE_CODIGO", "FORNECEDOR_CODIGO"],
  tipo: ["DIRECAO"], categoria: ["CATEGORIA_N1"], contaId: ["CONTA_N2"],
  valorPrevisto: ["VALOR_PREVISTO"], valor: ["VALOR_REALIZADO"],
  dataLanc: ["DATA_LANCAMENTO"], dataEmissao: ["DATA_EMISSAO"],
  dataVencOriginal: ["VENCIMENTO_ORIGINAL"], dataVencPlano: ["VENCIMENTO_PLANO"],
  dataPagamento: ["DATA_REALIZACAO"], dataEvento: ["DATA_EVENTO"],
  status: ["STATUS"], statusAuto: [], statusManual: ["STATUS_MANUAL"],
  fornecedor: ["EMPRESA"], banco: ["BANCO"], centroCusto: ["CENTRO_CUSTO"],
  dre: ["DRE"], statusExtrato: ["EXTRATO"], referencia: [], cont: [],
  anotacao: ["ANOTACAO"],
} as const;
export const OFFICIAL_HEADERS = [
  ...LANCAMENTO_FIELD_ORDER.flatMap(key => headersByField[key as keyof typeof headersByField]),
  "REGISTRO_ID", "REGISTRO_VERSAO",
];
// Planilhas oficiais já baixadas continuam aceitas para reimportação.
const PREVIOUS_OFFICIAL_HEADERS = [
  "REGISTRO_ID", "REGISTRO_VERSAO", "DATA_LANCAMENTO", "DESCRICAO", "DIRECAO", "STATUS",
  "VALOR_REALIZADO", "VALOR_PREVISTO", "DATA_REALIZACAO", "DATA_EMISSAO",
  "VENCIMENTO_ORIGINAL", "VENCIMENTO_PLANO", "DATA_EVENTO", "STATUS_MANUAL", "EXTRATO",
  "EMPRESA", "BANCO", "CATEGORIA_N1", "CONTA_N2", "CLIENTE_CODIGO", "FORNECEDOR_CODIGO",
  "CENTRO_CUSTO", "DRE", "ANOTACAO",
] as const;
const technicalHeaders = new Set(["REGISTRO_ID", "REGISTRO_VERSAO"]);
type Header = typeof OFFICIAL_HEADERS[number];
export type OfficialFileRow = { linha: number; cells: Record<Header, string> };
export type OfficialIssue = { linha: number; campo: string; motivo: string };
export type OfficialPreviewRow = {
  linha: number; registroId: string; acao: "NOVO" | "ALTERADO" | "INALTERADO" | "ERRO" | "CONFLITO";
  diferencas: { campo: string; antes: string; depois: string }[]; avisos: string[]; erros: string[];
};
export type OfficialPlan = {
  rows: OfficialPreviewRow[];
  resumo: { novos: number; alterados: number; inalterados: number; erros: number; conflitos: number; avisos: number };
  errors: OfficialIssue[];
  changes: { id: string | null; version: string; data: Record<string, unknown> }[];
};

const dateHeaders = ["DATA_LANCAMENTO", "DATA_REALIZACAO", "DATA_EMISSAO", "VENCIMENTO_ORIGINAL", "VENCIMENTO_PLANO", "DATA_EVENTO"] as const;
const optionalText: [Header, string][] = [
  ["EXTRATO", "statusExtrato"], ["EMPRESA", "fornecedor"], ["BANCO", "banco"],
  ["CENTRO_CUSTO", "centroCusto"], ["DRE", "dre"], ["ANOTACAO", "anotacao"],
];
const dateFields: [Header, string][] = [
  ["DATA_LANCAMENTO", "dataLanc"], ["DATA_REALIZACAO", "dataPagamento"],
  ["DATA_EMISSAO", "dataEmissao"], ["VENCIMENTO_ORIGINAL", "dataVencOriginal"],
  ["VENCIMENTO_PLANO", "dataVencPlano"], ["DATA_EVENTO", "dataEvento"],
];
const text = (value: unknown) => value === null || value === undefined ? "" : String(value).trim();
const dateText = (value: unknown) => value instanceof Date ? value.toISOString().slice(0, 10) : text(value).slice(0, 10);
const moneyText = (value: unknown) => value === null || value === undefined || value === "" ? "" : amountCell(String(value)) || String(value);

/** Only these displayed business fields can be round-tripped. System metadata is never imported. */
export function recordCells(row: any): Record<Header, string> {
  const cells = Object.fromEntries(OFFICIAL_HEADERS.map(header => [header, ""])) as Record<Header, string>;
  cells.REGISTRO_ID = row.id;
  cells.REGISTRO_VERSAO = row.atualizadoEm.toISOString();
  cells.DATA_LANCAMENTO = dateText(row.dataLanc);
  cells.DESCRICAO = row.descricao || "";
  cells.DIRECAO = row.tipo || "";
  cells.STATUS = row.status || "";
  cells.VALOR_REALIZADO = moneyText(row.valor);
  cells.VALOR_PREVISTO = moneyText(row.valorPrevisto);
  cells.DATA_REALIZACAO = dateText(row.dataPagamento);
  cells.DATA_EMISSAO = dateText(row.dataEmissao);
  cells.VENCIMENTO_ORIGINAL = dateText(row.dataVencOriginal);
  cells.VENCIMENTO_PLANO = dateText(row.dataVencPlano);
  cells.DATA_EVENTO = dateText(row.dataEvento);
  cells.STATUS_MANUAL = row.statusManual || "";
  cells.EXTRATO = row.statusExtrato || "";
  cells.EMPRESA = row.fornecedor || "";
  cells.BANCO = row.banco || "";
  cells.CATEGORIA_N1 = row.conta?.categoria?.tenantId === row.tenantId ? row.conta.categoria.codigo : row.categoria || "";
  cells.CONTA_N2 = row.conta?.tenantId === row.tenantId ? row.conta.codigo || "" : "";
  cells.CLIENTE_CODIGO = row.clienteRef?.codigo || "";
  cells.FORNECEDOR_CODIGO = row.fornecedorRef?.codigo || "";
  cells.CENTRO_CUSTO = row.centroCusto || "";
  cells.DRE = row.dre || "";
  cells.ANOTACAO = row.anotacao || "";
  return cells;
}

export function createOfficialWorkbook(records: any[]): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  const instructions = XLSX.utils.aoa_to_sheet([
    ["REGRA", "ORIENTAÇÃO"],
    ["Base", "Este arquivo contém todos os lançamentos do filtro atual, sem limite da paginação. Sem registros, preencha a aba LANCAMENTOS."],
    ["Cabeçalhos", "Não renomeie a aba LANCAMENTOS nem os cabeçalhos."],
    ["Existentes", "Mantenha REGISTRO_ID e REGISTRO_VERSAO. Edite somente as demais colunas."],
    ["Novos", "Deixe REGISTRO_ID e REGISTRO_VERSAO vazios. O sistema criará ID e sequência."],
    ["Códigos", "Trate Categoria, Conta, Cliente e Fornecedor como códigos de texto; preserve zeros à esquerda."],
    ["Classificação", "Conta N2 deve pertencer à Categoria N1 e ter tipo compatível com a Direção."],
    ["Datas", "Use AAAA-MM-DD ou DD/MM/AAAA. DATA_REALIZACAO é a data financeira."],
    ["Ausências", "Remover uma linha do arquivo não exclui nem altera o lançamento no sistema."],
    ["Conflitos", "Se um registro mudou desde o download, a importação inteira é bloqueada. Baixe uma base atualizada."],
    ["Prévia", "Selecionar o arquivo não grava nada. A confirmação revalida e aplica tudo em uma transação."],
    ["Legado", "CSV sem REGISTRO_ID pertence ao importador antigo e não atualiza registros. Use este XLSX oficial."],
  ]);
  instructions["!cols"] = [{ wch: 24 }, { wch: 105 }];
  XLSX.utils.book_append_sheet(workbook, instructions, "INSTRUCOES");
  const rows = records.map(record => recordCells(record));
  const sheet = XLSX.utils.aoa_to_sheet([[...OFFICIAL_HEADERS], ...rows.map(row => OFFICIAL_HEADERS.map(header => row[header]))]);
  const textColumns = ["REGISTRO_ID", "REGISTRO_VERSAO", "CATEGORIA_N1", "CONTA_N2",
    "CLIENTE_CODIGO", "FORNECEDOR_CODIGO"].map(header => OFFICIAL_HEADERS.indexOf(header));
  for (let r = 1; r <= Math.max(rows.length, 200); r++) {
    for (const c of textColumns) {
      const address = XLSX.utils.encode_cell({ r, c });
      sheet[address] = { t: "s", v: rows[r - 1]?.[OFFICIAL_HEADERS[c]] ?? "", z: "@" };
    }
  }
  sheet["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(rows.length, 200), c: OFFICIAL_HEADERS.length - 1 } });
  sheet["!cols"] = OFFICIAL_HEADERS.map(header => ({ wch: header === "DESCRICAO" || header === "ANOTACAO" ? 48
    : technicalHeaders.has(header) ? 38 : header.includes("DATA") || header.includes("VENCIMENTO") ? 20 : 23 }));
  XLSX.utils.book_append_sheet(workbook, sheet, "LANCAMENTOS");
  return XLSX.write(workbook, { bookType: "xlsx", type: "array", compression: true }) as ArrayBuffer;
}

export function parseOfficialWorkbook(bytes: Uint8Array): OfficialFileRow[] {
  const book = XLSX.read(bytes, { type: "array", cellDates: false });
  const sheet = book.Sheets.LANCAMENTOS;
  if (!sheet) throw new Error("A aba LANCAMENTOS é obrigatória. Baixe o XLSX oficial.");
  const matrix = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, { header: 1, raw: true, defval: "", blankrows: true });
  const headers = matrix[0] || [];
  const accepted = [OFFICIAL_HEADERS, PREVIOUS_OFFICIAL_HEADERS].find(candidate =>
    headers.length === candidate.length && candidate.every((header, index) => headers[index] === header));
  if (!accepted) {
    throw new Error("Cabeçalhos incompatíveis. Não renomeie nem reordene as colunas do XLSX oficial.");
  }
  if (matrix.length > 10002) throw new Error("O arquivo excede 10.000 linhas de dados.");
  return matrix.slice(1).flatMap((values, index) => {
    if (!values?.some(value => text(value))) return [];
    const cells = Object.fromEntries(accepted.map((header, column) => [header, text(values[column])])) as Record<Header, string>;
    return [{ linha: index + 2, cells }];
  });
}

function dateCell(value: string): string | null {
  if (!value) return "";
  let iso = "";
  if (/^\d{4,6}(\.\d+)?$/.test(value)) {
    const excel = XLSX.SSF.parse_date_code(Number(value));
    if (!excel) return null;
    iso = `${excel.y}-${String(excel.m).padStart(2, "0")}-${String(excel.d).padStart(2, "0")}`;
  } else {
    const br = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (br) iso = `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
    else if (/^\d{4}-\d{2}-\d{2}$/.test(value)) iso = value;
    else return null;
  }
  const date = new Date(`${iso}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso) return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match && iso !== value) return null;
  const br = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br && iso !== `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`) return null;
  return iso;
}

const asDbDate = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

function amountCell(value: string): string | null {
  if (!value) return "";
  let normalized = value.replace(/\s/g, "");
  if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(normalized)) normalized = normalized.replace(/\./g, "").replace(",", ".");
  else normalized = normalized.replace(",", ".");
  if (!/^\d{1,13}(\.\d{1,2})?$/.test(normalized)) return null;
  const [integer, fraction = ""] = normalized.split(".");
  return `${integer}.${fraction.padEnd(2, "0")}`;
}

export function canonicalCells(input: Record<Header, string>): { cells: Record<Header, string>; errors: string[] } {
  const cells = { ...input };
  const errors: string[] = [];
  for (const header of dateHeaders) {
    const parsed = dateCell(cells[header]);
    if (parsed === null) errors.push(`${header}: data inválida`);
    else cells[header] = parsed;
  }
  for (const header of ["VALOR_REALIZADO", "VALOR_PREVISTO"] as const) {
    const parsed = amountCell(cells[header]);
    if (parsed === null) errors.push(`${header}: valor inválido`);
    else cells[header] = parsed;
  }
  cells.DIRECAO = cells.DIRECAO.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  cells.STATUS = cells.STATUS.toLowerCase();
  if (!cells.DATA_LANCAMENTO) errors.push("DATA_LANCAMENTO: obrigatória");
  if (!cells.DESCRICAO) errors.push("DESCRICAO: obrigatória");
  if (!cells.VALOR_REALIZADO) errors.push("VALOR_REALIZADO: obrigatório (zero é permitido)");
  if (!["ENTRADA", "SAIDA"].includes(cells.DIRECAO)) errors.push("DIRECAO: use ENTRADA ou SAIDA");
  if (!["realizado", "previsto", "cancelado"].includes(cells.STATUS)) errors.push("STATUS: use realizado, previsto ou cancelado");
  return { cells, errors };
}

export async function planOfficialImport(db: any, tenantId: string, fileRows: OfficialFileRow[]): Promise<OfficialPlan> {
  const ids = fileRows.map(row => row.cells.REGISTRO_ID).filter(Boolean);
  // The same planner runs inside the confirmation transaction; keep queries sequential
  // because the PostgreSQL adapter uses one connection for that transaction.
  const existing = await db.lancamento.findMany({ where: { tenantId, id: { in: ids } }, include: {
      conta: { include: { categoria: true } }, clienteRef: true, fornecedorRef: true,
    } });
  const categories = await db.categoria.findMany({ where: { tenantId, ativo: true } });
  const accounts = await db.planoContas.findMany({ where: { tenantId, ativo: true }, include: { categoria: true } });
  const clients = await db.cliente.findMany({ where: { tenantId, ativo: true } });
  const suppliers = await db.fornecedor.findMany({ where: { tenantId, ativo: true } });
  const statuses = await db.statusManualTipo.findMany({ where: { tenantId, ativo: true } });
  const byId = new Map<string, any>(existing.map((row: any) => [row.id, row]));
  const categoryByCode = new Map<string, any>(categories.map((row: any) => [row.codigo, row]));
  const clientByCode = new Map<string, any>(clients.map((row: any) => [row.codigo, row]));
  const supplierByCode = new Map<string, any>(suppliers.map((row: any) => [row.codigo, row]));
  const activeStatus = new Set<string>(statuses.map((row: any) => row.codigo));
  const seenIds = new Set<string>();
  const result: OfficialPlan = { rows: [], errors: [], changes: [], resumo: { novos: 0, alterados: 0, inalterados: 0, erros: 0, conflitos: 0, avisos: 0 } };
  for (const fileRow of fileRows) {
    const { linha } = fileRow;
    const { cells, errors } = canonicalCells(fileRow.cells);
    const id = cells.REGISTRO_ID;
    const current = id ? byId.get(id) : null;
    const warnings: string[] = [];
    if (id) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) errors.push("REGISTRO_ID: formato inválido");
      if (seenIds.has(id)) errors.push("REGISTRO_ID: duplicado dentro do arquivo");
      seenIds.add(id);
      if (!current) errors.push("REGISTRO_ID: inexistente ou fora deste tenant");
      if (!cells.REGISTRO_VERSAO || Number.isNaN(new Date(cells.REGISTRO_VERSAO).getTime())) errors.push("REGISTRO_VERSAO: ausente ou inválida");
    } else if (cells.REGISTRO_VERSAO) errors.push("REGISTRO_VERSAO: linha nova deve deixar ID e versão vazios");
    const before = current ? recordCells(current) : null;
    const conflict = !!(current && cells.REGISTRO_VERSAO && cells.REGISTRO_VERSAO !== before?.REGISTRO_VERSAO);
    if (conflict) errors.push("CONFLITO — REGISTRO ALTERADO APÓS A EXPORTAÇÃO");
    const category = cells.CATEGORIA_N1 ? categoryByCode.get(cells.CATEGORIA_N1) : null;
    const accountMatches = cells.CONTA_N2 ? accounts.filter((row: any) => row.codigo === cells.CONTA_N2 && row.categoriaId === category?.id && row.categoria?.tenantId === tenantId && row.categoria?.ativo) : [];
    const account = accountMatches.length === 1 ? accountMatches[0] : null;
    const legacyCategoryUnchanged = !!(current && !cells.CONTA_N2 && before?.CATEGORIA_N1 === cells.CATEGORIA_N1 && !current.contaId);
    if (cells.CATEGORIA_N1 && !category && !legacyCategoryUnchanged) errors.push("CATEGORIA_N1: inexistente ou inativa no tenant");
    if (cells.CONTA_N2 && !category) errors.push("CONTA_N2: informe uma Categoria N1 ativa");
    else if (cells.CONTA_N2 && !account) errors.push("CONTA_N2: inexistente, inativa, ambígua ou fora da Categoria N1");
    if (account?.tipo === "RECEITA" && cells.DIRECAO !== "ENTRADA") errors.push("DIRECAO: Conta de Receita exige ENTRADA");
    if (account?.tipo === "DESPESA" && cells.DIRECAO !== "SAIDA") errors.push("DIRECAO: Conta de Despesa exige SAIDA");
    if (account?.tipo === "TRANSFERENCIA") errors.push("CONTA_N2: Transferência requer fluxo próprio");
    if (cells.CLIENTE_CODIGO && cells.FORNECEDOR_CODIGO) errors.push("CLIENTE_CODIGO/FORNECEDOR_CODIGO: informe somente um");
    const client = cells.CLIENTE_CODIGO ? clientByCode.get(cells.CLIENTE_CODIGO) : null;
    const supplier = cells.FORNECEDOR_CODIGO ? supplierByCode.get(cells.FORNECEDOR_CODIGO) : null;
    if (cells.CLIENTE_CODIGO && !client) errors.push("CLIENTE_CODIGO: inexistente ou inativo neste tenant");
    if (cells.FORNECEDOR_CODIGO && !supplier) errors.push("FORNECEDOR_CODIGO: inexistente ou inativo neste tenant");
    if (cells.STATUS_MANUAL && !activeStatus.has(cells.STATUS_MANUAL) && before?.STATUS_MANUAL !== cells.STATUS_MANUAL) errors.push("STATUS_MANUAL: código inexistente ou inativo");
    const differences = before ? OFFICIAL_HEADERS.filter(header => !technicalHeaders.has(header)).filter(header => {
      const prior = canonicalCells(before).cells[header];
      return prior !== cells[header];
    }).map(header => ({ campo: header, antes: before[header], depois: cells[header] })) : [];
    if (!id && cells.DATA_LANCAMENTO && cells.DESCRICAO && cells.VALOR_REALIZADO) {
      const duplicate = await db.lancamento.findFirst({ where: { tenantId, dataLanc: asDbDate(cells.DATA_LANCAMENTO), descricao: cells.DESCRICAO, valor: cells.VALOR_REALIZADO, tipo: cells.DIRECAO }, select: { id: true } });
      if (duplicate) warnings.push("Possível duplicidade: será criado novo registro, nunca atualizado automaticamente.");
    }
    const action: OfficialPreviewRow["acao"] = errors.length ? conflict ? "CONFLITO" : "ERRO" : !id ? "NOVO" : differences.length ? "ALTERADO" : "INALTERADO";
    result.rows.push({ linha, registroId: id, acao: action, diferencas: differences, avisos: warnings, erros: errors });
    result.resumo.avisos += warnings.length;
    if (action === "CONFLITO") result.resumo.conflitos++;
    else if (action === "ERRO") result.resumo.erros++;
    else if (action === "NOVO") result.resumo.novos++;
    else if (action === "ALTERADO") result.resumo.alterados++;
    else result.resumo.inalterados++;
    for (const reason of errors) result.errors.push({ linha, campo: reason.split(":")[0], motivo: reason });
    if (errors.length || action === "INALTERADO") continue;
    const data: Record<string, unknown> = {
      dataLanc: asDbDate(cells.DATA_LANCAMENTO), descricao: cells.DESCRICAO,
      tipo: cells.DIRECAO, status: cells.STATUS, valor: cells.VALOR_REALIZADO,
      valorPrevisto: cells.VALOR_PREVISTO || null,
      statusManual: cells.STATUS_MANUAL || null,
    };
    for (const [header, field] of dateFields.slice(1)) data[field] = cells[header] ? asDbDate(cells[header]) : null;
    for (const [header, field] of optionalText) data[field] = cells[header] || null;
    if (!current || before?.CATEGORIA_N1 !== cells.CATEGORIA_N1 || before?.CONTA_N2 !== cells.CONTA_N2) {
      data.contaId = account?.id || null;
      data.categoria = cells.CATEGORIA_N1 || null;
    }
    if (!current || before?.CLIENTE_CODIGO !== cells.CLIENTE_CODIGO || before?.FORNECEDOR_CODIGO !== cells.FORNECEDOR_CODIGO) {
      data.clienteId = client?.id || null;
      data.fornecedorId = supplier?.id || null;
      data.fantasiaPadrao = client?.nomeFantasia || client?.nome || supplier?.nomeFantasia || supplier?.nome || null;
    }
    result.changes.push({ id: id || null, version: cells.REGISTRO_VERSAO, data });
  }
  return result;
}
