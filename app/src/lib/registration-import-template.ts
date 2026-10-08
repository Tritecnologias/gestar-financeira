import * as XLSX from "xlsx";

export const REGISTRATION_FILENAME = "cadastros_10s.xlsx";
export const REGISTRATION_HEADERS = [
  "CODIGO", "TIPO_PESSOA", "NOME", "NOME_FANTASIA", "DOCUMENTO", "EMAIL", "TELEFONE", "ENDERECO",
  "CODIGO_CATEGORIA", "CODIGO_CONTA",
] as const;

export type ExportRegistration = {
  codigo: string; tipoPessoa: string; nome: string; nomeFantasia: string; documento: string;
  email: string; telefone: string; endereco: string; codigoCategoria: string; codigoConta: string;
};

function registrationSheet(rows: ExportRegistration[]) {
  const values = rows.map(row => [row.codigo, row.tipoPessoa, row.nome, row.nomeFantasia, row.documento,
    row.email, row.telefone, row.endereco, row.codigoCategoria, row.codigoConta]);
  const sheet = XLSX.utils.aoa_to_sheet([[...REGISTRATION_HEADERS], ...values]);
  const lastRow = Math.max(5000, values.length);
  for (let row = 1; row <= lastRow; row++) {
    for (const column of [0, 8, 9]) {
      const address = XLSX.utils.encode_cell({ r: row, c: column });
      sheet[address] = { t: "s", v: values[row - 1]?.[column] ?? "", z: "@" };
    }
  }
  sheet["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastRow, c: REGISTRATION_HEADERS.length - 1 } });
  sheet["!cols"] = [22, 16, 44, 35, 24, 35, 23, 56, 25, 25].map(wch => ({ wch }));
  return sheet;
}

export function createRegistrationWorkbook(clientes: ExportRegistration[], fornecedores: ExportRegistration[]): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  const instructions = XLSX.utils.aoa_to_sheet([
    ["REGRA", "ORIENTAÇÃO"],
    ["Arquivo único", "As abas CLIENTES e FORNECEDORES pertencem ao tenant atual. Sem cadastros ativos, elas vêm vazias."],
    ["Abas e cabeçalhos", "Não renomeie INSTRUCOES, CLIENTES, FORNECEDORES nem os cabeçalhos."],
    ["Código controlado", "CODIGO é gerado e reservado pelo sistema. Não altere o código de cadastros existentes; para novos cadastros, deixe CODIGO vazio."],
    ["Formato dos códigos", "Trate CODIGO, CODIGO_CATEGORIA e CODIGO_CONTA como texto. Preserve zeros à esquerda. As linhas 2 a 5001 estão preparadas como Texto."],
    ["Tipo de pessoa", "Deixe vazio ou use PF ou PJ."],
    ["Plano de Contas", "Para informar padrão financeiro, preencha juntos CODIGO_CATEGORIA e CODIGO_CONTA. A Conta deve estar ativa, pertencer à Categoria indicada e ao mesmo tenant."],
    ["Classificação opcional", "Deixe ambos os códigos financeiros vazios para não usar classificação padrão. Em cadastro existente, isso limpa o padrão."],
    ["Atualizar", "Mantenha o CODIGO já exportado e altere os demais campos. Código preenchido que não existe no sistema bloqueia a carga."],
    ["Incluir", "Adicione uma linha com CODIGO vazio na aba correspondente. Na confirmação, o sistema gera C0001/C0002... para Clientes e F0001/F0002... para Fornecedores."],
    ["Inativos", "Somente ativos são exportados. Códigos inativos permanecem reservados e não podem ser reutilizados ou reativados por esta carga."],
    ["Ausência", "Apagar uma linha da planilha não exclui nem desativa o cadastro."],
    ["Prévia", "A importação mostra novos, atualizações, sem alteração, avisos e erros. A confirmação revalida as duas abas em uma transação."],
    ["Documentos", "DOCUMENTO é preservado como texto. Não há consulta externa nem regra definitiva de unicidade de CPF/CNPJ nesta fase."],
  ]);
  instructions["!cols"] = [{ wch: 24 }, { wch: 125 }];
  XLSX.utils.book_append_sheet(workbook, instructions, "INSTRUCOES");
  XLSX.utils.book_append_sheet(workbook, registrationSheet(clientes), "CLIENTES");
  XLSX.utils.book_append_sheet(workbook, registrationSheet(fornecedores), "FORNECEDORES");
  return XLSX.write(workbook, { bookType: "xlsx", type: "array", compression: true }) as ArrayBuffer;
}
