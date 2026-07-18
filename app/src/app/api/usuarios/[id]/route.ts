import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/tenant";
import { prisma } from "@/lib/db";
import bcrypt from "bcryptjs";

// PUT /api/usuarios/[id] — editar usuário (nome, email, papel, ativo, senha)
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session: any;
  try { ({ session } = await requireSession()); } catch { return NextResponse.json({ error: "Não autorizado" }, { status: 401 }); }

  if (session.papel !== "admin" && session.papel !== "admin_global") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json();
  const { nome, email, papel, ativo, senha } = body;

  // Verificar se o usuário pertence ao tenant (admin normal) ou se é admin_global
  const usuario = await prisma.usuario.findUnique({ where: { id } });
  if (!usuario) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

  if (session.papel !== "admin_global" && usuario.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Sem permissão para este usuário" }, { status: 403 });
  }

  // Apenas admin_global pode promover a admin_global
  const papelFinal = (papel === "admin_global" && session.papel !== "admin_global") ? usuario.papel : papel;

  // Montar dados de atualização
  const data: any = {};
  if (nome !== undefined) data.nome = nome.trim();
  if (email !== undefined) data.email = email.trim().toLowerCase();
  if (papelFinal !== undefined) data.papel = papelFinal;
  if (ativo !== undefined) data.ativo = ativo;
  if (senha && senha.trim().length >= 6) data.senhaHash = await bcrypt.hash(senha, 12);

  try {
    const updated = await prisma.usuario.update({
      where: { id },
      data,
      select: { id: true, nome: true, email: true, papel: true, ativo: true, criadoEm: true },
    });
    return NextResponse.json(updated);
  } catch (e: any) {
    if (e.code === "P2002") return NextResponse.json({ error: "Email já cadastrado" }, { status: 409 });
    throw e;
  }
}

// DELETE /api/usuarios/[id] — excluir usuário
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let session: any;
  try { ({ session } = await requireSession()); } catch { return NextResponse.json({ error: "Não autorizado" }, { status: 401 }); }

  if (session.papel !== "admin" && session.papel !== "admin_global") {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 });
  }

  const { id } = await params;

  // Não pode excluir a si mesmo
  if (id === session.id) return NextResponse.json({ error: "Não é possível excluir seu próprio usuário" }, { status: 400 });

  const usuario = await prisma.usuario.findUnique({ where: { id } });
  if (!usuario) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

  if (session.papel !== "admin_global" && usuario.tenantId !== session.tenantId) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  await prisma.usuario.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
