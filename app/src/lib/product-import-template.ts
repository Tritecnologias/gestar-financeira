import * as XLSX from "xlsx";

export const PRODUCT_STRUCTURE_FILENAME = "portfolio_10s.xlsx";
export const PRODUCT_GROUP_HEADERS = ["CODIGO_GRUPO", "NOME_GRUPO"] as const;
export const PRODUCT_TYPE_HEADERS = ["CODIGO_GRUPO", "CODIGO_TIPO", "NOME_TIPO"] as const;
export const PRODUCT_LINE_HEADERS = ["CODIGO_GRUPO", "CODIGO_TIPO", "CODIGO_LINHA", "NOME_LINHA"] as const;
export const PRODUCT_ITEM_HEADERS = ["CODIGO_ITEM", "NOME", "CODIGO_GRUPO", "CODIGO_TIPO", "CODIGO_LINHA", "DESCRICAO", "UNIDADE", "OBSERVACOES"] as const;

export type ExportGroup = { codigo: string; nome: string };
export type ExportType = { codigoGrupo: string; codigo: string; nome: string };
export type ExportLine = { codigoGrupo: string; codigoTipo: string; codigo: string; nome: string };
export type ExportItem = { codigo: string; nome: string; codigoGrupo: string; codigoTipo: string; codigoLinha: string; descricao: string; unidade: string; observacoes: string };

function dataSheet(headers: readonly string[], rows: string[][], codeColumns: number[], widths: number[]) {
  const sheet = XLSX.utils.aoa_to_sheet([[...headers], ...rows]);
  const lastRow = Math.max(5000, rows.length);
  for (let row = 1; row <= lastRow; row++) for (const column of codeColumns) {
    sheet[XLSX.utils.encode_cell({ r: row, c: column })] = { t: "s", v: rows[row - 1]?.[column] ?? "", z: "@" };
  }
  sheet["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastRow, c: headers.length - 1 } });
  sheet["!cols"] = widths.map(wch => ({ wch }));
  return sheet;
}

export function createProductStructureWorkbook(groups: ExportGroup[], types: ExportType[], lines: ExportLine[], items: ExportItem[]): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  const instructions = XLSX.utils.aoa_to_sheet([
    ["REGRA", "ORIENTAÇÃO"],
    ["Estrutura atual", "As abas incluem cadastros ativos. Sem cadastros, vêm vazias com cabeçalhos."],
    ["Abas e colunas", "Não renomeie INSTRUCOES, GRUPOS, TIPOS, LINHAS, ITENS nem os cabeçalhos."],
    ["Códigos", "Mantenha códigos existentes como texto. Deixe o código vazio para Grupo, Tipo, Linha ou Item novo; o servidor gera o código na confirmação."],
    ["Pais novos", "Para vincular a Grupo novo sem código, use @N em CODIGO_GRUPO, sendo N a linha dele na aba GRUPOS. Para Tipo novo, use @N em CODIGO_TIPO com a linha da aba TIPOS. Para Linha nova, use @N em CODIGO_LINHA com a linha da aba LINHAS."],
    ["Hierarquia", "GRUPO → TIPO → LINHA opcional → ITEM. Cada Tipo pertence a um Grupo do tenant; cada Linha pertence a um Tipo."],
    ["Grupo", "Para alterar, preserve CODIGO_GRUPO. Para incluir, deixe-o vazio. Códigos são imutáveis."],
    ["Tipo", "CODIGO_GRUPO é obrigatório em TIPOS. Um Tipo deve estar no Grupo informado."],
    ["Linha", "CODIGO_GRUPO e CODIGO_TIPO são obrigatórios em LINHAS. CODIGO_LINHA em ITENS é opcional."],
    ["Legado", "Cadastros antigos sem vínculo com Grupo configurável não são convertidos nem exportados automaticamente."],
    ["Item existente", "Mantenha CODIGO_ITEM. Altere os demais campos para atualizar; o código não pode ser renumerado."],
    ["Item novo", "Deixe CODIGO_ITEM vazio. O servidor gera o próximo código na confirmação."],
    ["Ausência", "Remover uma linha do Excel não exclui nem desativa registros no sistema."],
    ["Inativos", "Registros inativos não são exportados e não podem ser atualizados nesta carga."],
    ["Prévia", "Selecione o arquivo para conferir prévia, erros, avisos e sugestões antes de confirmar. A confirmação revalida e grava tudo ou nada."],
  ]);
  instructions["!cols"] = [{ wch: 22 }, { wch: 120 }];
  XLSX.utils.book_append_sheet(workbook, instructions, "INSTRUCOES");
  XLSX.utils.book_append_sheet(workbook, dataSheet(PRODUCT_GROUP_HEADERS, groups.map(row => [row.codigo, row.nome]), [0], [24, 52]), "GRUPOS");
  XLSX.utils.book_append_sheet(workbook, dataSheet(PRODUCT_TYPE_HEADERS, types.map(row => [row.codigoGrupo, row.codigo, row.nome]), [0, 1], [24, 24, 52]), "TIPOS");
  XLSX.utils.book_append_sheet(workbook, dataSheet(PRODUCT_LINE_HEADERS, lines.map(row => [row.codigoGrupo, row.codigoTipo, row.codigo, row.nome]), [0, 1, 2], [24, 24, 24, 52]), "LINHAS");
  XLSX.utils.book_append_sheet(workbook, dataSheet(PRODUCT_ITEM_HEADERS, items.map(row => [row.codigo, row.nome, row.codigoGrupo, row.codigoTipo, row.codigoLinha, row.descricao, row.unidade, row.observacoes]), [0, 2, 3, 4], [22, 48, 24, 24, 24, 58, 16, 58]), "ITENS");
  return XLSX.write(workbook, { bookType: "xlsx", type: "array", compression: true }) as ArrayBuffer;
}
