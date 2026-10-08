import { legacyAuthEnabled } from "@/lib/auth";
import { getIdentityAccess, requireTenantAdmin } from "@/lib/tenant";

/** A administração da plataforma não concede contexto operacional empresarial. */
export async function requireUserAdminActor() {
  if (!legacyAuthEnabled) {
    const identity = await getIdentityAccess();
    if (identity.platformAdmin?.status === "ACTIVE") {
      return { id: "", identityId: identity.id, papel: "admin_global" as const, tenantId: "" };
    }
  }
  return (await requireTenantAdmin()).session;
}
