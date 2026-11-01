"use client";
import { useEffect, useState } from "react";

/** Presentation only: storage supplies a reference, never evidence of provisioning. */
export default function AdmissionHandoffNotice({ tenantId }: { tenantId: string }) {
  const [confirmedTenant, setConfirmedTenant] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const id = sessionStorage.getItem("dez-admission-id");
      if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return;
      const response = await fetch(`/api/admissions/${id}`, { cache: "no-store", signal: controller.signal });
      if (!response.ok) return;
      const state = await response.json();
      if (!controller.signal.aborted && state.state === "PROVISIONED" && state.tenantId === tenantId) setConfirmedTenant(tenantId);
    })().catch(() => { /* The existing contractual screen remains available if status cannot be read. */ });
    return () => controller.abort();
  }, [tenantId]);
  if (confirmedTenant !== tenantId) return null;
  return <aside className="terms-wait terms-admission-status" role="status">
    <strong>Identidade confirmada. Seu espaço foi criado automaticamente.</strong>
    <p>Siga com os documentos e as etapas contratuais obrigatórias para liberar o acesso.</p>
  </aside>;
}
