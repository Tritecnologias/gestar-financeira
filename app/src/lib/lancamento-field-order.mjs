// Sequência de negócio compartilhada pela apresentação padrão e pelo XLSX oficial.
// Cada superfície exibe apenas os campos que possui: status base no modal/XLSX,
// status automático na tabela, contraparte como códigos no XLSX.
export const LANCAMENTO_FIELD_ORDER = [
  "dataLanc", "descricao", "fantasiaPadrao", "tipo", "categoria", "contaId",
  "valorPrevisto", "dataPagamento", "valor", "statusAuto", "statusManual", "status",
  "dataVencOriginal", "dataVencPlano", "dataEmissao", "dataEvento",
  "banco", "centroCusto", "fornecedor", "statusExtrato", "dre", "cont",
  "anotacao", "referencia",
];
