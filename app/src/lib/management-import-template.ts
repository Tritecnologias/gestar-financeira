import * as XLSX from "xlsx";

export const MANAGEMENT_STRUCTURE_FILENAME = "estrutura_gerencial_10s.xlsx";

export type ExportArea = { codigo: string; nome: string };
export type ExportCenter = { codigo: string; nome: string; codigoArea: string };

// Deixa as linhas mais usuais prontas para códigos como 00123 sem criar registros.
const TEXT_ROWS = 5000;

function dataSheet(headers: string[], rows: string[][], codeColumns: number[], widths: number[]): XLSX.WorkSheet {
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const lastRow = Math.max(TEXT_ROWS, rows.length);
  for (let row = 1; row <= lastRow; row++) {
    for (const column of codeColumns) {
      const address = XLSX.utils.encode_cell({ r: row, c: column });
      sheet[address] = { t: "s", v: rows[row - 1]?.[column] ?? "", z: "@" };
    }
  }
  sheet["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastRow, c: headers.length - 1 } });
  sheet["!cols"] = widths.map(wch => ({ wch }));
  return sheet;
}

export function createManagementStructureWorkbook(areas: ExportArea[], centers: ExportCenter[]): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  const instructions = XLSX.utils.aoa_to_sheet([
    ["REGRA", "ORIENTAÇÃO"],
    ["Estrutura atual", "O arquivo contém os cadastros ativos atuais. Se não houver cadastros, as abas de dados virão vazias."],
    ["Abas", "Não renomeie as abas INSTRUCOES, AREAS_NEGOCIO e CENTROS_CUSTO."],
    ["Cabeçalhos", "Não renomeie os cabeçalhos das duas abas de dados."],
    ["Códigos", "Trate códigos como texto e preserve zeros à esquerda. As linhas 2 a 5001 das colunas de código já estão formatadas como Texto."],
    ["Alterar descrição", "Mantenha o código existente e edite a descrição."],
    ["Alterar Área do Centro", "Mantenha CODIGO_CC e altere CODIGO_AREA."],
    ["Incluir", "Adicione uma nova linha com um novo código."],
    ["Centro de Custo", "Todo Centro de Custo deve informar CODIGO_AREA."],
    ["Área de Negócio", "CODIGO_AREA deve existir na aba AREAS_NEGOCIO ou já estar ativo no sistema."],
    ["Registros ausentes", "Apagar uma linha do Excel não exclui nem desativa o registro no sistema."],
    ["Registros inativos", "Registros inativos não são exportados."],
    ["Alterar código", "Mudar um código existente será interpretado como outro registro, não como renomeação do código."],
    ["Prévia", "A importação mostra uma prévia antes de gravar. Revise os dados e erros antes de confirmar."],
    ["Preenchimento", "Comece na linha 2 das abas de dados e salve como .xlsx. A aba INSTRUCOES é apenas orientativa e pode permanecer no arquivo."],
  ]);
  instructions["!cols"] = [{ wch: 22 }, { wch: 115 }];
  XLSX.utils.book_append_sheet(workbook, instructions, "INSTRUCOES");
  XLSX.utils.book_append_sheet(workbook,
    dataSheet(["CODIGO_AREA", "DESCRICAO_AREA"], areas.map(area => [area.codigo, area.nome]), [0], [26, 55]), "AREAS_NEGOCIO");
  XLSX.utils.book_append_sheet(workbook,
    dataSheet(["CODIGO_CC", "DESCRICAO_CC", "CODIGO_AREA"], centers.map(center => [center.codigo, center.nome, center.codigoArea]), [0, 2], [26, 55, 26]), "CENTROS_CUSTO");
  return XLSX.write(workbook, { bookType: "xlsx", type: "array", compression: true }) as ArrayBuffer;
}
