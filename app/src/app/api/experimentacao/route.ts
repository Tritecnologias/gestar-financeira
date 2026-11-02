import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createHash } from "node:crypto";
import { trustedClientIp } from "@/lib/trusted-proxy";
import { experimentAbuseBudget } from "@/lib/experiment-abuse-budget";
import { admissionOrigin } from "@/lib/admission-policy";
import { startSpecialAdmission } from "@/lib/admissions";
import { EXPERIMENT_HEADERS, experimentBody, experimentEnabled, experimentError, experimentSameOrigin, validExperiment } from "@/lib/experiment-invitations";

export async function POST(req: Request) {
  try {
    experimentEnabled(); experimentSameOrigin(req);
    const digest = (value: string) => createHash("sha256").update(value).digest("hex");
    const ip = await trustedClientIp(req.headers);
    const limited = () => Object.assign(new Error("Muitas tentativas. Aguarde alguns minutos."), { status: 429 });
    if (!experimentAbuseBudget.request(ip ? digest(ip) : null)) throw limited();
    const body = await experimentBody(req);
    if (!["inspect", "acknowledge", "interest", "startAdmission"].includes(body.action) || Object.keys(body).some(key => !["token", "action"].includes(key))) throw Object.assign(new Error("Ação inválida."), { status: 400 });
    if (typeof body.token === "string" && /^[A-Za-z0-9_-]{43}$/.test(body.token) && !experimentAbuseBudget.token(digest(body.token))) throw limited();
    const row = await validExperiment(body.token);
    if (!row) throw Object.assign(new Error("Convite indisponível, expirado ou revogado."), { status: 404 });
    if (body.action === "startAdmission") return NextResponse.json(await startSpecialAdmission(body.token), { headers: EXPERIMENT_HEADERS });
    const field = body.action === "inspect" ? "viewedAt" : body.action === "acknowledge" ? "acknowledgedAt" : "interestAt";
    // Row lock serializes with revocation. Re-check expiry at the write, never trust the first read.
    const changed = await prisma.$transaction(async tx => {
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM experiment_invitations WHERE id=${row.id} AND revoked_at IS NULL AND expires_at>clock_timestamp() FOR UPDATE`;
      if (!locked.length) return false;
      await tx.experimentInvitation.updateMany({ where: { id: row.id, [field]: null }, data: { [field]: new Date() } });
      return true;
    });
    if (!changed) throw Object.assign(new Error("Convite indisponível, expirado ou revogado."), { status: 404 });
    const admission = admissionOrigin() ? await prisma.admission.findUnique({ where: { experimentInvitationId: row.id }, select: { status: true, expiresAt: true,
      challenges: { where: { purpose: "INVITATION_CREDENTIAL" }, select: { id: true }, take: 1 } } }) : null;
    const canStartAdmission = !!admission?.challenges.length && (admission.status === "PROVISIONED" || admission.status === "AUTHORIZED" && admission.expiresAt > new Date());
    return NextResponse.json({ firstName: row.recipientName.split(/\s+/)[0], acknowledged: !!row.acknowledgedAt || body.action === "acknowledge", interested: !!row.interestAt || body.action === "interest", canStartAdmission,
      ...(body.action === "interest" ? { message: canStartAdmission ? "Interesse registrado. Sua adesão já está autorizada; confirme seu e-mail para continuar. Registrar interesse ainda não libera acesso." : "Interesse registrado. Ricardo poderá acompanhar sua manifestação no painel de Convites Especiais. Aguarde a autorização e as orientações para confirmar seu e-mail e iniciar a adesão. Registrar interesse ainda não libera acesso." } : {}) }, { headers: EXPERIMENT_HEADERS });
  } catch (error) { const e = experimentError(error); return NextResponse.json({ error: e.message }, { status: e.status, headers: { ...EXPERIMENT_HEADERS, ...(e.status === 429 ? { "Retry-After": "300" } : {}) } }); }
}
