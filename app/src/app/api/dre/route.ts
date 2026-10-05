import { guardApi } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireEscrita } from "@/lib/tenant";

export async function GET() {
  const access = await guardApi(["estrutura.financeiras.view","fluxo.lancamentos.view"]); if (access) return access;
  let db: any;
  try { ({ db } = await requireSession()); } catch { return NextResponse.json({ error: "Não autorizado" }, { status: 401 }); }
  const items = await db.dre.findMany({ where: { ativo: true }, orderBy: [{ ordem: "asc" }, { codigo: "asc" }] });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const access = await guardApi("estrutura.financeiras.create"); if (access) return access;
  let db: any;
  try { ({ db } = await requireEscrita()); } catch (e: any) { return NextResponse.json({ error: e?.message ?? "Não autorizado" }, { status: e?.status ?? 401 }); }
  const { codigo, nome, ordem } = await req.json();
  if (!codigo?.trim() || !nome?.trim()) return NextResponse.json({ error: "Código e nome são obrigatórios" }, { status: 400 });
  try {
    const item = await db.dre.create({ data: { codigo: codigo.trim(), nome: nome.trim(), ordem: ordem ?? 0 } });
    return NextResponse.json(item, { status: 201 });
  } catch (e: any) {
    if (e.code === "P2002") return NextResponse.json({ error: "Código já cadastrado" }, { status: 409 });
    throw e;
  }
}
