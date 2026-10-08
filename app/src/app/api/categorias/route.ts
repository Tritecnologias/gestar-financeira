import { guardApi } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireEscrita } from "@/lib/tenant";
import { validNewCategoryCode } from "@/lib/financial-codes";

export async function GET() {
  const access = await guardApi(["estrutura.financeiras.view","estrutura.cadastrais.view","fluxo.lancamentos.view"]); if (access) return access;
  let db: any;
  try { ({ db } = await requireSession()); } catch { return NextResponse.json({ error: "Não autorizado" }, { status: 401 }); }
  const items = await db.categoria.findMany({ where: { ativo: true }, orderBy: [{ codigo: "asc" }] });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const access = await guardApi("estrutura.financeiras.create"); if (access) return access;
  let db: any;
  try { ({ db } = await requireEscrita()); } catch (e: any) { return NextResponse.json({ error: e?.message ?? "Não autorizado" }, { status: e?.status ?? 401 }); }
  const { codigo, nome, tipo } = await req.json();
  if (typeof codigo !== "string" || !validNewCategoryCode(codigo)) return NextResponse.json({ error: "Código da Categoria deve ter exatamente 2 dígitos numéricos." }, { status: 400 });
  if (typeof nome !== "string" || !nome.trim()) return NextResponse.json({ error: "Nome da Categoria é obrigatório" }, { status: 400 });
  try {
    const item = await db.categoria.create({ data: { codigo, nome: nome.trim(), tipo: tipo || null } });
    return NextResponse.json(item, { status: 201 });
  } catch (e: any) {
    if (e.code === "P2002") return NextResponse.json({ error: "Código já cadastrado" }, { status: 409 });
    throw e;
  }
}
