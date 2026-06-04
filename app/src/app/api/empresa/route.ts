import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/tenant";

export async function GET() {
  let db: any;
  try { ({ db } = await requireSession()); } catch { return NextResponse.json({ error: "Não autorizado" }, { status: 401 }); }
  const items = await db.empresa.findMany({ orderBy: [{ criadoEm: "asc" }] });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  let db: any;
  try { ({ db } = await requireSession()); } catch { return NextResponse.json({ error: "Não autorizado" }, { status: 401 }); }
  const body = await req.json();
  const { razaoSocial, nomeFantasia, cnpj, inscEstadual, telefone, email, endereco, cidade, estado, cep, segmento, porte, dataFundacao } = body;
  if (!razaoSocial?.trim()) return NextResponse.json({ error: "Razão social é obrigatória" }, { status: 400 });
  const item = await db.empresa.create({ data: { razaoSocial: razaoSocial.trim(), nomeFantasia: nomeFantasia || null, cnpj: cnpj || null, inscEstadual: inscEstadual || null, telefone: telefone || null, email: email || null, endereco: endereco || null, cidade: cidade || null, estado: estado || null, cep: cep || null, segmento: segmento || null, porte: porte || null, dataFundacao: dataFundacao ? new Date(dataFundacao) : null } });
  return NextResponse.json(item, { status: 201 });
}
