import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/tenant";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let db: any;
  try { ({ db } = await requireSession()); } catch { return NextResponse.json({ error: "Não autorizado" }, { status: 401 }); }
  const { id } = await params;
  const { codigo, nome, tipo } = await req.json();
  if (!nome?.trim()) return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
  try {
    const item = await db.categoria.update({ where: { id }, data: { codigo: codigo?.trim(), nome: nome.trim(), tipo: tipo || null } });
    return NextResponse.json(item);
  } catch (e: any) {
    if (e.code === "P2002") return NextResponse.json({ error: "Código já cadastrado" }, { status: 409 });
    if (e.code === "P2025") return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    throw e;
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let db: any;
  try { ({ db } = await requireSession()); } catch { return NextResponse.json({ error: "Não autorizado" }, { status: 401 }); }
  const { id } = await params;
  try {
    await db.$transaction(async (tx: any) => {
      const linked = await tx.planoContas.count({ where: { categoriaId: id, ativo: true } });
      if (linked) throw Object.assign(new Error(`Esta Categoria possui ${linked} ${linked === 1 ? "Conta ativa vinculada" : "Contas ativas vinculadas"}. Mova ou desative antes de desativar a Categoria.`), { status: 409 });
      await tx.categoria.update({ where: { id }, data: { ativo: false } });
    }, { isolationLevel: "Serializable" });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e.status) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e.code === "P2034") return NextResponse.json({ error: "Cadastro alterado simultaneamente. Tente novamente." }, { status: 409 });
    if (e.code === "P2025") return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    throw e;
  }
}
