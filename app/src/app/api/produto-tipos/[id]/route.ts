import { NextRequest, NextResponse } from "next/server";
import { requireEscrita } from "@/lib/tenant";
import { productApiError, productError, productText, productTransaction } from "@/lib/product-catalog";

type Context = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: Context) {
  try {
    const { db, session } = await requireEscrita();
    const { id } = await params;
    const input = await req.json();
    const codigo = productText(input.codigo, "Código do Tipo", true, 30)!;
    const nome = productText(input.nome, "Nome do Tipo", true)!;
    const item = await productTransaction(db, session.tenantId, async tx => {
      const existing = await tx.produtoTipo.findFirst({ where: { id, tenantId: session.tenantId } });
      if (!existing) throw productError("Tipo não encontrado neste tenant.", 404);
      if (input.grupoId !== undefined && input.grupoId !== existing.grupoId) throw productError("Grupo do Tipo não pode ser alterado.");
      if (existing.grupoId) {
        const group = await tx.produtoGrupo.findFirst({ where: { id: existing.grupoId, tenantId: session.tenantId, ativo: true } });
        if (!group) throw productError("Grupo do Tipo está inativo ou indisponível.");
      }
      return tx.produtoTipo.update({ where: { id }, data: { codigo, nome } });
    });
    return NextResponse.json(item);
  } catch (error: any) {
    const e = productApiError(error, "Não foi possível atualizar o Tipo.");
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
}

export async function DELETE(_req: NextRequest, { params }: Context) {
  try {
    const { db, session } = await requireEscrita();
    const { id } = await params;
    await productTransaction(db, session.tenantId, async tx => {
      const existing = await tx.produtoTipo.findFirst({ where: { id, tenantId: session.tenantId } });
      if (!existing) throw productError("Tipo não encontrado neste tenant.", 404);
      const [lines, items] = await Promise.all([
        tx.produtoLinha.count({ where: { tenantId: session.tenantId, tipoId: id, ativo: true } }),
        tx.produto.count({ where: { tenantId: session.tenantId, tipoId: id, ativo: true } }),
      ]);
      if (lines || items) throw productError(`Tipo possui ${lines} Linha(s) ativa(s) e ${items} Item(ns) ativo(s) vinculado(s).`, 409);
      await tx.produtoTipo.update({ where: { id }, data: { ativo: false } });
    });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    const e = productApiError(error, "Não foi possível desativar o Tipo.");
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
}
