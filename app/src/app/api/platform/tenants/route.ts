import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/tenant";
import { prisma } from "@/lib/db";

/** Catálogo administrativo; nunca concede acesso operacional ao tenant. */
export async function GET() {
  try { await requirePlatformAdmin(); }
  catch (error) { return NextResponse.json({ error: "Acesso negado" }, { status: (error as {status?: number}).status ?? 403 }); }
  const tenants = await prisma.tenant.findMany({
    select: { id: true, nome: true, slug: true, email: true, plano: true },
    orderBy: { nome: "asc" },
  });
  return NextResponse.json(tenants);
}
