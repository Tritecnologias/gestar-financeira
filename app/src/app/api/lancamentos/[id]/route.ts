import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/lib/tenant";
import { toNumber } from "@/lib/formatters";

type Params = { params: Promise<{ id: string }> };

const d = (v?: string | null) => v ? new Date(v) : null;

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

  // ⚡ update já injeta tenantId no WHERE via Extension
  const atualizado = await db.lancamento.update({
    where: { id },
    data: {
      ...(dataLanc    && { dataLanc: new Date(dataLanc) }),
      ...(descricao   && { descricao: descricao.trim() }),
      ...(valor !== undefined && { valor: parseFloat(valor) }),
      ...(tipo        && { tipo }),
      ...(status      && { status }),
      dataEmissao:      d(dataEmissao),
      dataVencOriginal: d(dataVencOriginal),
      dataVencPlano:    d(dataVencPlano),
      dataEvento:       d(dataEvento),
      dataPagamento:    d(dataPagamento),
      statusManual:     statusManual  ?? null,
      statusExtrato:    statusExtrato ?? null,
      valorPrevisto:    valorPrevisto ? parseFloat(valorPrevisto) : null,
      banco:            banco         ?? null,
      fornecedor:       fornecedor    ?? null,
      fornecedorId:     fornecedorId  ?? null,
      fantasiaPadrao:   fantasiaPadrao?? null,
      centroCusto:      centroCusto   ?? null,
      referencia:       referencia    ?? null,
      contaId:          contaId       ?? null,
      categoria:        categoria     ?? null,
      dre:              dre           ?? null,
      cont:             cont          ?? null,
      anotacao:         anotacao      ?? null,
    },
    include: { fornecedorRef: { select: { codigo: true, nome: true } } },
  });

  return NextResponse.json({
    id:          atualizado.id,
    seq:         atualizado.seq,
    dataLanc:    atualizado.dataLanc.toISOString().split("T")[0],
    descricao:   atualizado.descricao,
    valor:       toNumber(atualizado.valor),
    tipo:        atualizado.tipo,
    status:      atualizado.status,
    statusManual: atualizado.statusManual,
    statusExtrato:atualizado.statusExtrato,
    fornecedor:   atualizado.fornecedor,
    fantasiaPadrao: atualizado.fornecedorRef
      ? `${atualizado.fornecedorRef.codigo} – ${atualizado.fornecedorRef.nome}`
      : atualizado.fantasiaPadrao,
    centroCusto:  atualizado.centroCusto,
    banco:        atualizado.banco,
    anotacao:     atualizado.anotacao,
    criadoEm:    atualizado.criadoEm.toISOString(),
  });
}

// ── DELETE /api/lancamentos/[id] ────────────────────────────
export async function DELETE(req: NextRequest, { params }: Params) {
  let db: any;
  try {
    ({ db } = await requireSession());
  } catch {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }
  const { id } = await params;

  // findFirst já injeta tenantId — garante que só apaga registro do próprio tenant
  const existente = await db.lancamento.findFirst({ where: { id } });
  if (!existente) return NextResponse.json({ error: "Lançamento não encontrado" }, { status: 404 });

  await db.lancamento.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
