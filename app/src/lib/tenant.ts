import { auth } from "@/lib/auth";
import { prisma, getTenantPrisma } from "@/lib/db";
import { cookies } from "next/headers";
import type { UserSession, Papel } from "@/types";
import { isActiveLegacySession } from "@/lib/access-policy";
import { emailEqualsNormalized } from "@/lib/email";

/**
 * Valida a sessão e retorna o Prisma Client já escopado ao tenant.
 * Para admin_global: verifica se há um "tenant override" via cookie,
 * permitindo visualizar dados de qualquer tenant.
 */
export async function requireSession() {
  const session = await auth();
  const user = session?.user as any;
  if (!user?.id) {
    throw Object.assign(new Error("Não autenticado"), { status: 401 });
  }

  // Admin global pode operar em qualquer tenant via cookie
  // O JWT pode estar desatualizado; estado, papel e tenant de origem vêm do banco.
  const dbUser = await prisma.usuario.findUnique({
    where: { id: user.id },
    select: { papel: true, ativo: true, tenantId: true, nome: true, email: true, tenant: { select: { nome: true, ativo: true } } },
  });

  // Revogação de usuário ou tenant tem efeito mesmo em sessões já emitidas.
  if (!dbUser || !isActiveLegacySession(dbUser)) {
    throw Object.assign(new Error("Não autenticado"), { status: 401 });
  }

  const papelAtual = dbUser.papel as Papel;
  let activeTenantId = dbUser.tenantId;
  let activeTenantNome = dbUser.tenant.nome;

  // Mecanismo temporário até TenantMembership/SupportGrant. Admin Global ainda
  // pode escolher outro tenant ativo; admin/membro permanecem no de origem.
  let tenantSelecionado = true;

  if (papelAtual === "admin_global") {
    const cookieStore = await cookies();
    const override = cookieStore.get("tenant_override")?.value;
    if (override) {
      const tenant = await prisma.tenant.findUnique({ where: { id: override }, select: { id: true, nome: true, ativo: true } });
      if (tenant && tenant.ativo) {
        activeTenantId = tenant.id;
        activeTenantNome = tenant.nome;
        tenantSelecionado = true;
      }
    }
  }

  const db = getTenantPrisma(activeTenantId);
  return {
    db,
    baseTenantId: dbUser.tenantId,
    session: {
      id:         user.id        as string,
      nome:       dbUser.nome,
      email:      dbUser.email,
      papel:      papelAtual,
      tenantId:   activeTenantId,
      tenantNome: activeTenantNome,
      tenantSelecionado,
    } satisfies UserSession,
  };
}

/**
 * Igual ao requireSession, mas exige um tenant selecionado explicitamente.
 * Use em rotas de ESCRITA (create/import/update em massa) para impedir que
 * o admin_global grave dados sem ter escolhido um tenant — o que os enviaria
 * ao tenant pessoal dele por engano. Lança 409 quando não há tenant selecionado.
 */
export async function requireEscrita() {
  const ctx = await requireSession();
  if (!ctx.session.tenantSelecionado) {
    throw Object.assign(
      new Error("Selecione um tenant antes de gravar dados. Use o seletor de empresa (admin global)."),
      { status: 409 }
    );
  }
  return ctx;
}
/**
 * Retorna o tenant_id do usuário logado a partir da session.
 * Use em qualquer Server Component ou API Route para garantir
 * que as queries sejam sempre filtradas pelo tenant correto.
 */
export async function getTenantId(): Promise<string> {
  return (await requireSession()).session.tenantId;
}

/**
 * Retorna a session completa com dados do tenant e papel do usuário.
 */
export async function getSession(): Promise<UserSession> {
  return (await requireSession()).session;
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
  const count = await prisma.usuario.count({ where: { email: emailEqualsNormalized(email) } });
  return count > 0;
}
