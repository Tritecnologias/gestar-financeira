import { withAdvisoryAudit } from "@/lib/advisory-request";
import { guardApi } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireEscrita } from "@/lib/tenant";

async function advisoryGET() {
  const access = await guardApi("estrutura.empresa.view"); if (access) return access;
  let db: any;
  try { ({ db } = await requireSession()); } catch { return NextResponse.json({ error: "Não autorizado" }, { status: 401 }); }
  const items = await db.areaNegocio.findMany({ where: { ativo: true }, orderBy: [{ codigo: "asc" }] });
  return NextResponse.json(items);
}

async function advisoryPOST(req: NextRequest) {
  const access = await guardApi("estrutura.empresa.create"); if (access) return access;
  let db: any;
  try { ({ db } = await requireEscrita()); } catch (e: any) { return NextResponse.json({ error: e?.message ?? "Não autorizado" }, { status: e?.status ?? 401 }); }
  const { codigo, nome } = await req.json();
  if (!codigo?.trim() || !nome?.trim()) return NextResponse.json({ error: "Código e nome são obrigatórios" }, { status: 400 });
  try {
    const item = await db.areaNegocio.create({ data: { codigo: codigo.trim(), nome: nome.trim() } });
    return NextResponse.json(item, { status: 201 });
  } catch (e: any) {
    if (e.code === "P2002") return NextResponse.json({ error: "Código já cadastrado" }, { status: 409 });
    throw e;
  }
}

export const GET = withAdvisoryAudit("/api/areas-negocio", "GET", advisoryGET);
export const POST = withAdvisoryAudit("/api/areas-negocio", "POST", advisoryPOST);
