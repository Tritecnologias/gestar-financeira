import * as XLSX from "xlsx";

export const MANAGEMENT_TEMPLATE_FILENAME = "modelo_estrutura_gerencial_10s.xlsx";

// Deixa as linhas mais usuais prontas para códigos como 00123 sem criar registros.
const TEXT_ROWS = 5000;

function dataSheet(headers: string[], codeColumns: number[], widths: number[]): XLSX.WorkSheet {
  const sheet = XLSX.utils.aoa_to_sheet([headers]);
  for (let row = 1; row <= TEXT_ROWS; row++) {
    for (const column of codeColumns) {
      sheet[XLSX.utils.encode_cell({ r: row, c: column })] = { t: "s", v: "", z: "@" };
    }
  }
  sheet["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: TEXT_ROWS, c: headers.length - 1 } });
  sheet["!cols"] = widths.map(wch => ({ wch }));
  return sheet;
}

export function createManagementImportTemplate(): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  const instructions = XLSX.utils.aoa_to_sheet([
    ["REGRA", "ORIENTAÇÃO"],
    ["Abas", "Não renomeie as abas AREAS_NEGOCIO e CENTROS_CUSTO."],
    ["Cabeçalhos", "Não renomeie os cabeçalhos das duas abas de dados."],
    ["Códigos", "Preencha códigos como texto e preserve zeros à esquerda. As linhas 2 a 5001 das colunas de código já estão formatadas como Texto."],
    ["Centro de Custo", "Todo Centro de Custo deve informar CODIGO_AREA."],
    ["Área de Negócio", "CODIGO_AREA deve existir na aba AREAS_NEGOCIO ou já estar ativo no sistema."],
    ["Registros ausentes", "Registros que não aparecem na planilha não são excluídos nem desativados."],
    ["Prévia", "A importação mostra uma prévia antes de gravar. Revise os dados e erros antes de confirmar."],
    ["Preenchimento", "Comece na linha 2 das abas de dados e salve como .xlsx. A aba INSTRUCOES é apenas orientativa e pode permanecer no arquivo."],
  ]);
  instructions["!cols"] = [{ wch: 22 }, { wch: 115 }];
  XLSX.utils.book_append_sheet(workbook, instructions, "INSTRUCOES");
  XLSX.utils.book_append_sheet(workbook,
    dataSheet(["CODIGO_AREA", "DESCRICAO_AREA"], [0], [26, 55]), "AREAS_NEGOCIO");
  XLSX.utils.book_append_sheet(workbook,
    dataSheet(["CODIGO_CC", "DESCRICAO_CC", "CODIGO_AREA"], [0, 2], [26, 55, 26]), "CENTROS_CUSTO");
  return XLSX.write(workbook, { bookType: "xlsx", type: "array", compression: true }) as ArrayBuffer;
}
