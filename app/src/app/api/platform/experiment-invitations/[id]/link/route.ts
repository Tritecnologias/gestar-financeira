import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { experimentStatus } from "@/lib/experiment-policy";
import { experimentTokenMatches, openExperimentToken, sealExperimentToken, tokenFromOriginalExperimentLink } from "@/lib/experiment-link-crypto";
import { EXPERIMENT_HEADERS, experimentAdmin, experimentBody, experimentEnabled, experimentError, experimentSameOrigin } from "@/lib/experiment-invitations";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await experimentAdmin(); experimentSameOrigin(req);
    const { id } = await params, body = await experimentBody(req), origin = experimentEnabled();
    if (body.action !== "copy" && body.action !== "bind") throw Object.assign(new Error("Ação inválida."), { status: 400 });
    const result = await prisma.$transaction(async tx => {
      const active = await tx.$queryRaw<{ id: string }[]>`SELECT a.id FROM platform_admins a JOIN auth_identities i ON i.id=a.identity_id WHERE a.identity_id=${actor.identityId} AND a.status='ACTIVE' AND i.status='ACTIVE' FOR SHARE OF i`;
      if (!active.length) throw Object.assign(new Error("Acesso negado."), { status: 403 });
      // Share the row lock with cancellation and check server time inside the transaction.
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM experiment_invitations WHERE id=${id} AND revoked_at IS NULL AND expires_at>clock_timestamp() FOR UPDATE`;
      if (!locked.length) throw Object.assign(new Error("Convite expirado, cancelado ou indisponível."), { status: 410 });
      const row = await tx.experimentInvitation.findUniqueOrThrow({ where: { id } });
      if (experimentStatus(row) !== "ACTIVE") throw Object.assign(new Error("Convite expirado, cancelado ou indisponível."), { status: 410 });
      if (body.action === "bind") {
        const token = tokenFromOriginalExperimentLink(body.link, origin);
        if (!token || !experimentTokenMatches(token, row.tokenHash)) throw Object.assign(new Error("O link original não corresponde ao convite selecionado."), { status: 409 });
        if (!row.encryptedToken) {
          await tx.experimentInvitation.update({ where: { id }, data: { encryptedToken: sealExperimentToken(token, id, row.tokenHash) } });
          await writeAudit(tx, { actorIdentityId: actor.identityId, accessMode: "PLATFORM_ADMIN", action: "EXPERIMENT_ORIGINAL_LINK_BOUND", resourceType: "ExperimentInvitation", resourceId: id });
        }
        return { linked: true };
      }
      if (!row.encryptedToken) throw Object.assign(new Error("Convite anterior sem cópia recuperável. A vinculação do link original é opcional; nenhum novo link foi gerado."), { status: 409 });
      const token = openExperimentToken(row.encryptedToken, id, row.tokenHash);
      await writeAudit(tx, { actorIdentityId: actor.identityId, accessMode: "PLATFORM_ADMIN", action: "EXPERIMENT_LINK_RECOVERED", resourceType: "ExperimentInvitation", resourceId: id });
      return { link: `${origin}/experimentacao#convite=${token}` };
    });
    return NextResponse.json(result, { headers: EXPERIMENT_HEADERS });
  } catch (error) { const e = experimentError(error); return NextResponse.json({ error: e.message }, { status: e.status, headers: EXPERIMENT_HEADERS }); }
}
