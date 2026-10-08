import { normalizeEmail } from "../../src/lib/email.ts";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Never infer ownership of an existing identity from an email alone. */
export function buildPlatformAdminPlan(users, identities, maps) {
  const globals = users.filter(user => user.papel === "admin_global");
  const emailCounts = new Map();
  for (const user of users) {
    const email = normalizeEmail(user.email ?? "");
    emailCounts.set(email, (emailCounts.get(email) ?? 0) + 1);
  }
  const identityGroups = new Map();
  for (const identity of identities) {
    const email = normalizeEmail(identity.email ?? "");
    identityGroups.set(email, [...(identityGroups.get(email) ?? []), identity]);
  }
  const mapsByUserId = new Map(maps.map(map => [map.legacyUsuarioId, map]));
  const plan = {
    safeCreate: [], alreadyMapped: [], manualReview: [], conflict: [], incomplete: [],
  };

  for (const user of globals) {
    const email = normalizeEmail(user.email ?? "");
    if (!emailPattern.test(email) || !user.nome?.trim() || !user.senhaHash?.trim() ||
        !user.tenantId || !user.tenant) {
      plan.incomplete.push(user);
      continue;
    }
    if (emailCounts.get(email) !== 1) {
      plan.manualReview.push(user);
      continue;
    }
    if ((identityGroups.get(email)?.length ?? 0) > 1) {
      plan.manualReview.push(user);
      continue;
    }

    // Inactive legacy user or inactive origin tenant must not gain live platform access.
    const status = user.ativo && user.tenant.ativo ? "ACTIVE" : "INACTIVE";
    const map = mapsByUserId.get(user.id);
    const byEmail = identityGroups.get(email)?.[0];
    if (!map) {
      if (byEmail) plan.manualReview.push(user);
      else plan.safeCreate.push({ user, email, status });
      continue;
    }

    const identity = map.identity;
    if (map.tenantId !== user.tenantId || map.membershipId || !identity ||
        identity.id !== map.identityId || byEmail?.id !== identity.id ||
        identity.email !== email || identity.nome !== user.nome.trim() ||
        identity.senhaHash !== user.senhaHash || identity.status !== status) {
      plan.conflict.push(user);
      continue;
    }

    const platform = identity.platformAdmin;
    if (map.platformAdminId) {
      if (platform?.id === map.platformAdminId && platform.identityId === identity.id &&
          platform.status === status) plan.alreadyMapped.push(user);
      else plan.conflict.push(user);
    } else {
      // The database requires one target per mapping. A global mapping without
      // PlatformAdmin is malformed or business-scoped and needs explicit review.
      plan.conflict.push(user);
    }
  }

  const report = {
    legacyGlobal: globals.length,
    activeLegacy: globals.filter(user => user.ativo).length,
    inactiveLegacy: globals.filter(user => !user.ativo).length,
    withoutMapping: globals.filter(user => !mapsByUserId.has(user.id)).length,
    existingMemberships: globals.filter(user => {
      const map = mapsByUserId.get(user.id);
      return (map?.identity?.memberships?.length ?? 0) > 0;
    }).length,
    safeCreate: plan.safeCreate.length,
    alreadyMapped: plan.alreadyMapped.length,
    manualReview: plan.manualReview.length,
    conflict: plan.conflict.length,
    incomplete: plan.incomplete.length,
  };
  return { ...plan, report };
}
