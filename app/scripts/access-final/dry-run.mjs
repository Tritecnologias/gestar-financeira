// ACCESS-FINAL: aggregate, read-only inventory for a future production window.
// Use a database credential with SELECT privileges only. Never print row data.
import { Client } from "pg";
import { buildAccess2Plan } from "../access2/analysis.mjs";
import { buildPlatformAdminPlan } from "../access3b/analysis.mjs";

const expected = process.argv.find(arg => arg.startsWith("--expect-database="))?.split("=", 2)[1];
if (!expected || !/^[a-zA-Z0-9_-]+$/.test(expected)) {
  throw new Error("Pass --expect-database=<database> to prevent running against an unintended database.");
}
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required; use a SELECT-only credential.");
const targetSchema = new URL(url).searchParams.get("schema");
if (targetSchema && !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(targetSchema)) {
  throw new Error("Invalid schema name.");
}
const client = new Client({ connectionString: url });
const scalar = async sql => Number((await client.query(sql)).rows[0].count);
const countBy = async (table, column) => (await client.query(
  `SELECT ${column} AS value, count(*)::int AS count FROM ${table} GROUP BY ${column} ORDER BY ${column}`,
)).rows.map(row => ({ value: row.value, count: row.count }));

try {
  await client.connect();
  await client.query("BEGIN READ ONLY");
  await client.query("SET LOCAL statement_timeout = '30s'");
  if (targetSchema) await client.query(`SET LOCAL search_path TO "${targetSchema}"`);
  const context = (await client.query("SELECT current_database() AS database, current_setting('transaction_read_only') AS read_only")).rows[0];
  if (context.database !== expected || context.read_only !== "on") throw new Error("Database or read-only transaction mismatch.");
  const required = ["tenants", "usuarios", "auth_identities", "tenant_memberships", "platform_admins", "legacy_user_access_maps"];
  const present = (await client.query("SELECT to_regclass(name) IS NOT NULL AS present FROM unnest($1::text[]) AS name", [required])).rows;
  if (present.some(row => !row.present)) throw new Error("ACCESS schema is incomplete; apply approved migrations before this dry-run.");

  const tenants = (await client.query("SELECT id, ativo FROM tenants")).rows;
  const tenantsById = new Map(tenants.map(tenant => [tenant.id, tenant]));
  const users = (await client.query("SELECT id, tenant_id, nome, email, senha_hash, papel, ativo FROM usuarios")).rows.map(row => ({
    id: row.id, tenantId: row.tenant_id, nome: row.nome, email: row.email,
    senhaHash: row.senha_hash, papel: row.papel, ativo: row.ativo,
    tenant: tenantsById.get(row.tenant_id) ?? null,
  }));
  const identityRows = (await client.query("SELECT id, email, nome, senha_hash, status FROM auth_identities")).rows;
  const platformRows = (await client.query("SELECT id, identity_id, status FROM platform_admins")).rows;
  const membershipRows = (await client.query("SELECT id, identity_id, tenant_id, role, status FROM tenant_memberships")).rows;
  const platformByIdentity = new Map(platformRows.map(platform => [platform.identity_id, platform]));
  const membershipsByIdentity = new Map();
  for (const membership of membershipRows) {
    const group = membershipsByIdentity.get(membership.identity_id) ?? [];
    group.push({ id: membership.id });
    membershipsByIdentity.set(membership.identity_id, group);
  }
  const membershipsById = new Map(membershipRows.map(membership => [membership.id, membership]));
  const identities = identityRows.map(row => ({
    id: row.id, email: row.email, nome: row.nome, senhaHash: row.senha_hash, status: row.status,
    platformAdmin: platformByIdentity.get(row.id)
      ? { id: platformByIdentity.get(row.id).id,
          identityId: row.id, status: platformByIdentity.get(row.id).status }
      : null,
    memberships: membershipsByIdentity.get(row.id) ?? [],
  }));
  const identitiesById = new Map(identities.map(identity => [identity.id, identity]));
  const maps = (await client.query("SELECT legacy_usuario_id, identity_id, tenant_id, membership_id, platform_admin_id FROM legacy_user_access_maps")).rows.map(row => ({
    legacyUsuarioId: row.legacy_usuario_id, identityId: row.identity_id, tenantId: row.tenant_id,
    membershipId: row.membership_id, platformAdminId: row.platform_admin_id,
    identity: identitiesById.get(row.identity_id) ?? null,
    membership: membershipsById.get(row.membership_id)
      ? { id: row.membership_id, identityId: row.identity_id, tenantId: row.tenant_id,
          role: membershipsById.get(row.membership_id).role,
          status: membershipsById.get(row.membership_id).status }
      : null,
  }));
  const normalized = email => typeof email === "string" ? email.trim().toLowerCase() : "";
  const groups = new Map();
  const tenantGroups = new Map();
  for (const user of users) {
    const key = normalized(user.email);
    const group = groups.get(key) ?? [];
    group.push(user);
    groups.set(key, group);
    const tenantKey = `${user.tenantId}\0${key}`;
    tenantGroups.set(tenantKey, (tenantGroups.get(tenantKey) ?? 0) + 1);
  }
  const duplicates = [...groups.values()].filter(group => group.length > 1);
  const hashDiversity = {};
  for (const group of duplicates) {
    const distinct = new Set(group.map(user => user.senhaHash)).size;
    hashDiversity[distinct] = (hashDiversity[distinct] ?? 0) + 1;
  }
  const owners = new Set(membershipRows.filter(row => row.role === "OWNER" && row.status === "ACTIVE").map(row => row.tenant_id));
  const business = buildAccess2Plan(users, identities, maps).report;
  const platform = buildPlatformAdminPlan(users, identities, maps).report;
  const report = {
    database: context.database, readOnly: true,
    tenants: { total: tenants.length, active: tenants.filter(row => row.ativo).length,
      inactive: tenants.filter(row => !row.ativo).length,
      activeWithoutOwner: tenants.filter(row => row.ativo && !owners.has(row.id)).length },
    legacyUsers: { total: users.length, active: users.filter(row => row.ativo).length,
      inactive: users.filter(row => !row.ativo).length, adminGlobal: users.filter(row => row.papel === "admin_global").length,
      roles: await countBy("usuarios", "papel") },
    normalizedEmails: { unique: groups.size - (groups.has("") ? 1 : 0),
      duplicateGlobalGroups: duplicates.length,
      duplicateWithinTenantGroups: [...tenantGroups.values()].filter(count => count > 1).length,
      duplicateGroupsWithDifferentNames: duplicates.filter(group => new Set(group.map(user => user.nome?.trim())).size > 1).length,
      distinctHashCountByDuplicateGroup: hashDiversity },
    access: { identities: identities.length, memberships: membershipRows.length,
      platformAdmins: platformRows.length, membershipRoles: await countBy("tenant_memberships", "role"),
      mappings: maps.length },
    backfill: { business, platform },
  };
  await client.query("COMMIT");
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  console.error(`ACCESS-FINAL dry-run failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
