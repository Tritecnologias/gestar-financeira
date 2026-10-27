import { withAdvisoryAudit } from "@/lib/advisory-request";
import { guardApi } from "@/lib/permissions";
import { NextRequest, NextResponse } from "next/server";
import { requireSession, requireEscrita } from "@/lib/tenant";

async function advisoryGET() {
  const access = await guardApi("acao.tarefas.view"); if (access) return access;
  let db: any;
  try { ({ db } = await requireSession()); } catch { return NextResponse.json({ error: "Não autorizado" }, { status: 401 }); }
  const items = await db.tarefaStatus.findMany({ orderBy: [{ ordem: "asc" }] });
  return NextResponse.json(items);
}

async function advisoryPOST(req: NextRequest) {
  const access = await guardApi("acao.tarefas.create"); if (access) return access;
  let db: any;
  try { ({ db } = await requireEscrita()); } catch (e: any) { return NextResponse.json({ error: e?.message ?? "Não autorizado" }, { status: e?.status ?? 401 }); }
  const { nome, cor } = await req.json();
  if (!nome?.trim()) return NextResponse.json({ error: "Nome é obrigatório" }, { status: 400 });
  const item = await db.tarefaStatus.create({ data: { nome: nome.trim(), cor: cor || "#3b82f6" } });
  return NextResponse.json(item, { status: 201 });
}

async function advisoryPUT(req: NextRequest) {
  const access = await guardApi("acao.tarefas.edit"); if (access) return access;
  let db: any;
  try { ({ db } = await requireEscrita()); } catch (e: any) { return NextResponse.json({ error: e?.message ?? "Não autorizado" }, { status: e?.status ?? 401 }); }
  const { items } = await req.json();
  // Bulk update
  if (Array.isArray(items)) {
    for (const item of items) {
      if (item.id) await db.tarefaStatus.update({ where: { id: item.id }, data: { nome: item.nome, cor: item.cor, ordem: item.ordem ?? 0 } });
    }
  }
  return NextResponse.json({ ok: true });
}

export const GET = withAdvisoryAudit("/api/tarefas/status", "GET", advisoryGET);
export const POST = withAdvisoryAudit("/api/tarefas/status", "POST", advisoryPOST);
export const PUT = withAdvisoryAudit("/api/tarefas/status", "PUT", advisoryPUT);
