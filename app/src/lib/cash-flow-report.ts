import { Prisma } from "@prisma/client";
import type { ComponenteFinanceiro, calcularFluxoCaixa } from "./cash-flow";
import { segundaDaSemana, somarDias } from "./cash-flow-calendar.js";
export { segundaDaSemana, somarDias } from "./cash-flow-calendar.js";

type Resumo = ReturnType<typeof calcularFluxoCaixa>;
export type MedidaRelatorio = "REALIZADO" | "PREVISTO";
const zero = new Prisma.Decimal(0);

function agregar(componentes: ComponenteFinanceiro[]) {
  let entradas = zero;
  let saidas = zero;
  for (const item of componentes) {
    const valor = new Prisma.Decimal(item.valor);
    if (item.direcao === "ENTRADA") entradas = entradas.plus(valor);
    else saidas = saidas.plus(valor);
  }
  return { entradas: entradas.toFixed(2), saidas: saidas.toFixed(2),
    resultado: entradas.minus(saidas).toFixed(2), quantidade: componentes.length, componentes };
}

/** Projects the shared financial contract into two complete Monday–Sunday weeks. */
export function montarRelatorio14Dias(resumo: Resumo, medida: MedidaRelatorio) {
  const inicio = resumo.periodo.inicio;
  const fim = somarDias(inicio, 13);
  if (inicio !== segundaDaSemana(inicio) || resumo.periodo.fim !== fim) {
    throw new Error("O relatório exige duas semanas completas de segunda a domingo.");
  }
  const componentes = medida === "REALIZADO"
    ? resumo.realizado.componentes : resumo.consulta.previsto.componentes;
  const porDia = new Map<string, ComponenteFinanceiro[]>();
  for (const item of componentes) {
    if (!porDia.has(item.data)) porDia.set(item.data, []);
    porDia.get(item.data)!.push(item);
  }
  let acumulado = new Prisma.Decimal(resumo.saldoAnterior.total);
  const dias = Array.from({ length: 14 }, (_, indice) => {
    const data = somarDias(inicio, indice);
    const agregado = agregar(porDia.get(data) || []);
    acumulado = acumulado.plus(new Prisma.Decimal(agregado.resultado));
    return { data, ...agregado, saldoAcumulado: acumulado.toFixed(2) };
  });
  const semanas = [0, 1].map(indice => {
    const recorte = dias.slice(indice * 7, indice * 7 + 7);
    return { inicio: recorte[0].data, fim: recorte[6].data,
      ...agregar(recorte.flatMap(dia => dia.componentes)), dias: recorte };
  });
  return { medida, dataBase: resumo.consulta.dataBase, inicio, fim,
    saldoAnterior: resumo.saldoAnterior.total, dias, semanas,
    inconsistencias: resumo.inconsistencias };
}
