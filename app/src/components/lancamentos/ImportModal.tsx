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

export default function ImportModal({ open, onClose, onImported }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ ok: number; erro: number } | null>(null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

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
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const rows = parseCSV(text);
      if (rows.length > 0) {
        setHeaders(rows[0].map(h => h.toLowerCase().replace(/[^a-z0-9_]/g, "_")));
        setPreview(rows.slice(0, 6)); // Mostrar até 5 linhas de preview
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

  const importar = async () => {
    if (!file) return;
    setImporting(true);
    setError("");
    setResult(null);

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      const rows = parseCSV(text);
      if (rows.length < 2) { setError("Arquivo vazio ou sem dados"); setImporting(false); return; }

      const csvHeaders = rows[0].map(h => h.toLowerCase().replace(/[^a-z0-9_]/g, "_"));
      const dataRows = rows.slice(1);

      let ok = 0, erro = 0;

      for (const row of dataRows) {
        try {
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

          // Validações mínimas
          if (!lancamento.dataLanc || !lancamento.descricao) { erro++; continue; }
          if (!lancamento.valor && !lancamento.valorPrevisto) { erro++; continue; }
          if (!lancamento.valor) lancamento.valor = lancamento.valorPrevisto || 0;

          const res = await fetch("/api/lancamentos", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(lancamento),
          });

          if (res.ok) ok++;
          else erro++;
        } catch { erro++; }
      }

      setResult({ ok, erro });
      setImporting(false);
      if (ok > 0) onImported();
    };
    reader.readAsText(file, "UTF-8");
  };

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
              <strong>Resultado:</strong> {result.ok} importados com sucesso{result.erro > 0 && `, ${result.erro} com erro`}
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
            <div className="drop-sub">ou clique para selecionar</div>
          </div>
          <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />

          {/* Preview */}
          {preview.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6, color: "var(--text-secondary)" }}>Preview ({preview.length - 1} linhas):</div>
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
          <button className="btn btn-outline" onClick={onClose}>Fechar</button>
          <button className="btn btn-primary" onClick={importar} disabled={!file || importing}>
            {importing ? "Importando..." : `Importar ${preview.length > 1 ? preview.length - 1 : 0} linhas`}
          </button>
        </div>
      </div>
    </div>
  );
}
