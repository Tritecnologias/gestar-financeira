"use client";

import { useState, useRef, useCallback } from "react";
import Image from "next/image";

export default function ConfiguracoesPage() {
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Carrega o logo atual ao montar
  useState(() => {
    fetch("/api/config/logo")
      .then((r) => r.json())
      .then(({ logoUrl }) => {
        if (logoUrl) { setLogoUrl(logoUrl); setPreview(logoUrl); }
      });
  });

  function showMsg(text: string, ok: boolean) {
    setMsg({ text, ok });
    setTimeout(() => setMsg(null), 3500);
  }

  function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      showMsg("Formato inválido. Envie PNG, JPG ou SVG.", false);
      return;
    }
    if (file.size > 1_500_000) {
      showMsg("Imagem muito grande. Máximo 1.5 MB.", false);
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      setPreview(base64);
      setLogoUrl(base64);
    };
    reader.readAsDataURL(file);
  }

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, []);

  async function salvar() {
    if (!logoUrl) return;
    setSaving(true);
    try {
      const res = await fetch("/api/config/logo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logoUrl }),
      });
      if (!res.ok) {
        const err = await res.json();
        showMsg(err.error ?? "Erro ao salvar.", false);
      } else {
        showMsg("Logo atualizado com sucesso!", true);
      }
    } catch {
      showMsg("Erro de conexão.", false);
    } finally {
      setSaving(false);
    }
  }

  async function remover() {
    setRemoving(true);
    try {
      const res = await fetch("/api/config/logo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logoUrl: null }),
      });
      if (res.ok) {
        setLogoUrl(null);
        setPreview(null);
        showMsg("Logo removido. O padrão será exibido.", true);
      } else {
        showMsg("Erro ao remover.", false);
      }
    } catch {
      showMsg("Erro de conexão.", false);
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div>
      <header className="topbar">
        <div>
          <h1 className="page-title">Configurações</h1>
          <p className="page-sub">Personalize a aparência do sistema</p>
        </div>
      </header>

      <div style={{ padding: "28px", maxWidth: 640 }}>

        {/* ── Card: Logo da Empresa ─────────────────────── */}
        <div className="config-card">
          <div className="config-card-header">
            <span className="config-card-icon">🖼️</span>
            <div>
              <div className="config-card-title">Logo da Empresa</div>
              <div className="config-card-sub">
                Substitui o logo padrão na sidebar. Tamanho ideal: 200×60 px (PNG ou SVG transparente).
              </div>
            </div>
          </div>

          {/* Preview */}
          {preview && (
            <div className="logo-preview-box">
              <Image
                src={preview}
                alt="Preview do logo"
                width={200}
                height={60}
                style={{ objectFit: "contain", maxHeight: 60 }}
                unoptimized
              />
            </div>
          )}

          {/* Drop zone */}
          <div
            className={`drop-zone config-drop ${dragging ? "dragging" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
          >
            <div className="drop-icon">📁</div>
            <p style={{ fontSize: 13, color: "var(--text-secondary)", margin: "4px 0 2px" }}>
              Arraste uma imagem aqui ou clique para selecionar
            </p>
            <p className="drop-sub">PNG, JPG, SVG — máx. 1.5 MB</p>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={onFileChange}
              id="logo-file-input"
            />
          </div>

          {/* Ações */}
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <button
              className="btn btn-primary"
              onClick={salvar}
              disabled={saving || !logoUrl}
              id="btn-salvar-logo"
            >
              {saving ? <span className="spinner" /> : "💾"} Salvar logo
            </button>
            {preview && (
              <button
                className="btn btn-danger"
                onClick={remover}
                disabled={removing}
                id="btn-remover-logo"
              >
                {removing ? <span className="spinner" /> : "🗑️"} Remover logo
              </button>
            )}
          </div>

          {/* Toast inline */}
          {msg && (
            <div
              className={`config-msg ${msg.ok ? "ok" : "err"}`}
              style={{ marginTop: 12 }}
            >
              {msg.ok ? "✅" : "❌"} {msg.text}
            </div>
          )}
        </div>

        {/* ── Mais configurações futuras aqui ─────────── */}
        <div className="config-card" style={{ opacity: 0.5, cursor: "not-allowed" }}>
          <div className="config-card-header">
            <span className="config-card-icon">🎨</span>
            <div>
              <div className="config-card-title">Tema de Cores</div>
              <div className="config-card-sub">Em breve</div>
            </div>
          </div>
        </div>

        <div className="config-card" style={{ opacity: 0.5, cursor: "not-allowed" }}>
          <div className="config-card-header">
            <span className="config-card-icon">🔔</span>
            <div>
              <div className="config-card-title">Notificações</div>
              <div className="config-card-sub">Em breve</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
