"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ComponenteFinanceiro, DataBaseFinanceira } from "@/lib/cash-flow";
import { segundaDaSemana, somarDias } from "@/lib/cash-flow-calendar.js";
import type { MedidaRelatorio } from "@/lib/cash-flow-report";

type Dia = { data: string; entradas: string; saidas: string; resultado: string;
  quantidade: number; saldoAcumulado: string; componentes: ComponenteFinanceiro[] };
type Semana = { inicio: string; fim: string; entradas: string; saidas: string;
  resultado: string; quantidade: number; componentes: ComponenteFinanceiro[]; dias: Dia[] };
type Relatorio = { medida: MedidaRelatorio; dataBase: DataBaseFinanceira; inicio: string; fim: string;
  saldoAnterior: string; dias: Dia[]; semanas: Semana[];
  inconsistencias: { id: string; problemas: string[] }[] };
type Detalhe = { titulo: string; inicio: string; fim: string;
  entradas: string; saidas: string; resultado: string; quantidade: number;
  componentes: ComponenteFinanceiro[] };

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const valor = (quantia: string) => moeda.format(Number(quantia));
const dataBR = (data: string) => `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)}`;
const diaMes = (data: string) => `${data.slice(8, 10)}/${data.slice(5, 7)}`;
const nomesDia = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
const indiceDia = (data: string) => new Date(`${data}T00:00:00.000Z`).getUTCDay();
const BASES: { value: DataBaseFinanceira; label: string }[] = [
  { value: "VENCIMENTO_PLANO", label: "Vencimento plano" },
  { value: "VENCIMENTO_ORIGINAL", label: "Vencimento original" },
  { value: "DATA_EMISSAO", label: "Data de emissão" },
  { value: "DATA_LANCAMENTO", label: "Data de lançamento" },
  { value: "REALIZACAO", label: "Data de realização" },
];
const STATUS = ["REALIZADO", "ATRASADO", "A VENCER", "PREVISTO", "INCONSISTENTE", "CANCELADO"];
const sinal = (quantia: string) => Number(quantia) > 0 ? "positivo" : Number(quantia) < 0 ? "negativo" : "neutro";

function Cartao({ item, hoje, previsto, semanal, abrir }: {
  item: Dia | Semana; hoje: string; previsto: boolean; semanal: boolean; abrir: () => void;
}) {
  const data = semanal ? (item as Semana).inicio : (item as Dia).data;
  const fim = semanal ? (item as Semana).fim : data;
  const diaSemana = indiceDia(data);
  const atual = !semanal && data === hoje;
  const passado = !semanal && data < hoje;
  const fimSemana = !semanal && (diaSemana === 0 || diaSemana === 6);
  const emAberto = (componente: ComponenteFinanceiro) => ["ATRASADO", "A VENCER", "PREVISTO"].includes(componente.status || "");
  const pendencias = previsto && !semanal && item.componentes.some(emAberto);
  const pendente = (direcao: "ENTRADA" | "SAIDA") => {
    const partes = item.componentes.filter(componente => componente.direcao === direcao);
    return previsto && !semanal && partes.length > 0 && partes.every(emAberto);
  };
  const entradaPendente = pendente("ENTRADA"), saidaPendente = pendente("SAIDA");
  return <button type="button" onClick={abrir}
    className={`fcr-card ${semanal ? "fcr-card-week" : ""} ${atual ? "fcr-card-today" : ""} ${passado ? "fcr-card-past" : ""} ${diaSemana === 6 && !semanal ? "fcr-card-saturday" : ""} ${fimSemana ? "fcr-card-weekend" : ""} ${previsto ? "fcr-card-forecast" : "fcr-card-real"}`}
    aria-label={`${semanal ? "Total da semana" : nomesDia[diaSemana]} ${dataBR(data)}${semanal ? ` a ${dataBR(fim)}` : ""}, ${item.quantidade} lançamentos. Ver detalhes.`}>
    <span className="fcr-card-top"><strong>{semanal ? "Total da semana" : diaMes(data)}</strong>{atual && <em>HOJE</em>}
      {passado && pendencias && <em className="fcr-card-open-mark">EM ABERTO</em>}</span>
    <span className="fcr-card-day">{semanal ? `${diaMes(data)} – ${diaMes(fim)}` : nomesDia[diaSemana]}</span>
    <span className="fcr-card-metric"><small>{previsto ? "A receber" : "Entradas"}</small><strong className={`fcr-entry ${entradaPendente ? "fcr-pending-live" : ""} ${Number(item.entradas) === 0 ? "fcr-zero" : ""}`}>{valor(item.entradas)}</strong></span>
    <span className="fcr-card-metric"><small>{previsto ? "A pagar" : "Saídas"}</small><strong className={`fcr-outflow ${saidaPendente ? "fcr-pending-live" : ""} ${Number(item.saidas) === 0 ? "fcr-zero" : ""}`}>{valor(item.saidas)}</strong></span>
    <span className="fcr-card-result"><small>{previsto ? "Resultado previsto" : "Saldo do período"}</small>
      <strong className={previsto ? Number(item.resultado) === 0 ? "fcr-zero" : "" : sinal(item.resultado)}>{valor(item.resultado)}</strong></span>
    <span className="fcr-card-foot">{item.quantidade === 0 ? "Sem movimentação" : `${item.quantidade} ${item.quantidade === 1 ? "lançamento" : "lançamentos"}`} <span aria-hidden>↗</span></span>
  </button>;
}

function Grafico({ relatorio }: { relatorio: Relatorio }) {
  const previsto = relatorio.medida === "PREVISTO";
  const dias = relatorio.dias;
  const valores = [Number(relatorio.saldoAnterior), ...dias.map(dia => Number(dia.saldoAcumulado))];
  const minimo = Math.min(...valores), maximo = Math.max(...valores);
  const amplitude = maximo - minimo || 1;
  const maxMovimento = Math.max(1, ...dias.map(dia => Math.max(Number(dia.entradas), Number(dia.saidas))));
  const x = (indice: number) => 50 + indice * 58;
  const ySaldo = (numero: number) => 130 - (numero - minimo) / amplitude * 100;
  const pontos = [`24,${ySaldo(Number(relatorio.saldoAnterior))}`,
    ...dias.map((dia, indice) => `${x(indice)},${ySaldo(Number(dia.saldoAcumulado))}`)].join(" ");
  return <section className={`fcr-chart-panel ${previsto ? "fcr-chart-forecast" : ""}`} aria-labelledby="fcr-chart-title">
    <div className="fcr-chart-heading"><div><h2 id="fcr-chart-title">Evolução das duas semanas</h2>
      <p>{previsto ? "Resultado previsto acumulado" : "Saldo real acumulado"} · Saldo anterior {valor(relatorio.saldoAnterior)}</p></div>
      <div className="fcr-chart-legend"><span><i className="balance" />{previsto ? "Previsto acumulado" : "Saldo acumulado"}</span>
        <span><i className="income" />{previsto ? "A receber" : "Entradas"}</span>
        <span><i className="expense" />{previsto ? "A pagar" : "Saídas"}</span></div></div>
    <div className="fcr-chart-scroll" role="img" aria-label={`Evolução financeira de ${dataBR(relatorio.inicio)} a ${dataBR(relatorio.fim)}`}>
      <svg viewBox="0 0 865 260" width="865" height="260" aria-hidden="true">
        <text x="20" y="19" className="fcr-chart-caption">{previsto ? "Resultado previsto acumulado" : "Saldo acumulado"}</text>
        <text x="20" y="171" className="fcr-chart-caption">{previsto ? "Previsões por dia" : "Movimentação realizada por dia"}</text>
        <line x1="20" x2="840" y1="151" y2="151" className="fcr-chart-rule" />
        <line x1="20" x2="840" y1="229" y2="229" className="fcr-chart-rule" />
        <polyline points={pontos} className="fcr-chart-line" />
        {dias.map((dia, indice) => {
          const entrada = Number(dia.entradas), saida = Number(dia.saidas);
          return <g key={dia.data}><title>{`${dataBR(dia.data)} · ${previsto ? "A receber" : "Entradas"} ${valor(dia.entradas)} · ${previsto ? "A pagar" : "Saídas"} ${valor(dia.saidas)} · Acumulado ${valor(dia.saldoAcumulado)}`}</title>
            <circle cx={x(indice)} cy={ySaldo(Number(dia.saldoAcumulado))} r="3.5" className="fcr-chart-point" />
            {entrada > 0 && <rect x={x(indice) - 15} y={229 - entrada / maxMovimento * 50} width="11" height={entrada / maxMovimento * 50} rx="2" className="fcr-chart-income" />}
            {saida > 0 && <rect x={x(indice) + 3} y={229 - saida / maxMovimento * 50} width="11" height={saida / maxMovimento * 50} rx="2" className="fcr-chart-expense" />}
            <text x={x(indice)} y="252" textAnchor="middle" className="fcr-chart-date">{diaMes(dia.data)}</text>
          </g>;
        })}
      </svg></div>
  </section>;
}

function Modal({ detalhe, previsto, fechar }: { detalhe: Detalhe; previsto: boolean; fechar: () => void }) {
  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => { if (evento.key === "Escape") fechar(); };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, [fechar]);
  return <div className="fcr-modal-backdrop" onClick={evento => { if (evento.target === evento.currentTarget) fechar(); }}>
    <section className={`fcr-modal ${previsto ? "fcr-modal-forecast" : ""}`} role="dialog" aria-modal="true" aria-labelledby="fcr-modal-title">
      <header className="fcr-modal-header"><div><h2 id="fcr-modal-title">{detalhe.titulo}</h2>
        <p>{dataBR(detalhe.inicio)}{detalhe.inicio !== detalhe.fim && ` a ${dataBR(detalhe.fim)}`} · {previsto ? "Previsto" : "Realizado"} · {detalhe.quantidade} lançamentos</p></div>
        <button type="button" autoFocus aria-label="Fechar detalhes" onClick={fechar}>✕</button></header>
      <div className="fcr-modal-totals"><span>{previsto ? "A receber" : "Entradas"}<strong className={`fcr-entry ${Number(detalhe.entradas) === 0 ? "fcr-zero" : ""}`}>{valor(detalhe.entradas)}</strong></span>
        <span>{previsto ? "A pagar" : "Saídas"}<strong className={`fcr-outflow ${Number(detalhe.saidas) === 0 ? "fcr-zero" : ""}`}>{valor(detalhe.saidas)}</strong></span>
        <span>{previsto ? "Resultado previsto" : "Saldo"}<strong className={Number(detalhe.resultado) === 0 ? "fcr-zero" : previsto ? "" : sinal(detalhe.resultado)}>{valor(detalhe.resultado)}</strong></span></div>
      <div className="fcr-modal-list">{detalhe.componentes.length === 0 ? <div className="fcr-modal-empty">Nenhum lançamento compõe este período.</div> :
        detalhe.componentes.map(item => <article className="fcr-detail" key={`${item.id}-${item.data}`}>
          <div className="fcr-detail-main"><strong>{item.descricao || `Lançamento #${item.seq ?? "—"}`}</strong><span>{item.contraparte || "Sem contraparte"}</span></div>
          <div className="fcr-detail-class"><span>Categoria N1: {item.categoriaN1 || "—"}</span><span>Conta N2: {item.contaN2 || "—"}</span></div>
          <div className="fcr-detail-meta"><span>{dataBR(item.data)} · {item.direcao === "ENTRADA" ? "Entrada" : "Saída"} · {item.status || "—"}</span>
            <span>Venc. plano {item.dataVencPlano ? dataBR(item.dataVencPlano) : "—"} · Realização {item.dataRealizacao ? dataBR(item.dataRealizacao) : "—"}</span></div>
          <strong className={`fcr-detail-value ${item.direcao === "ENTRADA" ? "fcr-entry" : "fcr-outflow"}`}>{valor(item.valorAssinado)}</strong>
          <Link href="/lancamentos" className="fcr-detail-link">Ver em Lançamentos →</Link>
        </article>)}</div>
      <footer className="fcr-modal-footer"><Link href="/lancamentos" className="btn btn-outline">Abrir Lançamentos</Link>
        <button type="button" className="btn btn-primary" onClick={fechar}>Fechar</button></footer>
    </section>
  </div>;
}

export default function RelatoriosClient({ hoje }: { hoje: string }) {
  const [inicio, setInicio] = useState(() => segundaDaSemana(hoje));
  const [medida, setMedida] = useState<MedidaRelatorio>("REALIZADO");
  const [dataBase, setDataBase] = useState<DataBaseFinanceira>("VENCIMENTO_PLANO");
  const [statusManual, setStatusManual] = useState("");
  const [status, setStatus] = useState("");
  const [statusList, setStatusList] = useState<{ codigo: string; nome: string }[]>([]);
  const [relatorio, setRelatorio] = useState<Relatorio | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null);

  useEffect(() => { fetch("/api/status-tipos").then(res => res.json())
    .then(dados => { if (Array.isArray(dados)) setStatusList(dados); }).catch(() => {}); }, []);
  useEffect(() => {
    const controlador = new AbortController();
    setCarregando(true); setErro(null); setRelatorio(null); setDetalhe(null);
    const params = new URLSearchParams({ inicio, medida, dataReferencia: hoje });
    if (medida === "PREVISTO") params.set("dataBase", dataBase);
    if (statusManual) params.set("statusManual", statusManual);
    if (status) params.set("status", status);
    fetch(`/api/fluxo-caixa/relatorio?${params}`, { signal: controlador.signal })
      .then(async resposta => {
        if (!resposta.ok) throw new Error("Não foi possível carregar o relatório financeiro.");
        const dados: Relatorio = await resposta.json();
        if (!Array.isArray(dados.dias) || dados.dias.length !== 14 || !Array.isArray(dados.semanas) || dados.semanas.length !== 2)
          throw new Error("O relatório financeiro retornou dados incompletos.");
        return dados;
      })
      .then(dados => { if (!controlador.signal.aborted) setRelatorio(dados); })
      .catch(falha => { if (!controlador.signal.aborted) setErro(falha.message || "Erro ao carregar relatórios."); })
      .finally(() => { if (!controlador.signal.aborted) setCarregando(false); });
    return () => controlador.abort();
  }, [inicio, medida, dataBase, statusManual, status, hoje, tentativa]);

  const previsto = medida === "PREVISTO";
  const abrirDia = (dia: Dia) => setDetalhe({ titulo: `${nomesDia[indiceDia(dia.data)]} · ${dataBR(dia.data)}`,
    inicio: dia.data, fim: dia.data, entradas: dia.entradas, saidas: dia.saidas,
    resultado: dia.resultado, quantidade: dia.quantidade, componentes: dia.componentes });
  const abrirSemana = (semana: Semana) => setDetalhe({ titulo: "Total da semana", inicio: semana.inicio,
    fim: semana.fim, entradas: semana.entradas, saidas: semana.saidas, resultado: semana.resultado,
    quantidade: semana.quantidade, componentes: semana.componentes });

  return <div className="fcr-page"><header className="topbar fcr-topbar"><div><h1 className="page-title">Relatórios</h1>
    <p className="page-sub">Fluxo de Caixa · Visão diária e semanal</p></div>
    <Link href="/lancamentos" className="btn btn-outline">Ver Lançamentos</Link></header>
    <div className="fcr-body"><section className="fcr-controls" aria-label="Filtros do relatório">
      <div className="fcr-period"><strong>Período de duas semanas</strong><span>{dataBR(inicio)} a {dataBR(somarDias(inicio, 13))}</span>
        <div className="fcr-navigation"><button type="button" onClick={() => setInicio(somarDias(inicio, -14))}>← 2 semanas</button>
          <button type="button" onClick={() => setInicio(segundaDaSemana(hoje))}>Hoje</button>
          <button type="button" onClick={() => setInicio(somarDias(inicio, 14))}>2 semanas →</button></div></div>
      <div className="fcr-filter-list"><fieldset className="fcr-measure"><legend>Medida</legend>
        <button type="button" aria-pressed={!previsto} className={!previsto ? "selected" : ""} onClick={() => setMedida("REALIZADO")}>Realizado</button>
        <button type="button" aria-pressed={previsto} className={previsto ? "selected" : ""} onClick={() => setMedida("PREVISTO")}>Previsto</button></fieldset>
        {previsto && <label>Data-base<select value={dataBase} onChange={evento => setDataBase(evento.target.value as DataBaseFinanceira)}>
          {BASES.map(base => <option key={base.value} value={base.value}>{base.label}</option>)}</select></label>}
        <label>Status manual<select value={statusManual} onChange={evento => setStatusManual(evento.target.value)}><option value="">Todos</option>
          {statusList.map(item => <option key={item.codigo} value={item.codigo}>{item.nome}</option>)}</select></label>
        <label>Status financeiro<select value={status} onChange={evento => setStatus(evento.target.value)}><option value="">Todos</option>
          {STATUS.map(item => <option key={item} value={item}>{item}</option>)}</select></label></div>
    </section>
    <p className="fcr-explanation">{previsto ? `Valores previstos por ${BASES.find(base => base.value === dataBase)?.label.toLowerCase()}; o acumulado parte do saldo real anterior.`
      : "Caixa realizado pela data de pagamento ou recebimento. Sem data financeira, o valor não entra no realizado."}</p>
    {carregando && <div className="fcr-state" role="status"><span className="spinner" /> Carregando relatório…</div>}
    {erro && !carregando && <div className="fcr-state fcr-error" role="alert"><strong>Não foi possível mostrar os relatórios.</strong>
      <span>{erro}</span><button className="btn btn-outline" onClick={() => setTentativa(valor => valor + 1)}>Tentar novamente</button></div>}
    {relatorio && !carregando && !erro && <>
      {relatorio.inconsistencias.length > 0 && <div className="fcr-notice" role="status"><strong>{relatorio.inconsistencias.length} lançamentos precisam de revisão.</strong>
        <span>Registros sem data de realização confiável não compõem o caixa real.</span><Link href="/lancamentos">Revisar →</Link></div>}
      {relatorio.dias.every(dia => dia.quantidade === 0) && <p className="fcr-empty">Sem movimentação {previsto ? "prevista" : "realizada"} nestas duas semanas. O saldo anterior permanece no gráfico.</p>}
      {relatorio.semanas.map((semana, indice) => <section className="fcr-week" key={semana.inicio} aria-label={`Semana ${indice + 1}, ${dataBR(semana.inicio)} a ${dataBR(semana.fim)}`}>
        <div className="fcr-week-heading"><h2>Semana {indice + 1}</h2><span>{dataBR(semana.inicio)} a {dataBR(semana.fim)}</span></div>
        <div className="fcr-week-scroll"><div className="fcr-week-grid">{semana.dias.map(dia => <Cartao key={dia.data} item={dia} hoje={hoje} previsto={previsto} semanal={false} abrir={() => abrirDia(dia)} />)}
          <Cartao item={semana} hoje={hoje} previsto={previsto} semanal abrir={() => abrirSemana(semana)} /></div></div>
      </section>)}
      <Grafico relatorio={relatorio} />
    </>}
    </div>{detalhe && <Modal detalhe={detalhe} previsto={previsto} fechar={() => setDetalhe(null)} />}</div>;
}
