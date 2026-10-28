"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { parseInvitationLink } from "@/lib/invitation-link";
import "@/components/access/activation.css";

export default function PrimeiroAcessoPage() {
  const [link, setLink] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const clear = () => { setLink(""); setError(""); };
    window.addEventListener("pagehide", clear); window.addEventListener("pageshow", clear);
    return () => { window.removeEventListener("pagehide", clear); window.removeEventListener("pageshow", clear); };
  }, []);
  function proceed(event: React.FormEvent) {
    event.preventDefault();
    const destination = parseInvitationLink(link, window.location.origin);
    if (!destination) { setLink(""); setError("Confira o link recebido. Ele deve ser um convite desta plataforma."); return; }
    setLink(""); setError(""); window.location.replace(destination);
  }
  return <main className="activation-page"><section className="activation-card">
    <span className="activation-eyebrow">DEZ SOLUÇÕES · ACESSO</span><h1>Primeiro acesso</h1>
    <p>Recebeu um convite da DEZ Soluções?</p>
    <h2>Tenho meu convite</h2>
    <p>Abra o link recebido para ativar seu acesso. Se preferir, cole-o abaixo.</p>
    <form className="activation-fields" onSubmit={proceed} autoComplete="off">
      <label htmlFor="invitation-link">Link do convite<input id="invitation-link" type="text" value={link} autoComplete="off" spellCheck={false}
        autoCapitalize="none" maxLength={2048} required onChange={event => setLink(event.target.value)} /></label>
      {error && <p role="alert" className="activation-error">{error}</p>}
      <button type="submit">Continuar com meu convite</button>
    </form>
    <h2>Perdi ou não recebi meu convite</h2>
    <p>Solicite ao responsável pela sua empresa um novo convite de acesso.</p>
    <Link href="/login">Voltar para o login</Link>
  </section></main>;
}
