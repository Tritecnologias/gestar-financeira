"use client";
import { useEffect, useRef, useState } from "react";
import PasswordInput from "@/components/ui/PasswordInput";

export default function PasswordResetDialog({ identity, onClose, onSent, onUnavailable }: {
  identity: { id: string; nome: string; email: string }; onClose: () => void; onSent: (message: string) => void; onUnavailable: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null), [password, setPassword] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const element = dialog.current, opener = document.activeElement as HTMLElement | null;
    element?.showModal(); element?.querySelector<HTMLButtonElement>("button[data-back]")?.focus();
    return () => { element?.close(); if (opener?.isConnected) opener.focus({ preventScroll: true }); };
  }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError("");
    try {
      const response = await fetch(`/api/platform/identities/${encodeURIComponent(identity.id)}/password-reset`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm: true, adminPassword: password }),
      });
      const result = await response.json(); setPassword("");
      if (!response.ok) { if (response.status === 503) { setUnavailable(true); onUnavailable(); } setError(result.error || "Não foi possível solicitar o reset."); return; }
      onSent(result.message); onClose();
    } catch { setPassword(""); setError("Não foi possível confirmar o envio. Consulte o usuário antes de solicitar outro reset."); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialog} className="access-modal platform-reset-dialog" aria-labelledby="password-reset-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <form onSubmit={submit}>
      <h2 id="password-reset-title">Resetar senha</h2>
      <p>Enviar um link de redefinição para <strong>{identity.nome}</strong> no e-mail cadastrado <strong>{identity.email}</strong>?</p>
      <p className="access-hint">Confirme que verificou a identidade do solicitante. O link vale por 15 minutos. Empresas, vínculos e contratos serão preservados.</p>
      <PasswordInput id="reset-admin-password" label="Sua senha de administrador" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" required disabled={busy} holdToReveal />
      {error && <p role="alert" className="access-error">{error}</p>}
      <div className="access-modal-actions"><button data-back type="button" className="access-button access-button-secondary" disabled={busy} onClick={onClose}>Cancelar</button>
        <button type="submit" className="access-button access-button-primary" disabled={busy || unavailable}>{busy ? "Enviando…" : "Confirmar envio"}</button></div>
    </form>
  </dialog>;
}
