import { withAdvisoryAudit } from "@/lib/advisory-request";
import { guardApi } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/tenant";
import { reserveAccountCode } from "@/lib/financial-codes";

async function advisoryGET(req: NextRequest) {
  const access = await guardApi("estrutura.financeiras.create"); if (access) return access;
  try {
    const { db } = await requireSession();
    const categoriaId = req.nextUrl.searchParams.get("categoriaId");
    if (!categoriaId) return NextResponse.json({ error: "Categoria é obrigatória" }, { status: 400 });
    const categoria = await db.categoria.findFirst({ where: { id: categoriaId, ativo: true }, select: { id: true, codigo: true } });
    if (!categoria) return NextResponse.json({ error: "Categoria inexistente, inativa ou de outro tenant" }, { status: 404 });
    return NextResponse.json({ codigo: await reserveAccountCode(db, categoria) });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Não autorizado" }, { status: error?.status || 401 });
  }
}

export const GET = withAdvisoryAudit("/api/plano-contas/proximo-codigo", "GET", advisoryGET);
