import { prepareLancamento } from "@/lib/lancamento-validation";
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { toLancamentoDTO } from "@/lib/lancamento";
import { counterpartInclude } from "@/lib/lancamento-counterparty";

type Row = Record<string, unknown>;

function rowError(index: number, message: string, status = 400): Error & { status: number; row: number } {
  return Object.assign(new Error(`Lançamento ${index + 1}: ${message}`), { status, row: index + 1 });
}

export async function POST(req: NextRequest) {
  let session: Awaited<ReturnType<typeof requirePermission>>["session"];
  try { ({ session } = await requirePermission("fluxo.lancamentos.create")); }
  catch (error: any) { return NextResponse.json({ error: error?.message || "Não autenticado" }, { status: error?.status || 401 }); }

  let rows: unknown;
  try { ({ lancamentos: rows } = await req.json()); }
  catch { return NextResponse.json({ error: "Envie os lançamentos em JSON." }, { status: 400 }); }
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 100) {
    return NextResponse.json({ error: "Informe de 1 a 100 lançamentos." }, { status: 400 });
  }

  try {
    const created = await prisma.$transaction(async tx => {
      // A linha rápida e este lote compartilham a trava, para não reservar a mesma seq.
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`lancamento-seq:${session.tenantId}`}, 0))`;

      // Validar todas as linhas antes da primeira escrita. Uma falha de constraint
      // posterior também reverte a transação inteira.
      const prepared = [];
      for (const [index, raw] of rows.entries()) {
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw rowError(index, "dados inválidos.");
        const row = raw as Row;
        try {
          const data = await prepareLancamento(tx, session.tenantId, row);
          prepared.push({ ...data, tenantId: session.tenantId, criadoPor: session.id });
        } catch (error: any) { throw rowError(index, error?.status ? error.message : "Não foi possível validar a linha.", error?.status || 500); }
      }

      const last = await tx.lancamento.findFirst({
        where: { tenantId: session.tenantId }, orderBy: { seq: "desc" }, select: { seq: true },
      });
      let seq = (last?.seq ?? 0) + 1;
      const result = [];
      for (const [index, data] of prepared.entries()) {
        try {
          result.push(await tx.lancamento.create({ data: { ...data, seq: seq++ } as Prisma.LancamentoUncheckedCreateInput,
            include: counterpartInclude }));
        } catch (error: any) {
          if (error?.code === "P2034") throw error;
          throw rowError(index, "não foi possível gravar esta linha. Nenhum lançamento foi criado.", 500);
        }
      }
      return result;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 60000 });

    return NextResponse.json({ data: created.map(item => toLancamentoDTO(item, item.seq)), criados: created.length }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.code === "P2034" ? "Criação simultânea detectada. Tente novamente; nenhum lançamento foi gravado."
      : error?.status ? error.message : "Falha na criação. Nenhum lançamento foi gravado.", row: error?.row },
    { status: error?.status || (error?.code === "P2034" ? 409 : 500) });
  }
}
