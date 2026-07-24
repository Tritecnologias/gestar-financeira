import { NextRequest, NextResponse } from "next/server";
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

// POST /api/tenants — criar novo tenant (apenas admin_global)
export async function POST(req: NextRequest) {
  let session: any;
  try { ({ session } = await requireSession()); } catch { return NextResponse.json({ error: "Não autorizado" }, { status: 401 }); }

  if (session.papel !== "admin_global") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const { nome, email, plano } = await req.json();
  if (!nome?.trim() || !email?.trim()) return NextResponse.json({ error: "Nome e email são obrigatórios" }, { status: 400 });

  // Gerar slug a partir do nome
  const slug = nome.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  // Verificar unicidade
  const existente = await prisma.tenant.findFirst({ where: { OR: [{ slug }, { email: email.trim() }] } });
  if (existente) return NextResponse.json({ error: "Nome ou email já cadastrado" }, { status: 409 });

  const tenant = await prisma.tenant.create({
    data: { nome: nome.trim(), slug, email: email.trim().toLowerCase(), plano: plano || "trial" },
    select: { id: true, nome: true, slug: true, email: true, plano: true },
  });

  return NextResponse.json(tenant, { status: 201 });
}
