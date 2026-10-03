import * as XLSX from "xlsx";

export const PRODUCT_STRUCTURE_FILENAME = "produtos_servicos_10s.xlsx";
export const PRODUCT_TYPE_HEADERS = ["GRUPO", "CODIGO_TIPO", "NOME_TIPO"] as const;
export const PRODUCT_LINE_HEADERS = ["CODIGO_TIPO", "CODIGO_LINHA", "NOME_LINHA"] as const;
export const PRODUCT_ITEM_HEADERS = ["CODIGO_ITEM", "NOME", "GRUPO", "CODIGO_TIPO", "CODIGO_LINHA", "DESCRICAO", "UNIDADE", "PRECO_VENDA", "PRECO_CUSTO", "OBSERVACOES"] as const;

export type ExportType = { grupo: string; codigo: string; nome: string };
export type ExportLine = { codigoTipo: string; codigo: string; nome: string };
export type ExportItem = { codigo: string; nome: string; grupo: string; codigoTipo: string; codigoLinha: string; descricao: string; unidade: string; precoVenda: string; precoCusto: string; observacoes: string };

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

export function createProductStructureWorkbook(types: ExportType[], lines: ExportLine[], items: ExportItem[]): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  const instructions = XLSX.utils.aoa_to_sheet([
    ["REGRA", "ORIENTAÇÃO"],
    ["Estrutura atual", "As abas incluem cadastros ativos. Sem cadastros, vêm vazias com cabeçalhos."],
    ["Abas e colunas", "Não renomeie INSTRUCOES, TIPOS, LINHAS, ITENS nem os cabeçalhos."],
    ["Códigos", "Mantenha códigos como texto para preservar zeros à esquerda. As primeiras 5000 linhas de código estão preparadas como Texto."],
    ["Grupo", "Use apenas PRODUTO ou SERVICO."],
    ["Tipo", "Novo Item exige CODIGO_TIPO de Tipo ativo no Grupo ou criado em TIPOS."],
    ["Linha", "CODIGO_LINHA é opcional e deve pertencer ao Tipo. CODIGO_TIPO em LINHAS precisa identificar um único Tipo entre os Grupos."],
    ["Item existente", "Mantenha CODIGO_ITEM. Altere os demais campos para atualizar; o código não pode ser renumerado."],
    ["Item novo", "Deixe CODIGO_ITEM vazio. O servidor gera o próximo código na confirmação."],
    ["Preço", "PRECO_VENDA e PRECO_CUSTO são referências atuais; aceite valor positivo, zero ou vazio."],
    ["Ausência", "Remover uma linha do Excel não exclui nem desativa registros no sistema."],
    ["Inativos", "Registros inativos não são exportados e não podem ser atualizados nesta carga."],
    ["Prévia", "Selecione o arquivo para conferir prévia, erros, avisos e sugestões antes de confirmar. A confirmação revalida e grava tudo ou nada."],
  ]);
  instructions["!cols"] = [{ wch: 22 }, { wch: 120 }];
  XLSX.utils.book_append_sheet(workbook, instructions, "INSTRUCOES");
  XLSX.utils.book_append_sheet(workbook, dataSheet(PRODUCT_TYPE_HEADERS, types.map(row => [row.grupo, row.codigo, row.nome]), [1], [18, 24, 52]), "TIPOS");
  XLSX.utils.book_append_sheet(workbook, dataSheet(PRODUCT_LINE_HEADERS, lines.map(row => [row.codigoTipo, row.codigo, row.nome]), [0, 1], [24, 24, 52]), "LINHAS");
  XLSX.utils.book_append_sheet(workbook, dataSheet(PRODUCT_ITEM_HEADERS, items.map(row => [row.codigo, row.nome, row.grupo, row.codigoTipo, row.codigoLinha, row.descricao, row.unidade, row.precoVenda, row.precoCusto, row.observacoes]), [0, 3, 4], [22, 48, 18, 24, 24, 58, 16, 20, 20, 58]), "ITENS");
  return XLSX.write(workbook, { bookType: "xlsx", type: "array", compression: true }) as ArrayBuffer;
}
