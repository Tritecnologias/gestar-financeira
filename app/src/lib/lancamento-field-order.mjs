// Sequência de negócio compartilhada pela apresentação padrão e pelo XLSX oficial.
// Cada superfície exibe apenas os campos que possui: status base no modal/XLSX,
// status automático na tabela, contraparte como códigos no XLSX.
export const LANCAMENTO_FIELD_ORDER = [
  "descricao", "fantasiaPadrao", "tipo", "categoria", "contaId",
  "valorPrevisto", "valor", "dataLanc", "dataEmissao", "dataVencOriginal",
  "dataVencPlano", "dataPagamento", "dataEvento", "status", "statusAuto",
  "statusManual", "fornecedor", "banco", "centroCusto", "dre",
  "statusExtrato", "referencia", "cont", "anotacao",
];
