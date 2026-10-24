// Pure planning only. No database client, password material, grants or writes.
export function planIdentities(users, existing = []) {
  const normalize = value => String(value ?? '').trim().toLowerCase();
  const ordered = [...users].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const tenantIds = [...new Set(ordered.map(u => u.tenantId))].sort();
  const groups = new Map();
  for (const user of ordered) {
    const email = normalize(user.email);
    const key = email || `invalid:${user.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(user);
  }
  const result = [];
  for (const [email, rows] of groups) {
    const reasons = [];
    const categories = new Set();
    const tenants = new Set(rows.map(r => r.tenantId));
    const identities = existing.filter(i => normalize(i.email) === email);
    const invalid = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (tenants.size > 1) { categories.add('B'); reasons.push('MULTIPLE_TENANTS'); }
    if (rows.some(r => ['admin', 'admin_global'].includes(r.role))) {
      categories.add('C'); reasons.push('ADMINISTRATIVE_ROLE_REQUIRES_EXPLICIT_DECISION');
    }
    if (invalid || tenants.size < rows.length || identities.length > 1 || rows.some(r => !['admin_global','admin','membro'].includes(r.role))) {
      categories.add('D'); reasons.push('INVALID_EMAIL_DUPLICATE_IN_TENANT_OR_UNKNOWN_ROLE');
    }
    if (identities.length) reasons.push('EXISTING_IDENTITY_DO_NOT_OVERWRITE_OR_GRANT');
    if (rows.some(r => !r.active || !r.tenantActive)) reasons.push('INACTIVE_USER_OR_TENANT');
    if (rows.some(r => Number(r.crossTenantAuthorship) > 0)) reasons.push('PRESERVE_HISTORICAL_AUTHORSHIP');
    if (!categories.size && rows.every(r => r.active && r.tenantActive) && identities.length === 0) categories.add('A');
    // Even A is only a candidate. Ownership, password choice, profiles and grants require review.
    categories.add('E');
    result.push({
      group: `G${String(result.length + 1).padStart(3, '0')}`,
      categories: [...categories].sort(), reasons,
      users: rows.map(r => ({
        reference: `U${String(ordered.indexOf(r) + 1).padStart(3, '0')}`,
        tenant: `T${String(tenantIds.indexOf(r.tenantId) + 1).padStart(3, '0')}`,
        role: r.role, active: r.active, tenantActive: r.tenantActive,
        authorship: Number(r.authorship ?? 0), crossTenantAuthorship: Number(r.crossTenantAuthorship ?? 0),
      })),
      existingIdentityCount: identities.length,
      proposedWrites: [],
      decisionRequired: 'VERIFY_PERSON_AND_CREDENTIAL_FLOW_THEN_APPROVE_EACH_GRANT_SEPARATELY',
    });
  }
  return {
    mode: 'READ_ONLY_PLAN', groups: result,
    summary: Object.fromEntries(['A','B','C','D','E'].map(c => [c, result.filter(g => g.categories.includes(c)).length])),
    writes: 0, inferredOwners: 0, inferredPlatformAdmins: 0, inferredMemberships: 0,
    platformAdminImpliesTenantAccess: false,
  };
}
