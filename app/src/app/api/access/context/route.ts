import { NextResponse } from "next/server";
import { requireSession } from "@/lib/tenant";

/** Contexto efetivo revalidado; o JWT contém apenas identidade e modo. */
export async function GET() {
  try {
    const { session } = await requireSession();
    return NextResponse.json({
      authMode: session.authMode,
      identityId: session.identityId ?? null,
      tenantId: session.tenantId,
      membershipId: session.membershipId ?? null,
      role: session.membershipRole ?? session.papel,
      platformAdmin: session.platformAdmin ?? false,
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message },
      { status: (error as {status?: number}).status ?? 401 });
  }
}
