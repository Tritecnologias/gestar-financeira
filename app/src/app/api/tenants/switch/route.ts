import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// POST /api/tenants/switch — trocar tenant ativo (admin_global apenas)
export async function POST(req: NextRequest) {
  const session = await auth();
  const user = session?.user as any;
  if (!user || user.papel !== "admin_global") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const { tenantId } = await req.json();

  if (!tenantId || tenantId === user.tenantId) {
    // Voltar ao tenant original — deletar cookie
    const res = NextResponse.json({ active: user.tenantId, message: "Voltou ao tenant original" });
    res.cookies.set("tenant_override", "", { maxAge: 0, path: "/" });
    return res;
  }

  // Setar override via Set-Cookie header
  const res = NextResponse.json({ active: tenantId, message: "Tenant alterado" });
  res.cookies.set("tenant_override", tenantId, {
    httpOnly: true,
    secure: false, // HTTP em dev
    sameSite: "lax",
    maxAge: 60 * 60 * 8,
    path: "/",
  });
  return res;
}
