import type { Prisma } from "@prisma/client";
import { classificarLancamento, dataCivil, type DataBaseFinanceira } from "./cash-flow";

export const DATA_BASE_FIELDS: Record<DataBaseFinanceira, string> = {
  DATA_LANCAMENTO: "dataLanc",
  DATA_EMISSAO: "dataEmissao",
  VENCIMENTO_ORIGINAL: "dataVencOriginal",
  VENCIMENTO_PLANO: "dataVencPlano",
  REALIZACAO: "dataPagamento",
};

export type LancamentoQuery = {
  dataBase: DataBaseFinanceira;
  inicio: string;
  fim: string;
  busca: string;
  status: string;
  tipo: string;
  statusManual: string;
  categoria: string;
  contaId: string;
  clienteId: string;
  fornecedorId: string;
  centroCusto: string;
  banco: string;
  fornecedor: string;
};

export function lerFiltrosLancamentos(params: URLSearchParams): LancamentoQuery {
  const dataBase = (params.get("dataBase") || "DATA_LANCAMENTO") as DataBaseFinanceira;
  const inicio = params.get("inicio") || params.get("dataInicio") || "";
  const fim = params.get("fim") || params.get("dataFim") || "";
  if (!(dataBase in DATA_BASE_FIELDS) || (inicio && !dataCivil(inicio)) ||
    (fim && !dataCivil(fim)) || (inicio && fim && inicio > fim)) {
    throw new Error("Data-base ou período inválido.");
  }
  return {
    dataBase, inicio, fim,
    busca: (params.get("busca") || "").trim(),
    status: params.get("status") || "",
    tipo: params.get("tipo") || "",
    statusManual: params.get("statusManual") || "",
    categoria: params.get("categoria") || "",
    contaId: params.get("contaId") || "",
    clienteId: params.get("clienteId") || "",
    fornecedorId: params.get("fornecedorId") || "",
    centroCusto: params.get("centroCusto") || "",
    banco: params.get("banco") || "",
    fornecedor: params.get("fornecedor") || "",
  };
}

/** The same tenant-scoped dimension/search selection is used by table, CSV and financial summary. */
export function whereLancamentos(query: LancamentoQuery, tenantId: string, incluirPeriodo: boolean): Prisma.LancamentoWhereInput {
  const conditions: Prisma.LancamentoWhereInput[] = [];
  const where: Prisma.LancamentoWhereInput = { tenantId };
  if (query.tipo) where.tipo = query.tipo;
  if (query.statusManual) where.statusManual = query.statusManual;
  if (query.contaId) where.contaId = query.contaId;
  if (query.clienteId) where.clienteId = query.clienteId;
  if (query.fornecedorId) where.fornecedorId = query.fornecedorId;
  if (query.centroCusto) where.centroCusto = query.centroCusto;
  if (query.banco) where.banco = query.banco;
  if (query.fornecedor) where.fornecedor = { contains: query.fornecedor, mode: "insensitive" };
  if (query.categoria) conditions.push({ OR: [
    { conta: { is: { categoria: { is: { codigo: query.categoria, tenantId } } } } },
    { contaId: null, categoria: query.categoria },
  ] });
  if (query.busca) conditions.push({ OR: [
    { descricao: { contains: query.busca, mode: "insensitive" } },
    { anotacao: { contains: query.busca, mode: "insensitive" } },
    { centroCusto: { contains: query.busca, mode: "insensitive" } },
    { referencia: { contains: query.busca, mode: "insensitive" } },
    { statusManual: { contains: query.busca, mode: "insensitive" } },
    { banco: { contains: query.busca, mode: "insensitive" } },
    { fantasiaPadrao: { contains: query.busca, mode: "insensitive" } },
    { fornecedor: { contains: query.busca, mode: "insensitive" } },
    { clienteRef: { is: { nome: { contains: query.busca, mode: "insensitive" } } } },
    { clienteRef: { is: { nomeFantasia: { contains: query.busca, mode: "insensitive" } } } },
    { fornecedorRef: { is: { nome: { contains: query.busca, mode: "insensitive" } } } },
    { fornecedorRef: { is: { nomeFantasia: { contains: query.busca, mode: "insensitive" } } } },
  ] });
  if (incluirPeriodo && (query.inicio || query.fim)) {
    const dateRange: { gte?: Date; lte?: Date } = {};
    if (query.inicio) dateRange.gte = new Date(`${query.inicio}T00:00:00.000Z`);
    if (query.fim) dateRange.lte = new Date(`${query.fim}T00:00:00.000Z`);
    (where as Record<string, unknown>)[DATA_BASE_FIELDS[query.dataBase]] = dateRange;
  }
  if (conditions.length) where.AND = conditions;
  return where;
}

export function statusCorresponde(row: any, status: string, dataReferencia: string): boolean {
  if (!status) return true;
  return row.status === status || classificarLancamento(row, dataReferencia).status === status;
}

export function hojeSaoPaulo(): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
