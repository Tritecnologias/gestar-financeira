import { withAdvisoryAudit } from "@/lib/advisory-request";
import { guardApi } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/tenant";
import { validateActiveArea } from "@/lib/management-structure";

async function advisoryPUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await guardApi("estrutura.empresa.edit"); if (access) return access;
  let db: any;
  try { ({ db } = await requireSession()); } catch { return NextResponse.json({ error: "Não autorizado" }, { status: 401 }); }
  const { id } = await params;
  const { codigo, nome, areaId } = await req.json();
  if (!nome?.trim()) return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
  const area = await validateActiveArea(db, areaId);
  if (!area.ok) return NextResponse.json({ error: area.error }, { status: area.status });
  try {
    const item = await db.centroCusto.update({ where: { id }, data: { codigo: codigo?.trim(), nome: nome.trim(), areaId: area.id } });
    return NextResponse.json(item);
  } catch (e: any) {
    if (e.code === "P2002") return NextResponse.json({ error: "Código já cadastrado" }, { status: 409 });
    if (e.code === "P2025") return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    throw e;
  }
}

async function advisoryDELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await guardApi("estrutura.empresa.delete"); if (access) return access;
  let db: any;
  try { ({ db } = await requireSession()); } catch { return NextResponse.json({ error: "Não autorizado" }, { status: 401 }); }
  const { id } = await params;
  try {
    await db.centroCusto.update({ where: { id }, data: { ativo: false } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e.code === "P2025") return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    throw e;
  }
}

export const PUT = withAdvisoryAudit("/api/centros-custo/[id]", "PUT", advisoryPUT);
export const DELETE = withAdvisoryAudit("/api/centros-custo/[id]", "DELETE", advisoryDELETE);
