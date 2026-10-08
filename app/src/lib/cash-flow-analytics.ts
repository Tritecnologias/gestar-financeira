import { Prisma } from "@prisma/client";
import type { ComponenteFinanceiro, calcularFluxoCaixa } from "./cash-flow";
import { somarDias } from "./cash-flow-calendar.js";

type Resumo = ReturnType<typeof calcularFluxoCaixa>;
export type VisaoAnalise = "DUAS_SEMANAS" | "MENSAL";
export type MedidaAnalise = "REALIZADO" | "PREVISTO" | "COMPARAR";
const zero = new Prisma.Decimal(0);

function agregar(itens: ComponenteFinanceiro[]) {
  let entradas = zero, saidas = zero;
  for (const item of itens) {
    const valor = new Prisma.Decimal(item.valor);
    if (item.direcao === "ENTRADA") entradas = entradas.plus(valor);
    else saidas = saidas.plus(valor);
  }
  return { entradas: entradas.toFixed(2), saidas: saidas.toFixed(2),
    resultado: entradas.minus(saidas).toFixed(2), quantidade: itens.length, componentes: itens };
}

function composicao(itens: ComponenteFinanceiro[], direcao: "ENTRADA" | "SAIDA") {
  const operacionais = itens.filter(item => item.direcao === direcao && item.operacional);
  const oficiais = operacionais.filter(item => item.categoriaId && item.contaId);
  const categorias = new Map<string, ComponenteFinanceiro[]>();
  for (const item of oficiais) {
    const chave = item.categoriaId!;
    if (!categorias.has(chave)) categorias.set(chave, []);
    categorias.get(chave)!.push(item);
  }
  const linhas = [...categorias.entries()].map(([categoriaId, partes]) => {
    const contas = new Map<string, ComponenteFinanceiro[]>();
    for (const item of partes) {
      const chave = item.contaId!;
      if (!contas.has(chave)) contas.set(chave, []);
      contas.get(chave)!.push(item);
    }
    const contaN2 = [...contas.entries()].map(([contaId, componentes]) => ({ contaId,
      nome: componentes[0].contaN2 || "Conta N2", ...agregar(componentes) }))
      .sort((a, b) => new Prisma.Decimal(b[direcao === "ENTRADA" ? "entradas" : "saidas"])
        .comparedTo(new Prisma.Decimal(a[direcao === "ENTRADA" ? "entradas" : "saidas"])));
    return { categoriaId, nome: partes[0].categoriaN1 || "Categoria N1", ...agregar(partes), contas: contaN2 };
  }).sort((a, b) => new Prisma.Decimal(b[direcao === "ENTRADA" ? "entradas" : "saidas"])
    .comparedTo(new Prisma.Decimal(a[direcao === "ENTRADA" ? "entradas" : "saidas"])));
  const semClassificacao = agregar(operacionais.filter(item => !item.categoriaId || !item.contaId));
  const transferencias = agregar(itens.filter(item => item.direcao === direcao && !item.operacional));
  return { categorias: linhas, semClassificacao, transferencias };
}

/** Analytical projection of the existing motor: no financial status or value is reclassified here. */
export function montarAnalisesFluxoCaixa(resumo: Resumo, visao: VisaoAnalise, medida: MedidaAnalise) {
  const { inicio, fim } = resumo.periodo;
  const realizado = resumo.realizado.componentes;
  const previsto = resumo.consulta.previsto.componentes;
  const periodoRealizado = agregar(realizado);
  const periodoPrevisto = agregar(previsto);
  const variacao = {
    entradas: new Prisma.Decimal(periodoRealizado.entradas).minus(periodoPrevisto.entradas).toFixed(2),
    saidas: new Prisma.Decimal(periodoRealizado.saidas).minus(periodoPrevisto.saidas).toFixed(2),
    resultado: new Prisma.Decimal(periodoRealizado.resultado).minus(periodoPrevisto.resultado).toFixed(2),
  };
  const porDiaReal = new Map<string, ComponenteFinanceiro[]>();
  const porDiaPrevisto = new Map<string, ComponenteFinanceiro[]>();
  for (const [partes, indice] of [[realizado, porDiaReal], [previsto, porDiaPrevisto]] as const) {
    for (const item of partes) {
      if (!indice.has(item.data)) indice.set(item.data, []);
      indice.get(item.data)!.push(item);
    }
  }
  let saldoReal = new Prisma.Decimal(resumo.saldoAnterior.total);
  let acumuladoPrevisto = zero;
  let comparativoReal = zero;
  const dias = [];
  for (let data = inicio; data <= fim; data = somarDias(data, 1)) {
    const real = agregar(porDiaReal.get(data) || []);
    const plano = agregar(porDiaPrevisto.get(data) || []);
    saldoReal = saldoReal.plus(real.resultado);
    comparativoReal = comparativoReal.plus(real.resultado);
    acumuladoPrevisto = acumuladoPrevisto.plus(plano.resultado);
    dias.push({ data, realizado: real, previsto: plano,
      variacao: new Prisma.Decimal(real.resultado).minus(plano.resultado).toFixed(2),
      saldoRealAcumulado: saldoReal.toFixed(2),
      resultadoRealAcumulado: comparativoReal.toFixed(2),
      resultadoPrevistoAcumulado: acumuladoPrevisto.toFixed(2) });
  }
  const composicaoMedida = medida === "PREVISTO" ? previsto : realizado;
  return { visao, medida, inicio, fim, dataBasePrevisto: resumo.consulta.dataBase,
    saldoAnterior: resumo.saldoAnterior.total, saldoFinal: saldoReal.toFixed(2),
    realizado: periodoRealizado, previsto: periodoPrevisto, variacao, dias,
    composicao: { medida: (medida === "PREVISTO" ? "PREVISTO" : "REALIZADO") as "PREVISTO" | "REALIZADO",
      entradas: composicao(composicaoMedida, "ENTRADA"),
      saidas: composicao(composicaoMedida, "SAIDA") },
    inconsistencias: resumo.inconsistencias };
}
