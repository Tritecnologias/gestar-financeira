import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/tenant";
import { normalizeEmail } from "@/lib/email";
import { sameOrigin } from "@/lib/advisory-management";
import { withAccessRequest } from "@/lib/access-request-context";
import { newInviteToken } from "@/lib/access-invites";
import { auditContext } from "@/lib/audit";
import { contractualActor, contractualOnboardingState, selfContractualResponsible,
  nominateContractualResponsible, contractualInvitationAction, continueContractualNomination } from "@/lib/contractual-onboarding";
import { invitationDelivery, issueInvitationDelivery, INVITATION_RESPONSE_HEADERS } from "@/lib/invite-delivery";

function failure(error: unknown) {
  const e = error as { status?: number; code?: string; message?: string };
  const status = e.status ?? (["P2002", "P2034"].includes(e.code || "") ? 409 : 500);
  return NextResponse.json({ error: e.status ? e.message : status === 409 ?
    "A situação da empresa mudou. Atualize a página e confira antes de tentar novamente." : "Não foi possível concluir esta etapa." },
    { status, headers: INVITATION_RESPONSE_HEADERS });
}
export async function GET() {
  try {
    const { session } = await requireSession({ allowPendingTerms: true });
    return NextResponse.json(await contractualOnboardingState(session), { headers: INVITATION_RESPONSE_HEADERS });
  } catch (error) { return failure(error); }
}
async function handlePOST(req: NextRequest) {
  try {
    sameOrigin(req);
    const { session } = await requireSession({ allowPendingTerms: true });
    const actor = contractualActor(session);
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => !["action", "nome", "email", "channel"].includes(key))) {
      return NextResponse.json({ error: "Solicitação inválida." }, { status: 400 });
    }
    if (body.action === "self") return NextResponse.json(await selfContractualResponsible(actor), { headers: INVITATION_RESPONSE_HEADERS });
    if (body.action === "continue") return NextResponse.json(await continueContractualNomination(actor), { headers: INVITATION_RESPONSE_HEADERS });
    if (body.action === "revoke") return NextResponse.json(await contractualInvitationAction(actor, "revoke"), { headers: INVITATION_RESPONSE_HEADERS });
    if (body.action !== "other" && body.action !== "resend") return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    const delivery = invitationDelivery(req.nextUrl, body.channel ?? "MANUAL_SHARE");
    const secret = newInviteToken();
    if (body.action === "other") {
      const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
      const name = typeof body.nome === "string" ? body.nome.trim() : "";
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name || name.length > 160) return NextResponse.json({ error: "Informe nome e e-mail válidos." }, { status: 400 });
      const invite = await nominateContractualResponsible(actor, { email, name, tokenHash: secret.tokenHash });
      const sent = await issueInvitationDelivery(delivery, { id: invite.id, tenantId: actor.tenantId,
        to: email, name, role: "OWNER", profileName: invite.profileName, tenantName: invite.tenantName,
        token: secret.token, expiresAt: invite.expiresAt, actor: auditContext(session) });
      return NextResponse.json({ id: invite.id, status: invite.status, expiresAt: invite.expiresAt, ...sent }, { status: 201, headers: INVITATION_RESPONSE_HEADERS });
    }
    const invite = await contractualInvitationAction(actor, "resend", secret.tokenHash);
    if (!("email" in invite) || !invite.email) throw new Error("Reemissão incompleta.");
    const sent = await issueInvitationDelivery(delivery, { id: invite.id, tenantId: actor.tenantId,
      to: invite.email, name: invite.name, role: "OWNER", profileName: invite.profileName, tenantName: invite.tenantName,
      token: secret.token, expiresAt: invite.expiresAt, replacesId: invite.replacesId, actor: auditContext(session) });
    return NextResponse.json({ id: invite.id, status: invite.status, expiresAt: invite.expiresAt, ...sent }, { headers: INVITATION_RESPONSE_HEADERS });
  } catch (error) { return failure(error); }
}
export const POST = withAccessRequest("CONTRACTUAL_ONBOARDING", handlePOST);
