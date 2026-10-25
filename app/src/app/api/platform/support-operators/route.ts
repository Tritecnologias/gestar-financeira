import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/tenant";
import { setSupportOperator } from "@/lib/support-operators";
export async function GET() {
  try {
    const actor = await requirePlatformAdmin(); if (!actor.identityId) return NextResponse.json({ error: "Modo de identidade necessário." }, { status: 403 });
    return NextResponse.json(await prisma.supportOperator.findMany({ select: { id: true, identityId: true, status: true,
      identity: { select: { nome: true, email: true, status: true } } }, orderBy: { createdAt: "desc" } }), { headers: { "Cache-Control": "no-store" } });
  } catch (e: any) { return NextResponse.json({ error: e.status ? e.message : "Falha ao consultar operadores." }, { status: e.status ?? 500 }); }
}
export async function POST(request: Request) {
  try {
    const actor = await requirePlatformAdmin(); if (!actor.identityId) return NextResponse.json({ error: "Modo de identidade necessário." }, { status: 403 });
    const body = await request.json();
    if (typeof body?.identityId !== "string" || !body.identityId) return NextResponse.json({ error: "Informe a identidade explicitamente." }, { status: 400 });
    const result = await setSupportOperator(actor.identityId, body.identityId);
    return NextResponse.json({ id: result.id, identityId: result.identityId, status: result.status }, { status: 201 });
  } catch (e: any) { return NextResponse.json({ error: e.status ? e.message : "Falha ao conceder capacidade técnica." }, { status: e.status ?? (e.code === "P2034" ? 409 : 500) }); }
}
