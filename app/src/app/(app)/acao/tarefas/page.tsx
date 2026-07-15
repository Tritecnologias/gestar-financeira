"use client";
import { useState, useEffect, useCallback, useRef } from "react";

interface TarefaStatus { id: string; nome: string; cor: string; ordem: number; }
interface Coluna { nome: string; tipo: string; ordem: number; }
interface Linha { id: string; valores: Record<string, any>; ok: boolean; }
interface Tarefa { id: string; seq: number; nome: string; status: string; statusCor?: string; colunas: Coluna[]; linhas: Linha[]; }

export default function TarefasPage() {
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [statusList, setStatusList] = useState<TarefaStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [openTarefa, setOpenTarefa] = useState<Tarefa | null>(null);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [showColModal, setShowColModal] = useState(false);
  const [newColNome, setNewColNome] = useState("");
  const [newColTipo, setNewColTipo] = useState("Texto");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTarefaNome, setNewTarefaNome] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tRes, sRes] = await Promise.all([fetch("/api/tarefas"), fetch("/api/tarefas/status")]);
      const tData = await tRes.json(); const sData = await sRes.json();
      if (Array.isArray(tData)) setTarefas(tData);
      if (Array.isArray(sData)) setStatusList(sData);
    } catch {} finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Criar tarefa
  const criarTarefa = async () => {
    if (!newTarefaNome.trim()) return;
    setSaving(true);
    const res = await fetch("/api/tarefas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: newTarefaNome }) });
    if (res.ok) { setNewTarefaNome(""); load(); }
    setSaving(false);
  };

  // Excluir tarefa
  const excluirTarefa = async (id: string) => { if (!confirm("Excluir esta tarefa?")) return; await fetch(`/api/tarefas/${id}`, { method: "DELETE" }); load(); };

  // Atualizar tarefa
  const updateTarefa = async (id: string, data: Partial<Tarefa>) => {
    await fetch(`/api/tarefas/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    load();
    if (openTarefa?.id === id) { setOpenTarefa(prev => prev ? { ...prev, ...data } : null); }
  };

  // Criar coluna na tarefa aberta
  const criarColuna = () => {
    if (!openTarefa || !newColNome.trim()) return;
    const novasColunas = [...(openTarefa.colunas || []), { nome: newColNome.trim(), tipo: newColTipo, ordem: (openTarefa.colunas || []).length }];
    updateTarefa(openTarefa.id, { colunas: novasColunas as any });
    setOpenTarefa(prev => prev ? { ...prev, colunas: novasColunas } : null);
    setNewColNome(""); setNewColTipo("Texto"); setShowColModal(false);
  };

  // Excluir coluna
  const excluirColuna = (idx: number) => {
    if (!openTarefa) return;
    const novasColunas = openTarefa.colunas.filter((_, i) => i !== idx);
    updateTarefa(openTarefa.id, { colunas: novasColunas as any });
    setOpenTarefa(prev => prev ? { ...prev, colunas: novasColunas } : null);
  };

  // Adicionar linha
  const addLinha = () => {
    if (!openTarefa) return;
    const novaLinha: Linha = { id: Math.random().toString(36).slice(2) + Date.now().toString(36), valores: {}, ok: false };
    const novasLinhas = [...(openTarefa.linhas || []), novaLinha];
    updateTarefa(openTarefa.id, { linhas: novasLinhas as any });
    setOpenTarefa(prev => prev ? { ...prev, linhas: novasLinhas } : null);
  };

  // Atualizar valor de célula (local + debounce save)
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updateCelula = (linhaId: string, colNome: string, valor: any) => {
    if (!openTarefa) return;
    const novasLinhas = openTarefa.linhas.map(l => l.id === linhaId ? { ...l, valores: { ...l.valores, [colNome]: valor } } : l);
    setOpenTarefa(prev => prev ? { ...prev, linhas: novasLinhas } : null);
    // Debounce: salvar no servidor após 800ms de inatividade
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      fetch(`/api/tarefas/${openTarefa.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ linhas: novasLinhas }) });
    }, 800);
  };

  // Toggle OK
  const toggleOk = (linhaId: string) => {
    if (!openTarefa) return;
    const novasLinhas = openTarefa.linhas.map(l => l.id === linhaId ? { ...l, ok: !l.ok } : l);
    updateTarefa(openTarefa.id, { linhas: novasLinhas as any });
    setOpenTarefa(prev => prev ? { ...prev, linhas: novasLinhas } : null);
  };

  // Exportar CSV
  const exportarCSV = () => {
    if (!openTarefa) return;
    const cols = ["#", ...openTarefa.colunas.map(c => c.nome), "OK", "CONT"];
    const rows = openTarefa.linhas.map((l, i) => [i + 1, ...openTarefa.colunas.map(c => l.valores[c.nome] ?? ""), l.ok ? "OK" : "", 1]);
    const csv = [cols.join(","), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${openTarefa.nome}.csv`; a.click();
  };

  // Soma de coluna numérica
  const somaColuna = (colNome: string) => {
    if (!openTarefa) return null;
    const col = openTarefa.colunas.find(c => c.nome === colNome);
    if (!col || !["Número Inteiro", "Número Decimal", "Moeda", "Percentual"].includes(col.tipo)) return null;
    const soma = openTarefa.linhas.reduce((acc, l) => acc + (parseFloat(l.valores[colNome]) || 0), 0);
    return soma;
  };

  const getStatusColor = (status: string) => statusList.find(s => s.nome === status)?.cor || "#3b82f6";

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>Carregando...</div>;

  // Modal de tarefa aberta
  if (openTarefa) {
    return (
      <div style={{ height: "100%", overflowY: "auto", background: "var(--bg-deep)" }}>
        <div style={{ padding: "20px 28px" }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>#{openTarefa.seq} | {openTarefa.nome} | {openTarefa.status}</h2>
              <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 4, background: getStatusColor(openTarefa.status), color: "#fff" }}>{openTarefa.status}</span>
            </div>
            <button onClick={() => { setOpenTarefa(null); load(); }} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "var(--accent-red)" }}>✕</button>
          </div>

          {/* Ações */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <button className="btn btn-primary btn-sm" onClick={() => setShowColModal(true)}>Criar Coluna</button>
            <button className="btn btn-primary btn-sm" onClick={addLinha}>Adicionar Linha</button>
            <button className="btn btn-outline btn-sm" onClick={exportarCSV}>Exportar</button>
          </div>

          {/* Tabela */}
          <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: "var(--radius)", background: "var(--bg-card)" }}>
            {/* Somas acima do header */}
            <div style={{ display: "flex", fontSize: 11, fontWeight: 700, color: "var(--accent-red)", padding: "4px 0" }}>
              <span style={{ width: 40 }}></span>
              {openTarefa.colunas.map(c => { const s = somaColuna(c.nome); return <span key={c.nome} style={{ flex: 1, minWidth: 120, textAlign: "right", padding: "0 8px" }}>{s !== null ? s.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : ""}</span>; })}
              <span style={{ width: 40 }}></span>
              <span style={{ width: 50, textAlign: "center" }}>{openTarefa.linhas.length}</span>
            </div>
            <table className="data-table" style={{ fontSize: 12, borderCollapse: "separate", borderSpacing: 0 }}>
              <thead>
                <tr>
                  <th style={{ width: 40, position: "sticky", top: 0, background: "#1e3a5f", color: "#fff", zIndex: 2 }}>#</th>
                  {openTarefa.colunas.map((c, i) => (
                    <th key={i} style={{ position: "sticky", top: 0, background: "#1e3a5f", color: "#fff", zIndex: 2, minWidth: 120 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div><div style={{ fontSize: 9, opacity: 0.7 }}>{c.tipo}</div>{c.nome}</div>
                        <button onClick={() => excluirColuna(i)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", fontSize: 12 }}>✕</button>
                      </div>
                    </th>
                  ))}
                  <th style={{ width: 40, position: "sticky", top: 0, background: "#1e3a5f", color: "#fff", zIndex: 2 }}>OK</th>
                  <th style={{ width: 50, position: "sticky", top: 0, background: "#1e3a5f", color: "#fff", zIndex: 2 }}>CONT</th>
                </tr>
              </thead>
              <tbody>
                {openTarefa.linhas.map((linha, i) => (
                  <tr key={linha.id} style={{ background: linha.ok ? "rgba(5,150,105,0.06)" : undefined }}>
                    <td style={{ color: "var(--text-muted)", fontSize: 11 }}>{i + 1}</td>
                    {openTarefa.colunas.map(c => (
                      <td key={c.nome}>
                        {c.tipo === "Lista" ? (
                          <select className="cell-input" value={linha.valores[c.nome] || ""} onChange={e => updateCelula(linha.id, c.nome, e.target.value)} style={{ fontSize: 11, background: linha.valores[c.nome] ? getStatusColor(linha.valores[c.nome]) : undefined, color: linha.valores[c.nome] ? "#fff" : undefined }}>
                            <option value="">—</option>
                            {statusList.map(s => <option key={s.id} value={s.nome}>{s.nome}</option>)}
                          </select>
                        ) : (
                          <input className="cell-input" type={["Número Inteiro", "Número Decimal", "Moeda", "Percentual"].includes(c.tipo) ? "number" : c.tipo === "Data" ? "date" : "text"} step={["Número Decimal", "Moeda", "Percentual"].includes(c.tipo) ? "0.01" : undefined} value={linha.valores[c.nome] ?? ""} onChange={e => updateCelula(linha.id, c.nome, e.target.value)} style={{ fontSize: 11 }} />
                        )}
                      </td>
                    ))}
                    <td style={{ textAlign: "center" }}><button onClick={() => toggleOk(linha.id)} style={{ background: linha.ok ? "var(--accent-green)" : "var(--bg-hover)", color: linha.ok ? "#fff" : "var(--text-muted)", border: "none", borderRadius: 4, padding: "2px 6px", cursor: "pointer", fontSize: 10, fontWeight: 700 }}>{linha.ok ? "OK" : "—"}</button></td>
                    <td style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 11 }}>1</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Modal criar coluna */}
          {showColModal && (
            <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }} onClick={() => setShowColModal(false)}>
              <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: 24, minWidth: 320 }} onClick={e => e.stopPropagation()}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}><h3 style={{ fontSize: 15, fontWeight: 700 }}>Criar Coluna</h3><button onClick={() => setShowColModal(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16 }}>✕</button></div>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                  <div className="form-group" style={{ marginBottom: 0 }}><label>Nome da coluna</label><input type="text" value={newColNome} onChange={e => setNewColNome(e.target.value)} placeholder="VALOR GASTO" /></div>
                  <div className="form-group" style={{ marginBottom: 0 }}><label>Tipo de dados</label>
                    <select value={newColTipo} onChange={e => setNewColTipo(e.target.value)}>
                      <option>Texto</option><option>Número Inteiro</option><option>Número Decimal</option><option>Moeda</option><option>Percentual</option><option>Data</option><option>Data/hora</option><option>Hora</option><option>Duração</option><option>Lista</option>
                    </select>
                  </div>
                </div>
                <button className="btn btn-primary" onClick={criarColuna} style={{ marginTop: 16 }}>Criar</button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Página principal: lista de tarefas
  return (
    <div style={{ height: "100%", overflowY: "auto" }}>
      <header className="topbar"><div><h1 className="page-title">Ação - Tarefas</h1><p className="page-sub">Organize listas de tarefas com colunas livres, status editáveis e exportação.</p></div></header>
      <div style={{ padding: "16px 28px" }}>
        <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 20, marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div><h3 style={{ fontSize: 15, fontWeight: 700 }}>Listas de Tarefas</h3><p style={{ fontSize: 12, color: "var(--text-muted)" }}>Crie listas de acompanhamento e abra cada tarefa para montar a tabela do jeito que precisar.</p></div>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn btn-primary btn-sm" onClick={() => setShowCreateModal(true)}>Criar Tarefa</button>
              <button className="btn btn-outline btn-sm" onClick={() => setShowStatusModal(true)}>Status</button>
            </div>
          </div>

          {/* Tabela de tarefas */}
          <table className="data-table" style={{ fontSize: 13, borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr>
                <th style={{ width: 40, background: "#1e3a5f", color: "#fff" }}>#</th>
                <th style={{ background: "#1e3a5f", color: "#fff" }}>NOME DA TAREFA</th>
                <th style={{ width: 160, background: "#1e3a5f", color: "#fff" }}>STATUS</th>
                <th style={{ width: 140, background: "#1e3a5f", color: "#fff", textAlign: "center" }}>AÇÃO</th>
              </tr>
            </thead>
            <tbody>
              {tarefas.map(t => (
                <tr key={t.id}>
                  <td style={{ color: "var(--text-muted)", fontSize: 11 }}>{t.seq}</td>
                  <td style={{ fontWeight: 600 }}>{t.nome}</td>
                  <td>
                    <select className="cell-input" value={t.status} onChange={e => updateTarefa(t.id, { status: e.target.value })} style={{ background: getStatusColor(t.status), color: "#fff", fontWeight: 600, fontSize: 11, borderRadius: 4 }}>
                      {statusList.map(s => <option key={s.id} value={s.nome}>{s.nome}</option>)}
                      {!statusList.find(s => s.nome === t.status) && <option value={t.status}>{t.status}</option>}
                    </select>
                  </td>
                  <td style={{ textAlign: "center" }}>
                    <button className="btn btn-primary btn-sm" onClick={() => setOpenTarefa(t)} style={{ marginRight: 4 }}>Abrir</button>
                    <button className="btn btn-outline btn-sm" onClick={() => excluirTarefa(t.id)} style={{ color: "var(--accent-red)" }}>Excluir</button>
                  </td>
                </tr>
              ))}
              {tarefas.length === 0 && <tr><td colSpan={4} style={{ textAlign: "center", padding: 24, color: "var(--text-muted)" }}>Nenhuma tarefa criada. Clique em "Criar Tarefa".</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Modal Status */}
        {showStatusModal && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200 }} onClick={() => setShowStatusModal(false)}>
            <div style={{ background: "var(--bg-card)", border: "1px solid var(--border)", borderRadius: 8, padding: 24, minWidth: 360 }} onClick={e => e.stopPropagation()}>
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Gerenciar Status</h3>
              {statusList.map(s => (
                <div key={s.id} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
                  <input type="color" value={s.cor} onChange={e => { const updated = statusList.map(x => x.id === s.id ? { ...x, cor: e.target.value } : x); setStatusList(updated); }} style={{ width: 30, height: 30, border: "none", cursor: "pointer" }} />
                  <input type="text" className="cell-input" value={s.nome} onChange={e => { const updated = statusList.map(x => x.id === s.id ? { ...x, nome: e.target.value } : x); setStatusList(updated); }} />
                </div>
              ))}
              <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
                <button className="btn btn-primary btn-sm" onClick={async () => { await fetch("/api/tarefas/status", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: statusList }) }); setShowStatusModal(false); }}>Salvar</button>
                <button className="btn btn-outline btn-sm" onClick={async () => { const nome = prompt("Nome do novo status:"); if (nome) { await fetch("/api/tarefas/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome }) }); load(); } }}>+ Novo</button>
              </div>
            </div>
          </div>
        )}

        {/* Modal Criar Tarefa */}
        {showCreateModal && (
          <div className="modal-overlay" style={{ opacity: 1, pointerEvents: "all" }} onClick={() => setShowCreateModal(false)}>
            <div className="modal-content" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2 className="modal-title">Criar Tarefa</h2>
                <button className="modal-close" onClick={() => setShowCreateModal(false)}>✕</button>
              </div>
              <div className="modal-body">
                <div className="form-group">
                  <label>Nome da tarefa</label>
                  <input type="text" value={newTarefaNome} onChange={e => setNewTarefaNome(e.target.value)} placeholder="Ex: Implantação 10S (SaaS)" autoFocus onKeyDown={e => { if (e.key === "Enter" && newTarefaNome.trim()) { criarTarefa(); setShowCreateModal(false); } }} />
                </div>
              </div>
              <div className="modal-actions">
                <button className="btn btn-outline" onClick={() => setShowCreateModal(false)}>Cancelar</button>
                <button className="btn btn-primary" onClick={() => { criarTarefa(); setShowCreateModal(false); }} disabled={!newTarefaNome.trim() || saving}>Criar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
