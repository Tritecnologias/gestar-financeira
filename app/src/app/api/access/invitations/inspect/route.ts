import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { expireInvite, hashInviteToken, INVITE_UNAVAILABLE, validInviteToken } from "@/lib/access-invites";

export async function POST(req: NextRequest) {
  const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
  try {
    const { token } = await req.json();
    if (!validInviteToken(token)) return NextResponse.json({ error: INVITE_UNAVAILABLE }, { status: 404, headers });
    const invite = await prisma.accessInvite.findUnique({ where: { tokenHash: hashInviteToken(token) },
      select: { id: true, tenantId: true, email: true, status: true, expiresAt: true,
        tenant: { select: { nome: true, ativo: true } }, profile: { select: { ativo: true } } } });
    if (invite?.status === "PENDING" && invite.expiresAt <= new Date()) await expireInvite(invite.id, invite.tenantId);
    if (invite && (invite.status === "EXPIRED" || invite.expiresAt <= new Date())) {
      return NextResponse.json({ error: "Este convite expirou. Solicite um novo link ao administrador." }, { status: 410, headers });
    }
    if (invite?.status === "REVOKED" || invite?.status === "ACCEPTED") {
      return NextResponse.json({ error: "Este convite não está mais disponível." }, { status: 410, headers });
    }
    if (!invite || invite.status !== "PENDING" || !invite.tenant.ativo || !invite.profile.ativo) {
      return NextResponse.json({ error: INVITE_UNAVAILABLE }, { status: 404, headers });
    }
    const identity = await prisma.authIdentity.findUnique({ where: { email: invite.email },
      select: { id: true, status: true } });
    if (identity?.status === "INACTIVE") return NextResponse.json({ error: INVITE_UNAVAILABLE }, { status: 404, headers });
    const current = (await auth())?.user as { id?: string; authMode?: string } | undefined;
    return NextResponse.json({ tenantNome: invite.tenant.nome, expiresAt: invite.expiresAt,
      mode: identity ? "existing" : "new", canAccept: !!identity &&
        current?.authMode === "identity" && current.id === identity.id }, { headers });
  } catch {
    return NextResponse.json({ error: INVITE_UNAVAILABLE }, { status: 404, headers });
  }
}
