import * as XLSX from "xlsx";
import { productPrice, productText } from "@/lib/product-catalog";
import { PRODUCT_ITEM_HEADERS, PRODUCT_LINE_HEADERS, PRODUCT_TYPE_HEADERS } from "@/lib/product-import-template";

export type ProductImportIssue = { aba: string; linha: number; campo: string; codigo: string; motivo: string };
type Action = "novo" | "atualizar" | "igual" | "erro";
type BaseRow = { linha: number; acao?: Action; detalhes?: string[]; avisos?: string[]; sugestoes?: string[] };
export type TypeRow = BaseRow & { grupo: string; codigo: string; nome: string };
export type LineRow = BaseRow & { grupo: string; codigoTipo: string; codigo: string; nome: string };
export type ItemRow = BaseRow & { codigo: string; nome: string; grupo: string; codigoTipo: string; codigoLinha: string; descricao: string; unidade: string; precoVenda: string; precoCusto: string; observacoes: string };
export type ProductWorkbook = { tipos: TypeRow[]; linhas: LineRow[]; itens: ItemRow[]; errors: ProductImportIssue[] };
export type ProductPreview = ProductWorkbook & {
  warnings: ProductImportIssue[]; suggestions: ProductImportIssue[];
  resumo: { totalLido: number; totalNovo: number; totalAtualizado: number; totalSemAlteracao: number; totalErros: number; totalAvisos: number; totalSugestoes: number;
    tipos: SectionCount; linhas: SectionCount; itens: SectionCount; ausentes: { tipos: number; linhas: number; itens: number } };
};
type SectionCount = { novos: number; atualizacoes: number; semAlteracao: number; erros: number; avisos: number };
const typeKey = (group: string, code: string) => `${group}\u0000${code}`;
const lineKey = (group: string, typeCode: string, code: string) => `${group}\u0000${typeCode}\u0000${code}`;

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
  const tipos = sheet("TIPOS", PRODUCT_TYPE_HEADERS, [1]).map(({ linha, values }) => ({ linha, grupo: values[0], codigo: values[1], nome: values[2] }));
  const linhas = sheet("LINHAS", PRODUCT_LINE_HEADERS, [1, 2]).map(({ linha, values }) => ({ linha, grupo: values[0], codigoTipo: values[1], codigo: values[2], nome: values[3] }));
  const itens = sheet("ITENS", PRODUCT_ITEM_HEADERS, [0, 3, 4]).map(({ linha, values }) => ({ linha, codigo: values[0], nome: values[1], grupo: values[2], codigoTipo: values[3], codigoLinha: values[4], descricao: values[5], unidade: values[6], precoVenda: values[7], precoCusto: values[8], observacoes: values[9] }));
  if (!errors.length && !tipos.length && !linhas.length && !itens.length) errors.push({ aba: "ITENS", linha: 0, campo: "ARQUIVO", codigo: "", motivo: "Arquivo sem registros para importar." });
  return { tipos, linhas, itens, errors };
}

function validText(value: string, label: string, required: boolean, max: number) {
  try { productText(value, label, required, max); return null; }
  catch (error) { return error instanceof Error ? error.message : `${label} inválido.`; }
}
function normalizedPrice(value: string) { return productPrice(value.replace(",", "."), "Preço"); }
const priceEqual = (a: string | null, b: string | null) => a === b || (a !== null && b !== null && Number(a) === Number(b));

export async function validateProductWorkbook(input: ProductWorkbook, db: any, tenantId: string): Promise<ProductPreview> {
  const tipos = input.tipos.map(row => ({ ...row })), linhas = input.linhas.map(row => ({ ...row })), itens = input.itens.map(row => ({ ...row }));
  const errors = [...input.errors], warnings: ProductImportIssue[] = [], suggestions: ProductImportIssue[] = [];
  const invalid = { TIPOS: new Set<number>(), LINHAS: new Set<number>(), ITENS: new Set<number>() };
  for (const item of errors) if (item.aba in invalid) invalid[item.aba as keyof typeof invalid].add(item.linha);
  const issue = (aba: keyof typeof invalid, row: BaseRow & { codigo: string }, campo: string, motivo: string) => { errors.push({ aba, linha: row.linha, campo, codigo: row.codigo, motivo }); invalid[aba].add(row.linha); };
  const insight = (kind: "avisos" | "sugestoes", aba: string, row: BaseRow & { codigo: string }, campo: string, motivo: string) => {
    (kind === "avisos" ? warnings : suggestions).push({ aba, linha: row.linha, campo, codigo: row.codigo, motivo });
    (row[kind] ||= []).push(motivo);
  };
  const [dbTypes, dbLines, dbItems] = await Promise.all([
    db.produtoTipo.findMany({ where: { tenantId } }), db.produtoLinha.findMany({ where: { tenantId } }), db.produto.findMany({ where: { tenantId } }),
  ]);
  const dbTypeByKey = new Map<string, any>(dbTypes.map((row: any) => [typeKey(row.grupo, row.codigo), row]));
  const dbTypeById = new Map<string, any>(dbTypes.map((row: any) => [row.id, row]));
  const dbLineByKey = new Map<string, any>(dbLines.flatMap((row: any) => {
    const parent = dbTypeById.get(row.tipoId); return parent ? [[lineKey(parent.grupo, parent.codigo, row.codigo), row] as const] : [];
  }));
  const dbItemByCode = new Map<string, any>(dbItems.map((row: any) => [row.codigo, row]));
  const fileTypeCounts = new Map<string, number>();
  for (const row of tipos) { const key = typeKey(row.grupo, row.codigo); fileTypeCounts.set(key, (fileTypeCounts.get(key) || 0) + 1); }
  for (const row of tipos) {
    if (row.grupo !== "PRODUTO" && row.grupo !== "SERVICO") issue("TIPOS", row, "GRUPO", "Use PRODUTO ou SERVICO.");
    for (const [field, value, max] of [["CODIGO_TIPO", row.codigo, 30], ["NOME_TIPO", row.nome, 200]] as const) {
      const problem = validText(value, field, true, max); if (problem) issue("TIPOS", row, field, problem);
    }
    if ((fileTypeCounts.get(typeKey(row.grupo, row.codigo)) || 0) > 1) issue("TIPOS", row, "CODIGO_TIPO", "Tipo duplicado no mesmo Grupo no arquivo.");
    const old = dbTypeByKey.get(typeKey(row.grupo, row.codigo));
    if (old && !old.ativo) issue("TIPOS", row, "CODIGO_TIPO", "Tipo existente inativo; não será reativado.");
    row.acao = invalid.TIPOS.has(row.linha) ? "erro" : !old ? "novo" : old.nome === row.nome ? "igual" : "atualizar";
    if (row.acao === "atualizar") { row.detalhes = [`Nome: ${old.nome} → ${row.nome}`]; insight("avisos", "TIPOS", row, "NOME_TIPO", "Nome do Tipo será alterado."); }
  }
  const fileTypes = new Map(tipos.map(row => [typeKey(row.grupo, row.codigo), row]));
  const validTypeKeys = new Set<string>(dbTypes.filter((row: any) => row.ativo).map((row: any) => typeKey(row.grupo, row.codigo)));
  for (const row of tipos) if (row.acao !== "erro") validTypeKeys.add(typeKey(row.grupo, row.codigo));
  const fileLineCounts = new Map<string, number>();
  for (const row of linhas) { const key = lineKey(row.grupo, row.codigoTipo, row.codigo); fileLineCounts.set(key, (fileLineCounts.get(key) || 0) + 1); }
  for (const row of linhas) {
    if (row.grupo !== "PRODUTO" && row.grupo !== "SERVICO") issue("LINHAS", row, "GRUPO", "Use PRODUTO ou SERVICO.");
    for (const [field, value, max] of [["CODIGO_TIPO", row.codigoTipo, 30], ["CODIGO_LINHA", row.codigo, 30], ["NOME_LINHA", row.nome, 200]] as const) {
      const problem = validText(value, field, true, max); if (problem) issue("LINHAS", row, field, problem);
    }
    if ((fileLineCounts.get(lineKey(row.grupo, row.codigoTipo, row.codigo)) || 0) > 1) issue("LINHAS", row, "CODIGO_LINHA", "Linha duplicada para este Tipo e Grupo no arquivo.");
    const parentKey = typeKey(row.grupo, row.codigoTipo);
    if (!validTypeKeys.has(parentKey)) {
      issue("LINHAS", row, "CODIGO_TIPO", "Tipo inexistente, inativo ou incompatível com o Grupo.");
      const candidate = [...validTypeKeys].filter(key => key.startsWith(`${row.grupo}\u0000`)).map(key => key.split("\u0000")[1]).find(code => code.toLocaleLowerCase("pt-BR") === row.codigoTipo.toLocaleLowerCase("pt-BR"));
      if (candidate) insight("sugestoes", "LINHAS", row, "CODIGO_TIPO", `Confira a grafia de ${candidate}; nada será corrigido automaticamente.`);
    }
    if (fileTypes.get(parentKey)?.acao === "erro") issue("LINHAS", row, "CODIGO_TIPO", "Tipo informado na aba TIPOS possui erros.");
    const old = dbLineByKey.get(lineKey(row.grupo, row.codigoTipo, row.codigo));
    if (old && !old.ativo) issue("LINHAS", row, "CODIGO_LINHA", "Linha existente inativa; não será reativada.");
    row.acao = invalid.LINHAS.has(row.linha) ? "erro" : !old ? "novo" : old.nome === row.nome ? "igual" : "atualizar";
    if (row.acao === "atualizar") { row.detalhes = [`Nome: ${old.nome} → ${row.nome}`]; insight("avisos", "LINHAS", row, "NOME_LINHA", "Nome da Linha será alterado."); }
  }
  const fileLines = new Map(linhas.filter(row => row.acao !== "erro").map(row => [lineKey(row.grupo, row.codigoTipo, row.codigo), row]));
  const fileItemCodes = new Map<string, number>();
  for (const row of itens) if (row.codigo) fileItemCodes.set(row.codigo, (fileItemCodes.get(row.codigo) || 0) + 1);
  const seenNewNames = new Map<string, number>();
  for (const row of itens) {
    for (const [field, value, required, max] of [["CODIGO_ITEM", row.codigo, false, 30], ["NOME", row.nome, true, 200], ["CODIGO_TIPO", row.codigoTipo, true, 30], ["CODIGO_LINHA", row.codigoLinha, false, 30], ["DESCRICAO", row.descricao, false, 5000], ["UNIDADE", row.unidade, false, 30], ["OBSERVACOES", row.observacoes, false, 5000]] as const) {
      const problem = validText(value, field, required, max); if (problem) issue("ITENS", row, field, problem);
    }
    if (row.grupo !== "PRODUTO" && row.grupo !== "SERVICO") issue("ITENS", row, "GRUPO", "Use PRODUTO ou SERVICO.");
    if (row.codigo && (fileItemCodes.get(row.codigo) || 0) > 1) issue("ITENS", row, "CODIGO_ITEM", "Código do Item duplicado no arquivo.");
    const old = row.codigo ? dbItemByCode.get(row.codigo) : null;
    if (row.codigo && !old) issue("ITENS", row, "CODIGO_ITEM", "Código informado não existe neste tenant. Para novo Item, deixe vazio.");
    if (old && !old.ativo) issue("ITENS", row, "CODIGO_ITEM", "Item existente inativo; não será reativado.");
    const key = typeKey(row.grupo, row.codigoTipo);
    if (!validTypeKeys.has(key) || fileTypes.get(key)?.acao === "erro") issue("ITENS", row, "CODIGO_TIPO", "Tipo inexistente, inativo ou incompatível com o Grupo.");
    if (row.codigoLinha) {
      const line = dbLineByKey.get(lineKey(row.grupo, row.codigoTipo, row.codigoLinha));
      if ((!line?.ativo && !fileLines.has(lineKey(row.grupo, row.codigoTipo, row.codigoLinha))) || (line && !line.ativo)) issue("ITENS", row, "CODIGO_LINHA", "Linha inexistente, inativa ou incompatível com o Tipo.");
    }
    let sale: string | null = null, cost: string | null = null;
    try { sale = normalizedPrice(row.precoVenda); } catch { issue("ITENS", row, "PRECO_VENDA", "Preço de venda inválido; use valor não negativo com até duas casas decimais."); }
    try { cost = normalizedPrice(row.precoCusto); } catch { issue("ITENS", row, "PRECO_CUSTO", "Preço de custo inválido; use valor não negativo com até duas casas decimais."); }
    row.acao = invalid.ITENS.has(row.linha) ? "erro" : !old ? "novo" : "igual";
    if (row.acao !== "erro" && old) {
      const oldType = dbTypeById.get(old.tipoId);
      const oldLine = dbLines.find((line: any) => line.id === old.linhaId);
      const changes: string[] = [];
      for (const [label, before, after] of [["Nome", old.nome, row.nome], ["Grupo", old.tipo || "", row.grupo], ["Tipo", oldType?.codigo || "", row.codigoTipo], ["Linha", oldLine?.codigo || "", row.codigoLinha], ["Descrição", old.descricao || "", row.descricao], ["Unidade", old.unidade || "", row.unidade], ["Observações", old.observacoes || "", row.observacoes]] as const) if (before !== after) changes.push(`${label}: ${before || "—"} → ${after || "—"}`);
      const oldSale = old.precoVenda?.toString() ?? null, oldCost = old.precoCusto?.toString() ?? null;
      if (!priceEqual(oldSale, sale)) changes.push(`Venda: ${oldSale ?? "—"} → ${sale ?? "—"}`);
      if (!priceEqual(oldCost, cost)) changes.push(`Custo: ${oldCost ?? "—"} → ${cost ?? "—"}`);
      row.acao = changes.length ? "atualizar" : "igual";
      row.detalhes = changes;
      if (old.nome !== row.nome) insight("avisos", "ITENS", row, "NOME", "Nome do Item será alterado.");
      if (old.tipo !== row.grupo || oldType?.codigo !== row.codigoTipo || (oldLine?.codigo || "") !== row.codigoLinha) insight("avisos", "ITENS", row, "CLASSIFICACAO", "Classificação será alterada. Confira Grupo, Tipo e Linha.");
      if ((oldSale !== null && sale !== null && Number(oldSale) > 0 && Math.abs(Number(sale) / Number(oldSale) - 1) >= 0.5) || (oldCost !== null && cost !== null && Number(oldCost) > 0 && Math.abs(Number(cost) / Number(oldCost) - 1) >= 0.5)) insight("avisos", "ITENS", row, "PRECO", "Preço de referência varia 50% ou mais. Confira o antes/depois.");
    }
    if (row.acao === "novo") {
      const nameKey = `${row.grupo}\u0000${row.nome.toLocaleLowerCase("pt-BR")}`;
      const other = dbItems.find((item: any) => item.ativo && item.tipo === row.grupo && item.nome.toLocaleLowerCase("pt-BR") === row.nome.toLocaleLowerCase("pt-BR"));
      if (other || seenNewNames.has(nameKey)) insight("avisos", "ITENS", row, "NOME", "Possível duplicidade por nome. Nenhum registro será mesclado.");
      seenNewNames.set(nameKey, row.linha);
    }
  }
  const tally = (rows: BaseRow[], aba: string): SectionCount => ({ novos: rows.filter(row => row.acao === "novo").length, atualizacoes: rows.filter(row => row.acao === "atualizar").length, semAlteracao: rows.filter(row => row.acao === "igual").length, erros: errors.filter(error => error.aba === aba).length, avisos: warnings.filter(warning => warning.aba === aba).length });
  const t = tally(tipos, "TIPOS"), l = tally(linhas, "LINHAS"), i = tally(itens, "ITENS");
  const fileTypeKeys = new Set(tipos.map(row => typeKey(row.grupo, row.codigo)));
  const fileLineKeys = new Set(linhas.map(row => lineKey(row.grupo, row.codigoTipo, row.codigo)));
  const fileItemCodeSet = new Set(itens.map(row => row.codigo).filter(Boolean));
  return { tipos, linhas, itens, errors, warnings, suggestions, resumo: { totalLido: tipos.length + linhas.length + itens.length, totalNovo: t.novos + l.novos + i.novos, totalAtualizado: t.atualizacoes + l.atualizacoes + i.atualizacoes, totalSemAlteracao: t.semAlteracao + l.semAlteracao + i.semAlteracao, totalErros: errors.length, totalAvisos: warnings.length, totalSugestoes: suggestions.length, tipos: t, linhas: l, itens: i, ausentes: { tipos: dbTypes.filter((row: any) => row.ativo && !fileTypeKeys.has(typeKey(row.grupo, row.codigo))).length, linhas: dbLines.filter((row: any) => { const parent = dbTypeById.get(row.tipoId); return row.ativo && (!parent || !fileLineKeys.has(lineKey(parent.grupo, parent.codigo, row.codigo))); }).length, itens: dbItems.filter((row: any) => row.ativo && !fileItemCodeSet.has(row.codigo)).length } } };
}
