"use client";
import { useState, useRef, useEffect } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

const COLUNAS_MAPEAMENTO = [
  { csv: ["data_lanc", "data_lan_", "data_lancamento", "dt_lanc", "dt_lancamento"], campo: "dataLanc", label: "Data Lançamento" },
  { csv: ["descri___o", "descri__o", "descricao", "descrição", "historico"], campo: "descricao", label: "Descrição" },
  { csv: ["vl__realizado", "valor_realizado", "realizado", "valor_pago", "valor"], campo: "valor", label: "Valor Realizado" },
  { csv: ["vl__previsto", "valor_previsto", "previsto"], campo: "valorPrevisto", label: "Valor Previsto" },
  { csv: ["dire__o", "direcao", "tipo", "direção", "natureza"], campo: "tipo", label: "Tipo (ENTRADA/SAIDA)" },
  { csv: ["status_manual"], campo: "statusManual", label: "Status Manual" },
  { csv: ["status_extrato"], campo: "statusExtrato", label: "Status Extrato" },
  { csv: ["status"], campo: "status", label: "Status" },
  { csv: ["fornecedor", "empresa", "cliente", "favorecido"], campo: "fornecedor", label: "Fornecedor/Empresa" },
  { csv: ["fantasia__n4_", "fantasia_n4", "fantasia", "fantasia_padrao"], campo: "fantasiaPadrao", label: "Fantasia (n4)" },
  { csv: ["banco", "conta_bancaria"], campo: "banco", label: "Banco" },
  { csv: ["c__custo", "centro_custo", "centro_de_custo", "c_custo"], campo: "centroCusto", label: "Centro de Custo" },
  { csv: ["categoria"], campo: "categoria", label: "Categoria" },
  { csv: ["anota___o", "anota__o", "anotacao", "anotação", "observacao", "obs"], campo: "anotacao", label: "Anotação" },
  { csv: ["dt__emiss_o", "data_emiss_o", "data_emissao", "dt_emissao", "emissao"], campo: "dataEmissao", label: "Data Emissão" },
  { csv: ["venc__original", "venc_original", "vencimento_original", "vencimento"], campo: "dataVencOriginal", label: "Venc. Original" },
  { csv: ["venc__plano", "venc_plano", "vencimento_plano"], campo: "dataVencPlano", label: "Venc. Plano" },
  { csv: ["data_evento", "dt_evento", "dt__evento", "evento"], campo: "dataEvento", label: "Data Evento" },
  { csv: ["dt__pagamento", "data_pagamento", "dt_pagamento", "pagamento"], campo: "dataPagamento", label: "Data Pagamento" },
  { csv: ["conta__n5_", "conta_n5", "conta", "conta_contabil"], campo: "cont", label: "Conta (n5)" },
  { csv: ["dre"], campo: "dre", label: "DRE" },
  { csv: ["refer_ncia", "referencia", "referência", "ref"], campo: "referencia", label: "Referência" },
];

function matchHeaderIndex(csvHeaders: string[], variants: string[]): number {
  const exactIdx = csvHeaders.findIndex(h => variants.some(v => h === v));
  if (exactIdx >= 0) return exactIdx;
  const fixIdx = csvHeaders.findIndex(h => variants.some(v => h.startsWith(v + "_") || h.endsWith("_" + v)));
  if (fixIdx >= 0) return fixIdx;
  return csvHeaders.findIndex(h => variants.some(v => v.length > 4 && h.includes(v)));
}

const BATCH_SIZE = 100;

export default function ImportModal({ open, onClose, onImported }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [totalLinhas, setTotalLinhas] = useState(0);
  const [preview, setPreview] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [result, setResult] = useState<{ ok: number; erro: number; duplicados: number; tenantNome?: string } | null>(null);
  const [error, setError] = useState("");
  const [tenants, setTenants] = useState<{ id: string; nome: string; isActive?: boolean }[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string>("");
  const [selectedTenantNome, setSelectedTenantNome] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    fetch("/api/tenants")
      .then(r => r.json())
      .then(d => {
        if (Array.isArray(d) && d.length > 0) {
          setTenants(d);
          const active = d.find((t: any) => t.isActive) || d[0];
          if (active) {
            setSelectedTenantId(active.id);
            setSelectedTenantNome(active.nome);
          }
        }
      })
      .catch(() => {});
  }, [open]);

  const parseCSV = (text: string): string[][] => {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    return lines.map(line => {
      const sep = line.includes(";") ? ";" : ",";
      return line.split(sep).map(cell => cell.replace(/^"|"$/g, "").trim());
    });
  };

  const handleFile = (f: File) => {
    setFile(f);
    setResult(null);
    setError("");
    setProgress({ current: 0, total: 0 });
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const rows = parseCSV(text);
      if (rows.length > 0) {
        setHeaders(rows[0].map(h => h.toLowerCase().replace(/[^a-z0-9_]/g, "_")));
        setPreview(rows.slice(0, 11));
        setTotalLinhas(Math.max(0, rows.length - 1));
      }
    };
    reader.readAsText(f, "UTF-8");
  };

  const handleClearFile = () => {
    setFile(null);
    setPreview([]);
    setHeaders([]);
    setTotalLinhas(0);
    setResult(null);
    setError("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f && (f.name.endsWith(".csv") || f.name.endsWith(".txt"))) handleFile(f);
    else setError("Apenas arquivos .csv são suportados");
  };

  const mapRowToLancamento = (row: string[], csvHeaders: string[]) => {
    const lancamento: any = { tipo: "SAIDA", status: "realizado" };

    for (const map of COLUNAS_MAPEAMENTO) {
      const idx = matchHeaderIndex(csvHeaders, map.csv);
      if (idx >= 0 && row[idx]) {
        let val: any = row[idx];
        if (map.campo === "valor" || map.campo === "valorPrevisto") {
          val = parseFloat(val.replace(/[^\d,.-]/g, "").replace(",", "."));
          if (isNaN(val)) val = null;
        }
        if (map.campo.startsWith("data") && val) {
          const parts = val.match(/(\d{2})\/(\d{2})\/(\d{4})/);
          if (parts) val = `${parts[3]}-${parts[2]}-${parts[1]}`;
        }
        if (map.campo === "tipo" && val) {
          const normalizado = val.toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          val = normalizado.includes("ENTRADA") ? "ENTRADA" : "SAIDA";
        }
        if (val !== null && val !== undefined && val !== "") lancamento[map.campo] = val;
      }
    }

    if (typeof lancamento.valor === "number" && lancamento.valor < 0) {
      lancamento.tipo = "SAIDA";
      lancamento.valor = Math.abs(lancamento.valor);
    }
    if (typeof lancamento.valorPrevisto === "number" && lancamento.valorPrevisto < 0) {
      lancamento.valorPrevisto = Math.abs(lancamento.valorPrevisto);
    }

    return lancamento;
  };

  const importar = async () => {
    if (!file) return;
    setImporting(true);
    setError("");
    setResult(null);
    abortRef.current = false;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      const rows = parseCSV(text);
      if (rows.length < 2) { setError("Arquivo vazio ou sem dados"); setImporting(false); return; }

      const csvHeaders = rows[0].map(h => h.toLowerCase().replace(/[^a-z0-9_]/g, "_"));
      const dataRows = rows.slice(1);
      const totalRows = dataRows.length;

      setProgress({ current: 0, total: totalRows });

      let ok = 0, erro = 0, duplicados = 0;
      let returnedTenantNome = selectedTenantNome;

      for (let i = 0; i < totalRows; i += BATCH_SIZE) {
        if (abortRef.current) break;

        const batch = dataRows.slice(i, i + BATCH_SIZE);
        const lancamentos: any[] = [];

        for (const row of batch) {
          const lancamento = mapRowToLancamento(row, csvHeaders);
          if (!lancamento.dataLanc || !lancamento.descricao) { erro++; continue; }
          if (!lancamento.valor && !lancamento.valorPrevisto) { erro++; continue; }
          if (!lancamento.valor) lancamento.valor = lancamento.valorPrevisto || 0;
          lancamentos.push(lancamento);
        }

        if (lancamentos.length > 0) {
          try {
            const res = await fetch("/api/lancamentos/importar", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                lancamentos,
                tenantId: selectedTenantId || undefined,
              }),
            });

            if (res.ok) {
              const data = await res.json();
              ok += data.inseridos ?? lancamentos.length;
              duplicados += data.duplicados ?? 0;
              if (data.tenantNome) returnedTenantNome = data.tenantNome;
            } else {
              erro += lancamentos.length;
              if (res.status === 401 || res.status === 403 || res.status === 409) {
                const data = await res.json().catch(() => null);
                setError(data?.error || "Não foi possível importar. Verifique sua sessão/empresa.");
                abortRef.current = true;
              }
            }
          } catch {
            erro += lancamentos.length;
          }
        }

        setProgress({ current: Math.min(i + BATCH_SIZE, totalRows), total: totalRows });
      }

      setResult({ ok, erro, duplicados, tenantNome: returnedTenantNome });
      setImporting(false);
      if (ok > 0) onImported();
    };
    reader.readAsText(file, "UTF-8");
  };

  const cancelImport = () => {
    abortRef.current = true;
  };

  const porcentagem = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  const colunasMapeadasCount = headers.filter(h =>
    matchHeaderIndex([h], COLUNAS_MAPEAMENTO.flatMap(m => m.csv)) >= 0
  ).length;

  if (!open) return null;

  return (
    <div className="modal-overlay" style={{ opacity: 1, pointerEvents: "all", display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }} onClick={onClose}>
      <div
        className="modal-content modal-xl"
        style={{
          maxWidth: "min(1150px, 96vw)",
          width: "100%",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          borderRadius: 12,
          boxShadow: "0 25px 60px rgba(0,0,0,0.4)",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header" style={{ padding: "18px 24px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22 }}>📥</span>
            <div>
              <h2 className="modal-title" style={{ fontSize: 17, fontWeight: 700 }}>Importar Lançamentos (CSV)</h2>
              <p style={{ fontSize: 12, color: "var(--text-muted)", margin: "2px 0 0 0" }}>
                Envie seus extratos ou planilhas de lançamentos para importação automática
              </p>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} style={{ fontSize: 18, background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)" }}>✕</button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ padding: "20px 24px", overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
          
          {/* Destino da Importação */}
          <div
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              background: "rgba(37,99,235,0.06)",
              border: "1px solid rgba(37,99,235,0.2)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16 }}>🏢</span>
              <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                Empresa destino da importação:
              </span>
              <strong style={{ fontSize: 13, color: "var(--text-primary)" }}>
                {selectedTenantNome || "Dez Soluções"}
              </strong>
            </div>

            {tenants.length > 1 && (
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <label style={{ fontSize: 12, color: "var(--text-muted)" }}>Alterar:</label>
                <select
                  value={selectedTenantId}
                  onChange={e => {
                    const tid = e.target.value;
                    setSelectedTenantId(tid);
                    const t = tenants.find(x => x.id === tid);
                    if (t) setSelectedTenantNome(t.nome);
                  }}
                  disabled={importing}
                  style={{
                    padding: "4px 8px",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    background: "var(--bg-card)",
                    color: "var(--text-primary)",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {tenants.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.nome} {t.id === "00000000-0000-0000-0000-000000000001" ? "(Meu Tenant)" : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {error && <div className="alert alert-error" style={{ marginBottom: 0 }}>{error}</div>}

          {result && (
            <div style={{ padding: 14, borderRadius: 8, background: result.erro > 0 ? "var(--kpi-red-bg)" : "var(--kpi-green-bg)", border: `1px solid ${result.erro > 0 ? "var(--kpi-red-border)" : "var(--kpi-green-border)"}` }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>
                {result.erro === 0 ? "🎉 Importação realizada com sucesso!" : "Aviso de Importação"}
              </div>
              <div style={{ fontSize: 13 }}>
                <strong>{result.ok}</strong> lançamentos importados para a empresa <strong>{result.tenantNome || selectedTenantNome || "Dez Soluções"}</strong>
                {result.duplicados > 0 && `, ${result.duplicados} registros duplicados ignorados`}
                {result.erro > 0 && `, ${result.erro} linhas com erro`}
              </div>
            </div>
          )}

          {/* Barra de progresso */}
          {importing && (
            <div style={{ padding: 14, background: "var(--bg-hover)", borderRadius: 8, border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  Importando... {progress.current.toLocaleString()} de {progress.total.toLocaleString()} linhas
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--accent-blue)" }}>{porcentagem}%</span>
              </div>
              <div style={{ width: "100%", height: 8, borderRadius: 4, background: "var(--border)", overflow: "hidden" }}>
                <div style={{
                  width: `${porcentagem}%`,
                  height: "100%",
                  borderRadius: 4,
                  background: "var(--accent-blue)",
                  transition: "width 0.3s ease",
                }} />
              </div>
              <button
                type="button"
                className="btn btn-outline"
                style={{ marginTop: 10, fontSize: 12, padding: "4px 12px" }}
                onClick={cancelImport}
              >
                Cancelar importação
              </button>
            </div>
          )}

          {/* Drop zone / Arquivo Selecionado */}
          {!file ? (
            <div
              className="drop-zone"
              onDragOver={e => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              style={{
                padding: "36px 20px",
                border: "2px dashed var(--border)",
                borderRadius: 10,
                cursor: "pointer",
                background: "var(--bg-main)",
                textAlign: "center",
                transition: "all 0.2s ease",
              }}
            >
              <div className="drop-icon" style={{ fontSize: 36, marginBottom: 8 }}>📄</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)" }}>Arraste seu arquivo CSV aqui</div>
              <div className="drop-sub" style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 4 }}>
                ou clique para selecionar no computador (.csv ou .txt)
              </div>
            </div>
          ) : (
            <div
              style={{
                padding: "12px 18px",
                borderRadius: 10,
                background: "var(--bg-hover)",
                border: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 16,
                flexWrap: "wrap",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
                <div style={{ fontSize: 28, flexShrink: 0 }}>📄</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {file.name}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 8, marginTop: 2, flexWrap: "wrap" }}>
                    <span style={{ color: "var(--accent-green)", fontWeight: 600, background: "rgba(34, 197, 94, 0.12)", padding: "1px 8px", borderRadius: 4 }}>
                      ✓ {totalLinhas.toLocaleString()} linhas detectadas
                    </span>
                    {file.size > 0 && <span>• {(file.size / 1024).toFixed(1)} KB</span>}
                    {headers.length > 0 && (
                      <span style={{ color: "var(--accent-blue)", fontWeight: 500 }}>
                        • {colunasMapeadasCount} de {headers.length} colunas mapeadas
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ fontSize: 12, padding: "6px 14px", height: "auto" }}
                  onClick={() => fileRef.current?.click()}
                  disabled={importing}
                >
                  Trocar arquivo
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ fontSize: 12, padding: "6px 12px", height: "auto", color: "var(--accent-red)" }}
                  onClick={handleClearFile}
                  disabled={importing}
                  title="Remover arquivo"
                >
                  ✕
                </button>
              </div>
            </div>
          )}

          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt"
            style={{ display: "none" }}
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />

          {/* Preview Amplo */}
          {preview.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 6 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
                  Pré-visualização dos Dados ({Math.min(10, totalLinhas)} primeiras linhas de {totalLinhas.toLocaleString()}):
                </div>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  Role horizontalmente para inspecionar todas as colunas
                </div>
              </div>
              <div
                style={{
                  overflowX: "auto",
                  overflowY: "auto",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  maxHeight: "360px",
                  background: "var(--bg-main)",
                }}
              >
                <table className="data-table" style={{ width: "100%", fontSize: 12, borderCollapse: "separate", borderSpacing: 0 }}>
                  <thead style={{ position: "sticky", top: 0, zIndex: 3, background: "var(--bg-card)" }}>
                    <tr>
                      {preview[0]?.map((h, i) => {
                        const isMapped = matchHeaderIndex([h], COLUNAS_MAPEAMENTO.flatMap(m => m.csv)) >= 0;
                        return (
                          <th
                            key={i}
                            style={{
                              whiteSpace: "nowrap",
                              padding: "10px 14px",
                              fontSize: 11,
                              fontWeight: 700,
                              textTransform: "uppercase",
                              letterSpacing: "0.5px",
                              borderBottom: "2px solid var(--border)",
                              background: "var(--bg-card)",
                              color: isMapped ? "var(--accent-blue)" : "var(--text-muted)",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span>{h}</span>
                              {isMapped && (
                                <span
                                  style={{
                                    fontSize: 9,
                                    padding: "1px 5px",
                                    borderRadius: 4,
                                    background: "rgba(34, 197, 94, 0.15)",
                                    color: "var(--accent-green)",
                                    fontWeight: 700,
                                  }}
                                  title="Coluna mapeada com sucesso"
                                >
                                  ✓
                                </span>
                              )}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(1).map((row, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                        {row.map((c, j) => (
                          <td
                            key={j}
                            style={{
                              whiteSpace: "nowrap",
                              padding: "9px 14px",
                              fontSize: 12,
                              color: "var(--text-primary)",
                            }}
                          >
                            {c ? c : <span style={{ color: "var(--text-muted)", fontStyle: "italic", fontSize: 11 }}>—</span>}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Mapeamento info */}
          <details
            style={{
              fontSize: 12,
              background: "var(--bg-hover)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "10px 14px",
            }}
          >
            <summary style={{ cursor: "pointer", fontWeight: 600, color: "var(--text-secondary)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span>ℹ️ Colunas reconhecidas automaticamente ({COLUNAS_MAPEAMENTO.length} campos suportados)</span>
              <span style={{ fontSize: 11, color: "var(--accent-blue)", fontWeight: 500 }}>ver detalhes</span>
            </summary>
            <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
                  gap: "6px 12px",
                }}
              >
                {COLUNAS_MAPEAMENTO.map(m => (
                  <div key={m.campo} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
                    <code style={{ background: "var(--bg-card)", border: "1px solid var(--border)", padding: "1px 5px", borderRadius: 4, fontSize: 10 }}>
                      {m.csv[0]}
                    </code>
                    <span style={{ color: "var(--text-muted)" }}>→</span>
                    <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>{m.label}</span>
                  </div>
                ))}
              </div>
              <p style={{ marginTop: 10, fontSize: 11, color: "var(--text-muted)" }}>
                💡 <strong>Dica:</strong> Datas aceitas: <code>dd/mm/aaaa</code> ou <code>aaaa-mm-dd</code>. Separadores de coluna suportados: ponto e vírgula (<code>;</code>) ou vírgula (<code>,</code>).
              </p>
            </div>
          </details>
        </div>

        {/* Footer / Actions */}
        <div className="modal-actions" style={{ padding: "16px 24px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 12, flexShrink: 0 }}>
          <button className="btn btn-outline" onClick={onClose} disabled={importing}>Fechar</button>
          <button className="btn btn-primary" onClick={importar} disabled={!file || importing || totalLinhas === 0} style={{ minWidth: 160 }}>
            {importing
              ? `Importando... ${porcentagem}%`
              : result
                ? "✅ Importação Concluída"
                : `Importar ${totalLinhas.toLocaleString()} linhas`
            }
          </button>
        </div>
      </div>
    </div>
  );
}
