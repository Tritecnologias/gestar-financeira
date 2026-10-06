"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import "./access.css";

type Version = { id: string; version: string; title: string; description: string | null; status: "DRAFT" | "PUBLISHED" | "RETIRED";
  sha256: string; byteSize: number; requiresReaccept: boolean; createdAt: string; publishedAt: string | null;
  publishedBy: { nome: string } | null; _count: { acceptances: number } };
type Document = { id: string; code: string; audience: "CONTRATANTE" | "USUARIO"; required: boolean; versions: Version[] };

export default function TermsPlatformClient() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [code, setCode] = useState("");
  const [audience, setAudience] = useState<"CONTRATANTE" | "USUARIO">("CONTRATANTE");
  const [required, setRequired] = useState(true);
  const [uploadFor, setUploadFor] = useState<string | null>(null);
  const [version, setVersion] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [requiresReaccept, setRequiresReaccept] = useState(true);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const theme = localStorage.getItem("theme");
    if (theme === "dark" || theme === "light") document.documentElement.setAttribute("data-theme", theme);
  }, []);
  const load = useCallback(async () => {
    const response = await fetch("/api/platform/terms", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Não foi possível carregar os documentos.");
    setDocuments(body);
  }, []);
  useEffect(() => { void load().catch(cause => setError((cause as Error).message)); }, [load]);

  async function createDocument(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/platform/terms", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, audience, required }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Falha ao criar documento.");
      setCode(""); await load();
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  async function upload(event: FormEvent) {
    event.preventDefault();
    if (!uploadFor || !file) return;
    setBusy(true); setError("");
    try {
      const data = new FormData();
      data.set("file", file); data.set("version", version); data.set("title", title);
      data.set("description", description); data.set("requiresReaccept", String(requiresReaccept));
      const response = await fetch(`/api/platform/terms/${uploadFor}/versions`, { method: "POST", body: data });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Falha no upload.");
      setUploadFor(null); setVersion(""); setTitle(""); setDescription(""); setFile(null); await load();
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  async function changeStatus(id: string, action: "publish" | "retire") {
    if (!window.confirm(action === "publish" ? "Publicar esta versão? Ela se tornará imutável e substituirá a versão vigente." : "Retirar esta versão de vigência para novos aceites?")) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/platform/terms/versions/${id}/${action}`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Falha ao alterar vigência.");
      await load();
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  return <main className="access-page access-platform access-terms-page">
    <header className="access-header"><div><h1>Termos e Políticas</h1><p>Documentos oficiais versionados. O conteúdo jurídico é fornecido por PDF e não fica no código.</p></div>
      <Link className="access-button access-button-secondary" href="/plataforma">Voltar à plataforma</Link></header>
    {error && <p className="access-error" role="alert">{error}</p>}
    <form className="access-terms-form" onSubmit={event => void createDocument(event)}><h2>Novo documento lógico</h2>
      <label>Código<input required maxLength={64} value={code} onChange={event => setCode(event.target.value.toUpperCase())} placeholder="TERM_CONTRATANTE" /></label>
      <label>Audiência<select value={audience} onChange={event => setAudience(event.target.value as typeof audience)}>
        <option value="CONTRATANTE">Contratante / responsável do tenant</option><option value="USUARIO">Usuário da plataforma</option></select></label>
      <label className="access-check-label"><input type="checkbox" checked={required} onChange={event => setRequired(event.target.checked)} />Obrigatório</label>
      <button className="access-button access-button-primary" disabled={busy}>Criar documento</button></form>
    <div className="access-terms-list">{documents.map(document => <section className="access-terms-card" key={document.id}>
      <div className="access-terms-card-head"><div><h2>{document.code}</h2><p>{document.audience === "CONTRATANTE" ? "Responsável do tenant" : "Usuário da plataforma"} · {document.required ? "Obrigatório" : "Opcional"}</p></div>
        <button className="access-button access-button-secondary" onClick={() => { setUploadFor(document.id); setFile(null); }}>+ Nova versão PDF</button></div>
      <div className="access-table-wrap"><table className="access-table"><thead><tr><th>Versão</th><th>Título</th><th>Status</th><th>Publicação</th><th>Reaceite</th><th>Aceites</th><th>Arquivo / ação</th></tr></thead><tbody>
        {document.versions.map(item => <tr key={item.id}><td>{item.version}</td><td><strong>{item.title}</strong><small>SHA-256: {item.sha256}</small></td>
          <td>{item.status}</td><td>{item.publishedAt ? `${new Date(item.publishedAt).toLocaleDateString("pt-BR")} · ${item.publishedBy?.nome ?? "—"}` : "—"}</td>
          <td>{item.requiresReaccept ? "Sim" : "Não"}</td><td>{item._count.acceptances}</td><td className="access-actions">
            <a href={`/api/terms/versions/${item.id}/file`} target="_blank" rel="noopener noreferrer">Visualizar PDF</a>
            {item.status === "DRAFT" && <button disabled={busy} onClick={() => void changeStatus(item.id, "publish")}>Publicar</button>}
            {item.status === "PUBLISHED" && <button disabled={busy} onClick={() => void changeStatus(item.id, "retire")}>Retirar vigência</button>}
          </td></tr>)}
        {!document.versions.length && <tr><td colSpan={7} className="access-empty">Nenhuma versão enviada.</td></tr>}
      </tbody></table></div></section>)}
      {!documents.length && <p>Nenhum documento oficial cadastrado.</p>}
    </div>
    {uploadFor && <div className="access-modal-backdrop"><form className="access-modal" role="dialog" aria-modal="true" aria-labelledby="term-upload-title" onSubmit={event => void upload(event)}>
      <h2 id="term-upload-title">Nova versão PDF</h2><p className="access-hint">A versão publicada fica imutável. Envie somente o PDF oficial revisado.</p>
      <label>Versão<input required value={version} maxLength={32} onChange={event => setVersion(event.target.value)} placeholder="V1" /></label>
      <label>Título<input required value={title} maxLength={200} onChange={event => setTitle(event.target.value)} /></label>
      <label>Descrição opcional<textarea value={description} maxLength={1000} onChange={event => setDescription(event.target.value)} /></label>
      <label>PDF oficial<input required type="file" accept="application/pdf,.pdf" onChange={event => setFile(event.target.files?.[0] || null)} /></label>
      <label className="access-check-label"><input type="checkbox" checked={requiresReaccept} onChange={event => setRequiresReaccept(event.target.checked)} />Exigir novo aceite de quem já aceitou versão anterior</label>
      <div className="access-modal-actions"><button type="button" className="access-button access-button-secondary" onClick={() => setUploadFor(null)}>Cancelar</button>
        <button className="access-button access-button-primary" disabled={busy || !file}>Enviar rascunho</button></div>
    </form></div>}
  </main>;
}
