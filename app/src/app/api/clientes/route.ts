import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireEscrita } from "@/lib/tenant";
import { defaultAccountRelation, profileData, validateDefaultAccount } from "@/lib/registration-profile";

export async function GET() {
  let db: any;
  try { ({ db } = await requireSession()); } catch { return NextResponse.json({ error: "Não autorizado" }, { status: 401 }); }
  const items = await db.cliente.findMany({ where: { ativo: true }, orderBy: [{ codigo: "asc" }], include: defaultAccountRelation });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  let db: any, tenantId: string;
  try { const context = await requireEscrita(); db = context.db; tenantId = context.session.tenantId; } catch (e: any) { return NextResponse.json({ error: e?.message ?? "Não autorizado" }, { status: e?.status ?? 401 }); }
  try {
    const data = profileData(await req.json(), "create");
    await validateDefaultAccount(db, tenantId, data);
    const item = await db.cliente.create({ data });
    return NextResponse.json(item, { status: 201 });
  } catch (e: any) {
    if (e.status) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e.code === "P2002") return NextResponse.json({ error: "Código já cadastrado" }, { status: 409 });
    if (e.code === "P2003") return NextResponse.json({ error: "Conta padrão inválida ou de outro tenant" }, { status: 400 });
    throw e;
  }
}
