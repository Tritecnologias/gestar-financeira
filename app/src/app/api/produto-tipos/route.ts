import { NextRequest, NextResponse } from "next/server";
import { requireEscrita, requireSession } from "@/lib/tenant";
import { productApiError, productError, productText, productTransaction, reserveProductCode } from "@/lib/product-catalog";

export async function GET() {
  try {
    const { db } = await requireSession();
    return NextResponse.json(await db.produtoTipo.findMany({ orderBy: [{ codigo: "asc" }] }));
  } catch (error: any) {
    const e = productApiError(error, "Não foi possível carregar os Tipos.");
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { db, session } = await requireEscrita();
    const input = await req.json();
    const grupoId = productText(input.grupoId, "Grupo", true, 80)!;
    if (input.codigo) throw productError("Código do Tipo é gerado automaticamente.");
    const nome = productText(input.nome, "Nome do Tipo", true)!;
    const item = await productTransaction(db, session.tenantId, async tx => {
      const group = await tx.produtoGrupo.findFirst({ where: { id: grupoId, tenantId: session.tenantId, ativo: true } });
      if (!group) throw productError("Grupo inexistente, inativo ou de outro tenant.");
      const codigo = await reserveProductCode(tx, session.tenantId, "tipo", group);
      return tx.produtoTipo.create({ data: { grupoId, codigo, nome } });
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error: any) {
    const e = productApiError(error, "Não foi possível criar o Tipo.");
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
}
