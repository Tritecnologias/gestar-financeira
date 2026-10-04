import type { Prisma } from "@prisma/client";
import { calcularFluxoCaixa, type FiltrosFinanceiros, type OpcoesFluxoCaixa } from "./cash-flow";

// This service deliberately supplies the authenticated tenant in the query itself.
// The tenant is never accepted from request parameters or from a dimension filter.
export async function obterResumoFluxoCaixa(db: any, options: OpcoesFluxoCaixa) {
  const filters: FiltrosFinanceiros = options.filtros ?? {};
  const where: Prisma.LancamentoWhereInput = { tenantId: options.tenantId };
  for (const key of ["status", "statusManual", "tipo", "contaId", "categoria", "clienteId",
    "fornecedorId", "fornecedor", "centroCusto", "banco", "dre"] as const) {
    // Status financeiro is derived; Categoria N1 comes from the linked Conta N2.
    if (key === "status" || key === "categoria") continue;
    const value = filters[key];
    if (value) (where as Record<string, unknown>)[key] = value;
  }
  const entries = await db.lancamento.findMany({
    where,
    select: {
      id: true, tenantId: true, seq: true, status: true, statusManual: true, tipo: true,
      descricao: true, fantasiaPadrao: true,
      clienteRef: { select: { tenantId: true, nome: true, nomeFantasia: true } },
      fornecedorRef: { select: { tenantId: true, nome: true, nomeFantasia: true } },
      valor: true, valorPrevisto: true, dataLanc: true, dataEmissao: true,
      dataVencOriginal: true, dataVencPlano: true, dataPagamento: true,
      contaId: true, conta: { select: { tipo: true, tenantId: true,
        categoria: { select: { codigo: true, tenantId: true } } } },
      categoria: true, clienteId: true, fornecedorId: true, fornecedor: true,
      centroCusto: true, banco: true, dre: true,
    },
  });
  return calcularFluxoCaixa(entries, options);
}
