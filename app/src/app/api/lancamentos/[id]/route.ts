import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/tenant";
import { parseDateOnly, toLancamentoDTO } from "@/lib/lancamento";

type Params = { params: Promise<{ id: string }> };

// ── PUT /api/lancamentos/[id] ────────────────────────────────
export async function PUT(req: NextRequest, { params }: Params) {
  let db: any;
  try {
    ({ db } = await requireSession());
  } catch {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  const { id } = await params;

  // findFirst já injeta o tenantId automaticamente — impossível acessar registro de outro tenant
  const existente = await db.lancamento.findFirst({ where: { id } });
  if (!existente) return NextResponse.json({ error: "Lançamento não encontrado" }, { status: 404 });

  const body = await req.json();

  // ⚠️ SEQ nunca é atualizado — remover do body se vier
  delete body.seq;

  const {
    dataLanc, descricao, valor, tipo, status,
    fornecedor, fornecedorId, centroCusto, referencia, contaId,
    dataEmissao, dataVencOriginal, dataVencPlano, dataEvento, dataPagamento,
    statusManual, statusExtrato, valorPrevisto, banco,
    fantasiaPadrao, categoria, dre, cont, anotacao,
  } = body;

  const updateData: any = {};
  if (dataLanc !== undefined) updateData.dataLanc = parseDateOnly(dataLanc) ?? new Date();
  if (descricao !== undefined) updateData.descricao = descricao.trim();
  if (valor !== undefined && valor !== null && valor !== "") {
    updateData.valor = typeof valor === "number" ? valor : parseFloat(String(valor).replace(",", "."));
  }
  if (tipo !== undefined) updateData.tipo = tipo;
  if (status !== undefined) updateData.status = status;
  if (dataEmissao !== undefined) updateData.dataEmissao = parseDateOnly(dataEmissao);
  if (dataVencOriginal !== undefined) updateData.dataVencOriginal = parseDateOnly(dataVencOriginal);
  if (dataVencPlano !== undefined) updateData.dataVencPlano = parseDateOnly(dataVencPlano);
  if (dataEvento !== undefined) updateData.dataEvento = parseDateOnly(dataEvento);
  if (dataPagamento !== undefined) updateData.dataPagamento = parseDateOnly(dataPagamento);
  if (statusManual !== undefined) updateData.statusManual = statusManual || null;
  if (statusExtrato !== undefined) updateData.statusExtrato = statusExtrato || null;
  if (valorPrevisto !== undefined) {
    updateData.valorPrevisto = valorPrevisto ? (typeof valorPrevisto === "number" ? valorPrevisto : parseFloat(String(valorPrevisto).replace(",", "."))) : null;
  }
  if (banco !== undefined) updateData.banco = banco || null;
  if (fornecedor !== undefined) updateData.fornecedor = fornecedor || null;
  if (fornecedorId !== undefined) updateData.fornecedorId = fornecedorId || null;
  if (fantasiaPadrao !== undefined) updateData.fantasiaPadrao = fantasiaPadrao || null;
  if (centroCusto !== undefined) updateData.centroCusto = centroCusto || null;
  if (referencia !== undefined) updateData.referencia = referencia || null;
  if (contaId !== undefined) updateData.contaId = contaId || null;
  if (categoria !== undefined) updateData.categoria = categoria || null;
  if (dre !== undefined) updateData.dre = dre || null;
  if (cont !== undefined) updateData.cont = cont || null;
  if (anotacao !== undefined) updateData.anotacao = anotacao || null;

  // ⚡ update já injeta tenantId no WHERE via Extension
  const atualizado = await db.lancamento.update({
    where: { id },
    data: updateData,
    include: { fornecedorRef: { select: { codigo: true, nome: true } } },
  });

  return NextResponse.json(toLancamentoDTO(atualizado, atualizado.seq));
}

// ── DELETE /api/lancamentos/[id] ────────────────────────────
export async function DELETE(req: NextRequest, { params }: Params) {
  let db: any, session: any;
  try {
    ({ db, session } = await requireSession());
  } catch {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  // Apenas admin pode excluir lançamentos
  if (session.papel === "membro") {
    return NextResponse.json({ error: "Sem permissão para excluir" }, { status: 403 });
  }

  const { id } = await params;
  const existente = await db.lancamento.findFirst({ where: { id } });
  if (!existente) return NextResponse.json({ error: "Lançamento não encontrado" }, { status: 404 });

  await db.lancamento.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
