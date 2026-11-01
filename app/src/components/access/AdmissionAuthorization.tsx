"use client";
import { useState } from "react";

type Admission = { id: string; email: string; status: string; expiresAt: string; emailVerified: boolean };
export default function AdmissionAuthorization({ invitationId }: { invitationId: string }) {
  const [open, setOpen] = useState(false), [admission, setAdmission] = useState<Admission | null>(null);
  const [email, setEmail] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const path = `/api/platform/experiment-invitations/${invitationId}/admission`;
  async function inspect() {
    setBusy(true); setError("");
    try {
      const response = await fetch(path, { cache: "no-store" }), body = await response.json();
      if (!response.ok) throw new Error(body.error); setAdmission(body.admission); setOpen(true);
    } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  }
  async function authorize(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) }), body = await response.json();
      if (!response.ok) throw new Error(body.error); setAdmission(body);
      setNotice(body.delivery === "FAILED" || body.delivery === "DEFERRED" ? "Autorização registrada. Solicite um novo link para continuar a confirmação." : "Interesse aceito. A adesão depende da confirmação do e-mail autorizado.");
    } catch (cause) { setError((cause as Error).message); } finally { setBusy(false); }
  }
  return <div className="experiment-bind">
    {!open ? <button type="button" className="access-button access-button-secondary" disabled={busy} onClick={() => void inspect()}>Analisar adesão</button>
      : admission ? <div><small>Autorização: {admission.status === "CANCELLED" ? "cancelada" : admission.emailVerified ? "e-mail confirmado" : "aguardando confirmação"}.</small><small>{admission.email}</small><small>Válida até {new Date(admission.expiresAt).toLocaleString("pt-BR")}.</small></div>
        : <form method="post" onSubmit={authorize}><label>E-mail autorizado<input type="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} /></label><p>Ao aceitar o interesse, você autoriza a adesão somente para este endereço.</p><button className="access-button access-button-primary" type="submit" disabled={busy}>Aceitar interesse e autorizar</button></form>}
    {error && <small role="alert">{error}</small>}{notice && <small role="status">{notice}</small>}
  </div>;
}
