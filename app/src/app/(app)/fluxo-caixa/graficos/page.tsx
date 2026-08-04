"use client";
import { useState, useEffect, useCallback } from "react";
import { formatCurrency } from "@/lib/formatters";

type Visao = "2semanas" | "mensal";
type BaseData = "dataVencOriginal" | "dataVencPlano" | "dataPagamento";
type TipoValor = "valorPrevisto" | "valor";

interface DayAgg { date: string; label: string; aReceber: number; aPagar: number; }

function getMonday(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.getFullYear(), d.getMonth(), diff);
}

function fmtISO(d: Date) { return d.toISOString().split("T")[0]; }
function fmtBR(d: string) { const p = d.split("-"); return `${p[2]}/${p[1]}`; }

export default function GraficosPage() {
  const [visao, setVisao] = useState<Visao>("2semanas");
  const [baseData, setBaseData] = useState<BaseData>("dataVencOriginal");
  const [tipoValor, setTipoValor] = useState<TipoValor>("valorPrevisto");
  const [mesAno, setMesAno] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; });
  const [periodoInicio, setPeriodoInicio] = useState(() => fmtISO(getMonday(new Date())));
  const [periodoFim, setPeriodoFim] = useState(() => { const d = getMonday(new Date()); d.setDate(d.getDate() + 13); return fmtISO(d); });
  const [data, setData] = useState<DayAgg[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    let startDate: string, endDate: string;

    if (visao === "2semanas") {
      startDate = periodoInicio;
      endDate = periodoFim;
    } else {
      const [y, m] = mesAno.split("-").map(Number);
      startDate = `${y}-${String(m).padStart(2, "0")}-01`;
      const lastDay = new Date(y, m, 0).getDate();
      endDate = `${y}-${String(m).padStart(2, "0")}-${lastDay}`;
    }

    try {
      let allLancamentos: any[] = [];
      let page = 1; let hasMore = true;
      while (hasMore) {
        const params = new URLSearchParams({ dataInicio: startDate, dataFim: endDate, porPagina: "200", pagina: String(page) });
        const res = await fetch(`/api/lancamentos?${params}`);
        const json = await res.json();
        allLancamentos = [...allLancamentos, ...(json.data || [])];
        hasMore = json.data?.length === 200;
        page++;
      }

      // Gerar dias do período
      const start = new Date(startDate + "T00:00:00");
      const end = new Date(endDate + "T00:00:00");
      const days: DayAgg[] = [];
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        days.push({ date: fmtISO(d), label: fmtBR(fmtISO(d)), aReceber: 0, aPagar: 0 });
      }

      // Agrupar
      for (const l of allLancamentos) {
        const dateField = l[baseData];
        if (!dateField) continue;
        const dateStr = dateField.slice(0, 10);
        const dayEntry = days.find(d => d.date === dateStr);
        if (!dayEntry) continue;
        const valor = tipoValor === "valorPrevisto" ? (l.valorPrevisto || l.valor) : l.valor;
        if (l.tipo === "ENTRADA") dayEntry.aReceber += valor;
        else dayEntry.aPagar += valor;
      }

      setData(days);
    } catch {} finally { setLoading(false); }
  }, [visao, baseData, tipoValor, periodoInicio, periodoFim, mesAno]);

  useEffect(() => { loadData(); }, [loadData]);

  // KPIs
  const totalReceber = data.reduce((s, d) => s + d.aReceber, 0);
  const totalPagar = data.reduce((s, d) => s + d.aPagar, 0);
  const saldo = totalReceber - totalPagar;
  const liquidez = totalPagar > 0 ? (totalReceber / totalPagar).toFixed(2) : "—";

  // Max para gráfico de barras
  const maxVal = Math.max(...data.map(d => Math.max(d.aReceber, d.aPagar)), 1);

  // Semanas para visão 2 semanas
  const semana1 = data.slice(0, 7);
  const semana2 = data.slice(7, 14);

  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      <header className="topbar">
        <div>
          <h1 className="page-title">Relatórios</h1>
          <p className="page-sub">Fluxo de Caixa → Gráficos — Análise gráfica da movimentação financeira</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-outline">📊 Exportar CSV</button>
          <button className="btn btn-primary" onClick={loadData}>🔄 Filtrar</button>
        </div>
      </header>

      <div style={{ padding: "16px 28px" }}>
        {/* Filtros */}
        <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "flex-end", flexWrap: "wrap" }}>
          {/* Visão toggle */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Visão</label>
            <div style={{ display: "flex", gap: 4 }}>
              <button className={`btn btn-sm ${visao === "2semanas" ? "btn-primary" : "btn-outline"}`} onClick={() => setVisao("2semanas")}>2 Semanas</button>
              <button className={`btn btn-sm ${visao === "mensal" ? "btn-primary" : "btn-outline"}`} onClick={() => setVisao("mensal")}>Mensal</button>
            </div>
          </div>

          {visao === "2semanas" ? (
            <>
              <div className="form-group" style={{ marginBottom: 0 }}><label>Período</label>
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}><input type="date" className="filter-input" value={periodoInicio} onChange={e => setPeriodoInicio(e.target.value)} /><span style={{ fontSize: 12 }}>até</span><input type="date" className="filter-input" value={periodoFim} onChange={e => setPeriodoFim(e.target.value)} /></div>
              </div>
            </>
          ) : (
            <div className="form-group" style={{ marginBottom: 0 }}><label>Mês/Ano</label><input type="month" className="filter-input" value={mesAno} onChange={e => setMesAno(e.target.value)} /></div>
          )}

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Base de data</label>
            <select className="filter-input" value={baseData} onChange={e => setBaseData(e.target.value as BaseData)}>
              <option value="dataVencOriginal">Vencimento Original</option>
              <option value="dataVencPlano">Vencimento Plano</option>
              <option value="dataPagamento">Data Pagamento</option>
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Tipo de valor</label>
            <div style={{ display: "flex", gap: 4 }}>
              <button className={`btn btn-sm ${tipoValor === "valorPrevisto" ? "btn-primary" : "btn-outline"}`} onClick={() => setTipoValor("valorPrevisto")}>Valor Previsto</button>
              <button className={`btn btn-sm ${tipoValor === "valor" ? "btn-primary" : "btn-outline"}`} onClick={() => setTipoValor("valor")}>Valor Realizado</button>
            </div>
          </div>
        </div>

        {/* KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
          <div className="kpi kpi-green"><div className="kpi-label">A Receber</div><div className="kpi-value">{formatCurrency(totalReceber)}</div><div className="kpi-sub">Total no período</div></div>
          <div className="kpi kpi-red"><div className="kpi-label">A Pagar</div><div className="kpi-value">{formatCurrency(totalPagar)}</div><div className="kpi-sub">Total no período</div></div>
          <div className="kpi kpi-blue"><div className="kpi-label">Saldo do Período</div><div className="kpi-value">{formatCurrency(saldo)}</div><div className="kpi-sub">Diferença (A Receber - A Pagar)</div></div>
          <div className="kpi" style={{ background: "rgba(124,58,237,0.06)", borderColor: "rgba(124,58,237,0.2)" }}><div className="kpi-label">Índice de Liquidez</div><div className="kpi-value" style={{ color: "#7c3aed" }}>{liquidez}</div><div className="kpi-sub">A Receber / A Pagar</div></div>
        </div>

        {loading ? <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Carregando...</div> : (
          <>
            {/* Gráfico de Barras */}
            {visao === "2semanas" && semana1.length > 0 && (
              <>
                <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Semana 1: {semana1[0]?.label} a {semana1[6]?.label} ({tipoValor === "valorPrevisto" ? "Valor Previsto" : "Valor Realizado"})</h3>
                <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 160, marginBottom: 8, borderBottom: "1px solid var(--border)", paddingBottom: 4 }}>
                  {semana1.map(d => (
                    <div key={d.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                      <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 120 }}>
                        <div style={{ width: 12, background: "var(--accent-green)", borderRadius: "3px 3px 0 0", height: `${(d.aReceber / maxVal) * 120}px`, minHeight: d.aReceber > 0 ? 2 : 0 }} title={`Receber: ${formatCurrency(d.aReceber)}`} />
                        <div style={{ width: 12, background: "var(--accent-red)", borderRadius: "3px 3px 0 0", height: `${(d.aPagar / maxVal) * 120}px`, minHeight: d.aPagar > 0 ? 2 : 0 }} title={`Pagar: ${formatCurrency(d.aPagar)}`} />
                      </div>
                      <span style={{ fontSize: 9, color: "var(--text-muted)" }}>{d.label}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 12, marginBottom: 24, fontSize: 11 }}>
                  <span><span style={{ display: "inline-block", width: 10, height: 10, background: "var(--accent-green)", borderRadius: 2, marginRight: 4 }} />A Receber</span>
                  <span><span style={{ display: "inline-block", width: 10, height: 10, background: "var(--accent-red)", borderRadius: 2, marginRight: 4 }} />A Pagar</span>
                </div>
              </>
            )}

            {visao === "2semanas" && semana2.length > 0 && (
              <>
                <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Semana 2: {semana2[0]?.label} a {semana2[semana2.length - 1]?.label} ({tipoValor === "valorPrevisto" ? "Valor Previsto" : "Valor Realizado"})</h3>
                <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 160, marginBottom: 8, borderBottom: "1px solid var(--border)", paddingBottom: 4 }}>
                  {semana2.map(d => (
                    <div key={d.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                      <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 120 }}>
                        <div style={{ width: 12, background: "var(--accent-green)", borderRadius: "3px 3px 0 0", height: `${(d.aReceber / maxVal) * 120}px`, minHeight: d.aReceber > 0 ? 2 : 0 }} title={`Receber: ${formatCurrency(d.aReceber)}`} />
                        <div style={{ width: 12, background: "var(--accent-red)", borderRadius: "3px 3px 0 0", height: `${(d.aPagar / maxVal) * 120}px`, minHeight: d.aPagar > 0 ? 2 : 0 }} title={`Pagar: ${formatCurrency(d.aPagar)}`} />
                      </div>
                      <span style={{ fontSize: 9, color: "var(--text-muted)" }}>{d.label}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Visão Mensal */}
            {visao === "mensal" && (
              <>
                <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Movimentação Financeira — {mesAno} ({tipoValor === "valorPrevisto" ? "Valor Previsto" : "Valor Realizado"})</h3>

                {/* Tabela matricial resumida */}
                <div style={{ overflowX: "auto", marginBottom: 24, border: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
                  <table className="data-table" style={{ fontSize: 10, borderCollapse: "separate", borderSpacing: 0 }}>
                    <thead>
                      <tr>
                        <th style={{ position: "sticky", left: 0, background: "#F8FAFC", zIndex: 3, minWidth: 80 }}>Dia</th>
                        {data.map(d => <th key={d.date} style={{ minWidth: 60, textAlign: "right" }}>{d.label}</th>)}
                        <th style={{ minWidth: 80, textAlign: "right", fontWeight: 700 }}>TOTAL</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={{ position: "sticky", left: 0, background: "var(--bg-card)", fontWeight: 600, color: "var(--accent-green)" }}>Entradas</td>
                        {data.map(d => <td key={d.date} style={{ textAlign: "right", color: d.aReceber > 0 ? "var(--accent-green)" : "var(--text-muted)" }}>{d.aReceber > 0 ? (d.aReceber / 1000).toFixed(1) : "—"}</td>)}
                        <td style={{ textAlign: "right", fontWeight: 700, color: "var(--accent-green)" }}>{(totalReceber / 1000).toFixed(1)}</td>
                      </tr>
                      <tr>
                        <td style={{ position: "sticky", left: 0, background: "var(--bg-card)", fontWeight: 600, color: "var(--accent-red)" }}>Saídas</td>
                        {data.map(d => <td key={d.date} style={{ textAlign: "right", color: d.aPagar > 0 ? "var(--accent-red)" : "var(--text-muted)" }}>{d.aPagar > 0 ? (d.aPagar / 1000).toFixed(1) : "—"}</td>)}
                        <td style={{ textAlign: "right", fontWeight: 700, color: "var(--accent-red)" }}>{(totalPagar / 1000).toFixed(1)}</td>
                      </tr>
                      <tr style={{ borderTop: "2px solid var(--border)" }}>
                        <td style={{ position: "sticky", left: 0, background: "var(--bg-card)", fontWeight: 700 }}>Saldo Dia</td>
                        {data.map(d => { const s = d.aReceber - d.aPagar; return <td key={d.date} style={{ textAlign: "right", fontWeight: 600, color: s >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>{s !== 0 ? (s / 1000).toFixed(1) : "—"}</td>; })}
                        <td style={{ textAlign: "right", fontWeight: 700 }}>{(saldo / 1000).toFixed(1)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Gráfico de barras mensal */}
                <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Recebimentos e Pagamentos Diários</h4>
                <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 140, marginBottom: 8, borderBottom: "1px solid var(--border)", paddingBottom: 4 }}>
                  {data.map(d => (
                    <div key={d.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                      <div style={{ display: "flex", gap: 1, alignItems: "flex-end", height: 110 }}>
                        <div style={{ width: 6, background: "var(--accent-green)", borderRadius: "2px 2px 0 0", height: `${(d.aReceber / maxVal) * 110}px`, minHeight: d.aReceber > 0 ? 1 : 0 }} />
                        <div style={{ width: 6, background: "var(--accent-red)", borderRadius: "2px 2px 0 0", height: `${(d.aPagar / maxVal) * 110}px`, minHeight: d.aPagar > 0 ? 1 : 0 }} />
                      </div>
                      <span style={{ fontSize: 7, color: "var(--text-muted)" }}>{d.date.slice(8)}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 12, fontSize: 11, color: "var(--text-muted)" }}>
                  <span><span style={{ display: "inline-block", width: 10, height: 10, background: "var(--accent-green)", borderRadius: 2, marginRight: 4 }} />A Receber</span>
                  <span><span style={{ display: "inline-block", width: 10, height: 10, background: "var(--accent-red)", borderRadius: 2, marginRight: 4 }} />A Pagar</span>
                </div>
              </>
            )}

            {/* Totais por semana (2 semanas) */}
            {visao === "2semanas" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 24 }}>
                <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 16 }}>
                  <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Semana 1</h4>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 12 }}>Total Recebimentos</span><span style={{ fontWeight: 700, color: "var(--accent-green)" }}>{formatCurrency(semana1.reduce((s, d) => s + d.aReceber, 0))}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 12 }}>Total Pagamentos</span><span style={{ fontWeight: 700, color: "var(--accent-red)" }}>{formatCurrency(semana1.reduce((s, d) => s + d.aPagar, 0))}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--border)", paddingTop: 6, marginTop: 6 }}><span style={{ fontSize: 12, fontWeight: 600 }}>Saldo da Semana</span><span style={{ fontWeight: 700 }}>{formatCurrency(semana1.reduce((s, d) => s + d.aReceber - d.aPagar, 0))}</span></div>
                </div>
                <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 16 }}>
                  <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Semana 2</h4>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 12 }}>Total Recebimentos</span><span style={{ fontWeight: 700, color: "var(--accent-green)" }}>{formatCurrency(semana2.reduce((s, d) => s + d.aReceber, 0))}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 12 }}>Total Pagamentos</span><span style={{ fontWeight: 700, color: "var(--accent-red)" }}>{formatCurrency(semana2.reduce((s, d) => s + d.aPagar, 0))}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--border)", paddingTop: 6, marginTop: 6 }}><span style={{ fontSize: 12, fontWeight: 600 }}>Saldo da Semana</span><span style={{ fontWeight: 700 }}>{formatCurrency(semana2.reduce((s, d) => s + d.aReceber - d.aPagar, 0))}</span></div>
                </div>
              </div>
            )}

            <div style={{ textAlign: "center", marginTop: 16, fontSize: 10, color: "var(--text-muted)" }}>ℹ️ Os valores apresentados são baseados no {tipoValor === "valorPrevisto" ? "Valor Previsto" : "Valor Realizado"} utilizando como referência a {baseData === "dataVencOriginal" ? "Data Vencimento Original" : baseData === "dataVencPlano" ? "Data Vencimento Plano" : "Data Pagamento"}.</div>
          </>
        )}
      </div>
    </div>
  );
}
