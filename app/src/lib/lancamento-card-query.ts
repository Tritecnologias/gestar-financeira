import { obterResumoFluxoCaixa } from "./cash-flow-service";
import { idsDoCard, type CardLancamento } from "./lancamento-card-filter";
import { type LancamentoQuery, whereLancamentos } from "./lancamento-filters";

export async function consultarIdsDoCard(db: any, query: LancamentoQuery,
  tenantId: string, card: CardLancamento, hoje: string): Promise<string[]> {
  const resumo = await obterResumoFluxoCaixa(db, {
    tenantId, inicio: query.inicio || "1900-01-01", fim: query.fim || hoje,
    dataReferencia: hoje, dataBase: query.dataBase,
    filtros: { status: query.status, statusManual: query.statusManual, tipo: query.tipo,
      contaId: query.contaId, categoria: query.categoria, clienteId: query.clienteId,
      fornecedorId: query.fornecedorId, centroCusto: query.centroCusto, banco: query.banco },
  }, whereLancamentos(query, tenantId, false));
  return idsDoCard(resumo, card);
}
