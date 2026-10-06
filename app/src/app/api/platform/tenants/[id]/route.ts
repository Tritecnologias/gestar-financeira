import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/tenant";
import { normalizeEmail } from "@/lib/email";
import { writeAudit } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    const actor = await requirePlatformAdmin();
    const { id } = await params;
    const body = await req.json();
    const data: { nome?: string; email?: string; plano?: string; ativo?: boolean } = {};
    if (body.nome !== undefined) {
      if (typeof body.nome !== "string" || !body.nome.trim() || body.nome.length > 160) throw Object.assign(new Error("Nome inválido."), { status: 400 });
      data.nome = body.nome.trim();
    }
    if (body.email !== undefined) {
      if (typeof body.email !== "string" || !normalizeEmail(body.email).includes("@")) throw Object.assign(new Error("Email inválido."), { status: 400 });
      data.email = normalizeEmail(body.email);
    }
    if (body.plano !== undefined) {
      if (typeof body.plano !== "string" || !["trial", "mensal", "anual"].includes(body.plano)) throw Object.assign(new Error("Plano inválido."), { status: 400 });
      data.plano = body.plano;
    }
    if (body.ativo !== undefined) {
      if (typeof body.ativo !== "boolean") throw Object.assign(new Error("Status inválido."), { status: 400 });
      data.ativo = body.ativo;
    }
    if (!Object.keys(data).length) throw Object.assign(new Error("Nenhuma alteração informada."), { status: 400 });
    const result = await prisma.$transaction(async tx => {
      const before = await tx.tenant.findUniqueOrThrow({ where: { id }, select: {
        nome: true, plano: true, ativo: true,
      } });
      const updated = await tx.tenant.update({ where: { id }, data,
        select: { id: true, nome: true, slug: true, email: true, plano: true, ativo: true } });
      await writeAudit(tx, { actorIdentityId: actor.identityId, accessMode: "PLATFORM_ADMIN",
        action: before.ativo !== updated.ativo ? "TENANT_STATUS_CHANGED" : "TENANT_CHANGED",
        resourceType: "Tenant", resourceId: id,
        changes: { before: { nome: before.nome, plano: before.plano, ativo: before.ativo },
          after: { nome: updated.nome, plano: updated.plano, ativo: updated.ativo } } });
      return updated;
    });
    return NextResponse.json(result);
  } catch (error: any) {
    if (error?.code === "P2025") return NextResponse.json({ error: "Tenant não encontrado." }, { status: 404 });
    if (error?.code === "P2002") return NextResponse.json({ error: "Email já utilizado." }, { status: 409 });
    return NextResponse.json({ error: error?.status ? error.message : "Falha ao atualizar tenant." }, { status: error?.status ?? 500 });
  }
}
