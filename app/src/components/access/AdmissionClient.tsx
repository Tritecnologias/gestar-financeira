"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { getSession, signIn, signOut } from "next-auth/react";
import PasswordInput from "@/components/ui/PasswordInput";
import Link from "next/link";
import "./activation.css";
import "./admission.css";

type State = { id: string; email: string; state: "CREATE_IDENTITY" | "LOGIN_REQUIRED" | "IDENTITY_VERIFIED" | "PROVISIONED"; tenantId?: string };
const validId = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const retryMessage = "Não foi possível concluir agora. Consulte seu progresso antes de tentar novamente.";
async function post(path: string, body: unknown) {
  const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  const data = await r.json();
  if (!r.ok) throw new Error(r.status === 429 ? "Muitas tentativas. Aguarde alguns minutos para tentar novamente." : r.status >= 500 ? retryMessage : data.error || "Não foi possível continuar.");
  return data;
}
export default function AdmissionClient() {
  const [id, setId] = useState(""), [state, setState] = useState<State | null>(null);
  const [hasLink, setHasLink] = useState(false), [email, setEmail] = useState(""), [password, setPassword] = useState(""), [confirmation, setConfirmation] = useState(""), [name, setName] = useState("");
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [signedIn, setSignedIn] = useState(false), [cooldown, setCooldown] = useState(0);
  const link = useRef<{ challengeId: string; token: string } | null>(null), reference = useRef(""), generation = useRef(0), inFlight = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null), alert = useRef<HTMLParagraphElement>(null);
  const refresh = useCallback(async (target: string, revision = generation.current, signal?: AbortSignal) => {
    const r = await fetch(`/api/admissions/${target}`, { cache: "no-store", signal }), body = await r.json();
    if (revision !== generation.current || target !== reference.current || signal?.aborted) return null;
    if (r.ok) { setState(body); setEmail(body.email); if (body.state === "PROVISIONED") { link.current = null; setHasLink(false); } return body as State; }
    setState(null);
    if (r.status !== 401) setError(r.status === 409 ? "Esta adesão está indisponível. O link pode ter expirado ou a autorização ter sido cancelada. Solicite um novo link ou fale com quem enviou o convite." : r.status >= 500 ? retryMessage : body.error);
    return null;
  }, []);
  useEffect(() => {
    let controller: AbortController | null = null;
    function synchronize() {
      controller?.abort(); controller = new AbortController(); const { signal } = controller;
      const fragment = new URLSearchParams(window.location.hash.slice(1)), requested = fragment.get("id");
      let target = requested || reference.current;
      try { target ||= sessionStorage.getItem("dez-admission-id") || ""; } catch { /* Original mail remains usable. */ }
      const challengeId = fragment.get("challenge") || "", token = fragment.get("token") || "";
      window.history.replaceState(null, "", window.location.pathname);
      const revision = ++generation.current;
      if (target !== reference.current) { link.current = null; setState(null); setEmail(""); setPassword(""); setConfirmation(""); setName(""); }
      setError(""); setNotice("");
      if (fragment.get("from") === "convite") setNotice("Sua adesão já está autorizada. Confira a mensagem de confirmação no e-mail cadastrado no convite. Se já solicitou o link, aguarde sua chegada antes de reenviar.");
      if (!validId(target)) { reference.current = ""; link.current = null; setId(""); setState(null); setLoading(false); setHasLink(false); if (requested) setError("O link está incompleto. Abra o link original recebido por e-mail."); return; }
      reference.current = target; setId(target); setLoading(true);
      try { sessionStorage.setItem("dez-admission-id", target); } catch { /* No token is stored. */ }
      if (validId(challengeId) && /^[A-Za-z0-9_-]{43}$/.test(token)) link.current = { challengeId, token };
      setHasLink(!!link.current);
      void refresh(target, revision, signal).catch(() => { if (!signal.aborted) setError(retryMessage); }).finally(() => { if (!signal.aborted) setLoading(false); });
      void getSession().then(s => { if (!signal.aborted) setSignedIn(!!s?.user); }).catch(() => {});
    }
    window.addEventListener("hashchange", synchronize); synchronize();
    return () => { controller?.abort(); window.removeEventListener("hashchange", synchronize); };
  }, [refresh]);
  useEffect(() => {
    const update = () => { if (reference.current && !inFlight.current) void refresh(reference.current).catch(() => {}); };
    window.addEventListener("focus", update); return () => window.removeEventListener("focus", update);
  }, [refresh]);
  useEffect(() => { if (!cooldown) return; const timer = setTimeout(() => setCooldown(v => v - 1), 1000); return () => clearTimeout(timer); }, [cooldown]);
  const step = state?.state === "PROVISIONED" ? 2 : !state || hasLink ? 0 : ["CREATE_IDENTITY", "LOGIN_REQUIRED"].includes(state.state) ? 1 : 2;
  useEffect(() => { if (!loading) heading.current?.focus(); }, [loading, step, state?.state]);
  useEffect(() => { if (error) alert.current?.focus(); }, [error]);
  async function action(work: (current: () => boolean) => Promise<void>) {
    if (inFlight.current) return;
    const revision = generation.current, target = reference.current, current = () => revision === generation.current && target === reference.current;
    inFlight.current = true; setBusy(true); setError(""); setNotice("");
    try { await work(current); } catch (e) { if (current()) setError(e instanceof Error && e.message !== "Failed to fetch" ? e.message : retryMessage); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function confirmEmail() { await action(async current => {
    if (!link.current) throw new Error("Solicite um novo link para continuar.");
    await post(`/api/admissions/${id}/verify`, link.current);
    if (current()) { link.current = null; setHasLink(false); setNotice("E-mail confirmado. Agora confirme sua identidade."); await refresh(id); }
  }); }
  async function identify(event: React.FormEvent) { event.preventDefault(); await action(async current => {
    if (!state) return;
    try {
      if (state.state === "CREATE_IDENTITY") {
        if (password !== confirmation) throw new Error("As senhas precisam ser iguais.");
        await post(`/api/admissions/${id}/identity`, { password });
      }
      if (!current()) return;
      const result = await signIn("credentials", { email: state.email, password, redirect: false });
      if (!current()) return;
      setPassword(""); setConfirmation("");
      if (!result || result.error) throw new Error("Não foi possível entrar. Confira sua senha atual. Se precisar, solicite atendimento a quem enviou o convite.");
      setSignedIn(true); await refresh(id); setNotice("Identidade confirmada. Falta preparar seu espaço.");
    } catch (e) { if (current()) await refresh(id).catch(() => {}); throw e; }
  }); }
  async function prepare(event: React.FormEvent) { event.preventDefault(); await action(async current => {
    try { await post(`/api/admissions/${id}/provision`, { nome: name.trim() }); if (current()) window.location.assign("/onboarding"); }
    catch (e) { if (current()) await refresh(id).catch(() => {}); throw e; }
  }); }
  const titles = ["Confirme seu e-mail", "Confirme sua identidade", state?.state === "PROVISIONED" ? "Seu espaço está pronto" : "Prepare seu espaço"];
  return <main className="activation-page admission-page"><section className="activation-card admission-card" aria-busy={busy || loading}>
    <header><span className="activation-eyebrow">DEZ SOLUÇÕES · ADESÃO</span><h1>Seu próximo passo começa aqui</h1><p>Continue com segurança para organizar sua gestão.</p></header>
    <ol className="admission-steps" aria-label="Etapas da adesão">{["E-mail", "Identidade", "Seu espaço"].map((label, n) => <li key={label} aria-current={step === n ? "step" : undefined}><span aria-hidden="true">{n < step ? "✓" : n + 1}</span>{label}{n < step && <span className="admission-sr">: concluído</span>}</li>)}</ol>
    {error && <p ref={alert} tabIndex={-1} className="activation-error" role="alert">{error}</p>}
    {notice && <p className="admission-notice" role="status">{notice}</p>}
    {loading ? <p role="status">Consultando sua adesão…</p> : <>
      <h2 ref={heading} tabIndex={-1}>{titles[step]}</h2>
      {step === 0 && <>
        <p>Use o e-mail autorizado para esta adesão. A confirmação protege o acesso ao seu espaço.</p>
        {hasLink && <button disabled={busy} onClick={() => void confirmEmail()}>{busy ? "Confirmando…" : "Confirmar meu e-mail"}</button>}
        <form method="post" className="activation-fields" onSubmit={event => { event.preventDefault(); void action(async current => {
          const result = await post("/api/admissions/resume", { email, ...(id ? { admissionId: id } : {}) });
          if (current()) { link.current = null; setHasLink(false); setNotice(result.message); setCooldown(60); }
        }); }}>
          <label htmlFor="admission-email">E-mail autorizado<input id="admission-email" type="email" required autoComplete="email" maxLength={254} disabled={busy} value={email} onChange={event => setEmail(event.target.value)} /></label>
          <button className={hasLink ? "admission-secondary" : ""} disabled={busy || cooldown > 0} type="submit">{cooldown ? `Aguarde ${cooldown}s para reenviar` : "Receber novo link"}</button>
        </form>
        <p className="activation-muted">O convite individual já inclui a autorização de adesão. Se recebeu mais de uma autorização, abra o e-mail da adesão que deseja retomar.</p>
        <p className="activation-muted">Já criou seu espaço? <Link href="/login?callbackUrl=%2Fadesao">Entrar com minha conta</Link></p>
        {id && !hasLink && <button className="admission-secondary" disabled={busy} onClick={() => void action(async () => { await refresh(id); })}>Consultar progresso</button>}
      </>}
      {state && step > 0 && <p className="admission-verified">E-mail confirmado: <strong>{state.email}</strong></p>}
      {state && step === 1 && <form method="post" className="activation-fields" onSubmit={identify}>
        <p>{state.state === "CREATE_IDENTITY" ? "Crie uma senha com pelo menos 12 caracteres para proteger sua conta." : "Use sua senha atual. Seus acessos a outras empresas serão preservados."}</p>
        {signedIn && <button type="button" className="admission-secondary" disabled={busy} onClick={() => void action(async current => { await signOut({ redirect: false }); if (current()) { setSignedIn(false); await refresh(id); } })}>Sair da conta atual</button>}
        <PasswordInput id="admission-password" label={state.state === "CREATE_IDENTITY" ? "Crie sua senha" : "Senha atual"} disabled={busy} required autoComplete={state.state === "CREATE_IDENTITY" ? "new-password" : "current-password"} value={password} onChange={e => setPassword(e.target.value)} minLength={state.state === "CREATE_IDENTITY" ? 12 : undefined} maxLength={200}
          sequential={state.state === "CREATE_IDENTITY"} holdToReveal={state.state === "CREATE_IDENTITY"} aria-describedby={state.state === "CREATE_IDENTITY" ? "admission-password-help" : undefined} />
        {state.state === "CREATE_IDENTITY" && <><PasswordInput id="admission-confirmation" label="Confirme sua senha" required disabled={busy} autoComplete="new-password" value={confirmation} onChange={e => setConfirmation(e.target.value)} minLength={12} maxLength={200}
          sequential holdToReveal aria-describedby="admission-password-help" />
          <p id="admission-password-help" className="activation-muted">Para conferir a senha, mantenha o olho pressionado. No teclado, mantenha Alt+Shift+V pressionado no campo.</p></>}
        <button disabled={busy} type="submit">{busy ? "Confirmando…" : "Confirmar identidade"}</button>
        {state.state === "LOGIN_REQUIRED" && <p className="activation-muted">Não lembra sua senha? Solicite atendimento a quem enviou o convite. O link de adesão não altera sua senha.</p>}
      </form>}
      {state?.state === "IDENTITY_VERIFIED" && step === 2 && <form method="post" className="activation-fields" onSubmit={prepare}>
        <p>Dê um nome para reconhecer este espaço. Ele será criado e vinculado à sua conta.</p>
        <label htmlFor="admission-name">Nome do seu espaço<input id="admission-name" required disabled={busy} maxLength={160} autoComplete="organization" value={name} onChange={e => setName(e.target.value)} /></label>
        <button disabled={busy || !name.trim()} type="submit">{busy ? "Preparando seu espaço…" : "Criar meu espaço e continuar"}</button>
      </form>}
      {state?.state === "PROVISIONED" && step === 2 && <><p>Seu espaço já foi criado. Continue de onde parou para concluir as etapas de contratação.</p><button disabled={busy} onClick={() => void action(async current => { await post("/api/tenants/switch", { tenantId: state.tenantId }); if (current()) window.location.assign("/onboarding"); })}>{busy ? "Continuando…" : "Continuar adesão"}</button></>}
    </>}
    <footer className="admission-footer"><p>Depois, você seguirá para os termos pendentes, a escolha PF/PJ e a contratação. O acesso ao sistema será liberado ao concluir os requisitos.</p></footer>
  </section></main>;
}
