import { toNumber } from "@/lib/formatters";
import type { LancamentoDTO, StatusAuto } from "@/types";

/**
 * Converte qualquer representação de data (ISO 'YYYY-MM-DD', BR 'DD/MM/YYYY',
 * número serial do Excel ex: 46270, ou objeto Date) para um Date seguro (meio-dia UTC)
 * para campos @db.Date, evitando distorções de fuso horário.
 */
export function parseDateOnly(val?: string | number | Date | null): Date | null {
  if (val === undefined || val === null || val === "") return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;

  const str = String(val).trim();
  if (!str) return null;

  // 1. Número serial do Excel (ex: 46270, "46270", "46270.5")
  if (/^\d{4,6}(\.\d+)?$/.test(str)) {
    const num = parseFloat(str);
    if (!isNaN(num) && num >= 1000 && num <= 100000) {
      // Excel epoch bug: 25569 dias entre 1899-12-30 e 1970-01-01
      const d = new Date(Math.round((num - 25569) * 86400 * 1000));
      if (!isNaN(d.getTime())) {
        const iso = d.toISOString().slice(0, 10);
        return new Date(`${iso}T12:00:00.000Z`);
      }
    }
  }

  // 2. Formato brasileiro DD/MM/AAAA ou DD-MM-AAAA
  const brMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  if (brMatch) {
    const dia = brMatch[1].padStart(2, "0");
    const mes = brMatch[2].padStart(2, "0");
    const ano = brMatch[3];
    return new Date(`${ano}-${mes}-${dia}T12:00:00.000Z`);
  }

  // 3. Formato ISO AAAA-MM-DD
  const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return new Date(`${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T12:00:00.000Z`);
  }

  // 4. Fallback: construtor Date padrão
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    const iso = parsed.toISOString().slice(0, 10);
    return new Date(`${iso}T12:00:00.000Z`);
  }

  return null;
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

