"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ComponenteFinanceiro } from "@/lib/cash-flow";
import type { MedidaAnalise, VisaoAnalise, montarAnalisesFluxoCaixa } from "@/lib/cash-flow-analytics";
import { segundaDaSemana, somarDias } from "@/lib/cash-flow-calendar.js";

type Base = ReturnType<typeof montarAnalisesFluxoCaixa>;
type Analise = Base & { dimensoes: {
  categorias: { id: string; codigo: string; nome: string }[];
  contas: { id: string; codigo: string | null; descricao: string; categoriaId: string | null }[];
} };
type Grupo = Base["realizado"];
type Composicao = Base["composicao"]["entradas"];
type Detalhe = { titulo: string; periodo: string; total: string;
  itens: { origem: "REALIZADO" | "PREVISTO"; item: ComponenteFinanceiro }[] };
const dinheiro = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const valor = (texto: string) => dinheiro.format(Number(texto));
const dataBR = (data: string) => `${data.slice(8, 10)}/${data.slice(5, 7)}/${data.slice(0, 4)}`;
const diaMes = (data: string) => `${data.slice(8, 10)}/${data.slice(5, 7)}`;
const sinal = (texto: string) => Number(texto) > 0 ? "positivo" : Number(texto) < 0 ? "negativo" : "neutro";
function moverMes(mes: string, delta: number) {
  const [ano, numero] = mes.split("-").map(Number);
  return new Date(Date.UTC(ano, numero - 1 + delta, 1)).toISOString().slice(0, 7);
}

function Modal({ detalhe, fechar }: { detalhe: Detalhe; fechar: () => void }) {
  useEffect(() => {
    const teclado = (evento: KeyboardEvent) => { if (evento.key === "Escape") fechar(); };
    document.addEventListener("keydown", teclado);
    return () => document.removeEventListener("keydown", teclado);
  }, [fechar]);
  return <div className="fca-backdrop" onClick={evento => { if (evento.target === evento.currentTarget) fechar(); }}>
    <section className="fca-modal" role="dialog" aria-modal="true" aria-labelledby="fca-modal-title">
      <header><div><h2 id="fca-modal-title">{detalhe.titulo}</h2><p>{detalhe.periodo} · {valor(detalhe.total)} · {detalhe.itens.length} {detalhe.itens.length === 1 ? "componente" : "componentes"}</p></div>
        <button type="button" autoFocus aria-label="Fechar detalhes" onClick={fechar}>✕</button></header>
      <div className="fca-modal-body">{detalhe.itens.length === 0 ? <p className="fca-empty">Nenhum lançamento compõe este valor.</p> :
        detalhe.itens.map(({ origem, item }, indice) => <article key={`${origem}-${item.id}-${indice}`} className="fca-detail">
          <div><strong>{item.descricao || `Lançamento #${item.seq ?? "—"}`}</strong><small>{item.contraparte || "Sem contraparte"}</small></div>
          <div><span>Categoria N1: {item.categoriaN1 || "—"}</span><span>Conta N2: {item.contaN2 || "—"}</span></div>
          <div><span>{origem === "PREVISTO" ? "Previsto" : "Realizado"} · {item.direcao === "ENTRADA" ? "Entrada" : "Saída"} · {item.status}</span>
            <span>Data do recorte {dataBR(item.data)} · Plano {item.dataVencPlano ? dataBR(item.dataVencPlano) : "—"} · Realização {item.dataRealizacao ? dataBR(item.dataRealizacao) : "—"}</span></div>
          <strong className={`fca-detail-value ${origem === "PREVISTO" ? "previsto" : item.direcao === "ENTRADA" ? "entrada" : "saida"}`}>{valor(item.valorAssinado)}</strong>
          <Link href="/lancamentos">Ver em Lançamentos →</Link>
        </article>)}</div>
      <footer><Link className="btn btn-outline" href="/lancamentos">Abrir Lançamentos</Link><button type="button" className="btn btn-primary" onClick={fechar}>Fechar</button></footer>
    </section>
  </div>;
}

function Grafico({ dados, abrirDia }: { dados: Analise; abrirDia: (indice: number) => void }) {
  const comparar = dados.medida === "COMPARAR", previsto = dados.medida === "PREVISTO";
  const dias = dados.dias;
  const largura = Math.max(850, dias.length * (dias.length > 14 ? 35 : 58) + 70);
  const passo = (largura - 72) / dias.length;
  const x = (indice: number) => 42 + passo * (indice + .5);
  const acumulados = comparar ? ["resultadoRealAcumulado", "resultadoPrevistoAcumulado"] as const
    : [previsto ? "resultadoPrevistoAcumulado" : "saldoRealAcumulado"] as const;
  const partida = comparar || previsto ? 0 : Number(dados.saldoAnterior);
  const valores = [partida, ...dias.flatMap(dia => acumulados.map(chave => Number(dia[chave])))];
  const minimo = Math.min(...valores), maximo = Math.max(...valores), amplitude = maximo - minimo || 1;
  const y = (numero: number) => 137 - (numero - minimo) / amplitude * 103;
  const escolhido = previsto ? "previsto" : "realizado";
  const maiorMovimento = Math.max(1, ...dias.flatMap(dia => [Number(dia[escolhido].entradas), Number(dia[escolhido].saidas)]));
  const pontos = (chave: typeof acumulados[number]) =>
    [`24,${y(partida)}`, ...dias.map((dia, indice) => `${x(indice)},${y(Number(dia[chave]))}`)].join(" ");
  return <section className={`fca-panel fca-chart ${previsto ? "fca-forecast" : ""} ${comparar ? "fca-compare" : ""}`} aria-labelledby="fca-chart-title">
    <div className="fca-section-heading"><div><h2 id="fca-chart-title">{comparar ? "Previsto × realizado" : "Evolução financeira"}</h2>
      <p>{comparar ? "Aderência e trajetória dos resultados no período" : previsto ? "Movimentação e resultado previsto acumulado" : "Entradas, saídas e saldo real acumulado"}</p></div>
      <div className="fca-legend">{comparar ? <><span><i className="real-line" />Realizado</span><span><i className="plan-line" />Previsto</span></> :
        <><span><i className="balance-line" />{previsto ? "Resultado previsto" : "Saldo acumulado"}</span><span><i className="income-bar" />{previsto ? "A receber" : "Entradas"}</span><span><i className="outflow-bar" />{previsto ? "A pagar" : "Saídas"}</span></>}</div></div>
    <div className="fca-chart-scroll" role="group" aria-label={`Evolução diária de ${dataBR(dados.inicio)} a ${dataBR(dados.fim)}`}>
      <svg width={largura} height="270" viewBox={`0 0 ${largura} 270`}>
        <text x="16" y="18" className="fca-chart-label">{comparar ? "Resultado acumulado desde zero" : previsto ? "Resultado previsto acumulado desde zero" : `Saldo anterior ${valor(dados.saldoAnterior)}`}</text>
        <line x1="20" x2={largura - 18} y1="155" y2="155" className="fca-chart-rule" />
        {!comparar && <><text x="16" y="172" className="fca-chart-label">Movimentação diária</text><line x1="20" x2={largura - 18} y1="235" y2="235" className="fca-chart-rule" /></>}
        {acumulados.map((chave, indice) => <polyline key={chave} points={pontos(chave)}
          className={`fca-chart-line ${comparar ? indice === 0 ? "real" : "plan" : previsto ? "plan" : "real"}`} />)}
        {dias.map((dia, indice) => {
          const pos = x(indice), entrada = Number(dia[escolhido].entradas), saida = Number(dia[escolhido].saidas);
          return <g key={dia.data}>
            {!comparar && <><rect x={pos - 13} y={235 - entrada / maiorMovimento * 47} width="10" height={entrada / maiorMovimento * 47} rx="2" className="fca-chart-income" />
              <rect x={pos + 3} y={235 - saida / maiorMovimento * 47} width="10" height={saida / maiorMovimento * 47} rx="2" className="fca-chart-outflow" /></>}
            {acumulados.map((chave, ponto) => <circle key={chave} cx={pos} cy={y(Number(dia[chave]))} r="3.2"
              className={`fca-chart-point ${comparar ? ponto === 0 ? "real" : "plan" : previsto ? "plan" : "real"}`} />)}
            {(dias.length <= 14 || indice % 2 === 0 || indice === dias.length - 1) && <text x={pos} y="260" textAnchor="middle" className="fca-chart-date">{diaMes(dia.data)}</text>}
            <rect x={pos - passo / 2} y="22" width={passo} height="220" fill="transparent" role="button" tabIndex={0}
              aria-label={`Detalhar ${dataBR(dia.data)}`} onClick={() => abrirDia(indice)}
              onKeyDown={evento => { if (evento.key === "Enter" || evento.key === " ") { evento.preventDefault(); abrirDia(indice); } }}>
              <title>{dataBR(dia.data)} · Realizado {valor(dia.realizado.resultado)} · Previsto {valor(dia.previsto.resultado)}</title>
            </rect>
          </g>;
        })}
      </svg></div>
  </section>;
}

function ComposicaoPainel({ titulo, dados, direcao, medida, abrir }: {
  titulo: string; dados: Composicao; direcao: "ENTRADA" | "SAIDA";
  medida: "REALIZADO" | "PREVISTO"; abrir: (titulo: string, total: string, itens: ComponenteFinanceiro[]) => void;
}) {
  const [abertas, setAbertas] = useState<string[]>([]);
  const campo = direcao === "ENTRADA" ? "entradas" : "saidas";
  const maior = Math.max(1, ...dados.categorias.map(item => Number(item[campo])));
  return <section className={`fca-panel fca-composition ${medida === "PREVISTO" ? "fca-forecast" : ""}`}>
    <div className="fca-section-heading"><div><h2>{titulo}</h2><p>Categoria N1 → Conta N2 · {medida === "PREVISTO" ? "previsto" : "realizado"}</p></div></div>
    {dados.categorias.length === 0 ? <p className="fca-empty">Nenhuma classificação oficial com {direcao === "ENTRADA" ? "entradas" : "saídas"} neste período.</p> :
      <div className="fca-category-list">{dados.categorias.map(categoria => {
        const aberta = abertas.includes(categoria.categoriaId);
        return <div className="fca-category" key={categoria.categoriaId}>
          <div className="fca-category-head"><button type="button" aria-expanded={aberta}
            onClick={() => setAbertas(atual => aberta ? atual.filter(id => id !== categoria.categoriaId) : [...atual, categoria.categoriaId])}>
            <span aria-hidden>{aberta ? "▾" : "▸"}</span> {categoria.nome}</button>
            <button type="button" className="fca-category-total" onClick={() => abrir(categoria.nome, categoria[campo], categoria.componentes)}
              aria-label={`Detalhar ${categoria.nome}: ${valor(categoria[campo])}`}>{valor(categoria[campo])}</button></div>
          <div className="fca-track"><div style={{ width: `${Number(categoria[campo]) / maior * 100}%` }} /></div>
          {aberta && <div className="fca-account-list">{categoria.contas.map(conta => <button type="button" key={conta.contaId}
            onClick={() => abrir(conta.nome, conta[campo], conta.componentes)}><span>{conta.nome}</span><strong>{valor(conta[campo])}</strong></button>)}</div>}
        </div>;
      })}</div>}
    {dados.semClassificacao.quantidade > 0 && <p className="fca-composition-note">{dados.semClassificacao.quantidade} movimento(s) sem Categoria N1/Conta N2 oficial ficam fora das barras.
      <button type="button" onClick={() => abrir("Sem classificação oficial", dados.semClassificacao[campo], dados.semClassificacao.componentes)}>Ver componentes</button></p>}
    {dados.transferencias.quantidade > 0 && <p className="fca-composition-note">Transferências provisórias: {valor(dados.transferencias[campo])}. Não são tratadas como receita/despesa operacional.
      <button type="button" onClick={() => abrir("Transferências provisórias", dados.transferencias[campo], dados.transferencias.componentes)}>Ver componentes</button></p>}
  </section>;
}

export default function AnalisesClient({ hoje }: { hoje: string }) {
  const [visao, setVisao] = useState<VisaoAnalise>("DUAS_SEMANAS");
  const [medida, setMedida] = useState<MedidaAnalise>("REALIZADO");
  const [semana, setSemana] = useState(() => segundaDaSemana(hoje));
  const [mes, setMes] = useState(() => hoje.slice(0, 7));
  const [categoriaId, setCategoriaId] = useState("");
  const [contaId, setContaId] = useState("");
  const [dimensoes, setDimensoes] = useState<Analise["dimensoes"]>({ categorias: [], contas: [] });
  const [dados, setDados] = useState<Analise | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null);
  const periodo = visao === "DUAS_SEMANAS" ? semana : mes;

  useEffect(() => {
    const controlador = new AbortController();
    setDados(null); setDetalhe(null); setErro(null); setCarregando(true);
    const params = new URLSearchParams({ visao, medida, periodo, dataReferencia: hoje });
    if (categoriaId) params.set("categoriaId", categoriaId);
    if (contaId) params.set("contaId", contaId);
    fetch(`/api/fluxo-caixa/analises?${params}`, { signal: controlador.signal })
      .then(async resposta => {
        const corpo = await resposta.json();
        if (!resposta.ok) throw new Error(corpo.error || "Não foi possível carregar as análises.");
        if (!Array.isArray(corpo.dias) || !corpo.dimensoes || !Array.isArray(corpo.dimensoes.categorias))
          throw new Error("As análises retornaram dados incompletos.");
        return corpo as Analise;
      })
      .then(resultado => { if (!controlador.signal.aborted) { setDados(resultado); setDimensoes(resultado.dimensoes); } })
      .catch(falha => { if (!controlador.signal.aborted) setErro(falha.message); })
      .finally(() => { if (!controlador.signal.aborted) setCarregando(false); });
    return () => controlador.abort();
  }, [visao, medida, periodo, categoriaId, contaId, hoje, tentativa]);

  const abrir = (titulo: string, total: string, componentes: ComponenteFinanceiro[], origem: "REALIZADO" | "PREVISTO", recorte?: string) =>
    setDetalhe({ titulo, periodo: recorte || (dados ? `${dataBR(dados.inicio)} a ${dataBR(dados.fim)}` : ""), total,
      itens: componentes.map(item => ({ origem, item })) });
  const abrirComparacao = (titulo: string, total: string, real: ComponenteFinanceiro[], plano: ComponenteFinanceiro[], recorte?: string) =>
    setDetalhe({ titulo, periodo: recorte || (dados ? `${dataBR(dados.inicio)} a ${dataBR(dados.fim)}` : ""), total,
      itens: [...plano.map(item => ({ origem: "PREVISTO" as const, item })), ...real.map(item => ({ origem: "REALIZADO" as const, item }))] });
  const abrirDia = (indice: number) => {
    if (!dados) return;
    const dia = dados.dias[indice], recorte = dataBR(dia.data);
    if (medida === "COMPARAR") abrirComparacao(`Previsto × realizado · ${recorte}`,
      dia.variacao, dia.realizado.componentes, dia.previsto.componentes, recorte);
    else { const grupo = medida === "PREVISTO" ? dia.previsto : dia.realizado;
      abrir(`Movimentação · ${recorte}`, grupo.resultado, grupo.componentes, medida, recorte); }
  };
  const vazio = dados && (medida === "REALIZADO" ? dados.realizado.quantidade === 0 : medida === "PREVISTO"
    ? dados.previsto.quantidade === 0 : dados.realizado.quantidade === 0 && dados.previsto.quantidade === 0);
  const grupo = dados && (medida === "PREVISTO" ? dados.previsto : dados.realizado);
  const composicaoMedida = dados?.composicao.medida || "REALIZADO";

  return <div className="fca-page"><header className="topbar fca-topbar"><div><h1 className="page-title">Análises</h1>
    <p className="page-sub">Evolução, composição e comparação do fluxo financeiro</p></div>
    <Link href="/fluxo-caixa/relatorios" className="btn btn-outline">Ver Relatórios</Link></header>
    <div className="fca-body"><section className="fca-controls" aria-label="Filtros das análises">
      <fieldset><legend>Visão</legend><button type="button" className={visao === "DUAS_SEMANAS" ? "selected" : ""} aria-pressed={visao === "DUAS_SEMANAS"} onClick={() => setVisao("DUAS_SEMANAS")}>2 Semanas</button>
        <button type="button" className={visao === "MENSAL" ? "selected" : ""} aria-pressed={visao === "MENSAL"} onClick={() => setVisao("MENSAL")}>Mensal</button></fieldset>
      <fieldset><legend>Medida</legend>{(["REALIZADO", "PREVISTO", "COMPARAR"] as const).map(item =>
        <button type="button" key={item} className={medida === item ? "selected" : ""} aria-pressed={medida === item}
          onClick={() => setMedida(item)}>{item === "COMPARAR" ? "Comparar" : item === "PREVISTO" ? "Previsto" : "Realizado"}</button>)}</fieldset>
      <div className="fca-period"><span>Período</span><div>
        <button type="button" aria-label="Período anterior" onClick={() => visao === "MENSAL" ? setMes(moverMes(mes, -1)) : setSemana(somarDias(semana, -14))}>←</button>
        {visao === "MENSAL" ? <input type="month" aria-label="Mês e ano" value={mes}
          onChange={evento => setMes(evento.currentTarget.value)} onInput={evento => setMes(evento.currentTarget.value)} /> :
          <strong>{dataBR(semana)} – {dataBR(somarDias(semana, 13))}</strong>}
        <button type="button" aria-label="Próximo período" onClick={() => visao === "MENSAL" ? setMes(moverMes(mes, 1)) : setSemana(somarDias(semana, 14))}>→</button>
        <button type="button" onClick={() => { setSemana(segundaDaSemana(hoje)); setMes(hoje.slice(0, 7)); }}>Hoje</button>
      </div></div>
      <label>Categoria N1<select value={categoriaId} onChange={evento => { setCategoriaId(evento.target.value); setContaId(""); }}>
        <option value="">Todas</option>{dimensoes.categorias.map(item => <option key={item.id} value={item.id}>{item.codigo} · {item.nome}</option>)}</select></label>
      <label>Conta N2<select value={contaId} onChange={evento => setContaId(evento.target.value)}>
        <option value="">Todas</option>{dimensoes.contas.filter(item => !categoriaId || item.categoriaId === categoriaId).map(item =>
          <option key={item.id} value={item.id}>{item.codigo} · {item.descricao}</option>)}</select></label>
    </section>
    <p className="fca-context">{medida === "REALIZADO" ? "Caixa real pela data de realização." : medida === "PREVISTO"
      ? "Previsão por valor previsto e vencimento plano; acumulado previsto parte de zero."
      : "Previsto por vencimento plano × realizado por data financeira; ambos comparados no mesmo período."}</p>
    {carregando && <div className="fca-state" role="status"><span className="spinner" /> Carregando análises…</div>}
    {erro && !carregando && <div className="fca-state fca-error" role="alert"><strong>Não foi possível mostrar as análises.</strong>
      <span>{erro}</span><button className="btn btn-outline" onClick={() => setTentativa(atual => atual + 1)}>Tentar novamente</button></div>}
    {dados && !carregando && !erro && <>
      {dados.inconsistencias.length > 0 && <div className="fca-notice" role="status"><strong>{dados.inconsistencias.length} lançamentos precisam de revisão.</strong><Link href="/lancamentos">Revisar em Lançamentos →</Link></div>}
      <section className={`fca-summary ${medida === "PREVISTO" ? "fca-forecast" : ""}`} aria-label="Resumo analítico">
        {medida === "COMPARAR" ? ([
          ["Previsto", dados.previsto.resultado, "previsto"], ["Realizado", dados.realizado.resultado, "realizado"], ["Variação", dados.variacao.resultado, "variacao"],
        ] as const).map(([titulo, numero, classe]) => <button type="button" key={titulo} className={`${classe} ${sinal(numero)}`}
          onClick={() => classe === "variacao" ? abrirComparacao(titulo, numero, dados.realizado.componentes, dados.previsto.componentes)
            : abrir(titulo, numero, classe === "previsto" ? dados.previsto.componentes : dados.realizado.componentes,
              classe === "previsto" ? "PREVISTO" : "REALIZADO")}>
          <span>{titulo}</span><strong>{valor(numero)}</strong><small>{classe === "variacao" ? "Realizado − previsto" : "Resultado do período"}</small></button>) :
          ([ [medida === "PREVISTO" ? "A receber" : "Entradas", grupo!.entradas, "entrada"],
            [medida === "PREVISTO" ? "A pagar" : "Saídas", grupo!.saidas, "saida"],
            [medida === "PREVISTO" ? "Resultado previsto" : "Resultado", grupo!.resultado, "resultado"] ] as const)
            .map(([titulo, numero, classe]) => <button type="button" key={classe} className={`${classe} ${sinal(numero)}`}
              onClick={() => abrir(titulo, numero, grupo!.componentes.filter(item => classe === "resultado" || item.direcao === (classe === "entrada" ? "ENTRADA" : "SAIDA")), medida)}>
              <span>{titulo}</span><strong>{valor(numero)}</strong><small>{classe === "resultado" ? "Entradas − saídas" : "Total no período"}</small></button>)}
      </section>
      {vazio ? <div className="fca-no-data">Não há lançamentos {medida === "PREVISTO" ? "previstos" : medida === "REALIZADO" ? "realizados" : "previstos ou realizados"} neste período.
        <span>Altere período ou filtros para continuar a análise.</span></div> : <>
        <Grafico dados={dados} abrirDia={abrirDia} />
        <div className="fca-composition-grid"><ComposicaoPainel titulo="De onde vêm as entradas?" dados={dados.composicao.entradas} direcao="ENTRADA" medida={composicaoMedida}
          abrir={(titulo, numero, itens) => abrir(titulo, numero, itens, composicaoMedida)} />
          <ComposicaoPainel titulo="Para onde vão as saídas?" dados={dados.composicao.saidas} direcao="SAIDA" medida={composicaoMedida}
            abrir={(titulo, numero, itens) => abrir(titulo, numero, itens, composicaoMedida)} /></div>
        {medida === "COMPARAR" && <section className="fca-panel fca-comparison" aria-labelledby="fca-comparison-title"><div className="fca-section-heading"><div><h2 id="fca-comparison-title">Aderência ao previsto</h2>
          <p>Totais do período nas respectivas datas financeiras</p></div></div>
          <div className="fca-comparison-table"><span>Medida</span><span>Previsto</span><span>Realizado</span><span>Variação</span>
            {([ ["Entradas", "entradas"], ["Saídas", "saidas"], ["Resultado", "resultado"] ] as const).map(([titulo, campo]) => <button type="button" key={campo}
              onClick={() => abrirComparacao(titulo, dados.variacao[campo],
                dados.realizado.componentes.filter(item => campo === "resultado" || item.direcao === (campo === "entradas" ? "ENTRADA" : "SAIDA")),
                dados.previsto.componentes.filter(item => campo === "resultado" || item.direcao === (campo === "entradas" ? "ENTRADA" : "SAIDA")))}>
              <strong>{titulo}</strong><span>{valor(dados.previsto[campo])}</span><span>{valor(dados.realizado[campo])}</span><strong className={sinal(dados.variacao[campo])}>{valor(dados.variacao[campo])}</strong></button>)}</div></section>}
      </>}
    </>}
    </div>{detalhe && <Modal detalhe={detalhe} fechar={() => setDetalhe(null)} />}</div>;
}
