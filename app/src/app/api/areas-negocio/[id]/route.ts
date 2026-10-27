import { withAdvisoryAudit } from "@/lib/advisory-request";
import { guardApi } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/tenant";

async function advisoryPUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await guardApi("estrutura.empresa.edit"); if (access) return access;
  let db: any;
  try { ({ db } = await requireSession()); } catch { return NextResponse.json({ error: "Não autorizado" }, { status: 401 }); }
  const { id } = await params;
  const { codigo, nome } = await req.json();
  try {
    const item = await db.areaNegocio.update({ where: { id }, data: { codigo: codigo?.trim(), nome: nome?.trim() } });
    return NextResponse.json(item);
  } catch (e: any) { if (e.code === "P2025") return NextResponse.json({ error: "Não encontrado" }, { status: 404 }); throw e; }
}

async function advisoryDELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await guardApi("estrutura.empresa.delete"); if (access) return access;
  let db: any;
  try { ({ db } = await requireSession()); } catch { return NextResponse.json({ error: "Não autorizado" }, { status: 401 }); }
  const { id } = await params;
  const centrosAtivos = await db.centroCusto.count({ where: { areaId: id, ativo: true } });
  if (centrosAtivos > 0) {
    return NextResponse.json(
      { error: `Não é possível desativar a Área de Negócio: ${centrosAtivos} Centro(s) de Custo ativo(s) vinculado(s).` },
      { status: 409 }
    );
  }
  try { await db.areaNegocio.update({ where: { id }, data: { ativo: false } }); return NextResponse.json({ ok: true }); }
  catch (e: any) { if (e.code === "P2025") return NextResponse.json({ error: "Não encontrado" }, { status: 404 }); throw e; }
}

export const PUT = withAdvisoryAudit("/api/areas-negocio/[id]", "PUT", advisoryPUT);
export const DELETE = withAdvisoryAudit("/api/areas-negocio/[id]", "DELETE", advisoryDELETE);
