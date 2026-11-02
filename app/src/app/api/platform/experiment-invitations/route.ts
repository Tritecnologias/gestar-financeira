import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { experimentStatus } from "@/lib/experiment-policy";
import { issueAuthorizedSpecialInvitation } from "@/lib/admissions";
import { EXPERIMENT_HEADERS, experimentAdmin, experimentBody, experimentError, experimentSameOrigin } from "@/lib/experiment-invitations";

export async function GET() {
  try {
    await experimentAdmin();
    const rows = await prisma.experimentInvitation.findMany({ orderBy: { createdAt: "desc" }, take: 100,
      select: { id: true, recipientName: true, createdAt: true, expiresAt: true, revokedAt: true, viewedAt: true, acknowledgedAt: true, interestAt: true,
        admission: { select: { id: true, authorizedEmail: true, status: true, emailVerifiedAt: true } } } });
    const recoverable = new Set((await prisma.experimentInvitation.findMany({ where: { id: { in: rows.map(row => row.id) }, encryptedToken: { not: null } }, select: { id: true } })).map(row => row.id));
    return NextResponse.json(rows.map(row => ({ ...row, status: experimentStatus(row), linkRecoverable: recoverable.has(row.id), canCopyLink: recoverable.has(row.id) && experimentStatus(row) === "ACTIVE" })), { headers: EXPERIMENT_HEADERS });
  } catch (error) { const e = experimentError(error); return NextResponse.json({ error: e.message }, { status: e.status, headers: EXPERIMENT_HEADERS }); }
}
export async function POST(req: Request) {
  try {
    const actor = await experimentAdmin(); experimentSameOrigin(req);
    const body = await experimentBody(req);
    const row = await issueAuthorizedSpecialInvitation(actor.identityId, body);
    return NextResponse.json(row, { status: row.created ? 201 : 200, headers: EXPERIMENT_HEADERS });
  } catch (error) { const e = experimentError(error); return NextResponse.json({ error: e.message }, { status: e.status, headers: EXPERIMENT_HEADERS }); }
}
