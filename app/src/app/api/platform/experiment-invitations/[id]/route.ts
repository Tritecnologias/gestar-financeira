import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { EXPERIMENT_HEADERS, experimentAdmin, experimentError, experimentSameOrigin } from "@/lib/experiment-invitations";
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await experimentAdmin(); experimentSameOrigin(req);
    const { id } = await params;
    await prisma.$transaction(async tx => {
      const active = await tx.$queryRaw<{ id: string }[]>`SELECT a.id FROM platform_admins a JOIN auth_identities i ON i.id=a.identity_id WHERE a.identity_id=${actor.identityId} AND a.status='ACTIVE' AND i.status='ACTIVE' FOR SHARE OF i`;
      if (!active.length) throw Object.assign(new Error("Acesso negado."), { status: 403 });
      const updated = await tx.experimentInvitation.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } });
      if (!updated.count && !await tx.experimentInvitation.findUnique({ where: { id }, select: { id: true } })) throw Object.assign(new Error("Convite não encontrado."), { status: 404 });
      if (updated.count) await writeAudit(tx, { actorIdentityId: actor.identityId, accessMode: "PLATFORM_ADMIN", action: "EXPERIMENT_INVITATION_REVOKED", resourceType: "ExperimentInvitation", resourceId: id });
    });
    return NextResponse.json({ revoked: true }, { headers: EXPERIMENT_HEADERS });
  } catch (error) { const e = experimentError(error); return NextResponse.json({ error: e.message }, { status: e.status, headers: EXPERIMENT_HEADERS }); }
}
