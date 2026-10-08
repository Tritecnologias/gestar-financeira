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
    const nome = productText(input.nome, "Nome da Linha", true)!;
    const item = await productTransaction(db, session.tenantId, async tx => {
      const existing = await tx.produtoLinha.findFirst({ where: { id, tenantId: session.tenantId } });
      if (!existing) throw productError("Linha não encontrada neste tenant.", 404);
      if (!existing.ativo) throw productError("Linha inativa não pode ser editada.", 409);
      if (input.codigo !== undefined && input.codigo !== existing.codigo) throw productError("Código da Linha é imutável.");
      if (input.tipoId !== undefined && input.tipoId !== existing.tipoId) throw productError("Tipo da Linha não pode ser alterado.");
      return tx.produtoLinha.update({ where: { id }, data: { nome } });
    });
    return NextResponse.json(item);
  } catch (error: any) {
    const e = productApiError(error, "Não foi possível atualizar a Linha.");
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
}

export async function PATCH(_req: NextRequest, { params }: Context) {
  const access = await guardApi("estrutura.portfolio.edit"); if (access) return access;
  try {
    const { db, session } = await requireEscrita();
    const { id } = await params;
    const item = await productTransaction(db, session.tenantId, async tx => {
      const existing = await tx.produtoLinha.findFirst({ where: { id, tenantId: session.tenantId } });
      if (!existing) throw productError("Linha não encontrada neste tenant.", 404);
      const type = await tx.produtoTipo.findFirst({ where: { id: existing.tipoId, tenantId: session.tenantId, ativo: true } });
      if (!type) throw productError("Reative o Tipo antes de reativar esta Linha.", 409);
      const group = await tx.produtoGrupo.findFirst({ where: { id: type.grupoId, tenantId: session.tenantId, ativo: true } });
      if (!group) throw productError("Reative o Grupo antes de reativar esta Linha.", 409);
      return tx.produtoLinha.update({ where: { id }, data: { ativo: true } });
    });
    return NextResponse.json(item);
  } catch (error: any) {
    const e = productApiError(error, "Não foi possível reativar a Linha.");
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
      const existing = await tx.produtoLinha.findFirst({ where: { id, tenantId: session.tenantId } });
      if (!existing) throw productError("Linha não encontrada neste tenant.", 404);
      if (permanent && confirmation !== existing.codigo) throw productError("Confirme o código exato da Linha para excluir definitivamente.");
      const count = await tx.produto.count({ where: { tenantId: session.tenantId, linhaId: id, ...(permanent ? {} : { ativo: true }) } });
      if (count) throw productError(`Linha possui ${count} Item(ns) ${permanent ? "vinculado(s), inclusive inativos" : "ativo(s) vinculado(s)"}.`, 409);
      if (permanent) await tx.produtoLinha.delete({ where: { id } });
      else await tx.produtoLinha.update({ where: { id }, data: { ativo: false } });
    });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    if (error?.code === "P2003" || error?.code === "P2014") return NextResponse.json({ error: "Linha possui outra dependência e não pode ser excluída." }, { status: 409 });
    const e = productApiError(error, "Não foi possível excluir ou desativar a Linha.");
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
}
