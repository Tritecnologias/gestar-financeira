import { NextResponse } from "next/server";
import { requireSession } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import { permissionsFor } from "@/lib/permissions";

/** Contexto efetivo revalidado; o JWT contém apenas identidade e modo. */
export async function GET() {
  try {
    const context = await requireSession();
    const { session } = context;
    const [permissions, membership] = await Promise.all([
      permissionsFor(context),
      session.membershipId ? prisma.tenantMembership.findFirst({
        where: { id: session.membershipId, tenantId: session.tenantId },
        select: { profile: { select: { id: true, nome: true } } },
      }) : Promise.resolve(null),
    ]);
    return NextResponse.json({
      authMode: session.authMode,
      identityId: session.identityId ?? null,
      tenantId: session.tenantId,
      membershipId: session.membershipId ?? null,
      role: session.membershipRole ?? session.papel,
      platformAdmin: session.platformAdmin ?? false,
      profile: membership?.profile ?? null,
      permissions: [...permissions],
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message },
      { status: (error as {status?: number}).status ?? 401 });
  }
}
