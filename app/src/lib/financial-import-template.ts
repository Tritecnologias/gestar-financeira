import * as XLSX from "xlsx";

export const FINANCIAL_STRUCTURE_FILENAME = "estrutura_financeira_10s.xlsx";
export type ExportCategory = { codigo: string; nome: string };
export type ExportAccount = { codigo: string; descricao: string; codigoCategoria: string; tipo: string };

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

export function createFinancialStructureWorkbook(categories: ExportCategory[], accounts: ExportAccount[]): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  const instructions = XLSX.utils.aoa_to_sheet([
    ["REGRA", "ORIENTAÇÃO"],
    ["Estrutura atual", "O arquivo contém os cadastros ativos. Sem cadastros, as abas virão vazias."],
    ["Abas e cabeçalhos", "Não renomeie as abas nem os cabeçalhos."],
    ["Códigos", "Trate códigos como texto e preserve zeros à esquerda. As linhas 2 a 5001 das colunas de código estão formatadas como Texto."],
    ["Categoria N1", "Uma Categoria pode existir sem Conta."],
    ["Categoria N1 nova", "Informe manualmente um código numérico de exatamente 2 dígitos. A sequência é livre; o código deve ser único no tenant."],
    ["Conta N2 nova", "Use CODIGO_CATEGORIA.sequencial com no mínimo 2 dígitos no sequencial. Toda Conta exige Categoria ativa no sistema ou válida neste arquivo."],
    ["TIPO_CONTA", "Use exatamente RECEITA, DESPESA ou TRANSFERENCIA."],
    ["Alterar", "Mantenha o código existente e edite a descrição ou o tipo. Contas com código estrutural não podem mudar de Categoria na importação comum."],
    ["Incluir", "Adicione uma linha com código novo."],
    ["Inativos", "Registros inativos não são exportados e seus códigos não podem ser reutilizados pela importação."],
    ["Linhas ausentes", "Remover uma linha não exclui nem desativa o cadastro no sistema."],
    ["Alterar código", "Um código alterado é tratado como novo registro, não como renomeação."],
    ["Prévia", "A importação mostra prévia e erros antes de gravar. A confirmação revalida e grava tudo em uma transação."],
  ]);
  instructions["!cols"] = [{ wch: 22 }, { wch: 115 }];
  XLSX.utils.book_append_sheet(workbook, instructions, "INSTRUCOES");
  XLSX.utils.book_append_sheet(workbook,
    dataSheet(["CODIGO_CATEGORIA", "DESCRICAO_CATEGORIA"], categories.map(cat => [cat.codigo, cat.nome]), [0], [26, 55]), "CATEGORIAS_N1");
  XLSX.utils.book_append_sheet(workbook,
    dataSheet(["CODIGO_CONTA", "DESCRICAO_CONTA", "CODIGO_CATEGORIA", "TIPO_CONTA"], accounts.map(account => [account.codigo, account.descricao, account.codigoCategoria, account.tipo]), [0, 2], [26, 55, 26, 22]), "CONTAS_N2");
  return XLSX.write(workbook, { bookType: "xlsx", type: "array", compression: true }) as ArrayBuffer;
}
