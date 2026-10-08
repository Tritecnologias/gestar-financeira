import type { calcularFluxoCaixa } from "./cash-flow";

export const CARDS_LANCAMENTO = ["saldoAnterior", "entradas", "saidas", "aReceber", "aPagar", "saldoPeriodo", "saldoFinal"] as const;
export type CardLancamento = typeof CARDS_LANCAMENTO[number];

/** Reuses the exact components classified by the shared cash flow engine. */
export function idsDoCard(resumo: ReturnType<typeof calcularFluxoCaixa>, card: CardLancamento): string[] {
  const componentes = card === "aReceber" ? resumo.previsaoAberta.componentes.filter(item => item.direcao === "ENTRADA")
    : card === "aPagar" ? resumo.previsaoAberta.componentes.filter(item => item.direcao === "SAIDA")
    : resumo[card].componentes;
  return [...new Set(componentes.map(item => item.id))];
}
