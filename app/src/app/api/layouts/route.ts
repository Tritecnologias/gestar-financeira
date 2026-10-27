import { withAdvisoryAudit } from "@/lib/advisory-request";
import { layoutOwner } from "@/lib/business-author";
import { guardApi } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireEscrita } from "@/lib/tenant";

// GET /api/layouts — lista layouts do usuário logado
async function advisoryGET(req: NextRequest) {
  const access = await guardApi("fluxo.lancamentos.view"); if (access) return access;
  let db: any, session: any;
  try {
    ({ db, session } = await requireSession());
  } catch {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  // ⚡ tenantId injetado automaticamente; filtramos apenas pelo usuário
  const layouts = await db.layoutColunas.findMany({
    where: { ...layoutOwner(session) },
    orderBy: [{ isDefault: "desc" }, { criadoEm: "asc" }],
    select: { id: true, nome: true, colunas: true, isDefault: true, criadoEm: true },
  });

  return NextResponse.json(layouts);
}

// POST /api/layouts — salvar novo layout
async function advisoryPOST(req: NextRequest) {
  const access = await guardApi("fluxo.lancamentos.view"); if (access) return access;
  let db: any, session: any;
  try {
    ({ db, session } = await requireEscrita());
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Não autorizado" }, { status: e?.status ?? 401 });
  }

  const body = await req.json();
  const { nome, colunas, isDefault } = body;

  if (!nome?.trim() || !Array.isArray(colunas)) {
    return NextResponse.json({ error: "Nome e colunas são obrigatórios" }, { status: 400 });
  }

  if (isDefault) {
    // ⚡ updateMany já injeta tenantId no WHERE via Extension
    await db.layoutColunas.updateMany({
      where: { ...layoutOwner(session), isDefault: true },
      data: { isDefault: false },
    });
  }

  // ⚡ tenantId injetado automaticamente no create
  const layout = await db.layoutColunas.create({
    data: { ...layoutOwner(session), nome: nome.trim(), colunas, isDefault: isDefault ?? false },
  });

  return NextResponse.json(layout, { status: 201 });
}

export const GET = withAdvisoryAudit("/api/layouts", "GET", advisoryGET);
export const POST = withAdvisoryAudit("/api/layouts", "POST", advisoryPOST);
