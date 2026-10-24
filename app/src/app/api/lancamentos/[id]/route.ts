import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { toLancamentoDTO } from "@/lib/lancamento";
import { counterpartInclude } from "@/lib/lancamento-counterparty";
import { prepareLancamento, lancamentoError } from "@/lib/lancamento-validation";
import { optimisticWhere, concurrencyConflict } from "@/lib/lancamento-version.mjs";

type Params = { params: Promise<{ id: string }> };
export async function PUT(req: NextRequest, { params }: Params) {
  let session: any;
  try { ({ session } = await requirePermission("fluxo.lancamentos.edit")); }
  catch (error: any) { return NextResponse.json({ error: error.message }, { status: error.status || 401 }); }
  try {
    const { id } = await params;
    const body = await req.json();
    const row = await prisma.$transaction(async tx => {
      const existing = await tx.lancamento.findFirst({ where: { id, tenantId: session.tenantId } });
      if (!existing) throw Object.assign(new Error("Lançamento não encontrado."), { status: 404 });
      const where = optimisticWhere(id, session.tenantId, body.versao);
      if (where.revisao !== existing.revisao) concurrencyConflict();
      const data = await prepareLancamento(tx, session.tenantId, body, existing);
      if (Object.keys(data).length) {
        const written = await tx.lancamento.updateMany({ where, data });
        if (written.count !== 1) concurrencyConflict();
      }
      return tx.lancamento.findFirstOrThrow({ where: { id, tenantId: session.tenantId }, include: counterpartInclude });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json(toLancamentoDTO(row));
  } catch (error) { const result = lancamentoError(error); return NextResponse.json({ error: result.error }, { status: result.status }); }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  let db: any;
  try { ({ db } = await requirePermission("fluxo.lancamentos.delete")); }
  catch (error: any) { return NextResponse.json({ error: error.message }, { status: error.status || 401 }); }
  try {
    const { id } = await params;
    const deleted = await db.lancamento.deleteMany({ where: { id } });
    if (!deleted.count) return NextResponse.json({ error: "Lançamento não encontrado." }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (error) { const result = lancamentoError(error); return NextResponse.json({ error: result.error }, { status: result.status }); }
}
