import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/tenant";
import { offboardSupportOperator } from "@/lib/support-operators";
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requirePlatformAdmin(); if (!actor.identityId) return NextResponse.json({ error: "Modo de identidade necessário." }, { status: 403 });
    const body = await request.json(), ids = body?.devMembershipIds ?? [];
    if (body?.action !== "deactivate" || typeof body.reason !== "string" || body.reason.trim().length < 15 || body.reason.length > 500 ||
        !Array.isArray(ids) || ids.length > 50 || ids.some(i => typeof i !== "string" || !i) || new Set(ids).size !== ids.length) {
      return NextResponse.json({ error: "Informe desativação, motivo específico e vínculos DEV explícitos, se houver." }, { status: 400 });
    }
    return NextResponse.json(await offboardSupportOperator(actor.identityId, (await params).id, body.reason.trim(), ids));
  } catch (e: any) { return NextResponse.json({ error: e.status ? e.message : "Offboarding não confirmado. Atualize antes de repetir." }, { status: e.status ?? (e.code === "P2034" ? 409 : 500) }); }
}
