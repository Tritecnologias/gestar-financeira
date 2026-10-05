import { guardApi } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireEscrita } from "@/lib/tenant";
import { FINANCIAL_ACCOUNT_TYPES } from "@/lib/financial-account-types";

export async function GET() {
  const access = await guardApi(["estrutura.financeiras.view","estrutura.cadastrais.view","fluxo.lancamentos.view"]); if (access) return access;
  let db: any;
  try { ({ db } = await requireSession()); } catch { return NextResponse.json({ error: "Não autorizado" }, { status: 401 }); }
  const items = await db.planoContas.findMany({ where: { ativo: true }, orderBy: [{ codigo: "asc" }] });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const access = await guardApi("estrutura.financeiras.create"); if (access) return access;
  let db: any;
  try { ({ db } = await requireEscrita()); } catch (e: any) { return NextResponse.json({ error: e?.message ?? "Não autorizado" }, { status: e?.status ?? 401 }); }
  const { codigo, descricao, tipo, paiId, categoriaId } = await req.json();
  if (typeof codigo !== "string" || !codigo.trim() || typeof descricao !== "string" || !descricao.trim()) return NextResponse.json({ error: "Código e descrição são obrigatórios" }, { status: 400 });
  if (!FINANCIAL_ACCOUNT_TYPES.includes(tipo)) return NextResponse.json({ error: "Tipo da Conta inválido" }, { status: 400 });
  if (typeof categoriaId !== "string" || !categoriaId) return NextResponse.json({ error: "Categoria é obrigatória" }, { status: 400 });
  try {
    const item = await db.$transaction(async (tx: any) => {
      const categoria = await tx.categoria.findFirst({ where: { id: categoriaId, ativo: true }, select: { id: true } });
      if (!categoria) throw Object.assign(new Error("Categoria inexistente, inativa ou de outro tenant"), { status: 400 });
      const duplicate = await tx.planoContas.findFirst({ where: { codigo: codigo.trim() }, select: { id: true } });
      if (duplicate) throw Object.assign(new Error("Código de Conta já cadastrado neste tenant"), { status: 409 });
      return tx.planoContas.create({ data: { codigo: codigo.trim(), descricao: descricao.trim(), tipo, paiId: paiId || null, categoriaId } });
    }, { isolationLevel: "Serializable" });
    return NextResponse.json(item, { status: 201 });
  } catch (e: any) {
    if (e.status) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e.code === "P2034") return NextResponse.json({ error: "Cadastro alterado simultaneamente. Tente novamente." }, { status: 409 });
    throw e;
  }
}
