import { redirect } from "next/navigation";
import { requireSession } from "@/lib/tenant";
import { pendingTerms } from "@/lib/terms";
import TermsAcceptanceClient from "@/components/access/TermsAcceptanceClient";
import { SUPPORT_MODULES } from "@/lib/support-policy";
import "./terms.css";
import { contractualReadiness } from "@/lib/contractual-state";
import { prisma } from "@/lib/db";

export default async function TermsAcceptancePage() {
  let session;
  try { ({ session } = await requireSession({ allowPendingTerms: true })); }
  catch (error) { redirect((error as {status?: number}).status === 409 ? "/selecionar-tenant" : "/login"); }
  const pending = await pendingTerms(session);
  const returnPath = session.accessSource === "SUPPORT_GRANT"
    ? SUPPORT_MODULES[session.supportModules?.[0] ?? "ESTRUTURA_EMPRESA"].page : "/inicio";
  if (session.accessSource === "MEMBERSHIP") {
    const userTerms = pending.filter(t => t.audience === "USUARIO");
    if (userTerms.length) return <TermsAcceptanceClient initialPending={userTerms} audience="USUARIO" returnPath="/onboarding" />;
    const ready = await contractualReadiness(prisma, session.tenantId);
    if (!ready.active && ready.responsibleMembershipId !== session.membershipId) redirect("/onboarding");
    if (!ready.active && !pending.some(t => t.actionable)) redirect("/onboarding");
  }
  if (!pending.length) redirect(returnPath);
  return <TermsAcceptanceClient initialPending={pending} returnPath={returnPath} />;
}
