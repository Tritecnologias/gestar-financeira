import { prisma } from "@/lib/db";
import { legacyAuthEnabled } from "@/lib/auth";
import { requireSession, requireTenantAdmin } from "@/lib/tenant";
import { ALL_PERMISSIONS, PERMISSION_SET } from "@/lib/access-catalog";
import { NextResponse } from "next/server";

type Context = Pick<Awaited<ReturnType<typeof requireSession>>, "db" | "session">;

const OWNER_ESSENTIAL = [
  "acessos.usuarios.view", "acessos.usuarios.manage",
  "acessos.perfis.view", "acessos.perfis.manage",
];

/** Re-read the current profile: changes and revocations affect existing sessions. */
export async function permissionsFor(context: Context): Promise<ReadonlySet<string>> {
  if (legacyAuthEnabled) return new Set(ALL_PERMISSIONS);
  const membershipId = context.session.membershipId;
  if (!membershipId) return new Set();
  const membership = await prisma.tenantMembership.findFirst({
    where: { id: membershipId, tenantId: context.session.tenantId, status: "ACTIVE" },
    select: { role: true, profile: { select: { ativo: true, tenantId: true, permissoes: true } } },
  });
  const selected = membership?.profile?.ativo && membership.profile.tenantId === context.session.tenantId
    ? membership.profile.permissoes.filter(key => PERMISSION_SET.has(key)) : [];
  if (membership?.role === "OWNER") selected.push(...OWNER_ESSENTIAL);
  return new Set(selected);
}

export async function hasPermission(key: string, context?: Context): Promise<boolean> {
  if (!PERMISSION_SET.has(key)) return false;
  const current = context ?? await requireSession();
  return (await permissionsFor(current)).has(key);
}

export async function requirePermission(key: string): Promise<Context> {
  const context = await requireSession();
  if (legacyAuthEnabled && context.session.papel === "membro" && key === "fluxo.lancamentos.delete") {
    throw Object.assign(new Error("Acesso negado para esta ação."), { status: 403 });
  }
  if (!await hasPermission(key, context)) {
    throw Object.assign(new Error("Acesso negado para esta ação."), { status: 403 });
  }
  return context;
}

/** Explicit alternatives are for catalog lookups shared by authorized screens. */
export async function requireAnyPermission(keys: readonly string[]): Promise<Context> {
  const context = await requireSession();
  const granted = await permissionsFor(context);
  if (!keys.some(key => PERMISSION_SET.has(key) && granted.has(key))) {
    throw Object.assign(new Error("Acesso negado para esta ação."), { status: 403 });
  }
  return context;
}

export async function guardApi(keys: string | readonly string[]): Promise<NextResponse | null> {
  try {
    await requireAnyPermission(typeof keys === "string" ? [keys] : keys);
    return null;
  } catch (error) {
    const { status, message } = permissionError(error);
    return NextResponse.json({ error: message }, { status });
  }
}

export async function requireTenantPermission(key: string): Promise<Context> {
  const context = await requireTenantAdmin();
  if (!await hasPermission(key, context)) {
    throw Object.assign(new Error("Acesso negado para esta ação."), { status: 403 });
  }
  return context;
}

export function permissionError(error: unknown) {
  const cause = error as { status?: number; message?: string };
  return { status: cause?.status ?? 500, message: cause?.status ? cause.message ?? "Acesso negado." : "Falha interna." };
}
