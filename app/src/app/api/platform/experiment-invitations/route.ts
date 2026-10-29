import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { sealExperimentToken } from "@/lib/experiment-link-crypto";
import { prisma } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { experimentInput, experimentStatus } from "@/lib/experiment-policy";
import { EXPERIMENT_HEADERS, experimentAdmin, experimentBody, experimentError, experimentHash, experimentSameOrigin, experimentToken } from "@/lib/experiment-invitations";

export async function GET() {
  try {
    await experimentAdmin();
    const rows = await prisma.experimentInvitation.findMany({ orderBy: { createdAt: "desc" }, take: 100,
      select: { id: true, recipientName: true, createdAt: true, expiresAt: true, revokedAt: true, viewedAt: true, acknowledgedAt: true, interestAt: true } });
    const recoverable = new Set((await prisma.experimentInvitation.findMany({ where: { id: { in: rows.map(row => row.id) }, encryptedToken: { not: null } }, select: { id: true } })).map(row => row.id));
    return NextResponse.json(rows.map(row => ({ ...row, status: experimentStatus(row), linkRecoverable: recoverable.has(row.id), canCopyLink: recoverable.has(row.id) && experimentStatus(row) === "ACTIVE" })), { headers: EXPERIMENT_HEADERS });
  } catch (error) { const e = experimentError(error); return NextResponse.json({ error: e.message }, { status: e.status, headers: EXPERIMENT_HEADERS }); }
}
export async function POST(req: Request) {
  try {
    const actor = await experimentAdmin(); experimentSameOrigin(req);
    const body = await experimentBody(req);
    let input: ReturnType<typeof experimentInput>;
    try { input = experimentInput(body); } catch (e) { throw Object.assign(e as Error, { status: 400 }); }
    const token = experimentToken(), id = randomUUID(), tokenHash = experimentHash(token);
    const encryptedToken = sealExperimentToken(token, id, tokenHash);
    const row = await prisma.$transaction(async tx => {
      // Revalidate capability under lock; a revoked admin cannot issue with an old session.
      const active = await tx.$queryRaw<{ id: string }[]>`SELECT a.id FROM platform_admins a JOIN auth_identities i ON i.id=a.identity_id WHERE a.identity_id=${actor.identityId} AND a.status='ACTIVE' AND i.status='ACTIVE' FOR SHARE OF i`;
      if (!active.length) throw Object.assign(new Error("Acesso negado."), { status: 403 });
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`experiment-create:${actor.identityId}`},0))`;
      if (await tx.experimentInvitation.count({ where: { createdByIdentityId: actor.identityId, createdAt: { gte: new Date(Date.now() - 900000) } } }) >= 20) throw Object.assign(new Error("Limite de convites atingido. Aguarde 15 minutos."), { status: 429 });
      const created = await tx.experimentInvitation.create({ data: { id, recipientName: input.recipientName, tokenHash, encryptedToken, createdByIdentityId: actor.identityId, expiresAt: new Date(Date.now() + input.hours * 3600000) }, select: { id: true, expiresAt: true } });
      await writeAudit(tx, { actorIdentityId: actor.identityId, accessMode: "PLATFORM_ADMIN", action: "EXPERIMENT_INVITATION_CREATED", resourceType: "ExperimentInvitation", resourceId: created.id });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json(row, { status: 201, headers: EXPERIMENT_HEADERS });
  } catch (error) { const e = experimentError(error); return NextResponse.json({ error: e.message }, { status: e.status, headers: EXPERIMENT_HEADERS }); }
}
