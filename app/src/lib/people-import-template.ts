import * as XLSX from "xlsx";

export const PEOPLE_FILENAME = "pessoas_10s.xlsx";
export const PEOPLE_HEADERS = ["CODIGO_PESSOA", "NOME", "CARGO", "CODIGO_CC", "EMAIL", "TELEFONE"] as const;

export type ExportPerson = { codigo: string; nome: string; cargo: string; codigoCC: string; email: string; telefone: string };

export function createPeopleWorkbook(people: ExportPerson[]): ArrayBuffer {
  const workbook = XLSX.utils.book_new();
  const instructions = XLSX.utils.aoa_to_sheet([
    ["REGRA", "ORIENTAÇÃO"],
    ["Estrutura atual", "O arquivo contém as Pessoas ativas do tenant. Sem cadastros, a aba PESSOAS vem vazia."],
    ["Abas e cabeçalhos", "Não renomeie as abas INSTRUCOES e PESSOAS nem os cabeçalhos da aba PESSOAS."],
    ["Códigos", "Preencha CODIGO_PESSOA e CODIGO_CC como texto. Preserve zeros à esquerda. As linhas 2 a 5001 já estão preparadas como Texto."],
    ["Alterar Pessoa", "Mantenha CODIGO_PESSOA e edite os demais campos permitidos."],
    ["Incluir Pessoa", "Adicione uma linha com novo CODIGO_PESSOA."],
    ["Centro de Custo", "Se informado, CODIGO_CC deve existir e estar ativo no mesmo tenant. Pode ficar vazio."],
    ["Linha removida", "Apagar uma linha não exclui nem desativa a Pessoa no sistema."],
    ["Inativos", "Pessoas inativas não são exportadas. Um código inativo no arquivo impede a importação; não há reativação automática."],
    ["Prévia", "A importação mostra prévia e erros antes de gravar. Havendo erro, nenhuma linha é gravada."],
    ["Campos", "Somente código, nome, cargo, Centro de Custo, email e telefone são importados/exportados. Salário e documento não integram este fluxo."],
  ]);
  instructions["!cols"] = [{ wch: 22 }, { wch: 115 }];
  XLSX.utils.book_append_sheet(workbook, instructions, "INSTRUCOES");

  const rows = people.map(person => [person.codigo, person.nome, person.cargo, person.codigoCC, person.email, person.telefone]);
  const sheet = XLSX.utils.aoa_to_sheet([[...PEOPLE_HEADERS], ...rows]);
  const lastRow = Math.max(5000, rows.length);
  for (let row = 1; row <= lastRow; row++) {
    for (const column of [0, 3]) {
      const address = XLSX.utils.encode_cell({ r: row, c: column });
      sheet[address] = { t: "s", v: rows[row - 1]?.[column] ?? "", z: "@" };
    }
  }
  sheet["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastRow, c: PEOPLE_HEADERS.length - 1 } });
  sheet["!cols"] = [{ wch: 24 }, { wch: 44 }, { wch: 32 }, { wch: 24 }, { wch: 40 }, { wch: 24 }];
  XLSX.utils.book_append_sheet(workbook, sheet, "PESSOAS");
  return XLSX.write(workbook, { bookType: "xlsx", type: "array", compression: true }) as ArrayBuffer;
}
