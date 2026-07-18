import { auth } from "@/lib/auth";
import { prisma, getTenantPrisma } from "@/lib/db";
import { cookies } from "next/headers";
import type { UserSession, Papel } from "@/types";

/**
 * Valida a sessão e retorna o Prisma Client já escopado ao tenant.
 * Para admin_global: verifica se há um "tenant override" via cookie,
 * permitindo visualizar dados de qualquer tenant.
 */
export async function requireSession() {
  const session = await auth();
  const user = session?.user as any;
  if (!user?.tenantId) {
    throw Object.assign(new Error("Não autenticado"), { status: 401 });
  }

  // Admin global pode operar em qualquer tenant via cookie
  let activeTenantId = user.tenantId as string;
  let activeTenantNome = user.tenantNome as string;

  // Verificar papel direto do banco (JWT pode estar desatualizado)
  const dbUser = await prisma.usuario.findUnique({ where: { id: user.id }, select: { papel: true } });
  const papelAtual = (dbUser?.papel || user.papel) as string;

  if (papelAtual === "admin_global") {
    const cookieStore = await cookies();
    const override = cookieStore.get("tenant_override")?.value;
    if (override) {
      const tenant = await prisma.tenant.findUnique({ where: { id: override }, select: { id: true, nome: true, ativo: true } });
      if (tenant && tenant.ativo) {
        activeTenantId = tenant.id;
        activeTenantNome = tenant.nome;
      }
    }
  }

  const db = getTenantPrisma(activeTenantId);
  return {
    db,
    session: {
      id:         user.id        as string,
      nome:       user.name      as string ?? "",
      email:      user.email     as string ?? "",
      papel:      user.papel     as Papel,
      tenantId:   activeTenantId,
      tenantNome: activeTenantNome,
    } satisfies UserSession,
  };
}
/**
 * Retorna o tenant_id do usuário logado a partir da session.
 * Use em qualquer Server Component ou API Route para garantir
 * que as queries sejam sempre filtradas pelo tenant correto.
 */
export async function getTenantId(): Promise<string> {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Não autenticado");
  }
  return (session.user as any).tenantId as string;
}

/**
 * Retorna a session completa com dados do tenant e papel do usuário.
 */
export async function getSession(): Promise<UserSession> {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Não autenticado");
  }
  const user = session.user as any;
  return {
    id: user.id,
    nome: user.name ?? "",
    email: user.email ?? "",
    papel: user.papel,
    tenantId: user.tenantId,
    tenantNome: user.tenantNome,
  };
}

/**
 * Verifica se o usuário tem papel de admin ou admin_global.
 * Use em rotas que só admins devem acessar.
 */
export async function requireAdmin() {
  const { db, session } = await requireSession();
  if (session.papel !== "admin" && session.papel !== "admin_global") {
    throw Object.assign(new Error("Acesso negado"), { status: 403 });
  }
  return { db, session };
}

/**
 * Verifica se o usuário logado é admin global (o Ricardo).
 */
export async function isAdminGlobal(): Promise<boolean> {
  try {
    const session = await getSession();
    return session.papel === "admin_global";
  } catch {
    return false;
  }
}

/**
 * Hash de senha para criação de usuários (bcrypt, 12 rounds)
 */
export async function hashSenha(senha: string): Promise<string> {
  const bcrypt = await import("bcryptjs");
  return bcrypt.hash(senha, 12);
}

/**
 * Verifica se um email já existe em qualquer tenant
 */
export async function emailExiste(email: string): Promise<boolean> {
  const count = await prisma.usuario.count({ where: { email } });
  return count > 0;
}
