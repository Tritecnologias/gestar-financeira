import { redirect } from "next/navigation";
import { requireSupportOperator } from "@/lib/tenant";
import SupportClient from "@/components/access/SupportClient";
import { pendingOperatorTerms } from "@/lib/support-terms";
import TermsAcceptanceClient from "@/components/access/TermsAcceptanceClient";
import "@/app/termos/aceite/terms.css";
export default async function SupportPage({ searchParams }: { searchParams: Promise<{ pending?: string }> }) {
  let operator;
  try { operator = await requireSupportOperator(); } catch { redirect("/selecionar-tenant"); }
  const pending = await pendingOperatorTerms(operator.id);
  if (pending.length) return <TermsAcceptanceClient initialPending={pending} returnPath="/suporte" personalSupport />;
  return <><p role="status" className="support-notice" hidden={(await searchParams).pending !== "contract"}>
    O acesso aguarda regularização dos termos pelo responsável da empresa.</p>
    <SupportClient mode="operator" platformAdmin={operator.platformAdmin?.status === "ACTIVE"} /></>;
}
