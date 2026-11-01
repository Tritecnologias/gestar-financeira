"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import PasswordInput from "@/components/ui/PasswordInput";
import { AppearanceButton } from "@/components/appearance/AppearanceProvider";
import "@/components/access/access.css";
import "./account.css";

export default function PasswordResetClient({ enabled }: { enabled: boolean }) {
  const proof = useRef(""), [linkState, setLinkState] = useState<"loading" | "ready" | "missing">("loading"), [password, setPassword] = useState(""), [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [success, setSuccess] = useState(false);
  useEffect(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get("token") || "";
    if (value) {
      window.history.replaceState(window.history.state, "", window.location.pathname);
      if (/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/.test(value)) proof.current = value;
    }
    // Synchronize the client-only URL fragment after removing it from browser history.
    setLinkState(proof.current ? "ready" : "missing");
  }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (busy || !proof.current) return;
    if (password !== confirmation) { setError("A confirmação deve ser igual à nova senha."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/account/password-reset", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: proof.current, newPassword: password, confirmation }) });
      const result = await response.json();
      if (!response.ok) { setError(result.error || "Não foi possível redefinir a senha."); return; }
      proof.current = ""; setPassword(""); setConfirmation(""); setSuccess(true);
    } catch { setError("Não foi possível confirmar a alteração. Tente entrar com a nova senha antes de repetir."); }
    finally { setBusy(false); }
  }
  return <main className="access-page account-page account-reset"><header className="access-header"><div><h1>Definir nova senha</h1><p>Redefinição autorizada pelo Administrador da Plataforma.</p></div><AppearanceButton /></header><section className="account-security">
    {linkState === "loading" ? <p role="status">Carregando…</p> : success ? <section role="status"><p>Senha alterada com sucesso. Entre novamente com a nova senha.</p><Link className="access-button" href="/login?notice=password-changed">Ir para o login</Link></section>
      : !enabled || linkState === "missing" ? <section><p>Link indisponível. Abra o e-mail de redefinição ou entre em contato com o Administrador da Plataforma.</p><Link href="/login">Voltar ao login</Link></section>
      : <form onSubmit={submit}><p className="access-hint">Use pelo menos 12 caracteres. Seus espaços, vínculos e contratos serão preservados.</p>
        <PasswordInput id="reset-new-password" label="Nova senha" value={password} onChange={event => setPassword(event.target.value)} required autoComplete="new-password" minLength={12} maxLength={72} disabled={busy} holdToReveal />
        <PasswordInput id="reset-confirm-password" label="Confirme sua senha" value={confirmation} onChange={event => setConfirmation(event.target.value)} required autoComplete="new-password" maxLength={72} disabled={busy} holdToReveal />
        {error && <p role="alert" className="access-error">{error}</p>}
        <div className="access-modal-actions"><Link href="/login" className="access-button access-button-secondary">Voltar ao login</Link><button className="access-button access-button-primary" type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar nova senha"}</button></div>
      </form>}
  </section></main>;
}
