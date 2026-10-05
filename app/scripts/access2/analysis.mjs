import { normalizeEmail } from "../../src/lib/email.ts";

const legacyRole = { admin: "ADMIN", membro: "MEMBER" };
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function buildAccess2Plan(users, identities, maps) {
  const groups = new Map();
  for (const user of users) {
    const email = typeof user.email === "string" ? normalizeEmail(user.email) : "";
    groups.set(email, [...(groups.get(email) ?? []), user]);
  }
  const identitiesByEmail = new Map(identities.map(identity => [identity.email, identity]));
  const mapsByUserId = new Map(maps.map(map => [map.legacyUsuarioId, map]));
  const plan = { safe: [], alreadyMapped: [], conflict: [], manualReview: [], incomplete: [] };
  const repeated = { groups: 0, differentNames: 0, differentHashes: 0, differentStates: 0, differentRoles: 0, multipleTenants: 0 };
  const dataQuality = { invalidEmail: 0, missingName: 0, missingHash: 0, missingTenant: 0, existingIdentityCollision: 0 };
  for (const user of users) {
    if (!emailPattern.test(typeof user.email === "string" ? normalizeEmail(user.email) : "")) dataQuality.invalidEmail++;
    if (!user.nome?.trim()) dataQuality.missingName++;
    if (!user.senhaHash?.trim()) dataQuality.missingHash++;
    if (!user.tenantId || !user.tenant) dataQuality.missingTenant++;
  }

  for (const [email, group] of groups) {
    if (group.length > 1) {
      repeated.groups++;
      const differentNames = new Set(group.map(user => user.nome?.trim())).size > 1;
      const differentHashes = new Set(group.map(user => user.senhaHash)).size > 1;
      const differentStates = new Set(group.map(user => user.ativo)).size > 1;
      const differentRoles = new Set(group.map(user => user.papel)).size > 1;
      const multipleTenants = new Set(group.map(user => user.tenantId)).size > 1;
      if (differentNames) repeated.differentNames++;
      if (differentHashes) repeated.differentHashes++;
      if (differentStates) repeated.differentStates++;
      if (differentRoles) repeated.differentRoles++;
      if (multipleTenants) repeated.multipleTenants++;
      // Even identical records across tenants need explicit identity approval.
      const bucket = differentNames || differentHashes || differentStates || differentRoles || !multipleTenants
        ? plan.conflict : plan.manualReview;
      bucket.push(...group);
      continue;
    }

    const user = group[0];
    if (!emailPattern.test(email) || !user.nome?.trim() || !user.senhaHash?.trim() ||
        !user.tenantId || !user.tenant) {
      plan.incomplete.push(user);
      continue;
    }
    // admin_global belongs to PlatformAdmin, never to business membership.
    if (user.papel === "admin_global") {
      plan.manualReview.push(user);
      continue;
    }
    const role = legacyRole[user.papel];
    if (!role) {
      plan.conflict.push(user);
      continue;
    }

    const map = mapsByUserId.get(user.id);
    if (map) {
      const expectedStatus = user.ativo ? "ACTIVE" : "INACTIVE";
      const identity = map.identity;
      const membership = map.membership;
      if (map.tenantId === user.tenantId && identity?.id === map.identityId &&
          identity.email === email && identity.nome === user.nome.trim() &&
          identity.senhaHash === user.senhaHash && identity.status === expectedStatus &&
          membership?.id === map.membershipId && membership.identityId === identity.id &&
          membership.tenantId === user.tenantId && membership.status === expectedStatus &&
          membership.role === role && !map.platformAdminId) {
        plan.alreadyMapped.push(user);
      } else {
        plan.conflict.push(user);
      }
      continue;
    }

    if (identitiesByEmail.has(email)) {
      // Never reuse an identity merely because the email happens to match.
      dataQuality.existingIdentityCollision++;
      plan.manualReview.push(user);
      continue;
    }
    plan.safe.push({ user, email, role, status: user.ativo ? "ACTIVE" : "INACTIVE" });
  }

  return {
    ...plan,
    report: {
      legacyUsers: users.length,
      normalizedUniqueEmails: groups.size - (groups.has("") ? 1 : 0),
      repeatedEmailGroups: repeated,
      dataQuality,
      safe: plan.safe.length,
      alreadyMapped: plan.alreadyMapped.length,
      conflict: plan.conflict.length,
      manualReview: plan.manualReview.length,
      incomplete: plan.incomplete.length,
    },
  };
}
