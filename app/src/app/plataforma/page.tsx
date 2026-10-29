import { redirect } from "next/navigation";
import { getIdentityAccess, requirePlatformAdmin } from "@/lib/tenant";
import PlatformClient from "@/components/access/PlatformClient";
import { experimentOrigin } from "@/lib/experiment-policy";

/** Administração sem contexto empresarial; APIs continuam aplicando seus guards. */
export default async function PlataformaPage() {
  let operator = false;
  try { const actor = await requirePlatformAdmin();
    operator = actor.identityId ? (await getIdentityAccess()).supportOperator?.status === "ACTIVE" : false; }
  catch { redirect("/login"); }
  return <PlatformClient supportOperator={operator} experimentPilot={!!experimentOrigin()} />;
}
