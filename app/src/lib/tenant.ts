import { auth, legacyAuthEnabled } from "@/lib/auth";
import { prisma, getTenantPrisma } from "@/lib/db";
import { cookies } from "next/headers";
import type { UserSession, Papel } from "@/types";
import { isActiveLegacySession } from "@/lib/access-policy";
import { emailEqualsNormalized } from "@/lib/email";

function accessError(message: string, status: number) {
  return Object.assign(new Error(message), { status });
}

/** Revalida identidade, memberships e tenants a cada solicitação relevante. */
export async function getIdentityAccess(authenticatedUser?: { id?: string; authMode?: string; loginNonce?: string }) {
  const user = authenticatedUser ?? (await auth())?.user as { id?: string; authMode?: string; loginNonce?: string } | undefined;
  if (!user?.id || user.authMode !== "identity" || !user.loginNonce || legacyAuthEnabled) {
    throw accessError("Não autenticado", 401);
  }
  const identity = await prisma.authIdentity.findUnique({
    where: { id: user.id },
    select: {
      id: true, nome: true, email: true, status: true,
      platformAdmin: { select: { status: true } },
      memberships: {
        where: { status: "ACTIVE", tenant: { ativo: true } },
        select: { id: true, tenantId: true, role: true, tenant: { select: { nome: true } } },
        orderBy: { tenant: { nome: "asc" } },
      },
    },
  });
  if (!identity || identity.status !== "ACTIVE") throw accessError("Não autenticado", 401);
  return { ...identity, loginNonce: user.loginNonce };
}

export async function requirePlatformAdmin() {
  if (legacyAuthEnabled) {
    const context = await requireSession();
    if (context.session.papel !== "admin_global") throw accessError("Acesso negado", 403);
    return { identityId: null, legacySession: context.session };
  }
  const identity = await getIdentityAccess();
  if (identity.platformAdmin?.status !== "ACTIVE") throw accessError("Acesso negado", 403);
  return { identityId: identity.id, legacySession: null };
}

/**
 * Valida a sessão e retorna o Prisma Client escopado ao tenant efetivo.
 * O override de admin_global existe somente no modo legado explícito.
 */
export async function requireSession() {
  const session = await auth();
  const user = session?.user as any;
  if (!user?.id) {
    throw accessError("Não autenticado", 401);
  }

  if (!legacyAuthEnabled) {
    const identity = await getIdentityAccess(user);
    const memberships = identity.memberships;
    if (memberships.length === 0) throw accessError("Nenhum tenant ativo disponível para esta identidade", 403);
    const cookieStore = await cookies();
    const selected = cookieStore.get("tenant_context")?.value;
    const cookiePrefix = `${identity.id}:${identity.loginNonce}:`;
    const selectedTenantId = selected?.startsWith(cookiePrefix)
      ? selected.slice(cookiePrefix.length) : null;
    if (selectedTenantId && !memberships.some(m => m.tenantId === selectedTenantId)) {
      throw accessError("Contexto revogado; selecione outro tenant", 409);
    }
    const membership = selectedTenantId
      ? memberships.find(m => m.tenantId === selectedTenantId)
      : memberships.length === 1 ? memberships[0] : undefined;
    if (!membership) throw accessError("Selecione um tenant ativo", 409);

    // Usuario continua sendo a chave histórica de autoria e layouts. Sem mapping
    // explícito não há contexto empresarial operacional seguro.
    const mapping = await prisma.legacyUserAccessMap.findFirst({
      where: { identityId: identity.id, tenantId: membership.tenantId, membershipId: membership.id },
      select: { legacyUsuarioId: true, legacyUsuario: { select: { ativo: true } } },
    });
    if (!mapping?.legacyUsuario.ativo) throw accessError("Vínculo legado pendente ou inativo", 409);
    const papelAtual: Papel = membership.role === "MEMBER" ? "membro" : "admin";
    return {
      db: getTenantPrisma(membership.tenantId),
      baseTenantId: membership.tenantId,
      session: {
        id: mapping.legacyUsuarioId,
        identityId: identity.id,
        membershipId: membership.id,
        membershipRole: membership.role,
        platformAdmin: identity.platformAdmin?.status === "ACTIVE",
        authMode: "identity",
        nome: identity.nome,
        email: identity.email,
        papel: papelAtual,
        tenantId: membership.tenantId,
        tenantNome: membership.tenant.nome,
        tenantSelecionado: true,
      } satisfies UserSession,
    };
  }

  if (user.authMode !== "legacy") throw accessError("Não autenticado", 401);

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
      authMode:   "legacy",
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
 * Igual ao requireSession, mas exige contexto empresarial válido para escrita.
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
