"use client";
import { useState, useEffect, useCallback } from "react";
import { formatCurrency } from "@/lib/formatters";

interface DayData {
  date: string;
  dayOfWeek: string;
  dayNum: number;
  monthShort: string;
  aReceber: number;
  aPagar: number;
  itens: number;
  isToday: boolean;
  isPast: boolean;
}

const DIAS_SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const DIAS_SEMANA_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MESES_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function getMonday(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.getFullYear(), d.getMonth(), diff);
}

function formatDateISO(d: Date): string {
  return d.toISOString().split("T")[0];
}

export default function RelatoriosPage() {
  const [days, setDays] = useState<DayData[]>([]);
  const [loading, setLoading] = useState(true);
  const [baseDate, setBaseDate] = useState("");
  const [agruparPor, setAgruparPor] = useState<"dataVencOriginal" | "dataVencPlano">("dataVencOriginal");
  const [statusManual, setStatusManual] = useState("");
  const [statusAuto, setStatusAuto] = useState("");
  const [statusList, setStatusList] = useState<{ codigo: string; nome: string }[]>([]);
  const [selectedDay, setSelectedDay] = useState<DayData | null>(null);
  const [detailData, setDetailData] = useState<any[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Init
  useEffect(() => {
    setBaseDate(new Date().toISOString().split("T")[0]);
    fetch("/api/status-tipos").then(r => r.json()).then(d => Array.isArray(d) && setStatusList(d)).catch(() => {});
  }, []);

  const loadData = useCallback(async () => {
    if (!baseDate) return;
    setLoading(true);

    const refDate = new Date(baseDate + "T00:00:00");
    const monday = getMonday(refDate);
    const today = new Date(); today.setHours(0, 0, 0, 0);

    // Gerar 14 dias (2 semanas) começando na segunda-feira
    const allDays: DayData[] = [];
    for (let i = 0; i < 14; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      allDays.push({
        date: formatDateISO(d),
        dayOfWeek: DIAS_SEMANA[d.getDay()],
        dayNum: d.getDate(),
        monthShort: MESES_SHORT[d.getMonth()],
        aReceber: 0,
        aPagar: 0,
        itens: 0,
        isToday: formatDateISO(d) === formatDateISO(today),
        isPast: d < today,
      });
    }

    // Buscar lançamentos do período (14 dias)
    const startDate = allDays[0].date;
    const endDate = allDays[13].date;

    try {
      const params = new URLSearchParams({
        dataInicio: startDate,
        dataFim: endDate,
        porPagina: "200",
        ...(statusManual ? { statusManual } : {}),
      });

      // Buscar todas as páginas
      let allLancamentos: any[] = [];
      let page = 1;
      let hasMore = true;
      while (hasMore) {
        params.set("pagina", String(page));
        const res = await fetch(`/api/lancamentos?${params}`);
        const json = await res.json();
        allLancamentos = [...allLancamentos, ...(json.data || [])];
        hasMore = json.data?.length === 200;
        page++;
      }

      // Filtrar por statusAuto se selecionado
      let filtered = allLancamentos;
      if (statusAuto) filtered = filtered.filter((l: any) => l.statusAuto === statusAuto);

      // Agrupar por data
      for (const l of filtered) {
        const dateField = agruparPor === "dataVencPlano" ? l.dataVencPlano : l.dataVencOriginal;
        if (!dateField) continue;
        const dateStr = dateField.slice(0, 10);
        const dayEntry = allDays.find(d => d.date === dateStr);
        if (!dayEntry) continue;

        if (l.tipo === "ENTRADA") dayEntry.aReceber += l.valor;
        else dayEntry.aPagar += l.valor;
        dayEntry.itens++;
      }
    } catch {}

    setDays(allDays);
    setLoading(false);
  }, [baseDate, agruparPor, statusManual, statusAuto]);

  useEffect(() => { loadData(); }, [loadData]);

  // Abrir detalhes do dia
  const openDay = async (day: DayData) => {
    setSelectedDay(day);
    setDetailLoading(true);
    try {
      const params = new URLSearchParams({
        dataInicio: day.date,
        dataFim: day.date,
        porPagina: "200",
      });
      const res = await fetch(`/api/lancamentos?${params}`);
      const json = await res.json();
      setDetailData(json.data || []);
    } catch { setDetailData([]); }
    setDetailLoading(false);
  };

  // Calcular totais semanais
  const week1 = days.slice(0, 7);
  const week2 = days.slice(7, 14);
  const totalWeek = (week: DayData[]) => ({
    aReceber: week.reduce((s, d) => s + d.aReceber, 0),
    aPagar: week.reduce((s, d) => s + d.aPagar, 0),
  });
  const total1 = totalWeek(week1);
  const total2 = totalWeek(week2);

  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      <header className="topbar">
        <div>
          <h1 className="page-title">Relatórios</h1>
          <p className="page-sub">Fluxo de Caixa → Relatórios — Visão diária dos recebimentos e pagamentos</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-outline">📊 Exportar CSV</button>
          <button className="btn btn-primary" onClick={loadData}>🔄 Filtrar</button>
        </div>
      </header>

      <div style={{ padding: "16px 28px" }}>
        {/* Filtros */}
        <div style={{ display: "flex", gap: 12, marginBottom: 20, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Data de até</label>
            <input type="date" className="filter-input" value={baseDate} onChange={e => setBaseDate(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Agrupar por data</label>
            <div style={{ display: "flex", gap: 4 }}>
              <button className={`btn btn-sm ${agruparPor === "dataVencOriginal" ? "btn-primary" : "btn-outline"}`} onClick={() => setAgruparPor("dataVencOriginal")}>Vencimento Original</button>
              <button className={`btn btn-sm ${agruparPor === "dataVencPlano" ? "btn-primary" : "btn-outline"}`} onClick={() => setAgruparPor("dataVencPlano")}>Vencimento Plano</button>
            </div>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Status Manual</label>
            <select className="filter-input" value={statusManual} onChange={e => setStatusManual(e.target.value)}>
              <option value="">Todos</option>
              {statusList.map(s => <option key={s.codigo} value={s.codigo}>{s.nome}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Status Automático</label>
            <select className="filter-input" value={statusAuto} onChange={e => setStatusAuto(e.target.value)}>
              <option value="">Todos</option>
              <option value="PAGO">Pago</option>
              <option value="ATRASADO">Atrasado</option>
              <option value="A VENCER">A Vencer</option>
              <option value="PREVISTO">Previsto</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>Carregando...</div>
        ) : (
          <>
            {/* Semana 1 */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 8, marginBottom: 16 }}>
              {week1.map(day => (
                <div key={day.date} onClick={() => openDay(day)} style={{
                  border: "1px solid var(--border)", borderRadius: 8, padding: "12px 10px", cursor: "pointer",
                  background: day.isToday ? "rgba(37,99,235,0.08)" : day.isPast ? "rgba(0,0,0,0.02)" : "var(--bg-card)",
                  opacity: day.isPast && !day.isToday ? 0.6 : 1,
                  borderColor: day.isToday ? "var(--accent-blue)" : "var(--border)",
                  transition: "transform 0.1s, box-shadow 0.1s",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontSize: 16, fontWeight: 700 }}>{day.dayNum} {day.monthShort}</span>
                    {day.isToday && <span style={{ fontSize: 9, background: "var(--accent-blue)", color: "#fff", padding: "1px 5px", borderRadius: 4, fontWeight: 700 }}>HOJE</span>}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 8 }}>{day.dayOfWeek}</div>
                  <div style={{ fontSize: 11, color: "var(--accent-green)", fontWeight: 600, marginBottom: 4 }}>A RECEBER</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent-green)", marginBottom: 8 }}>{formatCurrency(day.aReceber)}</div>
                  <div style={{ fontSize: 11, color: "var(--accent-red)", fontWeight: 600, marginBottom: 4 }}>A PAGAR</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent-red)" }}>{formatCurrency(day.aPagar)}</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 8 }}>📋 {day.itens} itens</div>
                </div>
              ))}
              {/* Total Semana 1 */}
              <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "12px 10px", background: "rgba(37,99,235,0.04)" }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: "var(--text-secondary)" }}>TOTAL SEMANAL</div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 8 }}>{week1[0]?.dayNum}/{week1[0]?.monthShort} a {week1[6]?.dayNum}/{week1[6]?.monthShort}</div>
                <div style={{ fontSize: 11, color: "var(--accent-green)", fontWeight: 600, marginBottom: 2 }}>A RECEBER</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--accent-green)", marginBottom: 8 }}>{formatCurrency(total1.aReceber)}</div>
                <div style={{ fontSize: 11, color: "var(--accent-red)", fontWeight: 600, marginBottom: 2 }}>A PAGAR</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--accent-red)", marginBottom: 8 }}>{formatCurrency(total1.aPagar)}</div>
                <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 2 }}>SALDO</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: total1.aReceber - total1.aPagar >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>{formatCurrency(total1.aReceber - total1.aPagar)}</div>
              </div>
            </div>

            {/* Semana 2 */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 8 }}>
              {week2.map(day => (
                <div key={day.date} onClick={() => openDay(day)} style={{
                  border: "1px solid var(--border)", borderRadius: 8, padding: "12px 10px", cursor: "pointer",
                  background: day.isToday ? "rgba(37,99,235,0.08)" : day.isPast ? "rgba(0,0,0,0.02)" : "var(--bg-card)",
                  opacity: day.isPast && !day.isToday ? 0.6 : 1,
                  borderColor: day.isToday ? "var(--accent-blue)" : "var(--border)",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontSize: 16, fontWeight: 700 }}>{day.dayNum} {day.monthShort}</span>
                    {day.isToday && <span style={{ fontSize: 9, background: "var(--accent-blue)", color: "#fff", padding: "1px 5px", borderRadius: 4, fontWeight: 700 }}>HOJE</span>}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 8 }}>{day.dayOfWeek}</div>
                  <div style={{ fontSize: 11, color: "var(--accent-green)", fontWeight: 600, marginBottom: 4 }}>A RECEBER</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent-green)", marginBottom: 8 }}>{formatCurrency(day.aReceber)}</div>
                  <div style={{ fontSize: 11, color: "var(--accent-red)", fontWeight: 600, marginBottom: 4 }}>A PAGAR</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--accent-red)" }}>{formatCurrency(day.aPagar)}</div>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 8 }}>📋 {day.itens} itens</div>
                </div>
              ))}
              {/* Total Semana 2 */}
              <div style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "12px 10px", background: "rgba(37,99,235,0.04)" }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: "var(--text-secondary)" }}>TOTAL SEMANAL</div>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 8 }}>{week2[0]?.dayNum}/{week2[0]?.monthShort} a {week2[6]?.dayNum}/{week2[6]?.monthShort}</div>
                <div style={{ fontSize: 11, color: "var(--accent-green)", fontWeight: 600, marginBottom: 2 }}>A RECEBER</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--accent-green)", marginBottom: 8 }}>{formatCurrency(total2.aReceber)}</div>
                <div style={{ fontSize: 11, color: "var(--accent-red)", fontWeight: 600, marginBottom: 2 }}>A PAGAR</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--accent-red)", marginBottom: 8 }}>{formatCurrency(total2.aPagar)}</div>
                <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 2 }}>SALDO</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: total2.aReceber - total2.aPagar >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>{formatCurrency(total2.aReceber - total2.aPagar)}</div>
              </div>
            </div>

            <div style={{ textAlign: "center", marginTop: 12, fontSize: 11, color: "var(--text-muted)" }}>📅 Exibindo 14 dias</div>
          </>
        )}

        {/* Modal de Detalhes do Dia */}
        {selectedDay && (
          <div className="modal-overlay" style={{ opacity: 1, pointerEvents: "all" }} onClick={() => setSelectedDay(null)}>
            <div className="modal-content modal-lg" style={{ maxWidth: 800 }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <h2 className="modal-title">Detalhes do dia {selectedDay.dayNum}/{selectedDay.monthShort} ({selectedDay.dayOfWeek})</h2>
                </div>
                <button className="modal-close" onClick={() => setSelectedDay(null)}>✕</button>
              </div>
              <div className="modal-body">
                {/* KPIs do dia */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
                  <div style={{ padding: 12, borderRadius: 8, background: "var(--kpi-green-bg)", border: "1px solid var(--kpi-green-border)" }}>
                    <div style={{ fontSize: 11, color: "var(--accent-green)", fontWeight: 600 }}>A RECEBER</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: "var(--accent-green)" }}>{formatCurrency(selectedDay.aReceber)}</div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Total de recebimentos</div>
                  </div>
                  <div style={{ padding: 12, borderRadius: 8, background: "var(--kpi-red-bg)", border: "1px solid var(--kpi-red-border)" }}>
                    <div style={{ fontSize: 11, color: "var(--accent-red)", fontWeight: 600 }}>A PAGAR</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: "var(--accent-red)" }}>{formatCurrency(selectedDay.aPagar)}</div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Total de pagamentos</div>
                  </div>
                  <div style={{ padding: 12, borderRadius: 8, background: "var(--kpi-blue-bg)", border: "1px solid var(--kpi-blue-border)" }}>
                    <div style={{ fontSize: 11, fontWeight: 600 }}>SALDO DO DIA</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: selectedDay.aReceber - selectedDay.aPagar >= 0 ? "var(--accent-green)" : "var(--accent-red)" }}>{formatCurrency(selectedDay.aReceber - selectedDay.aPagar)}</div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)" }}>Diferença</div>
                  </div>
                </div>

                {/* Tabela de lançamentos do dia */}
                {detailLoading ? (
                  <div style={{ textAlign: "center", padding: 20, color: "var(--text-muted)" }}>Carregando...</div>
                ) : (
                  <>
                    <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Recebimentos ({detailData.filter((l: any) => l.tipo === "ENTRADA").length})</h4>
                    <table className="data-table" style={{ fontSize: 11, marginBottom: 16, borderCollapse: "separate", borderSpacing: 0 }}>
                      <thead><tr><th>#</th><th>Descrição</th><th>Empresa</th><th>Banco</th><th>Venc. Original</th><th>Venc. Plano</th><th style={{ textAlign: "right" }}>Valor</th><th>Status</th></tr></thead>
                      <tbody>
                        {detailData.filter((l: any) => l.tipo === "ENTRADA").map((l: any, i: number) => (
                          <tr key={l.id}><td>{i + 1}</td><td>{l.descricao}</td><td>{l.fornecedor || "—"}</td><td>{l.banco || "—"}</td><td>{l.dataVencOriginal || "—"}</td><td>{l.dataVencPlano || "—"}</td><td style={{ textAlign: "right", color: "var(--accent-green)", fontWeight: 600 }}>{formatCurrency(l.valor)}</td><td><span className="chip chip-entrada" style={{ fontSize: 9 }}>Entrada</span></td></tr>
                        ))}
                        {detailData.filter((l: any) => l.tipo === "ENTRADA").length === 0 && <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--text-muted)", padding: 12 }}>Nenhum recebimento</td></tr>}
                      </tbody>
                    </table>

                    <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Pagamentos ({detailData.filter((l: any) => l.tipo === "SAIDA").length})</h4>
                    <table className="data-table" style={{ fontSize: 11, borderCollapse: "separate", borderSpacing: 0 }}>
                      <thead><tr><th>#</th><th>Descrição</th><th>Empresa</th><th>Banco</th><th>Venc. Original</th><th>Venc. Plano</th><th style={{ textAlign: "right" }}>Valor</th><th>Status</th></tr></thead>
                      <tbody>
                        {detailData.filter((l: any) => l.tipo === "SAIDA").map((l: any, i: number) => (
                          <tr key={l.id}><td>{i + 1}</td><td>{l.descricao}</td><td>{l.fornecedor || "—"}</td><td>{l.banco || "—"}</td><td>{l.dataVencOriginal || "—"}</td><td>{l.dataVencPlano || "—"}</td><td style={{ textAlign: "right", color: "var(--accent-red)", fontWeight: 600 }}>{formatCurrency(l.valor)}</td><td><span className="chip chip-saida" style={{ fontSize: 9 }}>Saída</span></td></tr>
                        ))}
                        {detailData.filter((l: any) => l.tipo === "SAIDA").length === 0 && <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--text-muted)", padding: 12 }}>Nenhum pagamento</td></tr>}
                      </tbody>
                    </table>
                  </>
                )}
              </div>
              <div className="modal-actions">
                <button className="btn btn-outline" onClick={() => setSelectedDay(null)}>Fechar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
