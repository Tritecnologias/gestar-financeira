import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireEscrita } from "@/lib/tenant";

export async function GET() {
  let db: any;
  try { ({ db } = await requireSession()); } catch { return NextResponse.json({ error: "Não autorizado" }, { status: 401 }); }
  const items = await db.pessoa.findMany({ where: { ativo: true }, orderBy: [{ nome: "asc" }] });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  let db: any;
  try { ({ db } = await requireEscrita()); } catch (e: any) { return NextResponse.json({ error: e?.message ?? "Não autorizado" }, { status: e?.status ?? 401 }); }
  const { codigo, nome, cargo, departamento, email, telefone, documento, dataAdmissao, salario } = await req.json();
  if (!codigo?.trim() || !nome?.trim()) return NextResponse.json({ error: "Código e nome são obrigatórios" }, { status: 400 });
  try {
    const item = await db.pessoa.create({ data: { codigo: codigo.trim(), nome: nome.trim(), cargo: cargo || null, departamento: departamento || null, email: email || null, telefone: telefone || null, documento: documento || null, dataAdmissao: dataAdmissao ? new Date(dataAdmissao) : null, salario: salario ? parseFloat(salario) : null } });
    return NextResponse.json(item, { status: 201 });
  } catch (e: any) {
    if (e.code === "P2002") return NextResponse.json({ error: "Código já cadastrado" }, { status: 409 });
    throw e;
  }
}
