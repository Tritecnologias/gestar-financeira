"use client";
import { messagePtBr } from "@/lib/presentation";
import { useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import PasswordInput from "@/components/ui/PasswordInput";
import { AppearanceButton } from "@/components/appearance/AppearanceProvider";
import { PASSWORD_POLICY_MESSAGE } from "@/lib/password-policy";
import "@/components/access/access.css";
import "./account.css";

export default function AccountClient({ name, email, platformAdmin, supportOperator }: { name: string; email: string; platformAdmin: boolean; supportOperator: boolean }) {
  const [editing, setEditing] = useState(false), [currentPassword, setCurrent] = useState(""), [newPassword, setNew] = useState(""), [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [success, setSuccess] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError("");
    if (newPassword !== confirmation) { setError("A confirmação deve ser igual à nova senha."); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/account/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword, newPassword, confirmation }) });
      const body = await r.json();
      if (!r.ok) { setError(body.error || "Não foi possível alterar sua senha."); return; }
      setCurrent(""); setNew(""); setConfirmation(""); setSuccess(true);
    } catch { setError("Não foi possível conectar. Entre novamente para conferir se a senha foi alterada antes de tentar outra vez."); }
    finally { setBusy(false); }
  }
  function cancel() { setCurrent(""); setNew(""); setConfirmation(""); setError(""); setEditing(false); }
  return <main className="access-page access-platform account-page"><header className="access-header"><div><h1>Minha conta</h1><p>Seus dados de acesso e a segurança da sua conta.</p></div>
    <div className="access-header-actions"><AppearanceButton /><Link className="access-button access-button-secondary" href="/selecionar-tenant">Minhas empresas</Link>
      {platformAdmin && <Link className="access-button access-button-secondary" href="/plataforma">Administração da Plataforma</Link>}
      {supportOperator && <Link className="access-button access-button-secondary" href="/suporte">Área de Suporte</Link>}
      <button className="access-button access-button-secondary" onClick={() => void signOut({ callbackUrl: "/login" })}>Sair</button></div></header>
    <section className="account-details" aria-labelledby="account-details-title"><h2 id="account-details-title">Dados da conta</h2><dl><div><dt>Nome</dt><dd>{name}</dd></div><div><dt>E-mail</dt><dd>{email}</dd></div><div><dt>Situação</dt><dd>Ativa</dd></div></dl></section>
    <section className="account-security" aria-labelledby="account-security-title"><h2 id="account-security-title">Segurança</h2>
      {success ? <div role="status"><p>Senha alterada com sucesso. Suas sessões anteriores foram encerradas.</p><Link className="access-button access-button-primary" href="/login?notice=password-changed">Entrar com a nova senha</Link></div>
      : !editing ? <><p>Use sua senha atual para definir uma nova senha.</p><button className="access-button access-button-primary" onClick={() => setEditing(true)}>Alterar senha</button></>
      : <form onSubmit={submit}><p id="account-policy">{PASSWORD_POLICY_MESSAGE} Após salvar, entre novamente em seus dispositivos.</p>
        <PasswordInput id="current-password" label="Senha atual" name="currentPassword" value={currentPassword} onChange={e => setCurrent(e.target.value)} autoComplete="current-password" required maxLength={200} disabled={busy} autoFocus />
        <PasswordInput id="new-password" label="Nova senha" name="newPassword" value={newPassword} onChange={e => setNew(e.target.value)} autoComplete="new-password" required minLength={12} maxLength={200} aria-describedby="account-policy" disabled={busy} />
        <PasswordInput id="confirm-password" label="Confirmar nova senha" name="confirmation" value={confirmation} onChange={e => setConfirmation(e.target.value)} autoComplete="new-password" required minLength={12} maxLength={200} disabled={busy} />
        {error && <p className="access-error" role="alert">{messagePtBr(error)}</p>}<div className="account-actions"><button className="access-button access-button-secondary" type="button" disabled={busy} onClick={cancel}>Cancelar</button><button className="access-button access-button-primary" type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar nova senha"}</button></div>
      </form>}
    </section><p className="access-hint">A recuperação por e-mail será disponibilizada em uma próxima etapa.</p>
  </main>;
}
