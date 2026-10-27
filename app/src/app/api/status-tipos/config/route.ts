import { withAdvisoryAudit } from "@/lib/advisory-request";
import { guardApi } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireEscrita } from "@/lib/tenant";
import { prisma } from "@/lib/db";

// GET /api/status-tipos/config — retorna título da tabela de apoio
async function advisoryGET() {
  const access = await guardApi("fluxo.lancamentos.view"); if (access) return access;
  let session: any;
  try {
    ({ session } = await requireSession());
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: session.tenantId },
    select: { tituloTabelaStatus: true },
  });

  return NextResponse.json({ titulo: tenant?.tituloTabelaStatus ?? "VALOR PREVISTO" });
}

// PUT /api/status-tipos/config — atualiza título da tabela de apoio
async function advisoryPUT(req: NextRequest) {
  const access = await guardApi("fluxo.lancamentos.edit"); if (access) return access;
  let session: any;
  try {
    ({ session } = await requireEscrita());
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Não autorizado" }, { status: e?.status ?? 401 });
  }

  const body = await req.json();
  const { titulo } = body;

  if (!titulo?.trim()) {
    return NextResponse.json({ error: "Título é obrigatório" }, { status: 400 });
  }

  await prisma.tenant.update({
    where: { id: session.tenantId },
    data: { tituloTabelaStatus: titulo.trim() },
  });

  return NextResponse.json({ titulo: titulo.trim() });
}

export const GET = withAdvisoryAudit("/api/status-tipos/config", "GET", advisoryGET);
export const PUT = withAdvisoryAudit("/api/status-tipos/config", "PUT", advisoryPUT);
