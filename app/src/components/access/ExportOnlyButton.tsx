"use client";

import { useState } from "react";
import { useCan } from "./PermissionContext";

/** Export remains reachable when a profile may export but may not import. */
export default function ExportOnlyButton({ permission, importPermission, url, filename, label, className = "btn btn-secondary" }: {
  permission: string; importPermission: string; url: string; filename: string; label: string; className?: string;
}) {
  const can = useCan();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!can(permission) || can(importPermission)) return null;

  const download = async () => {
    setBusy(true); setError("");
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error("Não foi possível baixar o arquivo.");
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = objectUrl; link.download = filename;
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível baixar o arquivo.");
    } finally { setBusy(false); }
  };

  return <span><button type="button" className={className} onClick={() => void download()} disabled={busy}>{busy ? "Baixando…" : label}</button>{error && <span role="alert">{error}</span>}</span>;
}
