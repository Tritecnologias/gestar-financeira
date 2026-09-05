import { toNumber } from "@/lib/formatters";
import type { LancamentoDTO, StatusAuto } from "@/types";

/**
 * Converte string 'YYYY-MM-DD' para objeto Date seguro (meio-dia UTC)
 * evitando distorções de fuso horário em campos @db.Date.
 */
export function parseDateOnly(val?: string | Date | null): Date | null {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  const str = String(val).trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return null;
  return new Date(`${str}T12:00:00.000Z`);
}

/**
 * Calcula campos derivados de um lançamento
 */
export function calcularCamposDerivados(l: any): Partial<LancamentoDTO> {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const diasAtrasoOriginal = l.dataVencOriginal && !l.dataPagamento
    ? Math.floor((hoje.getTime() - new Date(l.dataVencOriginal).getTime()) / 86400000)
    : 0;

  const diasAtrasoPlano = l.dataVencPlano && !l.dataPagamento
    ? Math.floor((hoje.getTime() - new Date(l.dataVencPlano).getTime()) / 86400000)
    : 0;

  const getRangeAtraso = (dias: number, pago: boolean): string => {
    if (pago)             return "Pago";
    if (!l.dataVencPlano) return "Sem venc.";
    if (dias <= 0)        return "No prazo";
    if (dias <= 30)       return "01-30 dias";
    if (dias <= 60)       return "31-60 dias";
    if (dias <= 90)       return "61-90 dias";
    return "90+ dias";
  };

  const getStatusAuto = (): StatusAuto => {
    if (l.dataPagamento && l.valor > 0) return "PAGO";
    if (l.dataVencPlano && new Date(l.dataVencPlano) < hoje && !l.dataPagamento) return "ATRASADO";
    if (l.dataVencPlano && new Date(l.dataVencPlano) >= hoje && !l.dataPagamento) return "A VENCER";
    return "PREVISTO";
  };

  const vencPlano = l.dataVencPlano ? new Date(l.dataVencPlano) : null;
  const emissao   = l.dataEmissao   ? new Date(l.dataEmissao)   : null;
  const pago = !!l.dataPagamento;

  return {
    diasAtrasoOriginal,
    diasAtrasoPlano,
    rangeAtraso:   getRangeAtraso(diasAtrasoPlano, pago),
    statusAuto:    getStatusAuto(),
    vencA:  vencPlano ? vencPlano.getFullYear() : null,
    vencM:  vencPlano ? vencPlano.getMonth() + 1 : null,
    vencD:  vencPlano ? vencPlano.getDate() : null,
    vencAM: vencPlano ? `${String(vencPlano.getFullYear()).slice(2)}_${String(vencPlano.getMonth() + 1).padStart(2, "0")}` : null,
    emissaoAM: emissao ? `${String(emissao.getFullYear()).slice(2)}_${String(emissao.getMonth() + 1).padStart(2, "0")}` : null,
  };
}

/**
 * Converte registro do Prisma para o formato padronizado LancamentoDTO
 */
export function toLancamentoDTO(l: any, seq?: number): LancamentoDTO {
  const derivados = calcularCamposDerivados(l);
  const fmt = (d: Date | string | null | undefined) => {
    if (!d) return null;
    if (typeof d === "string") return d.slice(0, 10);
    return d.toISOString().split("T")[0];
  };

  return {
    id:               l.id,
    seq:              l.seq ?? seq ?? 0,
    tenantId:         "", // Não expor internamente
    dataLanc:         fmt(l.dataLanc)!,
    dataEmissao:      fmt(l.dataEmissao),
    dataVencOriginal: fmt(l.dataVencOriginal),
    dataVencPlano:    fmt(l.dataVencPlano),
    dataEvento:       fmt(l.dataEvento),
    dataPagamento:    fmt(l.dataPagamento),
    valor:            toNumber(l.valor),
    valorPrevisto:    l.valorPrevisto ? toNumber(l.valorPrevisto) : null,
    banco:            l.banco ?? null,
    tipo:             l.tipo,
    status:           l.status,
    statusManual:     l.statusManual ?? null,
    statusExtrato:    l.statusExtrato ?? null,
    statusAuto:       (derivados.statusAuto ?? "PREVISTO") as StatusAuto,
    descricao:        l.descricao,
    fornecedor:       l.fornecedor ?? null,
    fornecedorId:     l.fornecedorId ?? null,
    fantasiaPadrao:   l.fornecedorRef ? `${l.fornecedorRef.codigo} – ${l.fornecedorRef.nome}` : (l.fantasiaPadrao ?? null),
    centroCusto:      l.centroCusto ?? null,
    referencia:       l.referencia ?? null,
    contaId:          l.contaId ?? null,
    categoria:        l.categoria ?? null,
    dre:              l.dre ?? null,
    cont:             l.cont ?? null,
    anotacao:         l.anotacao ?? null,
    diasAtrasoOriginal: derivados.diasAtrasoOriginal ?? 0,
    diasAtrasoPlano:    derivados.diasAtrasoPlano    ?? 0,
    rangeAtraso:        derivados.rangeAtraso        ?? "Sem venc.",
    vencA:            derivados.vencA  ?? null,
    vencM:            derivados.vencM  ?? null,
    vencD:            derivados.vencD  ?? null,
    vencAM:           derivados.vencAM ?? null,
    emissaoAM:        derivados.emissaoAM ?? null,
    criadoEm:         l.criadoEm instanceof Date ? l.criadoEm.toISOString() : (l.criadoEm ?? new Date().toISOString()),
  };
}

