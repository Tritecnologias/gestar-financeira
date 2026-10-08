// Guards do modo legado e da compatibilidade administrativa de Usuario.
export function canManageLegacyUser(
  actor: { papel: string; tenantId: string },
  target: { papel: string; tenantId: string },
): boolean {
  return actor.tenantId === target.tenantId &&
    (actor.papel === "admin_global" || (actor.papel === "admin" && target.papel !== "admin_global"));
}

export function canAssignLegacyRole(actorRole: string, requestedRole: string): boolean {
  void actorRole;
  return requestedRole === "admin" || requestedRole === "membro";
}

export function canUseActiveTenant(
  actorRole: string,
  actorTenantId: string,
  targetTenantId: string,
  targetActive: boolean,
): boolean {
  void actorRole;
  return targetActive && actorTenantId === targetTenantId;
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

export function tenantContextCookieOptions() {
  return tenantOverrideCookieOptions();
}
