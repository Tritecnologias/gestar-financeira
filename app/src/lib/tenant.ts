import { auth, legacyAuthEnabled } from "@/lib/auth";
import { prisma, getTenantPrisma } from "@/lib/db";
import { cookies, headers } from "next/headers";
import type { UserSession, Papel } from "@/types";
import { isActiveLegacySession } from "@/lib/access-policy";
import { emailEqualsNormalized } from "@/lib/email";
import { requireAcceptedTerms } from "@/lib/terms";
import { expireSupportGrant } from "@/lib/support-grants";
import { supportRequestAllowed } from "@/lib/support-policy";
import { writeAudit } from "@/lib/audit";

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
  if (identity?.status === "INACTIVE") {
    await writeAudit(prisma, { actorIdentityId: identity.id, accessMode: "SYSTEM",
      action: "IDENTITY_DISABLED_ACCESS_ATTEMPT", resourceType: "AuthIdentity",
      resourceId: identity.id, result: "DENIED" }).catch(() => {});
  }
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
 * Mesmo no modo legado de rollback, o contexto empresarial fica no tenant de origem.
 */
export async function requireSession(options: { allowPendingTerms?: boolean } = {}): Promise<{
  db: ReturnType<typeof getTenantPrisma>; baseTenantId: string; session: UserSession;
}> {
  const session = await auth();
  const user = session?.user as any;
  if (!user?.id) {
    throw accessError("Não autenticado", 401);
  }

  if (!legacyAuthEnabled) {
    const identity = await getIdentityAccess(user);
    const memberships = identity.memberships;
    const cookieStore = await cookies();
    const supportCookie = cookieStore.get("support_context")?.value;
    const supportPrefix = `${identity.id}:${identity.loginNonce}:`;
    if (supportCookie?.startsWith(supportPrefix)) {
      if (identity.platformAdmin?.status !== "ACTIVE") throw accessError("Acesso de suporte revogado", 403);
      const grantId = supportCookie.slice(supportPrefix.length);
      const grant = await prisma.supportGrant.findUnique({
        where: { id: grantId },
        select: { id: true, tenantId: true, platformAdminIdentityId: true, status: true,
          modules: true, accessLevel: true, startsAt: true, expiresAt: true,
          tenant: { select: { nome: true, ativo: true } } },
      });
      if (!grant || grant.platformAdminIdentityId !== identity.id || !grant.tenant.ativo ||
          memberships.some(m => m.tenantId === grant.tenantId)) {
        throw accessError("Contexto de suporte indisponível; selecione um vínculo normal ou outro grant", 409);
      }
      if (grant.status === "ACTIVE" && grant.expiresAt && grant.expiresAt <= new Date()) {
        await expireSupportGrant(grant.id, grant.tenantId, grant.expiresAt);
        throw accessError("Acesso de suporte expirado", 409);
      }
      if (grant.status !== "ACTIVE" || !grant.startsAt || grant.startsAt > new Date() || !grant.expiresAt) {
        await writeAudit(prisma, { tenantId: grant.tenantId, actorIdentityId: identity.id,
          supportGrantId: grant.id, accessMode: "SUPPORT_GRANT", action: "SESSION_BLOCKED",
          resourceType: "SupportGrant", resourceId: grant.id, result: "DENIED",
          metadata: { status: grant.status } }).catch(() => {});
        throw accessError("Acesso de suporte revogado ou ainda não autorizado", 409);
      }
      const requestHeaders = await headers();
      const path = requestHeaders.get("x-10s-request-path") ?? "";
      const method = requestHeaders.get("x-10s-request-method") ?? "";
      if (!supportRequestAllowed(path, method, grant.modules, grant.accessLevel)) {
        await writeAudit(prisma, { tenantId: grant.tenantId, actorIdentityId: identity.id,
          supportGrantId: grant.id, accessMode: "SUPPORT_GRANT", action: "SUPPORT_ACTION_DENIED",
          resourceType: "Route", resourceId: path, result: "DENIED",
          metadata: { method } });
        throw accessError("Recurso fora do escopo do suporte autorizado", 403);
      }
      const context = {
        db: getTenantPrisma(grant.tenantId), baseTenantId: grant.tenantId,
        session: {
          id: `support:${identity.id}`, identityId: identity.id, authMode: "identity",
          platformAdmin: true, accessSource: "SUPPORT_GRANT", supportGrantId: grant.id,
          supportLevel: grant.accessLevel, supportModules: grant.modules,
          supportExpiresAt: grant.expiresAt.toISOString(), nome: identity.nome, email: identity.email,
          papel: "membro" as Papel, tenantId: grant.tenantId, tenantNome: grant.tenant.nome,
          tenantSelecionado: true,
        } satisfies UserSession,
      };
      if (!options.allowPendingTerms) await requireAcceptedTerms(context.session);
      if (!options.allowPendingTerms && path.startsWith("/api/") &&
          !path.startsWith("/api/access/") && !path.startsWith("/api/terms/")) {
        await writeAudit(prisma, { tenantId: grant.tenantId, actorIdentityId: identity.id,
          supportGrantId: grant.id, accessMode: "SUPPORT_GRANT", action: method === "GET" ?
            "SUPPORT_ACTION_EXECUTED" : "SUPPORT_ACTION_AUTHORIZED",
          resourceType: "Route", resourceId: path, metadata: { method } });
      }
      return context;
    }
    const selected = cookieStore.get("tenant_context")?.value;
    const cookiePrefix = `${identity.id}:${identity.loginNonce}:`;
    const selectedTenantId = selected?.startsWith(cookiePrefix)
      ? selected.slice(cookiePrefix.length) : null;
    if (selectedTenantId && !memberships.some(m => m.tenantId === selectedTenantId)) {
      const inactive = await prisma.tenantMembership.findFirst({ where: { identityId: identity.id, tenantId: selectedTenantId }, select: { id: true } });
      if (inactive) await writeAudit(prisma, { tenantId: selectedTenantId, actorIdentityId: identity.id,
        accessMode: "MEMBERSHIP", action: "MEMBERSHIP_INACTIVE_ACCESS_ATTEMPT",
        resourceType: "TenantMembership", resourceId: inactive.id, result: "DENIED" });
      throw accessError("Contexto revogado; selecione outro tenant", 409);
    }
    if (memberships.length === 0) throw accessError("Nenhum tenant ativo disponível para esta identidade", 403);
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
    if (!mapping?.legacyUsuario.ativo) {
      await writeAudit(prisma, { tenantId: membership.tenantId, actorIdentityId: identity.id,
        actorMembershipId: membership.id, accessMode: "MEMBERSHIP", action: "SESSION_BLOCKED",
        resourceType: "TenantMembership", resourceId: membership.id, result: "DENIED" }).catch(() => {});
      throw accessError("Vínculo legado pendente ou inativo", 409);
    }
    const papelAtual: Papel = membership.role === "MEMBER" ? "membro" : "admin";
    const context = {
      db: getTenantPrisma(membership.tenantId),
      baseTenantId: membership.tenantId,
      session: {
        id: mapping.legacyUsuarioId,
        identityId: identity.id,
        membershipId: membership.id,
        membershipRole: membership.role,
        platformAdmin: identity.platformAdmin?.status === "ACTIVE",
        accessSource: "MEMBERSHIP",
        authMode: "identity",
        nome: identity.nome,
        email: identity.email,
        papel: papelAtual,
        tenantId: membership.tenantId,
        tenantNome: membership.tenant.nome,
        tenantSelecionado: true,
      } satisfies UserSession,
    };
    if (!options.allowPendingTerms) await requireAcceptedTerms(context.session);
    return context;
  }

  if (user.authMode !== "legacy") throw accessError("Não autenticado", 401);

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
  const activeTenantId = dbUser.tenantId;
  const activeTenantNome = dbUser.tenant.nome;
  const tenantSelecionado = true;

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
  if (ctx.session.accessSource === "SUPPORT_GRANT" && ctx.session.supportLevel !== "OPERATIONAL") {
    throw accessError("Acesso de suporte somente leitura", 403);
  }
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
export async function requireTenantMembership() {
  const context = await requireSession();
  if (context.session.accessSource === "SUPPORT_GRANT") throw accessError("Membership empresarial necessário", 403);
  return context;
}

/** Explicit alias for callers that accept either membership or scoped support. */
export const requireTenantAccess = requireSession;

/** Administração empresarial requer o papel do membership, não PlatformAdmin. */
export async function requireTenantAdmin() {
  const { db, session } = await requireTenantMembership();
  if (session.papel !== "admin" && !(legacyAuthEnabled && session.papel === "admin_global")) {
    throw Object.assign(new Error("Acesso negado"), { status: 403 });
  }
  return { db, session };
}

/** Alias de compatibilidade para consumidores anteriores ao ACCESS-3B. */
export const requireAdmin = requireTenantAdmin;

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
