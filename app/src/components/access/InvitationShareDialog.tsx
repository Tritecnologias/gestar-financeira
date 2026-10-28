"use client";

import { useEffect, useRef, useState } from "react";
import { roleLabel } from "@/lib/presentation";
import { invitationWhatsAppUrl, parseInvitationLink } from "@/lib/invitation-link";
import "./access.css";

export type InvitationShare = { id: string; name: string; email: string; tenantName: string;
  role: string; profileName: string; expiresAt: string; link: string };

type ShareMethod = "COPY" | "WHATSAPP";
export default function InvitationShareDialog({ invitation, onClose, variant = "administrative", onShared }: {
  invitation: InvitationShare; onClose: () => void; variant?: "administrative" | "contractual";
  onShared?: (method: ShareMethod) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [notice, setNotice] = useState("");
  const contractual = variant === "contractual";
  useEffect(() => {
    dialog.current?.showModal();
    const clear = () => onClose();
    const timeout = window.setTimeout(clear, Math.max(0, Math.min(10 * 60_000, new Date(invitation.expiresAt).getTime() - Date.now())));
    window.addEventListener("pagehide", clear); window.addEventListener("pageshow", clear);
    return () => { clearTimeout(timeout); window.removeEventListener("pagehide", clear); window.removeEventListener("pageshow", clear); };
  }, [invitation.id, invitation.expiresAt, onClose]);

  async function copy() {
    if (!parseInvitationLink(invitation.link, window.location.origin)) { setNotice("Link indisponível. Gere um novo convite."); return; }
    try {
      await navigator.clipboard.writeText(invitation.link);
      if (contractual && onShared) onShared("COPY");
      else setNotice("Link copiado. Envie-o somente ao destinatário deste convite.");
    }
    catch { setNotice("Não foi possível copiar. Tente novamente ou compartilhe pelo WhatsApp."); }
  }
  function whatsapp() {
    const url = invitationWhatsAppUrl(invitation, window.location.origin);
    if (!url) { setNotice("Link indisponível. Gere um novo convite."); return; }
    window.open(url, "_blank", "noopener,noreferrer");
    // Opening the sharing channel is not proof that a message was sent/delivered.
    if (contractual && onShared) onShared("WHATSAPP");
  }
  return <dialog ref={dialog} className="access-share-dialog" aria-labelledby="invite-share-title" onCancel={onClose} onClose={onClose}>
    <h2 id="invite-share-title">{contractual ? "Convite pronto para compartilhar" : "Convite criado"}</h2>
    <p>{contractual ? "Escolha como compartilhar o convite com a pessoa indicada. A empresa aguardará a conclusão dos aceites." : "Compartilhe somente com o destinatário. Nenhum acesso fica ativo antes da confirmação do titular."}</p>
    <dl><dt>Nome</dt><dd>{invitation.name}</dd><dt>E-mail</dt><dd>{invitation.email}</dd>
      <dt>Empresa</dt><dd>{invitation.tenantName}</dd>{!contractual && <><dt>Função</dt><dd>{roleLabel(invitation.role)}</dd>
      <dt>Perfil</dt><dd>{invitation.profileName}</dd></>}<dt>{contractual ? "Validade" : "Expira em"}</dt><dd>{new Date(invitation.expiresAt).toLocaleString("pt-BR")}</dd></dl>
    <p className="access-hint">{contractual ? "O convite é pessoal e de uso único. Ao fechar ou recarregar, use “Enviar novamente” para obter um novo link; o anterior deixará de funcionar." : "Convite pessoal e de uso único. O link fica disponível nesta tela por até 10 minutos. Ao fechar ou recarregar, use “Gerar novo convite” para compartilhar novamente."}</p>
    {notice && <p className="access-hint" role="status">{notice}</p>}
    <div className="access-share-actions">
      <button type="button" className="access-button access-button-primary" onClick={whatsapp}>{contractual ? "Enviar pelo WhatsApp" : "Compartilhar por WhatsApp"}</button>
      <button type="button" className="access-button access-button-secondary" onClick={() => void copy()}>{contractual ? "Copiar link" : "Copiar link de convite"}</button>
      <button type="button" className="access-button access-button-secondary" onClick={onClose}>Fechar</button>
    </div>
  </dialog>;
}
