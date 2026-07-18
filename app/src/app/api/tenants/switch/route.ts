import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { cookies } from "next/headers";

// POST /api/tenants/switch — trocar tenant ativo (admin_global apenas)
export async function POST(req: NextRequest) {
  const session = await auth();
  const user = session?.user as any;
  if (!user || user.papel !== "admin_global") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const { tenantId } = await req.json();
  const cookieStore = await cookies();

  if (!tenantId || tenantId === user.tenantId) {
    // Voltar ao tenant original
    cookieStore.delete("tenant_override");
    return NextResponse.json({ active: user.tenantId, message: "Voltou ao tenant original" });
  }

  // Setar override
  cookieStore.set("tenant_override", tenantId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 8, // 8 horas
    path: "/",
  });

  return NextResponse.json({ active: tenantId, message: "Tenant alterado" });
}
