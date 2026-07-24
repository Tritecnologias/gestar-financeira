import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";

// GET /api/usuarios — lista usuários (admin: do próprio tenant, admin_global: todos)
export async function GET() {
  let session: any;
  try { ({ session } = await requireSession()); } catch { return NextResponse.json({ error: "Não autorizado" }, { status: 401 }); }

  if (session.papel !== "admin" && session.papel !== "admin_global") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const where = session.papel === "admin_global" ? {} : { tenantId: session.tenantId };
  const usuarios = await prisma.usuario.findMany({
    where,
    select: { id: true, nome: true, email: true, papel: true, ativo: true, criadoEm: true, tenantId: true, tenant: { select: { nome: true } } },
    orderBy: [{ criadoEm: "desc" }],
  });

  return NextResponse.json(usuarios);
}

// POST /api/usuarios — criar novo usuário
export async function POST(req: NextRequest) {
  let session: any;
  try { ({ session } = await requireSession()); } catch { return NextResponse.json({ error: "Não autorizado" }, { status: 401 }); }

  if (session.papel !== "admin" && session.papel !== "admin_global") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const { nome, email, senha, papel, tenantId: targetTenantId } = await req.json();

  if (!nome?.trim() || !email?.trim() || !senha?.trim()) {
    return NextResponse.json({ error: "Nome, email e senha são obrigatórios" }, { status: 400 });
  }

  if (senha.length < 6) {
    return NextResponse.json({ error: "Senha deve ter pelo menos 6 caracteres" }, { status: 400 });
  }

  // Admin global pode criar em qualquer tenant; admin só no próprio
  const tenantIdFinal = (session.papel === "admin_global" && targetTenantId) ? targetTenantId : session.tenantId;

  // Verificar se email já existe no tenant
  const existente = await prisma.usuario.findFirst({ where: { email: email.trim(), tenantId: tenantIdFinal } });
  if (existente) return NextResponse.json({ error: "Email já cadastrado neste tenant" }, { status: 409 });

  // Apenas admin_global pode criar outro admin_global
  const papelFinal = (papel === "admin_global" && session.papel !== "admin_global") ? "admin" : (papel || "membro");

  const senhaHash = await bcrypt.hash(senha, 12);

  const usuario = await prisma.usuario.create({
    data: {
      tenantId: tenantIdFinal,
      nome: nome.trim(),
      email: email.trim().toLowerCase(),
      senhaHash,
      papel: papelFinal,
    },
    select: { id: true, nome: true, email: true, papel: true, ativo: true, criadoEm: true },
  });

  return NextResponse.json(usuario, { status: 201 });
}
