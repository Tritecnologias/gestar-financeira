import { NextRequest, NextResponse } from "next/server";
import { requireEscrita } from "@/lib/tenant";
import { productApiError, productError, productPrice, productText, productTransaction, validateProductClassification } from "@/lib/product-catalog";

type Context = { params: Promise<{ id: string }> };
const relations = { grupoRef: true, tipoRef: true, linhaRef: true };

export async function PUT(req: NextRequest, { params }: Context) {
  try {
    const { db, session } = await requireEscrita();
    const { id } = await params;
    const input = await req.json();
    const existing = await db.produto.findFirst({ where: { id, tenantId: session.tenantId } });
    if (!existing) throw productError("Item não encontrado neste tenant.", 404);
    if (input.codigo !== undefined && input.codigo !== existing.codigo) throw productError("O código do Item é imutável.");
    const nome = productText(input.nome, "Nome", true)!;
    const grupoId = productText(input.grupoId === undefined ? existing.grupoId : input.grupoId, "Grupo", true, 80)!;
    const tipoId = productText(input.tipoId === undefined ? existing.tipoId : input.tipoId, "Tipo", true, 80)!;
    const linhaId = input.linhaId === undefined ? existing.linhaId : productText(input.linhaId, "Linha", false, 80);
    if (input.ativo !== undefined && typeof input.ativo !== "boolean") throw productError("Status inválido.");
    const ativo = input.ativo === undefined ? existing.ativo : input.ativo;
    const data = {
      nome, tipo: null, grupoId, tipoId, linhaId, ativo,
      descricao: productText(input.descricao, "Descrição", false, 5000),
      observacoes: productText(input.observacoes, "Observações", false, 5000),
      unidade: productText(input.unidade, "Unidade", false, 30),
      precoVenda: productPrice(input.precoVenda, "Preço de venda"),
      precoCusto: productPrice(input.precoCusto, "Preço de custo"),
    };
    const item = await productTransaction(db, session.tenantId, async tx => {
      await validateProductClassification(tx, session.tenantId, grupoId, tipoId, linhaId);
      return tx.produto.update({ where: { id }, data, include: relations });
    });
    return NextResponse.json(item);
  } catch (error: any) {
    const e = productApiError(error, "Não foi possível atualizar o item.");
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
}

export async function DELETE(req: NextRequest, { params }: Context) {
  try {
    const { db, session } = await requireEscrita();
    const { id } = await params;
    const permanent = req.nextUrl.searchParams.get("permanent") === "true";
    const confirmation = permanent ? (await req.json().catch(() => null))?.confirmCode : null;
    await productTransaction(db, session.tenantId, async tx => {
      const item = await tx.produto.findFirst({ where: { id, tenantId: session.tenantId } });
      if (!item) throw productError("Item não encontrado neste tenant.", 404);
      if (permanent && confirmation !== item.codigo) throw productError("Confirme o código exato do Item para excluir definitivamente.");
      if (permanent) await tx.produto.delete({ where: { id } });
      else await tx.produto.update({ where: { id }, data: { ativo: false } });
    });
    return NextResponse.json({ ok: true });
  } catch (error: any) {
    const e = productApiError(error, "Não foi possível excluir ou desativar o Item.");
    if (error?.code === "P2003" || error?.code === "P2014") return NextResponse.json({ error: "Item possui referência em outro cadastro ou módulo e não pode ser excluído definitivamente." }, { status: 409 });
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
}
