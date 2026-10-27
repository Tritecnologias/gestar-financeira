import { withAdvisoryAudit } from "@/lib/advisory-request";
import { guardApi } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/tenant";

async function advisoryPUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await guardApi("estrutura.empresa.edit"); if (access) return access;
  let db: any;
  try { ({ db } = await requireSession()); } catch { return NextResponse.json({ error: "Não autorizado" }, { status: 401 }); }
  const { id } = await params;
  const { banco, agencia, conta, tipo, titular } = await req.json();
  try {
    const item = await db.dadoBancario.update({ where: { id }, data: { banco: banco?.trim(), agencia: agencia || null, conta: conta || null, tipo: tipo || null, titular: titular || null } });
    return NextResponse.json(item);
  } catch (e: any) { if (e.code === "P2025") return NextResponse.json({ error: "Não encontrado" }, { status: 404 }); throw e; }
}

async function advisoryDELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await guardApi("estrutura.empresa.delete"); if (access) return access;
  let db: any;
  try { ({ db } = await requireSession()); } catch { return NextResponse.json({ error: "Não autorizado" }, { status: 401 }); }
  const { id } = await params;
  try { await db.dadoBancario.update({ where: { id }, data: { ativo: false } }); return NextResponse.json({ ok: true }); }
  catch (e: any) { if (e.code === "P2025") return NextResponse.json({ error: "Não encontrado" }, { status: 404 }); throw e; }
}

export const PUT = withAdvisoryAudit("/api/dados-bancarios/[id]", "PUT", advisoryPUT);
export const DELETE = withAdvisoryAudit("/api/dados-bancarios/[id]", "DELETE", advisoryDELETE);
