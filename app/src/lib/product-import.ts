import * as XLSX from "xlsx";
import { productText } from "@/lib/product-catalog";
import { PRODUCT_GROUP_HEADERS, PRODUCT_ITEM_HEADERS, PRODUCT_LINE_HEADERS, PRODUCT_TYPE_HEADERS } from "@/lib/product-import-template";

export type ProductImportIssue = { aba: string; linha: number; campo: string; codigo: string; motivo: string };
type Action = "novo" | "atualizar" | "igual" | "erro";
type BaseRow = { linha: number; acao?: Action; detalhes?: string[]; avisos?: string[]; sugestoes?: string[] };
export type TypeRow = BaseRow & { grupo: string; codigo: string; nome: string };
export type GroupRow = BaseRow & { codigo: string; nome: string };
export type LineRow = BaseRow & { grupo: string; codigoTipo: string; codigo: string; nome: string };
export type ItemRow = BaseRow & { codigo: string; nome: string; grupo: string; codigoTipo: string; codigoLinha: string; descricao: string; unidade: string; observacoes: string };
export type ProductWorkbook = { grupos: GroupRow[]; tipos: TypeRow[]; linhas: LineRow[]; itens: ItemRow[]; errors: ProductImportIssue[] };
export type ProductPreview = ProductWorkbook & {
  warnings: ProductImportIssue[]; suggestions: ProductImportIssue[];
  resumo: { totalLido: number; totalNovo: number; totalAtualizado: number; totalSemAlteracao: number; totalErros: number; totalAvisos: number; totalSugestoes: number;
    grupos: SectionCount; tipos: SectionCount; linhas: SectionCount; itens: SectionCount; ausentes: { grupos: number; tipos: number; linhas: number; itens: number } };
};
type SectionCount = { novos: number; atualizacoes: number; semAlteracao: number; erros: number; avisos: number };
const typeKey = (group: string, code: string) => `${group}\u0000${code}`;
const lineKey = (group: string, typeCode: string, code: string) => `${group}\u0000${typeCode}\u0000${code}`;
const rowRef = (row: BaseRow & { codigo: string }) => row.codigo || `@${row.linha}`;

export function parseProductWorkbook(bytes: Uint8Array): ProductWorkbook {
  const book = XLSX.read(bytes, { type: "array", cellText: true });
  const errors: ProductImportIssue[] = [];
  function sheet(name: string, columns: readonly string[], codes: number[]) {
    const worksheet = book.Sheets[name];
    if (!worksheet) { errors.push({ aba: name, linha: 0, campo: "ABA", codigo: "", motivo: `Aba ${name} ausente.` }); return [] as { linha: number; values: string[] }[]; }
    const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1");
    const cells = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, raw: false, defval: "", blankrows: true });
    const headers = (cells[0] || []).map(value => String(value).trim().toUpperCase());
    for (const column of columns) {
      if (!headers.includes(column)) errors.push({ aba: name, linha: range.s.r + 1, campo: column, codigo: "", motivo: `Coluna ${column} ausente.` });
      if (headers.filter(value => value === column).length > 1) errors.push({ aba: name, linha: range.s.r + 1, campo: column, codigo: "", motivo: `Coluna ${column} duplicada.` });
    }
    if (columns.some(column => headers.filter(value => value === column).length !== 1)) return [] as { linha: number; values: string[] }[];
    return cells.slice(1).flatMap((row, index) => {
      const values = columns.map(column => String(row[headers.indexOf(column)] ?? "").trim());
      if (values.every(value => !value)) return [];
      const linha = range.s.r + index + 2;
      for (const position of codes) {
        const column = columns[position];
        const cell = worksheet[XLSX.utils.encode_cell({ r: linha - 1, c: range.s.c + headers.indexOf(column) })];
        if (values[position] && cell?.t === "n") errors.push({ aba: name, linha, campo: column, codigo: values[position], motivo: "Código numérico pode perder zeros à esquerda. Formate a célula como Texto e confira o código." });
      }
      return [{ linha, values }];
    });
  }
  const grupos = sheet("GRUPOS", PRODUCT_GROUP_HEADERS, [0]).map(({ linha, values }) => ({ linha, codigo: values[0], nome: values[1] }));
  const tipos = sheet("TIPOS", PRODUCT_TYPE_HEADERS, [0, 1]).map(({ linha, values }) => ({ linha, grupo: values[0], codigo: values[1], nome: values[2] }));
  const linhas = sheet("LINHAS", PRODUCT_LINE_HEADERS, [0, 1, 2]).map(({ linha, values }) => ({ linha, grupo: values[0], codigoTipo: values[1], codigo: values[2], nome: values[3] }));
  const itens = sheet("ITENS", PRODUCT_ITEM_HEADERS, [0, 2, 3, 4]).map(({ linha, values }) => ({ linha, codigo: values[0], nome: values[1], grupo: values[2], codigoTipo: values[3], codigoLinha: values[4], descricao: values[5], unidade: values[6], observacoes: values[7] }));
  if (!errors.length && !grupos.length && !tipos.length && !linhas.length && !itens.length) errors.push({ aba: "ITENS", linha: 0, campo: "ARQUIVO", codigo: "", motivo: "Arquivo sem registros para importar." });
  return { grupos, tipos, linhas, itens, errors };
}

function validText(value: string, label: string, required: boolean, max: number) {
  try { productText(value, label, required, max); return null; }
  catch (error) { return error instanceof Error ? error.message : `${label} inválido.`; }
}

export async function validateProductWorkbook(input: ProductWorkbook, db: any, tenantId: string): Promise<ProductPreview> {
  const grupos = input.grupos.map(row => ({ ...row })), tipos = input.tipos.map(row => ({ ...row })), linhas = input.linhas.map(row => ({ ...row })), itens = input.itens.map(row => ({ ...row }));
  const errors = [...input.errors], warnings: ProductImportIssue[] = [], suggestions: ProductImportIssue[] = [];
  const invalid = { GRUPOS: new Set<number>(), TIPOS: new Set<number>(), LINHAS: new Set<number>(), ITENS: new Set<number>() };
  for (const item of errors) if (item.aba in invalid) invalid[item.aba as keyof typeof invalid].add(item.linha);
  const issue = (aba: keyof typeof invalid, row: BaseRow & { codigo: string }, campo: string, motivo: string) => { errors.push({ aba, linha: row.linha, campo, codigo: row.codigo, motivo }); invalid[aba].add(row.linha); };
  const insight = (kind: "avisos" | "sugestoes", aba: string, row: BaseRow & { codigo: string }, campo: string, motivo: string) => {
    (kind === "avisos" ? warnings : suggestions).push({ aba, linha: row.linha, campo, codigo: row.codigo, motivo });
    (row[kind] ||= []).push(motivo);
  };
  const [dbGroups, dbTypes, dbLines, dbItems] = await Promise.all([
    db.produtoGrupo.findMany({ where: { tenantId } }), db.produtoTipo.findMany({ where: { tenantId } }), db.produtoLinha.findMany({ where: { tenantId } }), db.produto.findMany({ where: { tenantId } }),
  ]);
  const dbGroupByCode = new Map<string, any>(dbGroups.map((row: any) => [row.codigo, row]));
  const dbGroupById = new Map<string, any>(dbGroups.map((row: any) => [row.id, row]));
  const dbTypeByKey = new Map<string, any>(dbTypes.flatMap((row: any) => {
    const group = dbGroupById.get(row.grupoId); return group ? [[typeKey(group.codigo, row.codigo), row] as const] : [];
  }));
  const dbTypeById = new Map<string, any>(dbTypes.map((row: any) => [row.id, row]));
  const dbLineByKey = new Map<string, any>(dbLines.flatMap((row: any) => {
    const parent = dbTypeById.get(row.tipoId), group = dbGroupById.get(parent?.grupoId); return group ? [[lineKey(group.codigo, parent.codigo, row.codigo), row] as const] : [];
  }));
  const dbItemByCode = new Map<string, any>(dbItems.map((row: any) => [row.codigo, row]));
  const fileGroupCounts = new Map<string, number>();
  for (const row of grupos) if (row.codigo) fileGroupCounts.set(row.codigo, (fileGroupCounts.get(row.codigo) || 0) + 1);
  for (const row of grupos) {
    for (const [field, value, required, max] of [["CODIGO_GRUPO", row.codigo, false, 30], ["NOME_GRUPO", row.nome, true, 200]] as const) {
      const problem = validText(value, field, required, max); if (problem) issue("GRUPOS", row, field, problem);
    }
    if (row.codigo && (fileGroupCounts.get(row.codigo) || 0) > 1) issue("GRUPOS", row, "CODIGO_GRUPO", "Grupo duplicado no arquivo.");
    const old = row.codigo ? dbGroupByCode.get(row.codigo) : null;
    if (row.codigo && !old) issue("GRUPOS", row, "CODIGO_GRUPO", "Código informado não existe neste tenant. Para novo Grupo, deixe vazio.");
    if (old && !old.ativo) issue("GRUPOS", row, "CODIGO_GRUPO", "Grupo existente inativo; não será reativado.");
    row.acao = invalid.GRUPOS.has(row.linha) ? "erro" : !old ? "novo" : old.nome === row.nome ? "igual" : "atualizar";
    if (row.acao === "atualizar") { row.detalhes = [`Nome: ${old.nome} → ${row.nome}`]; insight("avisos", "GRUPOS", row, "NOME_GRUPO", "Nome do Grupo será alterado."); }
  }
  const fileGroups = new Map(grupos.map(row => [rowRef(row), row]));
  const validGroupCodes = new Set<string>(dbGroups.filter((row: any) => row.ativo).map((row: any) => row.codigo));
  for (const row of grupos) if (row.acao !== "erro") validGroupCodes.add(rowRef(row));
  const fileTypeCounts = new Map<string, number>();
  for (const row of tipos) if (row.codigo) { const key = typeKey(row.grupo, row.codigo); fileTypeCounts.set(key, (fileTypeCounts.get(key) || 0) + 1); }
  for (const row of tipos) {
    const groupProblem = validText(row.grupo, "CODIGO_GRUPO", true, 30); if (groupProblem) issue("TIPOS", row, "CODIGO_GRUPO", groupProblem);
    if (!validGroupCodes.has(row.grupo) || fileGroups.get(row.grupo)?.acao === "erro") issue("TIPOS", row, "CODIGO_GRUPO", "Grupo inexistente ou inativo neste tenant ou inválido na aba GRUPOS.");
    for (const [field, value, required, max] of [["CODIGO_TIPO", row.codigo, false, 30], ["NOME_TIPO", row.nome, true, 200]] as const) {
      const problem = validText(value, field, required, max); if (problem) issue("TIPOS", row, field, problem);
    }
    if (row.codigo && (fileTypeCounts.get(typeKey(row.grupo, row.codigo)) || 0) > 1) issue("TIPOS", row, "CODIGO_TIPO", "Tipo duplicado no mesmo Grupo no arquivo.");
    const old = row.codigo ? dbTypeByKey.get(typeKey(row.grupo, row.codigo)) : null;
    if (row.codigo && !old) issue("TIPOS", row, "CODIGO_TIPO", "Código informado não existe neste Grupo. Para novo Tipo, deixe vazio.");
    if (old && !old.ativo) issue("TIPOS", row, "CODIGO_TIPO", "Tipo existente inativo; não será reativado.");
    row.acao = invalid.TIPOS.has(row.linha) ? "erro" : !old ? "novo" : old.nome === row.nome ? "igual" : "atualizar";
    if (row.acao === "atualizar") { row.detalhes = [`Nome: ${old.nome} → ${row.nome}`]; insight("avisos", "TIPOS", row, "NOME_TIPO", "Nome do Tipo será alterado."); }
  }
  const fileTypes = new Map(tipos.map(row => [typeKey(row.grupo, rowRef(row)), row]));
  const validTypeKeys = new Set<string>(dbTypes.filter((row: any) => row.ativo && dbGroupById.get(row.grupoId)?.ativo).map((row: any) => typeKey(dbGroupById.get(row.grupoId).codigo, row.codigo)));
  for (const row of tipos) if (row.acao !== "erro") validTypeKeys.add(typeKey(row.grupo, rowRef(row)));
  const fileLineCounts = new Map<string, number>();
  for (const row of linhas) if (row.codigo) { const key = lineKey(row.grupo, row.codigoTipo, row.codigo); fileLineCounts.set(key, (fileLineCounts.get(key) || 0) + 1); }
  for (const row of linhas) {
    const groupProblem = validText(row.grupo, "CODIGO_GRUPO", true, 30); if (groupProblem) issue("LINHAS", row, "CODIGO_GRUPO", groupProblem);
    if (!validGroupCodes.has(row.grupo) || fileGroups.get(row.grupo)?.acao === "erro") issue("LINHAS", row, "CODIGO_GRUPO", "Grupo inexistente ou inativo neste tenant ou inválido na aba GRUPOS.");
    for (const [field, value, required, max] of [["CODIGO_TIPO", row.codigoTipo, true, 30], ["CODIGO_LINHA", row.codigo, false, 30], ["NOME_LINHA", row.nome, true, 200]] as const) {
      const problem = validText(value, field, required, max); if (problem) issue("LINHAS", row, field, problem);
    }
    if (row.codigo && (fileLineCounts.get(lineKey(row.grupo, row.codigoTipo, row.codigo)) || 0) > 1) issue("LINHAS", row, "CODIGO_LINHA", "Linha duplicada para este Tipo e Grupo no arquivo.");
    const parentKey = typeKey(row.grupo, row.codigoTipo);
    if (!validTypeKeys.has(parentKey)) {
      issue("LINHAS", row, "CODIGO_TIPO", "Tipo inexistente, inativo ou incompatível com o Grupo.");
      const candidate = [...validTypeKeys].filter(key => key.startsWith(`${row.grupo}\u0000`)).map(key => key.split("\u0000")[1]).find(code => code.toLocaleLowerCase("pt-BR") === row.codigoTipo.toLocaleLowerCase("pt-BR"));
      if (candidate) insight("sugestoes", "LINHAS", row, "CODIGO_TIPO", `Confira a grafia de ${candidate}; nada será corrigido automaticamente.`);
    }
    if (fileTypes.get(parentKey)?.acao === "erro") issue("LINHAS", row, "CODIGO_TIPO", "Tipo informado na aba TIPOS possui erros.");
    const old = row.codigo ? dbLineByKey.get(lineKey(row.grupo, row.codigoTipo, row.codigo)) : null;
    if (row.codigo && !old) issue("LINHAS", row, "CODIGO_LINHA", "Código informado não existe neste Tipo. Para nova Linha, deixe vazio.");
    if (old && !old.ativo) issue("LINHAS", row, "CODIGO_LINHA", "Linha existente inativa; não será reativada.");
    row.acao = invalid.LINHAS.has(row.linha) ? "erro" : !old ? "novo" : old.nome === row.nome ? "igual" : "atualizar";
    if (row.acao === "atualizar") { row.detalhes = [`Nome: ${old.nome} → ${row.nome}`]; insight("avisos", "LINHAS", row, "NOME_LINHA", "Nome da Linha será alterado."); }
  }
  const fileLines = new Map(linhas.filter(row => row.acao !== "erro").map(row => [lineKey(row.grupo, row.codigoTipo, rowRef(row)), row]));
  const fileItemCodes = new Map<string, number>();
  for (const row of itens) if (row.codigo) fileItemCodes.set(row.codigo, (fileItemCodes.get(row.codigo) || 0) + 1);
  const seenNewNames = new Map<string, number>();
  for (const row of itens) {
    for (const [field, value, required, max] of [["CODIGO_ITEM", row.codigo, false, 30], ["NOME", row.nome, true, 200], ["CODIGO_TIPO", row.codigoTipo, true, 30], ["CODIGO_LINHA", row.codigoLinha, false, 30], ["DESCRICAO", row.descricao, false, 5000], ["UNIDADE", row.unidade, false, 30], ["OBSERVACOES", row.observacoes, false, 5000]] as const) {
      const problem = validText(value, field, required, max); if (problem) issue("ITENS", row, field, problem);
    }
    const groupProblem = validText(row.grupo, "CODIGO_GRUPO", true, 30); if (groupProblem) issue("ITENS", row, "CODIGO_GRUPO", groupProblem);
    if (!validGroupCodes.has(row.grupo) || fileGroups.get(row.grupo)?.acao === "erro") issue("ITENS", row, "CODIGO_GRUPO", "Grupo inexistente ou inativo neste tenant ou inválido na aba GRUPOS.");
    if (row.codigo && (fileItemCodes.get(row.codigo) || 0) > 1) issue("ITENS", row, "CODIGO_ITEM", "Código do Item duplicado no arquivo.");
    const old = row.codigo ? dbItemByCode.get(row.codigo) : null;
    if (row.codigo && !old) issue("ITENS", row, "CODIGO_ITEM", "Código informado não existe neste tenant. Para novo Item, deixe vazio.");
    if (old && !old.ativo) issue("ITENS", row, "CODIGO_ITEM", "Item existente inativo; não será reativado.");
    if (old && !old.grupoId) issue("ITENS", row, "CODIGO_ITEM", "Item legado sem Grupo configurável; não será convertido automaticamente nesta carga.");
    const key = typeKey(row.grupo, row.codigoTipo);
    if (!validTypeKeys.has(key) || fileTypes.get(key)?.acao === "erro") issue("ITENS", row, "CODIGO_TIPO", "Tipo inexistente, inativo ou incompatível com o Grupo.");
    if (row.codigoLinha) {
      const line = dbLineByKey.get(lineKey(row.grupo, row.codigoTipo, row.codigoLinha));
      if ((!line?.ativo && !fileLines.has(lineKey(row.grupo, row.codigoTipo, row.codigoLinha))) || (line && !line.ativo)) issue("ITENS", row, "CODIGO_LINHA", "Linha inexistente, inativa ou incompatível com o Tipo.");
    }
    row.acao = invalid.ITENS.has(row.linha) ? "erro" : !old ? "novo" : "igual";
    if (row.acao !== "erro" && old) {
      const oldType = dbTypeById.get(old.tipoId);
      const oldLine = dbLines.find((line: any) => line.id === old.linhaId);
      const changes: string[] = [];
      for (const [label, before, after] of [["Nome", old.nome, row.nome], ["Grupo", dbGroupById.get(old.grupoId)?.codigo || "", row.grupo], ["Tipo", oldType?.codigo || "", row.codigoTipo], ["Linha", oldLine?.codigo || "", row.codigoLinha], ["Descrição", old.descricao || "", row.descricao], ["Unidade", old.unidade || "", row.unidade], ["Observações", old.observacoes || "", row.observacoes]] as const) if (before !== after) changes.push(`${label}: ${before || "—"} → ${after || "—"}`);
      row.acao = changes.length ? "atualizar" : "igual";
      row.detalhes = changes;
      if (old.nome !== row.nome) insight("avisos", "ITENS", row, "NOME", "Nome do Item será alterado.");
      if (dbGroupById.get(old.grupoId)?.codigo !== row.grupo || oldType?.codigo !== row.codigoTipo || (oldLine?.codigo || "") !== row.codigoLinha) insight("avisos", "ITENS", row, "CLASSIFICACAO", "Classificação será alterada. Confira Grupo, Tipo e Linha.");
    }
    if (row.acao === "novo") {
      const nameKey = `${row.grupo}\u0000${row.nome.toLocaleLowerCase("pt-BR")}`;
      const other = dbItems.find((item: any) => item.ativo && dbGroupById.get(item.grupoId)?.codigo === row.grupo && item.nome.toLocaleLowerCase("pt-BR") === row.nome.toLocaleLowerCase("pt-BR"));
      if (other || seenNewNames.has(nameKey)) insight("avisos", "ITENS", row, "NOME", "Possível duplicidade por nome. Nenhum registro será mesclado.");
      seenNewNames.set(nameKey, row.linha);
    }
  }
  const tally = (rows: BaseRow[], aba: string): SectionCount => ({ novos: rows.filter(row => row.acao === "novo").length, atualizacoes: rows.filter(row => row.acao === "atualizar").length, semAlteracao: rows.filter(row => row.acao === "igual").length, erros: errors.filter(error => error.aba === aba).length, avisos: warnings.filter(warning => warning.aba === aba).length });
  const g = tally(grupos, "GRUPOS"), t = tally(tipos, "TIPOS"), l = tally(linhas, "LINHAS"), i = tally(itens, "ITENS");
  const fileGroupCodes = new Set(grupos.map(row => row.codigo).filter(Boolean));
  const fileTypeKeys = new Set(tipos.filter(row => row.codigo).map(row => typeKey(row.grupo, row.codigo)));
  const fileLineKeys = new Set(linhas.filter(row => row.codigo).map(row => lineKey(row.grupo, row.codigoTipo, row.codigo)));
  const fileItemCodeSet = new Set(itens.map(row => row.codigo).filter(Boolean));
  return { grupos, tipos, linhas, itens, errors, warnings, suggestions, resumo: { totalLido: grupos.length + tipos.length + linhas.length + itens.length, totalNovo: g.novos + t.novos + l.novos + i.novos, totalAtualizado: g.atualizacoes + t.atualizacoes + l.atualizacoes + i.atualizacoes, totalSemAlteracao: g.semAlteracao + t.semAlteracao + l.semAlteracao + i.semAlteracao, totalErros: errors.length, totalAvisos: warnings.length, totalSugestoes: suggestions.length, grupos: g, tipos: t, linhas: l, itens: i, ausentes: { grupos: dbGroups.filter((row: any) => row.ativo && !fileGroupCodes.has(row.codigo)).length, tipos: dbTypes.filter((row: any) => row.ativo && row.grupoId && !fileTypeKeys.has(typeKey(dbGroupById.get(row.grupoId)?.codigo || "", row.codigo))).length, linhas: dbLines.filter((row: any) => { const parent = dbTypeById.get(row.tipoId), group = dbGroupById.get(parent?.grupoId); return row.ativo && group && !fileLineKeys.has(lineKey(group.codigo, parent.codigo, row.codigo)); }).length, itens: dbItems.filter((row: any) => row.ativo && row.grupoId && !fileItemCodeSet.has(row.codigo)).length } } };
}
