import { guardApi } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { requireEscrita } from "@/lib/tenant";
import { productApiError, productError, productText, productTransaction } from "@/lib/product-catalog";

type Context = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: Context) {
  const access = await guardApi("estrutura.portfolio.edit"); if (access) return access;
  try {
    const { db, session } = await requireEscrita();
    const { id } = await params;
    const input = await req.json();
    const nome = productText(input.nome, "Nome do Tipo", true)!;
    const item = await productTransaction(db, session.tenantId, async tx => {
      const existing = await tx.produtoTipo.findFirst({ where: { id, tenantId: session.tenantId } });
      if (!existing) throw productError("Tipo não encontrado neste tenant.", 404);
      if (!existing.ativo) throw productError("Tipo inativo não pode ser editado.", 409);
      if (input.codigo !== undefined && input.codigo !== existing.codigo) throw productError("Código do Tipo é imutável.");
      if (input.grupoId !== undefined && input.grupoId !== existing.grupoId) throw productError("Grupo do Tipo não pode ser alterado.");
      if (existing.grupoId) {
        const group = await tx.produtoGrupo.findFirst({ where: { id: existing.grupoId, tenantId: session.tenantId, ativo: true } });
        if (!group) throw productError("Grupo do Tipo está inativo ou indisponível.");
      }
      return tx.produtoTipo.update({ where: { id }, data: { nome } });
    });
    return NextResponse.json(item);
  } catch (error: any) {
    const e = productApiError(error, "Não foi possível atualizar o Tipo.");
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
}

export async function PATCH(_req: NextRequest, { params }: Context) {
  const access = await guardApi("estrutura.portfolio.edit"); if (access) return access;
  try {
    const { db, session } = await requireEscrita();
    const { id } = await params;
    const item = await productTransaction(db, session.tenantId, async tx => {
      const existing = await tx.produtoTipo.findFirst({ where: { id, tenantId: session.tenantId } });
      if (!existing) throw productError("Tipo não encontrado neste tenant.", 404);
      const group = await tx.produtoGrupo.findFirst({ where: { id: existing.grupoId, tenantId: session.tenantId, ativo: true } });
      if (!group) throw productError("Reative o Grupo antes de reativar este Tipo.", 409);
      return tx.produtoTipo.update({ where: { id }, data: { ativo: true } });
    });
    return NextResponse.json(item);
  } catch (error: any) {
    const e = productApiError(error, "Não foi possível reativar o Tipo.");
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
}

export async function DELETE(req: NextRequest, { params }: Context) {
  const access = await guardApi("estrutura.portfolio.delete"); if (access) return access;
  try {
    const { db, session } = await requireEscrita();
    const { id } = await params;
    const permanent = req.nextUrl.searchParams.get("permanent") === "true";
    const confirmation = permanent ? (await req.json().catch(() => null))?.confirmCode : null;
    await productTransaction(db, session.tenantId, async tx => {
      const existing = await tx.produtoTipo.findFirst({ where: { id, tenantId: session.tenantId } });
      if (!existing) throw productError("Tipo não encontrado neste tenant.", 404);
      if (permanent && confirmation !== existing.codigo) throw productError("Confirme o código exato do Tipo para excluir definitivamente.");
      const [lines, items] = await Promise.all([
        tx.produtoLinha.count({ where: { tenantId: session.tenantId, tipoId: id, ...(permanent ? {} : { ativo: true }) } }),
        tx.produto.count({ where: { tenantId: session.tenantId, tipoId: id, ...(permanent ? {} : { ativo: true }) } }),
      ]);
      if (lines || items) throw productError(`Tipo possui ${lines} Linha(s) e ${items} Item(ns) ${permanent ? "vinculado(s), inclusive inativos" : "ativo(s) vinculado(s)"}.`, 409);
      if (permanent) await tx.produtoTipo.delete({ where: { id } });
      else await tx.produtoTipo.update({ where: { id }, data: { ativo: false } });
    });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    if (error?.code === "P2003" || error?.code === "P2014") return NextResponse.json({ error: "Tipo possui outra dependência e não pode ser excluído." }, { status: 409 });
    const e = productApiError(error, "Não foi possível excluir ou desativar o Tipo.");
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
}
