import { guardApi } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/tenant";
import { FINANCIAL_ACCOUNT_TYPES } from "@/lib/financial-account-types";
import { validNewAccountCode } from "@/lib/financial-codes";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await guardApi("estrutura.financeiras.edit"); if (access) return access;
  let db: any;
  try { ({ db } = await requireSession()); } catch { return NextResponse.json({ error: "Não autorizado" }, { status: 401 }); }
  const { id } = await params;
  const { codigo, descricao, tipo, paiId, categoriaId } = await req.json();
  if (typeof descricao !== "string" || !descricao.trim()) return NextResponse.json({ error: "Descrição é obrigatória" }, { status: 400 });
  if (!FINANCIAL_ACCOUNT_TYPES.includes(tipo)) return NextResponse.json({ error: "Tipo da Conta inválido" }, { status: 400 });
  if (typeof categoriaId !== "string" || !categoriaId) return NextResponse.json({ error: "Categoria é obrigatória; classifique esta Conta antes de salvar" }, { status: 400 });
  try {
    const item = await db.$transaction(async (tx: any) => {
      const categoria = await tx.categoria.findFirst({ where: { id: categoriaId, ativo: true }, select: { id: true, codigo: true } });
      if (!categoria) throw Object.assign(new Error("Categoria inexistente, inativa ou de outro tenant"), { status: 400 });
      const current = await tx.planoContas.findFirst({ where: { id, ativo: true }, select: { codigo: true, categoriaId: true } });
      if (!current) throw Object.assign(new Error("Conta não encontrada"), { status: 404 });
      if (codigo !== undefined && codigo !== current.codigo) throw Object.assign(new Error("Código da Conta é imutável."), { status: 409 });
      if (current.categoriaId !== categoriaId && current.codigo && validNewAccountCode(current.codigo, categoria.codigo) === false && /^.+\.\d{2,}$/.test(current.codigo)) {
        throw Object.assign(new Error("Conta com código estrutural não pode mudar de Categoria por edição comum."), { status: 409 });
      }
      return tx.planoContas.update({ where: { id }, data: { descricao: descricao.trim(), tipo, categoriaId, ...(paiId !== undefined ? { paiId: paiId || null } : {}) } });
    }, { isolationLevel: "Serializable" });
    return NextResponse.json(item);
  } catch (e: any) {
    if (e.status) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e.code === "P2034") return NextResponse.json({ error: "Cadastro alterado simultaneamente. Tente novamente." }, { status: 409 });
    if (e.code === "P2025") return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    throw e;
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await guardApi("estrutura.financeiras.delete"); if (access) return access;
  let db: any;
  try { ({ db } = await requireSession()); } catch { return NextResponse.json({ error: "Não autorizado" }, { status: 401 }); }
  const { id } = await params;
  try {
    await db.planoContas.update({ where: { id }, data: { ativo: false } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e.code === "P2025") return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    throw e;
  }
}
