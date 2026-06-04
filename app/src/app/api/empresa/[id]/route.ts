import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/tenant";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let db: any;
  try { ({ db } = await requireSession()); } catch { return NextResponse.json({ error: "Não autorizado" }, { status: 401 }); }
  const { id } = await params;
  const body = await req.json();
  const { razaoSocial, nomeFantasia, cnpj, inscEstadual, telefone, email, endereco, cidade, estado, cep, segmento, porte, dataFundacao } = body;
  if (!razaoSocial?.trim()) return NextResponse.json({ error: "Razão social é obrigatória" }, { status: 400 });
  try {
    const item = await db.empresa.update({ where: { id }, data: { razaoSocial: razaoSocial.trim(), nomeFantasia: nomeFantasia || null, cnpj: cnpj || null, inscEstadual: inscEstadual || null, telefone: telefone || null, email: email || null, endereco: endereco || null, cidade: cidade || null, estado: estado || null, cep: cep || null, segmento: segmento || null, porte: porte || null, dataFundacao: dataFundacao ? new Date(dataFundacao) : null } });
    return NextResponse.json(item);
  } catch (e: any) { if (e.code === "P2025") return NextResponse.json({ error: "Não encontrado" }, { status: 404 }); throw e; }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let db: any;
  try { ({ db } = await requireSession()); } catch { return NextResponse.json({ error: "Não autorizado" }, { status: 401 }); }
  const { id } = await params;
  try { await db.empresa.delete({ where: { id } }); return NextResponse.json({ ok: true }); }
  catch (e: any) { if (e.code === "P2025") return NextResponse.json({ error: "Não encontrado" }, { status: 404 }); throw e; }
}
