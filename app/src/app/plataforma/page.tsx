import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/tenant";
import PlatformClient from "@/components/access/PlatformClient";

/** Administração sem contexto empresarial; APIs continuam aplicando seus guards. */
export default async function PlataformaPage() {
  try { await requirePlatformAdmin(); }
  catch { redirect("/login"); }
  return <PlatformClient />;
}
