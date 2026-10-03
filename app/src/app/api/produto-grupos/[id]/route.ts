import { NextRequest, NextResponse } from "next/server";
import { requireEscrita } from "@/lib/tenant";
import { productApiError, productError, productText, productTransaction } from "@/lib/product-catalog";

type Context = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: Context) {
  try {
    const { db, session } = await requireEscrita();
    const { id } = await params;
    const input = await req.json();
    const nome = productText(input.nome, "Nome do Grupo", true)!;
    const item = await productTransaction(db, session.tenantId, async tx => {
      const existing = await tx.produtoGrupo.findFirst({ where: { id, tenantId: session.tenantId } });
      if (!existing) throw productError("Grupo não encontrado neste tenant.", 404);
      if (!existing.ativo) throw productError("Grupo inativo não pode ser editado.", 409);
      if (input.codigo !== undefined && input.codigo !== existing.codigo) throw productError("Código do Grupo é imutável.");
      return tx.produtoGrupo.update({ where: { id }, data: { nome } });
    });
    return NextResponse.json(item);
  } catch (error: any) {
    const e = productApiError(error, "Não foi possível atualizar o Grupo.");
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
}

export async function DELETE(_req: NextRequest, { params }: Context) {
  try {
    const { db, session } = await requireEscrita();
    const { id } = await params;
    await productTransaction(db, session.tenantId, async tx => {
      const existing = await tx.produtoGrupo.findFirst({ where: { id, tenantId: session.tenantId } });
      if (!existing) throw productError("Grupo não encontrado neste tenant.", 404);
      const [types, items] = await Promise.all([
        tx.produtoTipo.count({ where: { tenantId: session.tenantId, grupoId: id, ativo: true } }),
        tx.produto.count({ where: { tenantId: session.tenantId, grupoId: id, ativo: true } }),
      ]);
      if (types || items) throw productError(`Grupo possui ${types} Tipo(s) ativo(s) e ${items} Item(ns) ativo(s) vinculado(s).`, 409);
      await tx.produtoGrupo.update({ where: { id }, data: { ativo: false } });
    });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    const e = productApiError(error, "Não foi possível desativar o Grupo.");
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
}
