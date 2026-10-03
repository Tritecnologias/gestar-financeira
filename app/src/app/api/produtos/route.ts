import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireEscrita } from "@/lib/tenant";
import { nextProductCode, productApiError, productText, productTransaction, validateProductClassification } from "@/lib/product-catalog";

const relations = { grupoRef: { select: { id: true, codigo: true, nome: true, ativo: true } }, tipoRef: { select: { id: true, codigo: true, nome: true, grupoId: true, ativo: true } }, linhaRef: { select: { id: true, codigo: true, nome: true, tipoId: true, ativo: true } } };

export async function GET() {
  try {
    const { db } = await requireSession();
    return NextResponse.json(await db.produto.findMany({ orderBy: { codigo: "asc" }, include: relations }));
  } catch (error: any) {
    const e = productApiError(error, "Não foi possível carregar os itens.");
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { db, session } = await requireEscrita();
    const input = await req.json();
    const nome = productText(input.nome, "Nome", true)!;
    const grupoId = productText(input.grupoId, "Grupo", true, 80)!;
    const tipoId = productText(input.tipoId, "Tipo", true, 80)!;
    const linhaId = productText(input.linhaId, "Linha", false, 80);
    const descricao = productText(input.descricao, "Descrição", false, 5000);
    const observacoes = productText(input.observacoes, "Observações", false, 5000);
    const unidade = productText(input.unidade, "Unidade", false, 30);
    const item = await productTransaction(db, session.tenantId, async tx => {
      await validateProductClassification(tx, session.tenantId, grupoId, tipoId, linhaId);
      const codigo = await nextProductCode(tx, session.tenantId);
      return tx.produto.create({ data: { codigo, nome, grupoId, tipoId, linhaId, descricao, observacoes, unidade }, include: relations });
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error: any) {
    const e = productApiError(error, "Não foi possível criar o item.");
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
}
