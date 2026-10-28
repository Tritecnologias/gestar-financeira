"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import Link from "next/link";
import InvitationShareDialog, { type InvitationShare } from "./InvitationShareDialog";
import "@/app/termos/aceite/terms.css";
import "./contractual-onboarding.css";

type State = { status: string; tenantName: string; isOwner: boolean; canChoose: boolean; canResolve: boolean; canAcceptContract: boolean;
  invitation: { id: string; name: string; email: string; status?: string; expiresAt: string; canReissue: boolean; canRevoke: boolean } | null };
const endpoint = "/api/onboarding/contractual";
function nextPage(state: State) {
  if (state.status === "ACTIVE") window.location.assign("/inicio");
  else if (state.status === "USER_TERMS_REQUIRED" || state.status === "AWAITING_CONTRACT" && state.canAcceptContract) window.location.assign("/termos/aceite");
}

export default function ContractualOnboardingClient({ initialState }: { initialState: State }) {
  const [state, setState] = useState(initialState), [other, setOther] = useState(false);
  const [name, setName] = useState(""), [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [share, setShare] = useState<InvitationShare | null>(null);
  const loading = useRef(false);
  const statusHeading = useRef<HTMLHeadingElement>(null);
  const closeShare = useCallback(() => {
    setShare(null);
    requestAnimationFrame(() => statusHeading.current?.focus());
  }, []);
  const shared = useCallback((method: "COPY" | "WHATSAPP") => {
    setNotice(method === "COPY" ? "Link copiado. Compartilhe somente com a pessoa indicada." :
      "Conclua o envio no WhatsApp. A plataforma não confirma o envio ou a entrega da mensagem.");
    closeShare();
  }, [closeShare]);
  const refresh = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Não foi possível conferir a situação da empresa.");
      let next: State = body;
      if (next.canResolve) {
        const continued = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "continue" }) });
        if (!continued.ok) { const result = await continued.json(); throw new Error(result.error || "Não foi possível concluir a indicação."); }
        const current = await fetch(endpoint, { cache: "no-store" });
        if (!current.ok) throw new Error("Não foi possível conferir a situação atual.");
        next = await current.json();
      }
      setState(next); nextPage(next);
    } catch (cause) { setError((cause as Error).message); }
    finally { loading.current = false; }
  }, []);
  useEffect(() => {
    void refresh();
    const check = () => { if (!document.hidden) void refresh(); };
    const timer = window.setInterval(check, 15000);
    document.addEventListener("visibilitychange", check);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", check); };
  }, [refresh]);
  async function act(action: string) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...(action === "other" ? { nome: name, email } : {}), channel: "MANUAL_SHARE" }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Não foi possível concluir esta etapa.");
      if (result.share) setShare(result.share);
      if (action === "revoke") setNotice("O convite anterior deixou de funcionar. Escolha o Responsável Contratual.");
      setName(""); setEmail(""); setOther(false);
      await refresh();
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }
  const unavailable = state.status === "DOCUMENTS_UNAVAILABLE";
  return <main className="terms-page contractual-onboarding"><section className="terms-card">
    <header><span className="terms-eyebrow">DEZ SOLUÇÕES · CONFIGURAÇÃO DA EMPRESA</span>
      <h1>{state.canChoose ? "Responsável Contratual" : "Configuração da empresa ainda não concluída"}</h1><p>{state.tenantName}</p></header>
    {unavailable ? <p role="status">Os documentos da contratação estão indisponíveis. Solicite orientação à DEZ Soluções.</p>
      : state.canChoose ? <>
        <h2>Quem será responsável pela contratação desta empresa?</h2>
        <p>Essa pessoa representará a empresa no aceite dos termos da contratação.</p>
        <div className="contractual-choices"><button className="btn btn-primary" type="button" disabled={busy} onClick={() => void act("self")}>Sou eu</button>
          <button className="btn btn-secondary" type="button" disabled={busy} aria-expanded={other} onClick={() => setOther(true)}>Outra pessoa</button></div>
        {other && <form method="post" className="contractual-form" onSubmit={event => { event.preventDefault(); void act("other"); }}>
          <p>A pessoa indicada receberá um convite para concluir os termos da contratação.</p>
          <label htmlFor="contractual-name">Nome<input id="contractual-name" required maxLength={160} autoComplete="name" value={name} onChange={event => setName(event.target.value)} /></label>
          <label htmlFor="contractual-email">E-mail<input id="contractual-email" required type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} /></label>
          <button className="btn btn-primary" type="submit" disabled={busy}>Enviar convite</button>
        </form>}
      </> : <div className="terms-wait" role="status"><h2 ref={statusHeading} tabIndex={-1}>Aguardando aceite do Responsável Contratual</h2>
        <p>As áreas da empresa serão liberadas após a conclusão da contratação. Seu acesso será atualizado automaticamente.</p></div>}
    {state.isOwner && state.invitation && state.invitation.status !== "REVOKED" && <section className="contractual-invitation" aria-label="Convite do Responsável Contratual">
      <h2>Pessoa indicada</h2><p><strong>{state.invitation.name}</strong><br />{state.invitation.email}</p>
      <p>{state.invitation.status === "ACCEPTED" ? "Acesso ativado. Aguardando conclusão dos termos." : state.invitation.status === "EXPIRED" ? "O convite expirou." : "Convite pronto para compartilhar. Aguardando aceite da pessoa indicada."}</p>
      <div className="contractual-choices">
        {state.invitation.canReissue && <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => void act("resend")}>Enviar novamente</button>}
        {state.invitation.canRevoke && <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => {
          if (window.confirm("Trocar o Responsável Contratual? O convite atual deixará de funcionar e você poderá escolher novamente.")) void act("revoke");
        }}>Trocar responsável</button>}
      </div></section>}
    {notice && <p className="contractual-notice" role="status">{notice}</p>}
    {error && <p className="terms-error" role="alert">{error}</p>}
    <nav className="contractual-footer" aria-label="Ações de acesso">
      <button className="terms-signout" type="button" disabled={busy} onClick={() => void refresh()}>Atualizar situação</button>
      <Link href="/minha-conta">Minha conta</Link><Link href="/selecionar-tenant">Minhas empresas</Link>
      <button className="terms-signout" type="button" onClick={() => void signOut({ callbackUrl: "/login" })}>Sair</button>
    </nav>
  </section>{share && <InvitationShareDialog invitation={share} variant="contractual" onShared={shared} onClose={closeShare} />}</main>;
}
