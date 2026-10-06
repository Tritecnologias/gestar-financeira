import { guardApi } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireEscrita } from "@/lib/tenant";
import { FINANCIAL_ACCOUNT_TYPES } from "@/lib/financial-account-types";
import { financialCodeTransaction, reserveAccountCode } from "@/lib/financial-codes";

export async function GET() {
  const access = await guardApi(["estrutura.financeiras.view","estrutura.cadastrais.view","fluxo.lancamentos.view"]); if (access) return access;
  let db: any;
  try { ({ db } = await requireSession()); } catch { return NextResponse.json({ error: "Não autorizado" }, { status: 401 }); }
  const items = await db.planoContas.findMany({ where: { ativo: true }, orderBy: [{ codigo: "asc" }] });
  return NextResponse.json(items);
}

export async function POST(req: NextRequest) {
  const access = await guardApi("estrutura.financeiras.create"); if (access) return access;
  let db: any, tenantId: string;
  try { ({ db, baseTenantId: tenantId } = await requireEscrita()); } catch (e: any) { return NextResponse.json({ error: e?.message ?? "Não autorizado" }, { status: e?.status ?? 401 }); }
  const { descricao, tipo, paiId, categoriaId } = await req.json();
  if (typeof descricao !== "string" || !descricao.trim()) return NextResponse.json({ error: "Descrição é obrigatória" }, { status: 400 });
  if (!FINANCIAL_ACCOUNT_TYPES.includes(tipo)) return NextResponse.json({ error: "Tipo da Conta inválido" }, { status: 400 });
  if (typeof categoriaId !== "string" || !categoriaId) return NextResponse.json({ error: "Categoria é obrigatória" }, { status: 400 });
  try {
    const item = await financialCodeTransaction(db, tenantId, async tx => {
      const categoria = await tx.categoria.findFirst({ where: { id: categoriaId, ativo: true }, select: { id: true, codigo: true } });
      if (!categoria) throw Object.assign(new Error("Categoria inexistente, inativa ou de outro tenant"), { status: 400 });
      const codigo = await reserveAccountCode(tx, categoria);
      return tx.planoContas.create({ data: { codigo, descricao: descricao.trim(), tipo, paiId: paiId || null, categoriaId } });
    });
    return NextResponse.json(item, { status: 201 });
  } catch (e: any) {
    if (e.status) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e.code === "P2002") return NextResponse.json({ error: "Código de Conta já cadastrado. Tente novamente." }, { status: 409 });
    if (e.code === "P2034") return NextResponse.json({ error: "Cadastro alterado simultaneamente. Tente novamente." }, { status: 409 });
    throw e;
  }
}
