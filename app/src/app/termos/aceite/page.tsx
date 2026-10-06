import { redirect } from "next/navigation";
import { requireSession } from "@/lib/tenant";
import { pendingTerms } from "@/lib/terms";
import TermsAcceptanceClient from "@/components/access/TermsAcceptanceClient";
import { SUPPORT_MODULES } from "@/lib/support-policy";
import "./terms.css";

export default async function TermsAcceptancePage() {
  let session;
  try { ({ session } = await requireSession({ allowPendingTerms: true })); }
  catch (error) { redirect((error as {status?: number}).status === 409 ? "/selecionar-tenant" : "/login"); }
  const pending = await pendingTerms(session);
  const returnPath = session.accessSource === "SUPPORT_GRANT"
    ? SUPPORT_MODULES[session.supportModules?.[0] ?? "ESTRUTURA_EMPRESA"].page : "/lancamentos";
  if (!pending.length) redirect(returnPath);
  return <TermsAcceptanceClient initialPending={pending} returnPath={returnPath} />;
}
