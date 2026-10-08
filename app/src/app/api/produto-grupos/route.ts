import { guardApi } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { requireEscrita, requireSession } from "@/lib/tenant";
import { productApiError, productError, productText, productTransaction, reserveProductCode } from "@/lib/product-catalog";

export async function GET() {
  const access = await guardApi("estrutura.portfolio.view"); if (access) return access;
  try {
    const { db } = await requireSession();
    return NextResponse.json(await db.produtoGrupo.findMany({ orderBy: { codigo: "asc" } }));
  } catch (error: any) {
    const e = productApiError(error, "Não foi possível carregar os Grupos.");
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
}

export async function POST(req: NextRequest) {
  const access = await guardApi("estrutura.portfolio.create"); if (access) return access;
  try {
    const { db, session } = await requireEscrita();
    const input = await req.json();
    if (input.codigo) throw productError("Código do Grupo é gerado automaticamente.");
    const nome = productText(input.nome, "Nome do Grupo", true)!;
    const item = await productTransaction(db, session.tenantId, async tx => {
      const codigo = await reserveProductCode(tx, session.tenantId, "grupo");
      return tx.produtoGrupo.create({ data: { codigo, nome } });
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error: any) {
    const e = productApiError(error, "Não foi possível criar o Grupo.");
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
}
