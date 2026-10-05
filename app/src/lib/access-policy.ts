// Guards for the current Usuario model. Membership based authorization replaces
// these when the identity migration is introduced.
export function canManageLegacyUser(
  actor: { papel: string; tenantId: string },
  target: { papel: string; tenantId: string },
): boolean {
  return actor.papel === "admin_global" ||
    (actor.papel === "admin" && actor.tenantId === target.tenantId && target.papel !== "admin_global");
}

export function canAssignLegacyRole(actorRole: string, requestedRole: string): boolean {
  return (requestedRole === "admin" || requestedRole === "membro") ||
    (actorRole === "admin_global" && requestedRole === "admin_global");
}

export function canUseActiveTenant(
  actorRole: string,
  actorTenantId: string,
  targetTenantId: string,
  targetActive: boolean,
): boolean {
  return targetActive && (actorRole === "admin_global" || actorTenantId === targetTenantId);
}

export function isActiveLegacySession(user: { ativo: boolean; tenant?: { ativo: boolean } } | null): boolean {
  return Boolean(user?.ativo && user.tenant?.ativo);
}

export function tenantOverrideCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge: 60 * 60 * 8,
    path: "/",
  };
}
