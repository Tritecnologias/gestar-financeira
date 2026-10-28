import { redirect } from "next/navigation";
import { requireSession } from "@/lib/tenant";
import { contractualOnboardingState } from "@/lib/contractual-onboarding";
import ContractualOnboardingClient from "@/components/access/ContractualOnboardingClient";
import Link from "next/link";

export default async function OnboardingPage() {
  let session;
  try { ({ session } = await requireSession({ allowPendingTerms: true })); }
  catch (error) { redirect([403, 409].includes((error as { status?: number }).status ?? 0) ? "/selecionar-tenant" : "/login"); }
  if (session.authMode === "legacy") return <main className="terms-page"><section className="terms-card">
    <h1>Configuração da empresa ainda não concluída</h1><p>O Proprietário deve concluir a contratação com sua conta de acesso atual.</p>
    <Link href="/api/auth/signout">Sair</Link></section></main>;
  if (session.accessSource !== "MEMBERSHIP") redirect("/selecionar-tenant");
  const state = await contractualOnboardingState(session);
  if (state.status === "USER_TERMS_REQUIRED") redirect("/termos/aceite");
  if (state.status === "ACTIVE") redirect("/inicio");
  if (state.status === "AWAITING_CONTRACT" && state.canAcceptContract) redirect("/termos/aceite");
  return <ContractualOnboardingClient initialState={state} />;
}
