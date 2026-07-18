import { auth } from "@/lib/auth";
import { prisma, getTenantPrisma } from "@/lib/db";
import type { UserSession, Papel } from "@/types";

/**
 * Valida a sessão e retorna o Prisma Client já escopado ao tenant.
 * Use em todas as rotas de API para garantir isolamento de dados.
 *
 * @example
 * const { db, session } = await requireSession();
 * const rows = await db.lancamento.findMany(); // ← tenantId já injetado!
 *
 * @throws NextResponse 401 se não autenticado — capture e retorne diretamente.
 */
export async function requireSession() {
  const session = await auth();
  const user = session?.user as any;
  if (!user?.tenantId) {
    // Lança um objeto que pode ser retornado direto na rota
    throw Object.assign(new Error("Não autenticado"), { status: 401 });
  }
  const db = getTenantPrisma(user.tenantId as string);
  return {
    db,
    session: {
      id:         user.id        as string,
      nome:       user.name      as string ?? "",
      email:      user.email     as string ?? "",
      papel:      user.papel     as Papel,
      tenantId:   user.tenantId  as string,
      tenantNome: user.tenantNome as string,
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
