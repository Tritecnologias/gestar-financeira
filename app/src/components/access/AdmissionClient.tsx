"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import PasswordInput from "@/components/ui/PasswordInput";
import "./activation.css";

type State = { id: string; email: string; state: "CREATE_IDENTITY" | "LOGIN_REQUIRED" | "IDENTITY_VERIFIED"; expiresAt: string };
const validId = (value: string) => /^[0-9a-f-]{36}$/i.test(value);
async function readAdmission(reference: string, signal?: AbortSignal) {
  const response = await fetch(`/api/admissions/${reference}`, { cache: "no-store", signal });
  return { ok: response.ok, status: response.status, body: await response.json() as State & { error?: string } };
}
export default function AdmissionClient() {
  const [id, setId] = useState(""), [state, setState] = useState<State | null>(null);
  const [hasLink, setHasLink] = useState(false), [email, setEmail] = useState(""), [password, setPassword] = useState(""), [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const link = useRef<{ challengeId: string; token: string } | null>(null);
  const initialReference = useRef("");
  const applyState = useCallback((response: Awaited<ReturnType<typeof readAdmission>>) => {
    if (response.ok) { setState(response.body); setEmail(response.body.email); return true; }
    setState(null);
    if (response.status !== 401) setError(response.body.error || "Não foi possível consultar sua adesão.");
    return false;
  }, []);
  const refresh = useCallback(async (reference: string) => applyState(await readAdmission(reference)), [applyState]);
  useEffect(() => {
    let controller: AbortController | null = null;
    function synchronizeLocation() {
      controller?.abort(); controller = new AbortController(); const { signal } = controller;
      const fragment = new URLSearchParams(window.location.hash.slice(1));
      let reference = fragment.get("id") || initialReference.current;
      try { reference ||= sessionStorage.getItem("dez-admission-id") || ""; } catch { /* A blocked browser store must not block an email link. */ }
      const challengeId = fragment.get("challenge") || "", token = fragment.get("token") || "";
      // Tokens exist only in memory until explicit confirmation; never local/session storage or query strings.
      window.history.replaceState(null, "", window.location.pathname);
      if (!validId(reference)) return;
      if (initialReference.current && initialReference.current !== reference) link.current = null;
      initialReference.current = reference;
      try { sessionStorage.setItem("dez-admission-id", reference); } catch { /* Cookie and original email remain usable. */ }
      if (validId(challengeId) && /^[A-Za-z0-9_-]{43}$/.test(token)) link.current = { challengeId, token };
      void readAdmission(reference, signal).then(response => { if (!signal.aborted) { setError(""); applyState(response); } })
        .catch(() => { if (!signal.aborted) setError("Não foi possível consultar agora. Tente novamente."); })
        .finally(() => { if (!signal.aborted) { setId(reference); setHasLink(!!link.current); } });
    }
    window.addEventListener("hashchange", synchronizeLocation); synchronizeLocation();
    return () => { controller?.abort(); window.removeEventListener("hashchange", synchronizeLocation); };
  }, [applyState]);
  useEffect(() => {
    if (!id) return;
    const update = () => { void refresh(id).catch(() => {}); };
    window.addEventListener("focus", update);
    return () => window.removeEventListener("focus", update);
  }, [id, refresh]);
  async function action(work: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try { await work(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Não foi possível continuar."); }
    finally { setBusy(false); }
  }
  async function post(path: string, body: unknown) {
    const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || "Não foi possível continuar."); return result;
  }
  async function confirmEmail() {
    await action(async () => {
      if (!link.current) throw new Error("Solicite um novo link para continuar.");
      await post(`/api/admissions/${id}/verify`, link.current);
      link.current = null; setHasLink(false); await refresh(id);
    });
  }
  async function resume(event: React.FormEvent) {
    event.preventDefault();
    await action(async () => {
      const result = await post("/api/admissions/resume", { email, ...(id ? { admissionId: id } : {}) });
      setNotice(result.message);
    });
  }
  async function identify(event: React.FormEvent) {
    event.preventDefault();
    await action(async () => {
      if (!state) return;
      if (state.state === "CREATE_IDENTITY") {
        if (password !== confirmation) throw new Error("As senhas precisam ser iguais.");
        await post(`/api/admissions/${id}/identity`, { password });
      }
      const result = await signIn("credentials", { email: state.email, password, redirect: false });
      setPassword(""); setConfirmation("");
      if (result?.error) {
        await refresh(id); // A committed new account survives a lost response or login failure.
        throw new Error("Entre com sua senha atual para continuar. Sua senha não foi redefinida.");
      }
      await refresh(id);
    });
  }
  return <main className="activation-page"><section className="activation-card">
    <span className="activation-eyebrow">DEZ SOLUÇÕES · ADESÃO</span><h1>Continue sua adesão</h1>
    {error && <p className="activation-error" role="alert">{error}</p>}
    <p role="status" aria-live="polite">{notice}</p>
    {!state && <>
      <p>Confirme o controle do e-mail autorizado para continuar com segurança.</p>
      {hasLink && <button disabled={busy} onClick={() => void confirmEmail()}>Confirmar meu e-mail</button>}
      <form method="post" className="activation-fields" onSubmit={resume}>
        <label>E-mail autorizado<input type="email" required autoComplete="email" maxLength={254} value={email} onChange={event => setEmail(event.target.value)} /></label>
        <button disabled={busy} type="submit">Receber novo link</button>
        {!id && <p className="activation-muted">Se recebeu mais de uma autorização, abra o e-mail da adesão que deseja retomar.</p>}
      </form>
    </>}
    {state && <>
      <p>E-mail confirmado: <strong>{state.email}</strong>.</p>
      {state.state === "IDENTITY_VERIFIED" ? <><h2>Identidade verificada</h2><p>Sua adesão está pronta para a próxima etapa. A criação do seu espaço ainda não está disponível.</p>
        <button disabled={busy} onClick={() => void action(async () => { await refresh(id); })}>Atualizar situação</button></>
        : <form method="post" className="activation-fields" onSubmit={identify}>
          <p>{state.state === "CREATE_IDENTITY" ? "Crie sua senha para identificar sua conta." : "Entre com sua senha atual. Seus acessos existentes serão preservados."}</p>
          <PasswordInput id="admission-password" label={state.state === "CREATE_IDENTITY" ? "Crie sua senha" : "Senha atual"} required autoComplete={state.state === "CREATE_IDENTITY" ? "new-password" : "current-password"} value={password} onChange={event => setPassword(event.target.value)} minLength={state.state === "CREATE_IDENTITY" ? 12 : undefined} maxLength={200} />
          {state.state === "CREATE_IDENTITY" && <PasswordInput id="admission-confirmation" label="Confirme sua senha" required autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} minLength={12} maxLength={200} />}
          <button disabled={busy} type="submit">{busy ? "Aguarde…" : "Confirmar identidade"}</button>
          {state.state === "LOGIN_REQUIRED" && <p className="activation-muted">Se não lembra sua senha, solicite atendimento para recuperar sua conta. O link de adesão não redefine senhas.</p>}
        </form>}
    </>}
  </section></main>;
}
