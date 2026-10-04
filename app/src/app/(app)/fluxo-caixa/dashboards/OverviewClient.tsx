"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { calcularFluxoCaixa, ComponenteFinanceiro } from "@/lib/cash-flow";
import { lerResumoFluxoCaixa } from "@/lib/cash-flow-response";

type Resumo = ReturnType<typeof calcularFluxoCaixa>;
type Kpi = "saldoAnterior" | "entradas" | "saidas" | "saldoPeriodo" | "saldoFinal";
type Periodo = { modo: "atual" | "anterior" | "proximo" | "personalizado"; inicio: string; fim: string };
const formatador = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dinheiro = (valor: string) => formatador.format(Number(valor));
const dataBR = (data: string) => data ? `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)}` : "—";

function mes(hoje: string, deslocamento: number): Periodo {
  const [ano, numero] = hoje.split("-").map(Number);
  const inicio = new Date(Date.UTC(ano, numero - 1 + deslocamento, 1)).toISOString().slice(0, 10);
  const fim = new Date(Date.UTC(ano, numero + deslocamento, 0)).toISOString().slice(0, 10);
  return { modo: deslocamento === 0 ? "atual" : deslocamento < 0 ? "anterior" : "proximo",
    inicio, fim: deslocamento === 0 ? hoje : fim };
}

const indicadores: { chave: Kpi; titulo: string; apoio: string; classe: string }[] = [
  { chave: "saldoAnterior", titulo: "Saldo anterior", apoio: "Antes do período", classe: "base" },
  { chave: "entradas", titulo: "Entradas", apoio: "Realizadas no período", classe: "entrada" },
  { chave: "saidas", titulo: "Saídas", apoio: "Realizadas no período", classe: "saida" },
  { chave: "saldoPeriodo", titulo: "Saldo do período", apoio: "Entradas − saídas", classe: "periodo" },
  { chave: "saldoFinal", titulo: "Saldo final", apoio: "Posição ao fim do período", classe: "final" },
];

function Grafico({ resumo }: { resumo: Resumo }) {
  const serie = resumo.serieCaixa;
  if (!serie.length) return <div className="fc-empty">Sem movimentação realizada neste período.</div>;
  const largura = Math.max(650, serie.length * 48 + 100);
  const saldos = [Number(resumo.saldoAnterior.total), ...serie.map(dia => Number(dia.saldoAcumulado))];
  const menor = saldos.reduce((a, b) => Math.min(a, b));
  const maior = saldos.reduce((a, b) => Math.max(a, b));
  const escalaSaldo = maior - menor || 1;
  const maximo = serie.reduce((maior, dia) => Math.max(maior, Number(dia.entradas), Number(dia.saidas)), 1);
  const ySaldo = (valor: number) => 118 - (valor - menor) / escalaSaldo * 82;
  const pontos = [`40,${ySaldo(saldos[0])}`, ...serie.map((dia, i) => `${74 + i * 48},${ySaldo(Number(dia.saldoAcumulado))}`)].join(" ");
  const passo = Math.max(1, Math.ceil(serie.length / 14));
  return <div className="fc-chart-scroll" role="img" aria-label="Movimentação diária e saldo acumulado">
    <svg width={largura} height="260" viewBox={`0 0 ${largura} 260`} aria-hidden="true">
      <text x="24" y="20" className="fc-chart-caption">Saldo acumulado</text>
      <text x="24" y="154" className="fc-chart-caption">Movimentação diária</text>
      <line x1="24" x2={largura - 20} y1="130" y2="130" className="fc-chart-rule" />
      <line x1="24" x2={largura - 20} y1="222" y2="222" className="fc-chart-rule" />
      <polyline points={pontos} className="fc-chart-line" />
      {serie.map((dia, i) => {
        const x = 74 + i * 48;
        const entrada = Number(dia.entradas), saida = Number(dia.saidas);
        return <g key={dia.data}>
          <title>{`${dataBR(dia.data)} · Entradas ${dinheiro(dia.entradas)} · Saídas ${dinheiro(dia.saidas)} · Saldo ${dinheiro(dia.saldoAcumulado)}`}</title>
          <circle cx={x} cy={ySaldo(Number(dia.saldoAcumulado))} r="3.5" className="fc-chart-point" />
          {entrada > 0 && <rect x={x - 15} y={222 - entrada / maximo * 58} width="12" height={entrada / maximo * 58} rx="2" className="fc-chart-income" />}
          {saida > 0 && <rect x={x + 3} y={222 - saida / maximo * 58} width="12" height={saida / maximo * 58} rx="2" className="fc-chart-outflow" />}
          {(i % passo === 0 || i === serie.length - 1) && <text x={x} y="247" textAnchor="middle" className="fc-chart-date">{dia.data.slice(8, 10)}/{dia.data.slice(5, 7)}</text>}
        </g>;
      })}
    </svg>
  </div>;
}

function Composicao({ resumo }: { resumo: Resumo }) {
  const entradas = Number(resumo.entradas.total), saidas = Number(resumo.saidas.total);
  const maximo = Math.max(entradas, saidas, 1);
  return <section className="fc-panel fc-composition" aria-labelledby="fc-composition-title">
    <div className="fc-panel-heading"><h2 id="fc-composition-title">Entradas × saídas</h2><span>Caixa realizado</span></div>
    {([["Entradas", resumo.entradas.total, entradas, "entrada"], ["Saídas", resumo.saidas.total, saidas, "saida"]] as const).map(([titulo, valor, numero, classe]) =>
      <div className="fc-composition-item" key={classe}><div><span>{titulo}</span><strong>{dinheiro(valor)}</strong></div>
        <div className="fc-composition-track"><div className={`fc-composition-fill ${classe}`} style={{ width: `${numero / maximo * 100}%` }} /></div></div>)}
    <p className="fc-helper">Previsões não entram nesta comparação.</p>
  </section>;
}

function ModalDetalhe({ resumo, chave, nome, fechar }: { resumo: Resumo; chave: Kpi; nome: string; fechar: () => void }) {
  const componentes: ComponenteFinanceiro[] = resumo[chave].componentes;
  useEffect(() => {
    const tecla = (evento: KeyboardEvent) => { if (evento.key === "Escape") fechar(); };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [fechar]);
  return <div className="fc-modal-backdrop" onClick={evento => { if (evento.target === evento.currentTarget) fechar(); }}>
    <section className="fc-modal" role="dialog" aria-modal="true" aria-labelledby="fc-modal-title">
      <div className="fc-modal-heading"><div><h2 id="fc-modal-title">{nome}</h2>
        <p>{dinheiro(resumo[chave].total)} · {componentes.length} {componentes.length === 1 ? "movimento" : "movimentos"}</p></div>
        <button type="button" aria-label="Fechar detalhes" autoFocus onClick={fechar}>✕</button></div>
      <div className="fc-modal-body">{componentes.length === 0 ? <div className="fc-empty">Nenhum movimento compõe este valor.</div> :
        componentes.map(item => <div className="fc-detail-row" key={item.id}>
          <span>{dataBR(item.data)}</span><span><strong>{item.descricao || `Lançamento #${item.seq ?? "—"}`}</strong>
            <small>{item.contraparte || item.status || "Realizado"}</small></span>
          <span className={item.direcao === "SAIDA" ? "saida" : "entrada"}>{item.direcao === "SAIDA" ? "Saída" : "Entrada"}</span>
          <strong className={item.direcao === "SAIDA" ? "saida" : "entrada"}>{dinheiro(item.valorAssinado)}</strong>
        </div>)}</div>
      <div className="fc-modal-footer"><Link href="/lancamentos" className="btn btn-outline">Ver em Lançamentos</Link>
        <button type="button" className="btn btn-primary" onClick={fechar}>Fechar</button></div>
    </section>
  </div>;
}

export default function OverviewClient({ hoje }: { hoje: string }) {
  const [periodo, setPeriodo] = useState<Periodo>(() => mes(hoje, 0));
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const [detalhe, setDetalhe] = useState<Kpi | null>(null);

  useEffect(() => {
    const controlador = new AbortController();
    setResumo(null);
    setDetalhe(null);
    if (!periodo.inicio || !periodo.fim || periodo.inicio > periodo.fim) {
      setCarregando(false);
      setErro("Informe um período válido: a data inicial deve ser anterior ou igual à final.");
      return () => controlador.abort();
    }
    setCarregando(true);
    setErro(null);
    const parametros = new URLSearchParams({ inicio: periodo.inicio, fim: periodo.fim,
      dataReferencia: hoje, dataBase: "REALIZACAO" });
    fetch(`/api/fluxo-caixa/resumo?${parametros}`, { signal: controlador.signal })
      .then(lerResumoFluxoCaixa)
      .then(dados => { if (!controlador.signal.aborted) setResumo(dados); })
      .catch(falha => { if (!controlador.signal.aborted) setErro(falha.message || "Erro ao carregar a Visão Geral."); })
      .finally(() => { if (!controlador.signal.aborted) setCarregando(false); });
    return () => controlador.abort();
  }, [periodo.inicio, periodo.fim, hoje, tentativa]);

  const tituloSaldo = periodo.fim === hoje ? "Saldo atual" : "Saldo final";
  const nomeKpi = (chave: Kpi) => chave === "saldoFinal" ? tituloSaldo : indicadores.find(item => item.chave === chave)?.titulo || "";

  return <div className="fc-overview">
    <header className="topbar fc-topbar"><div><h1 className="page-title">Visão Geral</h1>
      <p className="page-sub">Posição e movimentação do caixa</p></div>
      <Link href="/lancamentos" className="btn btn-outline">Ver lançamentos</Link></header>
    <div className="fc-body">
      <section className="fc-period" aria-label="Período financeiro">
        <div className="fc-period-title"><strong>Período financeiro</strong><span>Caixa pela data de pagamento ou recebimento</span></div>
        <div className="fc-period-controls"><div className="fc-presets" role="group" aria-label="Períodos rápidos">
          {([[-1, "Mês anterior"], [0, "Mês atual"], [1, "Próximo mês"]] as const).map(([offset, titulo]) => {
            const modo = offset === 0 ? "atual" : offset < 0 ? "anterior" : "proximo";
            return <button key={modo} type="button" className={`fc-preset ${periodo.modo === modo ? "active" : ""}`}
              aria-pressed={periodo.modo === modo} onClick={() => setPeriodo(mes(hoje, offset))}>{titulo}</button>;
          })}</div>
          <div className="fc-dates"><label>De<input type="date" value={periodo.inicio} onChange={evento =>
            setPeriodo(atual => ({ ...atual, modo: "personalizado", inicio: evento.target.value }))} /></label>
            <label>Até<input type="date" value={periodo.fim} onChange={evento =>
              setPeriodo(atual => ({ ...atual, modo: "personalizado", fim: evento.target.value }))} /></label></div></div>
      </section>
      {carregando && <div className="fc-loading" role="status"><span className="spinner" /> Carregando posição financeira…</div>}
      {erro && !carregando && <div className="fc-error" role="alert"><strong>Não foi possível mostrar a Visão Geral.</strong>
        <p>{erro}</p><button className="btn btn-outline" onClick={() => setTentativa(valor => valor + 1)}>Tentar novamente</button></div>}
      {resumo && !carregando && !erro && <>
        <div className="fc-period-note">{dataBR(periodo.inicio)} a {dataBR(periodo.fim)} · Valores realizados
          {periodo.modo === "atual" && " · mês atual até hoje"}</div>
        {resumo.inconsistencias.length > 0 && <div className="fc-warning" role="status"><div>
          <strong>{resumo.inconsistencias.length} {resumo.inconsistencias.length === 1 ? "lançamento precisa" : "lançamentos precisam"} de revisão.</strong>
          <span> Registros sem data financeira confiável ficam fora do caixa realizado.</span></div>
          <Link href="/lancamentos">Revisar lançamentos</Link></div>}
        <section className="fc-kpis" aria-label="Indicadores do caixa realizado">{indicadores.map(item => {
          const valor = resumo[item.chave].total;
          const saldo = item.chave === "saldoAnterior" || item.chave === "saldoPeriodo" || item.chave === "saldoFinal";
          const sinal = saldo ? (Number(valor) > 0 ? "positive" : Number(valor) < 0 ? "negative" : "zero") : "";
          return <button type="button" key={item.chave} className={`fc-kpi ${item.classe} ${sinal}`}
            aria-label={`${nomeKpi(item.chave)}: ${dinheiro(valor)}. Ver lançamentos componentes.`} onClick={() => setDetalhe(item.chave)}>
            <span>{nomeKpi(item.chave)}</span><strong>{dinheiro(valor)}</strong><small>{item.apoio}</small></button>;
        })}</section>
        {resumo.saldoPeriodo.componentes.length === 0 && <p className="fc-no-movement">Sem movimentos realizados no período. O saldo anterior foi preservado.</p>}
        <div className="fc-visuals"><section className="fc-panel fc-main-chart" aria-labelledby="fc-chart-title">
          <div className="fc-panel-heading"><div><h2 id="fc-chart-title">Movimentação do período</h2>
            <span>Entradas, saídas e saldo acumulado por data financeira</span></div></div>
          <div className="fc-legend"><span><i className="line" />Saldo acumulado</span><span><i className="entrada" />Entradas</span><span><i className="saida" />Saídas</span></div>
          <Grafico resumo={resumo} /></section><Composicao resumo={resumo} /></div>
        <section className="fc-panel fc-latest" aria-labelledby="fc-latest-title">
          <div className="fc-panel-heading"><div><h2 id="fc-latest-title">Últimos lançamentos</h2>
            <span>Até cinco registros do período selecionado</span></div><Link href="/lancamentos">Ver lançamentos →</Link></div>
          {resumo.ultimosLancamentos.length === 0 ? <div className="fc-empty">Nenhum lançamento neste período.</div> :
            <div className="fc-latest-list">{resumo.ultimosLancamentos.map(item => <div className="fc-latest-row" key={item.id}>
              <span className="fc-latest-date">{dataBR(item.dataFinanceira || item.data)}
                {!item.dataFinanceira && <small>Sem data financeira</small>}</span>
              <span className="fc-latest-description"><strong>{item.descricao}</strong><small>{item.contraparte || `Lançamento #${item.seq ?? "—"}`}</small></span>
              <span className={`fc-direction ${item.direcao === "SAIDA" ? "saida" : "entrada"}`}>{item.direcao === "SAIDA" ? "SAÍDA" : "ENTRADA"}</span>
              <strong className={`fc-latest-value ${item.direcao === "SAIDA" ? "saida" : "entrada"}`}>{dinheiro(item.valor)}</strong>
              <span className={`fc-status ${item.status === "INCONSISTENTE" ? "warning" : ""}`}>{item.status}</span>
            </div>)}</div>}
        </section>
      </>}
    </div>
    {resumo && detalhe && <ModalDetalhe resumo={resumo} chave={detalhe} nome={nomeKpi(detalhe)} fechar={() => setDetalhe(null)} />}
  </div>;
}
