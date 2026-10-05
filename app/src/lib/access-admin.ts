import { legacyAuthEnabled } from "@/lib/auth";
import { getIdentityAccess, requireSession } from "@/lib/tenant";

/** A administração da plataforma não concede contexto operacional empresarial. */
export async function requireUserAdminActor() {
  if (!legacyAuthEnabled) {
    const identity = await getIdentityAccess();
    if (identity.platformAdmin?.status === "ACTIVE") {
      return { id: "", identityId: identity.id, papel: "admin_global" as const, tenantId: "" };
    }
  }
  const { session } = await requireSession();
  if (session.papel !== "admin" && session.papel !== "admin_global") {
    throw Object.assign(new Error("Acesso negado"), { status: 403 });
  }
  return session;
}
