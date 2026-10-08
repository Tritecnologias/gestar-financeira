import type { calcularFluxoCaixa } from "./cash-flow";

type Resumo = ReturnType<typeof calcularFluxoCaixa>;

/** Falha de rede/API nunca deve ser interpretada como posição financeira zerada. */
export async function lerResumoFluxoCaixa(resposta: Response): Promise<Resumo> {
  if (!resposta.ok) throw new Error("Não foi possível carregar a posição do caixa.");
  const dados: unknown = await resposta.json();
  if (!dados || typeof dados !== "object") throw new Error("O resumo financeiro retornou dados inválidos.");
  const resumo = dados as Partial<Resumo>;
  if (typeof resumo.saldoAnterior?.total !== "string" || typeof resumo.entradas?.total !== "string" ||
    typeof resumo.saidas?.total !== "string" || typeof resumo.saldoPeriodo?.total !== "string" ||
    typeof resumo.saldoFinal?.total !== "string" || !Array.isArray(resumo.serieCaixa) ||
    !Array.isArray(resumo.ultimosLancamentos) || !Array.isArray(resumo.inconsistencias)) {
    throw new Error("O resumo financeiro retornou dados inválidos.");
  }
  return resumo as Resumo;
}
