import { redirect } from "next/navigation";
import { requireSession } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { acceptedUserTerms } from "@/lib/contractual-state";
import { tenantModalityState } from "@/lib/tenant-modality-state";
import TenantModalityClient from "@/components/access/TenantModalityClient";

export default async function TenantModalityPage() {
  let session;
  try { ({ session } = await requireSession({ allowPendingTerms: true })); }
  catch (e) { redirect([403, 409].includes((e as { status?: number }).status ?? 0) ? "/selecionar-tenant" : "/login"); }
  if (session.authMode !== "identity" || session.accessSource !== "MEMBERSHIP") redirect("/selecionar-tenant");
  if (!await acceptedUserTerms(prisma, session.identityId!)) redirect("/termos/aceite");
  const state = await tenantModalityState(prisma, session.tenantId);
  if (!state.pending) redirect("/onboarding");
  return <TenantModalityClient tenantName={state.tenantName} canChoose={session.membershipRole === "OWNER"} />;
}
