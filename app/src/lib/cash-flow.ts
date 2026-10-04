import { Prisma } from "@prisma/client";

export type DataBaseFinanceira =
  | "DATA_LANCAMENTO"
  | "DATA_EMISSAO"
  | "VENCIMENTO_ORIGINAL"
  | "VENCIMENTO_PLANO"
  | "REALIZACAO";

export type StatusFinanceiro =
  | "CANCELADO"
  | "REALIZADO"
  | "ATRASADO"
  | "A VENCER"
  | "PREVISTO"
  | "INCONSISTENTE";

export type LancamentoFinanceiro = {
  id: string;
  tenantId: string;
  seq?: number;
  status: string;
  statusManual?: string | null;
  tipo: string;
  valor: Prisma.Decimal | string | number;
  valorPrevisto?: Prisma.Decimal | string | number | null;
  dataLanc: Date | string;
  dataEmissao?: Date | string | null;
  dataVencOriginal?: Date | string | null;
  dataVencPlano?: Date | string | null;
  dataPagamento?: Date | string | null;
  contaId?: string | null;
  conta?: { tipo: string; tenantId: string; categoria?: { codigo: string; tenantId: string } | null } | null;
  categoria?: string | null;
  clienteId?: string | null;
  fornecedorId?: string | null;
  fornecedor?: string | null;
  centroCusto?: string | null;
  banco?: string | null;
  dre?: string | null;
};

export type FiltrosFinanceiros = Partial<Pick<LancamentoFinanceiro,
  "status" | "statusManual" | "tipo" | "contaId" | "categoria" | "clienteId" |
  "fornecedorId" | "fornecedor" | "centroCusto" | "banco" | "dre">>;

export type ComponenteFinanceiro = {
  id: string;
  data: string;
  direcao: "ENTRADA" | "SAIDA";
  valor: string;
  valorAssinado: string;
  operacional: boolean;
};

type GrupoFinanceiro = {
  entradas: string;
  saidas: string;
  saldo: string;
  componentes: ComponenteFinanceiro[];
};

const ZERO = new Prisma.Decimal(0);
const DATA_FIELDS: Record<DataBaseFinanceira, keyof LancamentoFinanceiro> = {
  DATA_LANCAMENTO: "dataLanc",
  DATA_EMISSAO: "dataEmissao",
  VENCIMENTO_ORIGINAL: "dataVencOriginal",
  VENCIMENTO_PLANO: "dataVencPlano",
  REALIZACAO: "dataPagamento",
};

export function dataCivil(value: Date | string | null | undefined): string | null {
  if (value == null || value === "") return null;
  const text = value instanceof Date ? (Number.isNaN(value.getTime()) ? "" : value.toISOString().slice(0, 10)) : value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const [year, month, day] = text.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day ? text : null;
}

function decimal(value: Prisma.Decimal | string | number | null | undefined): Prisma.Decimal | null {
  if (value == null || value === "") return null;
  try {
    const result = new Prisma.Decimal(value);
    return result.isFinite() ? result : null;
  } catch {
    return null;
  }
}

function positive(value: Prisma.Decimal | string | number | null | undefined): Prisma.Decimal | null {
  const result = decimal(value);
  return result?.greaterThan(ZERO) ? result : null;
}

function money(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

export function dataDaBase(entry: LancamentoFinanceiro, base: DataBaseFinanceira): string | null {
  return dataCivil(entry[DATA_FIELDS[base]] as Date | string | null | undefined);
}

export function problemaContaDirecao(entry: LancamentoFinanceiro): string | null {
  if (!entry.contaId) return null;
  if (!entry.conta) return "CONTA_VINCULADA_INEXISTENTE";
  if (entry.conta.tenantId !== entry.tenantId) return "CONTA_DE_OUTRO_TENANT";
  return problemaTipoConta(entry.conta.tipo, entry.tipo);
}

export function problemaTipoConta(tipoConta: string, direcao: string): string | null {
  if (tipoConta === "TRANSFERENCIA") return "TRANSFERENCIA_SEM_PAREAMENTO";
  if (tipoConta === "RECEITA" && direcao !== "ENTRADA") return "RECEITA_COM_SAIDA";
  if (tipoConta === "DESPESA" && direcao !== "SAIDA") return "DESPESA_COM_ENTRADA";
  return null;
}

export function classificarLancamento(entry: LancamentoFinanceiro, dataReferencia: string) {
  const problemas: string[] = [];
  const realizadoEm = dataCivil(entry.dataPagamento);
  const previstoPara = dataCivil(entry.dataVencPlano);
  const valorReal = positive(entry.valor);
  const valorPlano = positive(entry.valorPrevisto);
  const direcaoValida = entry.tipo === "ENTRADA" || entry.tipo === "SAIDA";
  const problemaConta = problemaContaDirecao(entry);
  if (problemaConta) problemas.push(problemaConta);
  if (!direcaoValida) problemas.push("DIRECAO_INVALIDA");
  if (entry.dataPagamento != null && !realizadoEm) problemas.push("DATA_REALIZACAO_INVALIDA");
  if (entry.valorPrevisto != null && !valorPlano) problemas.push("VALOR_PREVISTO_INVALIDO");
  if (entry.dataVencPlano != null && !previstoPara) problemas.push("VENCIMENTO_PLANO_INVALIDO");

  if (entry.status === "cancelado") {
    if (realizadoEm) problemas.push("CANCELADO_COM_REALIZACAO");
    return { status: "CANCELADO" as StatusFinanceiro, problemas, realizadoEm, previstoPara,
      valorRealizado: null, valorPrevisto: null, previsaoAberta: false };
  }

  if (entry.status === "realizado") {
    if (!realizadoEm) problemas.push("REALIZADO_SEM_DATA");
    if (!valorReal) problemas.push("VALOR_REALIZADO_INVALIDO");
    const valido = Boolean(realizadoEm && valorReal && direcaoValida);
    return { status: valido && !problemaConta ? "REALIZADO" as StatusFinanceiro : "INCONSISTENTE" as StatusFinanceiro,
      problemas, realizadoEm, previstoPara,
      valorRealizado: valido ? valorReal : null,
      valorPrevisto: direcaoValida && previstoPara && valorPlano ? valorPlano : null,
      previsaoAberta: false };
  }

  if (entry.status === "previsto") {
    if (realizadoEm) problemas.push("PREVISTO_COM_REALIZACAO");
    if (!valorPlano) problemas.push("PREVISTO_SEM_VALOR");
    if (!previstoPara) problemas.push("PREVISTO_SEM_VENCIMENTO");
    if (entry.statusManual === "PAGO") problemas.push("STATUS_MANUAL_PAGO_SEM_REALIZACAO");
    const valido = Boolean(!realizadoEm && valorPlano && direcaoValida);
    const status: StatusFinanceiro = !valido || problemaConta
      ? "INCONSISTENTE"
      : !previstoPara ? "PREVISTO" : previstoPara < dataReferencia ? "ATRASADO" : "A VENCER";
    return { status, problemas, realizadoEm, previstoPara, valorRealizado: null,
      valorPrevisto: direcaoValida && previstoPara ? valorPlano : null,
      previsaoAberta: valido && !problemaConta && Boolean(previstoPara) };
  }

  problemas.push("STATUS_FINANCEIRO_INVALIDO");
  return { status: "INCONSISTENTE" as StatusFinanceiro, problemas, realizadoEm, previstoPara,
    valorRealizado: null, valorPrevisto: null, previsaoAberta: false };
}

function matches(entry: LancamentoFinanceiro, tenantId: string, filtros: FiltrosFinanceiros,
  statusDerivado: StatusFinanceiro): boolean {
  if (entry.tenantId !== tenantId) return false;
  return (Object.keys(filtros) as (keyof FiltrosFinanceiros)[]).every(key => {
    if (filtros[key] == null || filtros[key] === "") return true;
    if (key === "status") return entry.status === filtros.status || statusDerivado === filtros.status;
    if (key === "categoria") {
      const official = entry.contaId && entry.conta?.categoria?.tenantId === tenantId
        ? entry.conta.categoria.codigo : entry.categoria;
      return official === filtros.categoria;
    }
    return entry[key] === filtros[key];
  });
}

function component(entry: LancamentoFinanceiro, date: string, value: Prisma.Decimal): ComponenteFinanceiro {
  const signed = entry.tipo === "ENTRADA" ? value : value.negated();
  return { id: entry.id, data: date, direcao: entry.tipo as "ENTRADA" | "SAIDA",
    valor: money(value), valorAssinado: money(signed),
    operacional: entry.conta?.tipo !== "TRANSFERENCIA" };
}

function group(components: ComponenteFinanceiro[]): GrupoFinanceiro {
  let entradas = ZERO;
  let saidas = ZERO;
  for (const item of components) {
    const value = new Prisma.Decimal(item.valor);
    if (item.direcao === "ENTRADA") entradas = entradas.plus(value);
    else saidas = saidas.plus(value);
  }
  return { entradas: money(entradas), saidas: money(saidas), saldo: money(entradas.minus(saidas)), componentes: components };
}

export type OpcoesFluxoCaixa = {
  tenantId: string;
  inicio: string;
  fim: string;
  dataReferencia: string;
  dataBase?: DataBaseFinanceira;
  filtros?: FiltrosFinanceiros;
};

/** Pure financial contract: every summary, date group and drill-down comes from the same entries. */
export function calcularFluxoCaixa(entries: readonly LancamentoFinanceiro[], options: OpcoesFluxoCaixa) {
  const { tenantId, inicio, fim, dataReferencia, dataBase = "REALIZACAO", filtros = {} } = options;
  if (!tenantId || !dataCivil(inicio) || !dataCivil(fim) || !dataCivil(dataReferencia) || inicio > fim) {
    throw new Error("Período, data de referência ou tenant inválido.");
  }
  const saldoAnterior: ComponenteFinanceiro[] = [];
  const periodo: ComponenteFinanceiro[] = [];
  const previstoHistorico: ComponenteFinanceiro[] = [];
  const previsaoAberta: ComponenteFinanceiro[] = [];
  const consultaRealizado: ComponenteFinanceiro[] = [];
  const consultaPrevisto: ComponenteFinanceiro[] = [];
  const inconsistencias: { id: string; problemas: string[] }[] = [];
  const classificacoes: { id: string; status: StatusFinanceiro; realizado: boolean;
    previstoHistorico: boolean; previsaoAberta: boolean }[] = [];
  const variacoes: { id: string; previsto: string; realizado: string; diferenca: string; aberto: string }[] = [];

  for (const entry of entries) {
    if (entry.tenantId !== tenantId) continue;
    const classified = classificarLancamento(entry, dataReferencia);
    if (!matches(entry, tenantId, filtros, classified.status)) continue;
    classificacoes.push({ id: entry.id, status: classified.status,
      realizado: Boolean(classified.valorRealizado), previstoHistorico: Boolean(classified.valorPrevisto),
      previsaoAberta: classified.previsaoAberta });
    if (classified.problemas.length) inconsistencias.push({ id: entry.id, problemas: classified.problemas });
    const baseDate = dataDaBase(entry, dataBase);
    if (classified.valorRealizado && classified.realizadoEm) {
      const item = component(entry, classified.realizadoEm, classified.valorRealizado);
      if (classified.realizadoEm < inicio) saldoAnterior.push(item);
      else if (classified.realizadoEm <= fim) periodo.push(item);
      if (baseDate && baseDate >= inicio && baseDate <= fim) consultaRealizado.push(component(entry, baseDate, classified.valorRealizado));
    }
    if (classified.valorPrevisto && classified.previstoPara) {
      if (classified.previstoPara >= inicio && classified.previstoPara <= fim) {
        const item = component(entry, classified.previstoPara, classified.valorPrevisto);
        previstoHistorico.push(item);
        if (classified.previsaoAberta) previsaoAberta.push(item);
      }
      if (baseDate && baseDate >= inicio && baseDate <= fim) {
        consultaPrevisto.push(component(entry, baseDate, classified.valorPrevisto));
      }
      if (classified.valorRealizado && classified.realizadoEm &&
        classified.realizadoEm >= inicio && classified.realizadoEm <= fim) {
        const signedPlan = entry.tipo === "ENTRADA" ? classified.valorPrevisto : classified.valorPrevisto.negated();
        const signedReal = entry.tipo === "ENTRADA" ? classified.valorRealizado : classified.valorRealizado.negated();
        variacoes.push({ id: entry.id, previsto: money(signedPlan), realizado: money(signedReal),
          diferenca: money(signedReal.minus(signedPlan)), aberto: "0.00" });
      }
    }
  }

  const opening = group(saldoAnterior);
  const movements = group(periodo);
  const closing = group([...saldoAnterior, ...periodo]);
  const entradas = group(periodo.filter(item => item.direcao === "ENTRADA"));
  const saidas = group(periodo.filter(item => item.direcao === "SAIDA"));
  const groupByDay = (items: ComponenteFinanceiro[]) => {
    const days = new Map<string, ComponenteFinanceiro[]>();
    for (const item of items) {
      if (!days.has(item.data)) days.set(item.data, []);
      days.get(item.data)!.push(item);
    }
    return [...days.entries()].sort(([left], [right]) => left.localeCompare(right))
      .map(([data, parts]) => ({ data, ...group(parts) }));
  };

  return {
    periodo: { inicio, fim, dataReferencia },
    filtros,
    saldoAnterior: { total: opening.saldo, componentes: saldoAnterior },
    entradas: { total: entradas.entradas, componentes: entradas.componentes },
    saidas: { total: saidas.saidas, componentes: saidas.componentes },
    saldoPeriodo: { total: movements.saldo, componentes: periodo },
    saldoFinal: { total: closing.saldo, componentes: closing.componentes },
    realizado: movements,
    operacional: group(periodo.filter(item => item.operacional)),
    previstoHistorico: group(previstoHistorico),
    previsaoAberta: group(previsaoAberta),
    variacoes,
    consulta: { dataBase, realizado: group(consultaRealizado), previsto: group(consultaPrevisto),
      realizadoPorData: groupByDay(consultaRealizado), previstoPorData: groupByDay(consultaPrevisto) },
    inconsistencias,
    classificacoes,
  };
}
