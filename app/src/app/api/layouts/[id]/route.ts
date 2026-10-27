import { withAdvisoryAudit } from "@/lib/advisory-request";
import { layoutOwner } from "@/lib/business-author";
import { guardApi } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/tenant";

// DELETE /api/layouts/[id] — excluir layout
async function advisoryDELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await guardApi("fluxo.lancamentos.view"); if (access) return access;
  let db: any, session: any;
  try {
    ({ db, session } = await requireSession());
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id } = await params;

  try {
    await db.layoutColunas.delete({
      where: { id, ...layoutOwner(session) },
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e.code === "P2025") return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    throw e;
  }
}

export const DELETE = withAdvisoryAudit("/api/layouts/[id]", "DELETE", advisoryDELETE);
