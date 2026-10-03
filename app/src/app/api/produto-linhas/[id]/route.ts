import { NextRequest, NextResponse } from "next/server";
import { requireEscrita } from "@/lib/tenant";
import { productApiError, productError, productText, productTransaction } from "@/lib/product-catalog";

type Context = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: Context) {
  try {
    const { db, session } = await requireEscrita();
    const { id } = await params;
    const input = await req.json();
    const codigo = productText(input.codigo, "Código da Linha", true, 30)!;
    const nome = productText(input.nome, "Nome da Linha", true)!;
    const item = await productTransaction(db, session.tenantId, async tx => {
      const existing = await tx.produtoLinha.findFirst({ where: { id, tenantId: session.tenantId } });
      if (!existing) throw productError("Linha não encontrada neste tenant.", 404);
      if (input.tipoId !== undefined && input.tipoId !== existing.tipoId) throw productError("Tipo da Linha não pode ser alterado.");
      return tx.produtoLinha.update({ where: { id }, data: { codigo, nome } });
    });
    return NextResponse.json(item);
  } catch (error: any) {
    const e = productApiError(error, "Não foi possível atualizar a Linha.");
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
}

export async function DELETE(_req: NextRequest, { params }: Context) {
  try {
    const { db, session } = await requireEscrita();
    const { id } = await params;
    await productTransaction(db, session.tenantId, async tx => {
      const existing = await tx.produtoLinha.findFirst({ where: { id, tenantId: session.tenantId } });
      if (!existing) throw productError("Linha não encontrada neste tenant.", 404);
      const count = await tx.produto.count({ where: { tenantId: session.tenantId, linhaId: id, ativo: true } });
      if (count) throw productError(`Linha possui ${count} Item(ns) ativo(s) vinculado(s).`, 409);
      await tx.produtoLinha.update({ where: { id }, data: { ativo: false } });
    });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    const e = productApiError(error, "Não foi possível desativar a Linha.");
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
}
