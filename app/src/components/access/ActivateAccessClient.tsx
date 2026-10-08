"use client";

import { useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import "./activation.css";

type Invitation = { tenantNome: string; expiresAt: string; mode: "new" | "existing"; canAccept: boolean };

export default function ActivateAccessClient() {
  const tokenRef = useRef("");
  const [invite, setInvite] = useState<Invitation | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [email, setEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "dark" || saved === "light") document.documentElement.setAttribute("data-theme", saved);
  }, []);

  async function inspect(token: string) {
    const response = await fetch("/api/access/invitations/inspect", { method: "POST",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }), cache: "no-store" });
    const body = await response.json();
    if (!response.ok) {
      sessionStorage.removeItem("10s-invite-token");
      setInvite(null); setError(body.error || "Convite indisponível."); return;
    }
    setInvite(body); setError("");
  }

  useEffect(() => {
    if (!tokenRef.current) {
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      tokenRef.current = fragment.get("token") || sessionStorage.getItem("10s-invite-token") || "";
      if (tokenRef.current) sessionStorage.setItem("10s-invite-token", tokenRef.current);
      window.history.replaceState(null, "", window.location.pathname);
    }
    if (!tokenRef.current) { setError("Link de convite inválido."); return; }
    void inspect(tokenRef.current);
  }, []);

  async function authenticate(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const result = await signIn("credentials", { email, password: loginPassword, redirect: false });
      if (result?.error) throw new Error("Não foi possível autenticar. Confira suas credenciais.");
      await inspect(tokenRef.current);
      setLoginPassword("");
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  async function accept() {
    if (invite?.mode === "new" && (password.length < 12 || password.length > 200 || password !== confirm)) {
      setError("Use uma senha de 12 a 200 caracteres e confirme-a corretamente."); return;
    }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/access/invitations/accept", { method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tokenRef.current, ...(invite?.mode === "new" ? { password } : {}) }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Não foi possível concluir o acesso.");
      tokenRef.current = ""; sessionStorage.removeItem("10s-invite-token");
      if (body.newlyActivated) {
        const result = await signIn("credentials", { email: body.email, password, redirect: false });
        setPassword(""); setConfirm("");
        if (result?.error) { setError("Acesso ativado. Entre pelo login com sua nova senha."); setInvite(null); return; }
        window.location.assign("/inicio");
      } else {
        window.location.assign("/selecionar-tenant");
      }
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  return <main className="activation-page"><section className="activation-card">
    <span className="activation-eyebrow">DEZ SOLUÇÕES · ACESSO</span>
    <h1>Concluir acesso ao 10S</h1>
    {error && <p className="activation-error" role="alert">{error}</p>}
    {!invite && !error && <p>Verificando convite…</p>}
    {invite && <>
      <p>Você recebeu acesso para <strong>{invite.tenantNome}</strong>. Confirme para ativar seu vínculo.</p>
      <p className="activation-muted">Este convite expira em {new Date(invite.expiresAt).toLocaleString("pt-BR")}.</p>
      {invite.mode === "new" ? <div className="activation-fields">
        <label>Crie sua senha<input type="password" autoComplete="new-password" value={password}
          onChange={event => setPassword(event.target.value)} minLength={12} maxLength={200} /></label>
        <label>Confirme sua senha<input type="password" autoComplete="new-password" value={confirm}
          onChange={event => setConfirm(event.target.value)} /></label>
        <p className="activation-muted">A senha é definida apenas por você. O aceite dos documentos obrigatórios será solicitado depois.</p>
      </div> : invite.canAccept ? <p className="activation-muted">Sua identidade está autenticada. Confirme o acesso ao novo tenant.</p>
        : <form className="activation-fields" onSubmit={authenticate}>
          <p>Entre com a conta destinatária do convite antes de confirmar. Sua senha atual não será alterada.</p>
          <label>E-mail<input type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} /></label>
          <label>Senha atual<input type="password" autoComplete="current-password" required value={loginPassword}
            onChange={event => setLoginPassword(event.target.value)} /></label>
          <button disabled={busy} type="submit">Entrar para confirmar</button>
        </form>}
      {(invite.mode === "new" || invite.canAccept) && <button className="activation-primary" disabled={busy}
        onClick={() => void accept()}>{busy ? "Concluindo…" : "Confirmar acesso"}</button>}
    </>}
    <a href="/login">Ir para o login</a>
  </section></main>;
}
