import { withAdvisoryAudit } from "@/lib/advisory-request";
import { guardApi } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireEscrita } from "@/lib/tenant";

async function advisoryGET() {
  const access = await guardApi("estrutura.empresa.view"); if (access) return access;
  let db: any;
  try { ({ db } = await requireSession()); } catch { return NextResponse.json({ error: "Não autorizado" }, { status: 401 }); }
  const items = await db.dadoBancario.findMany({ where: { ativo: true }, orderBy: [{ banco: "asc" }] });
  return NextResponse.json(items);
}

async function advisoryPOST(req: NextRequest) {
  const access = await guardApi("estrutura.empresa.create"); if (access) return access;
  let db: any;
  try { ({ db } = await requireEscrita()); } catch (e: any) { return NextResponse.json({ error: e?.message ?? "Não autorizado" }, { status: e?.status ?? 401 }); }
  const { banco, agencia, conta, tipo, titular } = await req.json();
  if (!banco?.trim()) return NextResponse.json({ error: "Banco é obrigatório" }, { status: 400 });
  const item = await db.dadoBancario.create({ data: { banco: banco.trim(), agencia: agencia || null, conta: conta || null, tipo: tipo || null, titular: titular || null } });
  return NextResponse.json(item, { status: 201 });
}

export const GET = withAdvisoryAudit("/api/dados-bancarios", "GET", advisoryGET);
export const POST = withAdvisoryAudit("/api/dados-bancarios", "POST", advisoryPOST);
