"use client";
import { useEffect, useRef, useState } from "react";
import PasswordInput from "@/components/ui/PasswordInput";

export default function PasswordResetDialog({ identity, onClose, onSent, onUnavailable }: {
  identity: { id: string; nome: string; email: string }; onClose: () => void; onSent: (message: string) => void; onUnavailable: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null), [password, setPassword] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [unavailable, setUnavailable] = useState(false), [copied, setCopied] = useState(false);
  const [result, setResult] = useState<{ temporaryPassword: string; expiresAt: string } | null>(null);
  useEffect(() => {
    const element = dialog.current, opener = document.activeElement as HTMLElement | null;
    const forget = () => {
      const input = element?.querySelector<HTMLInputElement>("#temporary-password");
      if (input) input.value = "";
      setPassword(""); setResult(null);
    };
    element?.showModal(); element?.querySelector<HTMLButtonElement>("button[data-back]")?.focus();
    window.addEventListener("pagehide", forget);
    return () => { window.removeEventListener("pagehide", forget); element?.close(); if (opener?.isConnected) opener.focus({ preventScroll: true }); };
  }, []);
  function close() { setPassword(""); setResult(null); onClose(); }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (busy || result) return; setBusy(true); setError("");
    try {
      const response = await fetch(`/api/platform/identities/${encodeURIComponent(identity.id)}/password-reset`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: true, adminPassword: password }),
      });
      const value = await response.json(); setPassword("");
      if (!response.ok) { if (response.status === 503) { setUnavailable(true); onUnavailable(); } setError(value.error || "Não foi possível solicitar o reset."); return; }
      setResult({ temporaryPassword: value.temporaryPassword, expiresAt: value.expiresAt }); onSent(value.message);
    } catch { setPassword(""); setError("Não foi possível confirmar o reset. A senha pode ter sido alterada. Não há recuperação da senha gerada; solicite outro reset após o intervalo de segurança."); }
    finally { setBusy(false); }
  }
  async function copy() {
    if (!result) return;
    try { await navigator.clipboard.writeText(result.temporaryPassword); setCopied(true); }
    catch { setError("Não foi possível copiar automaticamente. Selecione e copie a senha exibida."); }
  }
  return <dialog ref={dialog} className="access-modal platform-reset-dialog" aria-labelledby="password-reset-title" onCancel={event => { event.preventDefault(); if (!busy) close(); }}>
    <h2 id="password-reset-title">Resetar senha</h2>
    {result ? <div>
      <p role="status">Senha provisória gerada para <strong>{identity.nome}</strong> ({identity.email}).</p>
      <p>Compartilhe apenas com o titular pelo canal previamente verificado. A senha será exibida somente nesta confirmação e não poderá ser consultada novamente.</p>
      <label htmlFor="temporary-password">Senha provisória</label>
      <input id="temporary-password" type="text" value={result.temporaryPassword} readOnly autoFocus autoComplete="off" spellCheck={false} style={{ width: "100%", boxSizing: "border-box", fontFamily: "monospace" }} />
      <p>Válida até {new Date(result.expiresAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (horário de Brasília). A troca será obrigatória antes de acessar a plataforma.</p>
      {copied && <p role="status">Senha copiada.</p>}{error && <p role="alert" className="access-error">{error}</p>}
      <div className="access-modal-actions"><button type="button" className="access-button access-button-secondary" onClick={() => void copy()}>Copiar senha</button>
        <button type="button" className="access-button access-button-primary" onClick={close}>Fechar confirmação</button></div>
    </div> : <form onSubmit={submit}>
      <p>Gerar uma senha provisória para <strong>{identity.nome}</strong> ({identity.email})?</p>
      <p className="access-hint">Confirme que verificou a identidade do solicitante. A senha atual será substituída e as sessões anteriores encerradas. A senha provisória vale por 30 minutos. Empresas, vínculos e contratos serão preservados.</p>
      <PasswordInput id="reset-admin-password" label="Sua senha de administrador" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" required disabled={busy} holdToReveal />
      {error && <p role="alert" className="access-error">{error}</p>}
      <div className="access-modal-actions"><button data-back type="button" className="access-button access-button-secondary" disabled={busy} onClick={close}>Cancelar</button>
        <button type="submit" className="access-button access-button-primary" disabled={busy || unavailable}>{busy ? "Gerando…" : "Gerar senha provisória"}</button></div>
    </form>}
  </dialog>;
}
