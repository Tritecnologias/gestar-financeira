import { redirect } from "next/navigation";
import { requireSession } from "@/lib/tenant";
import { pendingTerms } from "@/lib/terms";
import TermsAcceptanceClient from "@/components/access/TermsAcceptanceClient";
import "./terms.css";

export default async function TermsAcceptancePage() {
  let session;
  try { ({ session } = await requireSession({ allowPendingTerms: true })); }
  catch (error) { redirect((error as {status?: number}).status === 409 ? "/selecionar-tenant" : "/login"); }
  const pending = await pendingTerms(session);
  if (!pending.length) redirect("/lancamentos");
  return <TermsAcceptanceClient initialPending={pending} />;
}
