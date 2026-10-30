"use client";
import { useState } from "react";
import Link from "next/link";
import type { TenantModality } from "@/lib/tenant-modality-state";
import { HomologIdentityBadge } from "@/components/identity/EnvironmentIdentity";
import "./tenant-modality.css";

export default function TenantModalityClient({ tenantName, canChoose }: { tenantName: string; canChoose: boolean }) {
  const [choice, setChoice] = useState<TenantModality | "">("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function confirm(event: React.FormEvent) {
    event.preventDefault(); if (!choice || busy) return;
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/onboarding/modalidade", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ modalidade: choice }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Não foi possível definir a modalidade.");
      window.location.assign("/onboarding");
    } catch (e) { setError((e as Error).message); setBusy(false); }
  }
  return <main className="modality-page"><section className="modality-card" aria-labelledby="modality-title">
    <img className="modality-logo" src="/experimentacao/assets/brand-approved.png" width={2508} height={627} alt="DEZ Soluções — Assessoria Empresarial" />
    <HomologIdentityBadge />
    <p className="modality-tenant">Espaço: <strong>{tenantName}</strong></p>
    {canChoose ? <><h1 id="modality-title">Como você deseja utilizar este espaço?</h1>
      <p>A escolha vale para esta empresa ou espaço pessoal. Sua conta de acesso continua a mesma.</p>
      <form onSubmit={confirm}><fieldset disabled={busy}><legend>Escolha a modalidade</legend>
        <label className="modality-option"><input type="radio" name="modalidade" value="PF" checked={choice === "PF"} onChange={() => setChoice("PF")} required /><span><strong>Gestão Pessoal — PF</strong><span>Organizar minhas finanças pessoais.</span></span></label>
        <label className="modality-option"><input type="radio" name="modalidade" value="PJ" checked={choice === "PJ"} onChange={() => setChoice("PJ")} required /><span><strong>Gestão Empresarial — PJ</strong><span>Organizar a gestão da minha empresa.</span></span></label>
      </fieldset>
      {error && <p className="modality-error" role="alert">{error}</p>}
      <button className="modality-confirm" type="submit" disabled={!choice || busy}>{busy ? "Confirmando…" : "Confirmar e continuar"}</button>
      </form><p className="modality-hint">Em seguida, você continuará a definição do Responsável Contratual e os termos aplicáveis.</p>
    </> : <><h1 id="modality-title">Aguardando o Proprietário</h1><p>O Proprietário precisa definir a modalidade deste espaço antes de liberar a operação. Nenhum acesso adicional foi concedido.</p></>}
    <nav aria-label="Conta"><Link href="/selecionar-tenant">Minhas empresas</Link><Link href="/minha-conta">Minha conta</Link></nav>
  </section></main>;
}
