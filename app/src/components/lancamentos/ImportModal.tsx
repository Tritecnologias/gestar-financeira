"use client";
import { useState, useRef } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

const COLUNAS_MAPEAMENTO = [
  { csv: ["data_lanc", "data_lan_", "data"], campo: "dataLanc", label: "Data Lançamento" },
  { csv: ["descri__o", "descricao", "descrição"], campo: "descricao", label: "Descrição" },
  { csv: ["vl__realizado", "valor_realizado", "realizado", "valor"], campo: "valor", label: "Valor Realizado" },
  { csv: ["dire__o", "direcao", "tipo", "direção"], campo: "tipo", label: "Tipo (ENTRADA/SAIDA)" },
  { csv: ["status_manual", "status_manual"], campo: "statusManual", label: "Status Manual" },
  { csv: ["empresa", "fornecedor"], campo: "fornecedor", label: "Fornecedor/Empresa" },
  { csv: ["banco"], campo: "banco", label: "Banco" },
  { csv: ["c__custo", "centro_custo", "c_custo"], campo: "centroCusto", label: "Centro de Custo" },
  { csv: ["categoria"], campo: "categoria", label: "Categoria" },
  { csv: ["anota__o", "anotacao", "anotação"], campo: "anotacao", label: "Anotação" },
  { csv: ["dt__emiss_o", "data_emissao", "dt_emissao", "emissao"], campo: "dataEmissao", label: "Data Emissão" },
  { csv: ["venc__original", "venc_original"], campo: "dataVencOriginal", label: "Venc. Original" },
  { csv: ["venc__plano", "venc_plano"], campo: "dataVencPlano", label: "Venc. Plano" },
  { csv: ["dt__pagamento", "data_pagamento", "pagamento"], campo: "dataPagamento", label: "Data Pagamento" },
  { csv: ["vl__previsto", "valor_previsto", "previsto"], campo: "valorPrevisto", label: "Valor Previsto" },
  { csv: ["conta__n5_", "conta_n5", "conta"], campo: "cont", label: "Conta (n5)" },
  { csv: ["dre"], campo: "dre", label: "DRE" },
  { csv: ["fantasia__n4_", "fantasia_n4", "fantasia"], campo: "fantasiaPadrao", label: "Fantasia (n4)" },
];

// Tamanho do lote enviado ao servidor por vez
const BATCH_SIZE = 100;

export default function ImportModal({ open, onClose, onImported }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [totalLinhas, setTotalLinhas] = useState(0);
  const [preview, setPreview] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [result, setResult] = useState<{ ok: number; erro: number; duplicados: number } | null>(null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef(false);

  const parseCSV = (text: string): string[][] => {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    return lines.map(line => {
      // Parse simples — suporta ; e ,
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
        setPreview(rows.slice(0, 6)); // Mostrar até 5 linhas de preview
        setTotalLinhas(rows.length - 1); // Total de linhas de dados (excluindo header)
      }
    };
    reader.readAsText(f, "UTF-8");
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
      const idx = csvHeaders.findIndex(h => map.csv.some(variant => h.includes(variant) || h === variant));
      if (idx >= 0 && row[idx]) {
        let val: any = row[idx];
        // Conversões de tipo
        if (map.campo === "valor" || map.campo === "valorPrevisto") {
          val = parseFloat(val.replace(/[^\d,.-]/g, "").replace(",", "."));
          if (isNaN(val)) val = null;
        }
        if (map.campo.startsWith("data") && val) {
          // Tentar dd/mm/yyyy → yyyy-mm-dd
          const parts = val.match(/(\d{2})\/(\d{2})\/(\d{4})/);
          if (parts) val = `${parts[3]}-${parts[2]}-${parts[1]}`;
        }
        if (map.campo === "tipo" && val) {
          val = val.toUpperCase().includes("ENTRADA") ? "ENTRADA" : "SAIDA";
        }
        if (val !== null && val !== undefined && val !== "") lancamento[map.campo] = val;
      }
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

      // Processar em lotes
      for (let i = 0; i < totalRows; i += BATCH_SIZE) {
        if (abortRef.current) break;

        const batch = dataRows.slice(i, i + BATCH_SIZE);
        const lancamentos: any[] = [];

        for (const row of batch) {
          const lancamento = mapRowToLancamento(row, csvHeaders);
          // Validações mínimas
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
              body: JSON.stringify({ lancamentos }),
            });

            if (res.ok) {
              const data = await res.json();
              ok += data.inseridos ?? lancamentos.length;
              duplicados += data.duplicados ?? 0;
            } else {
              erro += lancamentos.length;
              // Erros que impedem toda a importação (ex.: admin global sem
              // tenant selecionado = 409). Mostra a mensagem e interrompe.
              if (res.status === 401 || res.status === 403 || res.status === 409) {
                const data = await res.json().catch(() => null);
                setError(data?.error || "Não foi possível importar. Verifique sua sessão/tenant.");
                abortRef.current = true;
              }
            }
          } catch {
            erro += lancamentos.length;
          }
        }

        setProgress({ current: Math.min(i + BATCH_SIZE, totalRows), total: totalRows });
      }

      setResult({ ok, erro, duplicados });
      setImporting(false);
      if (ok > 0) onImported();
    };
    reader.readAsText(file, "UTF-8");
  };

  const cancelImport = () => {
    abortRef.current = true;
  };

  const porcentagem = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

  if (!open) return null;

  return (
    <div className="modal-overlay" style={{ opacity: 1, pointerEvents: "all" }} onClick={onClose}>
      <div className="modal-content modal-lg" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">📥 Importar Lançamentos (CSV)</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

          {result && (
            <div style={{ marginBottom: 16, padding: 12, borderRadius: 8, background: result.erro > 0 ? "var(--kpi-red-bg)" : "var(--kpi-green-bg)", border: `1px solid ${result.erro > 0 ? "var(--kpi-red-border)" : "var(--kpi-green-border)"}` }}>
              <strong>Resultado:</strong> {result.ok} importados com sucesso
              {result.duplicados > 0 && `, ${result.duplicados} duplicados ignorados`}
              {result.erro > 0 && `, ${result.erro} com erro`}
            </div>
          )}

          {/* Barra de progresso */}
          {importing && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  Importando... {progress.current.toLocaleString()} de {progress.total.toLocaleString()} linhas
                </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--accent-blue)" }}>{porcentagem}%</span>
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
                className="btn btn-outline"
                style={{ marginTop: 8, fontSize: 12 }}
                onClick={cancelImport}
              >
                Cancelar importação
              </button>
            </div>
          )}

          {/* Drop zone */}
          <div
            className="drop-zone"
            onDragOver={e => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
            style={{ marginBottom: 16 }}
          >
            <div className="drop-icon">📄</div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{file ? file.name : "Arraste um arquivo CSV aqui"}</div>
            <div className="drop-sub">{file ? `${totalLinhas.toLocaleString()} linhas de dados detectadas` : "ou clique para selecionar"}</div>
          </div>
          <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />

          {/* Preview */}
          {preview.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: "var(--text-secondary)" }}>Preview (primeiras {preview.length - 1} linhas de {totalLinhas.toLocaleString()}):</div>
              <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: 6, maxHeight: 160 }}>
                <table className="data-table" style={{ fontSize: 10 }}>
                  <thead><tr>{preview[0]?.map((h, i) => <th key={i} style={{ whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
                  <tbody>{preview.slice(1).map((row, i) => <tr key={i}>{row.map((c, j) => <td key={j} style={{ whiteSpace: "nowrap" }}>{c}</td>)}</tr>)}</tbody>
                </table>
              </div>
            </div>
          )}

          {/* Mapeamento info */}
          <details style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 16 }}>
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>Colunas reconhecidas automaticamente</summary>
            <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
              {COLUNAS_MAPEAMENTO.map(m => <div key={m.campo}><code>{m.csv[0]}</code> → {m.label}</div>)}
            </div>
            <p style={{ marginTop: 8 }}>Datas aceitas: dd/mm/aaaa ou aaaa-mm-dd. Separador: ; ou , </p>
          </details>
        </div>

        <div className="modal-actions">
          <button className="btn btn-outline" onClick={onClose} disabled={importing}>Fechar</button>
          <button className="btn btn-primary" onClick={importar} disabled={!file || importing}>
            {importing
              ? `Importando... ${porcentagem}%`
              : result
                ? "✅ Concluído — Importar novamente"
                : `Importar ${totalLinhas.toLocaleString()} linhas`
            }
          </button>
        </div>
      </div>
    </div>
  );
}
