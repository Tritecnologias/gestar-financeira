import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/tenant";
import AdminPage from "@/app/(app)/admin/page";

/** Administração sem contexto empresarial; APIs continuam aplicando seus guards. */
export default async function PlataformaPage() {
  try { await requirePlatformAdmin(); }
  catch { redirect("/login"); }
  return <div style={{ minHeight: "100vh", background: "var(--background)", color: "var(--text-primary)" }}>
    <AdminPage platformMode />
  </div>;
}
