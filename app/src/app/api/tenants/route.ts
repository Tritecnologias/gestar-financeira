import { NextResponse } from "next/server";
import { requireSession } from "@/lib/tenant";
import { prisma } from "@/lib/db";

// GET /api/tenants — lista todos os tenants (apenas admin_global)
export async function GET() {
  let session: any;
  try { ({ session } = await requireSession()); } catch { return NextResponse.json({ error: "Não autorizado" }, { status: 401 }); }

  if (session.papel !== "admin_global") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const tenants = await prisma.tenant.findMany({
    where: { ativo: true },
    select: { id: true, nome: true, slug: true, email: true, plano: true },
    orderBy: [{ nome: "asc" }],
  });

  return NextResponse.json(tenants);
}
