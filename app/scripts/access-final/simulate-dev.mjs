// Synthetic legacy -> ACCESS migration and backfill rehearsal. Local DEV only.
import { randomBytes, randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import bcrypt from "bcryptjs";
import { Client } from "pg";
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { buildAccess2Plan } from "../access2/analysis.mjs";
import { runPlatformAdminBackfill } from "../access3b/migration.mjs";

const source = new URL(process.env.DATABASE_URL || "");
if (source.hostname !== "127.0.0.1" || source.port !== "55432" || source.pathname !== "/gestar_vf_dev") {
  throw new Error("ACCESS-FINAL simulation requires isolated local DEV PostgreSQL on 127.0.0.1:55432.");
}
const schema = `accessfinal_test_${randomBytes(5).toString("hex")}`;
const isolated = new URL(source);
isolated.searchParams.set("schema", schema);
isolated.searchParams.set("sslmode", "disable");
const root = new Client({ connectionString: source.toString() });
let db, server, failureServer, nonDevServer, created = false;
const check = (label, condition) => { if (!condition) throw new Error(`FAIL ${label}`); checks.push(label); };
const checks = [];
const password = randomBytes(20).toString("hex");
const base = "http://127.0.0.1:3017";
const cookies = new Map();
const addCookies = response => { for (const line of response.headers.getSetCookie()) {
  const part = line.split(";", 1)[0]; const split = part.indexOf("=");
  if (split > 0) cookies.set(part.slice(0, split), part.slice(split + 1));
} };
const cookieHeader = () => [...cookies].map(([key, value]) => `${key}=${value}`).join("; ");
const get = path => fetch(`${base}${path}`, { headers: { Cookie: cookieHeader() }, redirect: "manual" });

try {
  await root.connect();
  await root.query(`CREATE SCHEMA "${schema}"`);
  created = true;
  // Never let an absent fixture table silently resolve to real DEV public data.
  await root.query(`SET search_path TO "${schema}"`);
  const migrationDir = join(process.cwd(), "prisma", "migrations");
  const migrationNames = [
    "0_legacy_baseline", "20261005_access_identity_membership", "20261005_access_profiles",
    "20261005_access_profiles_config_compat", "20261005_access_profiles_member_compat",
    "20261005_access4b_owner_events", "20261005_access4b_permissions",
    "20261005_access5a_versioned_terms", "20261005_access5a_z_integrity",
    "20261005_access5b_support_grants", "20261005_access5c_audit_events",
    "20261007_access_invitations",
  ];
  const onDisk = (await readdir(migrationDir, { withFileTypes: true }))
    .filter(entry => entry.isDirectory()).map(entry => entry.name);
  check("explicit migration sequence covers every folder", migrationNames.length === onDisk.length &&
    migrationNames.every(name => onDisk.includes(name)));
  // Probe the actual Prisma engine on a fresh schema, then discard it. Historical
  // migration names may sort differently from their dependency order.
  const probeSchema = `accessfinal_probe_${randomBytes(5).toString("hex")}`;
  const probeUrl = new URL(isolated);
  probeUrl.searchParams.set("schema", probeSchema);
  let freshDeploySucceeded = false;
  await root.query(`CREATE SCHEMA "${probeSchema}"`);
  try {
    const probe = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"],
      { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: probeUrl.toString() },
        encoding: "utf8", timeout: 90000 });
    freshDeploySucceeded = probe.status === 0;
    if (freshDeploySucceeded) {
      const applied = (await root.query(`SELECT migration_name FROM "${probeSchema}"._prisma_migrations WHERE finished_at IS NOT NULL ORDER BY finished_at`)).rows.map(row => row.migration_name);
      check("Prisma deploy respects ACCESS dependency order", JSON.stringify(applied) === JSON.stringify(migrationNames));
    }
  } finally {
    await root.query(`DROP SCHEMA IF EXISTS "${probeSchema}" CASCADE`);
  }
  console.log(`Prisma fresh-schema migrate deploy: ${freshDeploySucceeded ? "PASS" : "FAIL"}`);
  check("Prisma migrate deploy succeeds on a fresh isolated schema", freshDeploySucceeded);
  await root.query(await readFile(join(migrationDir, migrationNames[0], "migration.sql"), "utf8"));
  const highId = randomUUID(), homeId = randomUUID();
  const hash = await bcrypt.hash(password, 10);
  const otherHash = await bcrypt.hash(`${password}-different`, 10);
  const tenantRows = [
    [highId, "HIGH ACCESS-FINAL", `high-final-${schema}`, `high-${schema}@localhost.invalid`],
    [homeId, "THE HOME ACCESS-FINAL", `home-final-${schema}`, `home-${schema}@localhost.invalid`],
  ];
  for (const row of tenantRows) await root.query(
    "INSERT INTO tenants (id, nome, slug, email) VALUES ($1, $2, $3, $4)", row);
  const legacy = [
    [randomUUID(), highId, "Owner candidate", `owner-${schema}@localhost.invalid`, hash, "admin"],
    [randomUUID(), highId, "Member candidate", `member-${schema}@localhost.invalid`, hash, "membro"],
    [randomUUID(), homeId, "Home candidate", `home-${schema}@localhost.invalid`, hash, "membro"],
    [randomUUID(), highId, "Shared A", `shared-${schema}@localhost.invalid`, hash, "membro"],
    [randomUUID(), homeId, "Shared B", `shared-${schema}@localhost.invalid`, otherHash, "membro"],
    [randomUUID(), highId, "Platform candidate", `platform-${schema}@localhost.invalid`, hash, "admin_global"],
  ];
  for (const row of legacy) await root.query(
    "INSERT INTO usuarios (id, tenant_id, nome, email, senha_hash, papel) VALUES ($1, $2, $3, $4, $5, $6)", row);
  check("synthetic legacy seeded before ACCESS migrations", Number((await root.query("SELECT count(*)::int AS n FROM usuarios")).rows[0].n) === 6);
  for (const name of migrationNames.slice(1)) {
    try { await root.query(await readFile(join(migrationDir, name, "migration.sql"), "utf8")); }
    catch (error) { throw new Error(`Migration ${name} failed: ${error.message}`); }
  }
  check("all migrations applied in chronological order", migrationNames.length === 12);
  db = new PrismaClient({ adapter: new PrismaPg({ connectionString: isolated.toString() }, { schema }) });
  const loadBusinessPlan = async () => {
    const [users, identities, maps] = await Promise.all([
      db.usuario.findMany({ select: { id: true, tenantId: true, nome: true, email: true,
        senhaHash: true, papel: true, ativo: true, tenant: { select: { id: true, ativo: true } } } }),
      db.authIdentity.findMany({ select: { id: true, email: true } }),
      db.legacyUserAccessMap.findMany({ include: { identity: { select: { id: true, email: true, nome: true,
        senhaHash: true, status: true } }, membership: { select: { id: true, identityId: true,
        tenantId: true, role: true, status: true } } } }),
    ]);
    return buildAccess2Plan(users, identities, maps);
  };
  const before = await loadBusinessPlan();
  check("duplicate global email held for manual resolution", before.report.conflict === 2);
  check("business candidates and platform account separated", before.report.safe === 3 && before.report.manualReview === 1);
  await db.$transaction(async tx => {
    for (const { user, email, role, status } of before.safe) {
      const identity = await tx.authIdentity.create({ data: { email, nome: user.nome.trim(), senhaHash: user.senhaHash, status } });
      const membership = await tx.tenantMembership.create({ data: { identityId: identity.id,
        tenantId: user.tenantId, role, status } });
      await tx.legacyUserAccessMap.create({ data: { legacyUsuarioId: user.id,
        identityId: identity.id, tenantId: user.tenantId, membershipId: membership.id } });
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  const after = await loadBusinessPlan();
  check("business backfill idempotent and conflicts untouched", after.report.safe === 0 &&
    after.report.alreadyMapped === 3 && after.report.conflict === 2);
  const platformFirst = await runPlatformAdminBackfill(db);
  const platformSecond = await runPlatformAdminBackfill(db);
  check("explicit admin_global rule creates platform mapping once", platformFirst.changes.createdPlatformAdmins === 1 &&
    platformSecond.changes.createdPlatformAdmins === 0);
  check("no OWNER inferred", await db.tenantMembership.count({ where: { role: "OWNER" } }) === 0);
  check("legacy users preserved", await db.usuario.count() === 6);
  check("no business data or HOM-REAL in isolated schema", await db.lancamento.count() === 0);
  // Read-only inventory must classify the post-backfill state without leaking rows.
  const inventory = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/access-final/dry-run.mjs", "--expect-database=gestar_vf_dev"],
      { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: isolated.toString() }, stdio: ["ignore", "pipe", "pipe"] });
    let output = "", error = "";
    child.stdout.on("data", chunk => { output += chunk; });
    child.stderr.on("data", chunk => { error += chunk; });
    child.on("exit", code => code === 0 ? resolve(JSON.parse(output)) : reject(new Error(error.slice(-1000))));
  });
  check("read-only dry-run exposes only aggregate conflict counts", inventory.readOnly &&
    inventory.backfill.business.conflict === 2 && inventory.tenants.activeWithoutOwner === 2 &&
    !JSON.stringify(inventory).includes(password));

  // Explicit fixture values override .env.local, even when real SMTP is configured there.
  const simulatedEnv = { ...process.env, EMAIL_PROVIDER: "mock", APP_PUBLIC_URL: base,
    SMTP_HOST: "", SMTP_PORT: "", SMTP_SECURE: "", SMTP_USER: "", SMTP_PASSWORD: "",
    EMAIL_FROM_ADDRESS: "", EMAIL_FROM_NAME: "" };
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", "3017"],
    { cwd: process.cwd(), env: { ...simulatedEnv, DATABASE_URL: isolated.toString(),
      NEXTAUTH_URL: base, AUTH_TRUST_HOST: "true" }, stdio: ["ignore", "pipe", "pipe"] });
  for (let i = 0; i < 80; i++) {
    if (server.exitCode !== null) throw new Error("Isolated HTTP server exited.");
    try { if ((await fetch(`${base}/login`)).status === 200) break; } catch { /* starting */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  const csrfResponse = await get("/api/auth/csrf"); addCookies(csrfResponse);
  const { csrfToken } = await csrfResponse.json();
  const loginResponse = await fetch(`${base}/api/auth/callback/credentials`, { method: "POST", redirect: "manual",
    headers: { Cookie: cookieHeader(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken, email: legacy[0][3], password,
      callbackUrl: `${base}/selecionar-tenant` }) });
  addCookies(loginResponse);
  check("backfilled identity logs in over HTTP", cookieHeader().includes("authjs.session-token="));
  const singleChoices = await get("/api/tenants");
  check("single active membership is available without tenant selection", singleChoices.status === 200 &&
    (await singleChoices.json()).length === 1 && (await get("/inicio")).status === 200);
  const switchResponse = await fetch(`${base}/api/tenants/switch`, { method: "POST", redirect: "manual",
    headers: { Cookie: cookieHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ tenantId: highId }) });
  addCookies(switchResponse);
  check("backfilled membership selects own tenant", switchResponse.status === 200);
  const denied = await fetch(`${base}/api/tenants/switch`, { method: "POST", redirect: "manual",
    headers: { Cookie: cookieHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ tenantId: homeId }) });
  check("cannot switch to tenant without membership", denied.status === 403);
  // Role matrix and one-identity/two-tenant context are tested only in this schema.
  const opProfile = await db.accessProfile.create({ data: { tenantId: highId, nome: "FINANCEIRO OPERACIONAL",
    permissoes: ["fluxo.lancamentos.view", "fluxo.lancamentos.create", "fluxo.lancamentos.edit"] } });
  const managerProfile = await db.accessProfile.create({ data: { tenantId: homeId, nome: "FINANCEIRO GERENTE",
    permissoes: ["fluxo.lancamentos.view", "fluxo.visao.saldos", "fluxo.relatorios.view"] } });
  const readerProfile = await db.accessProfile.create({ data: { tenantId: highId, nome: "CONSULTA",
    permissoes: ["fluxo.lancamentos.view"] } });
  const rhProfile = await db.accessProfile.create({ data: { tenantId: highId, nome: "RH",
    permissoes: ["estrutura.pessoas.view"] } });
  const opIdentity = await db.authIdentity.findUnique({ where: { email: legacy[1][3] } });
  const opHigh = await db.tenantMembership.findUnique({ where: { identityId_tenantId: { identityId: opIdentity.id, tenantId: highId } } });
  await db.tenantMembership.update({ where: { id: opHigh.id }, data: { profileId: opProfile.id } });
  const opHome = await db.tenantMembership.create({ data: { identityId: opIdentity.id, tenantId: homeId,
    role: "MEMBER", profileId: managerProfile.id } });
  const opHomeLegacy = await db.usuario.create({ data: { tenantId: homeId, nome: opIdentity.nome,
    email: opIdentity.email, senhaHash: hash, papel: "membro" } });
  await db.legacyUserAccessMap.create({ data: { legacyUsuarioId: opHomeLegacy.id,
    identityId: opIdentity.id, tenantId: homeId, membershipId: opHome.id } });
  const readerIdentity = await db.authIdentity.create({ data: { nome: "Reader fixture",
    email: `reader-${schema}@localhost.invalid`, senhaHash: hash } });
  const readerMembership = await db.tenantMembership.create({ data: { identityId: readerIdentity.id, tenantId: highId,
    role: "MEMBER", profileId: readerProfile.id } });
  const readerLegacy = await db.usuario.create({ data: { tenantId: highId, nome: readerIdentity.nome,
    email: readerIdentity.email, senhaHash: hash, papel: "membro" } });
  await db.legacyUserAccessMap.create({ data: { legacyUsuarioId: readerLegacy.id,
    identityId: readerIdentity.id, tenantId: highId, membershipId: readerMembership.id } });
  const rhIdentity = await db.authIdentity.create({ data: { nome: "RH fixture",
    email: `rh-${schema}@localhost.invalid`, senhaHash: hash } });
  const rhMembership = await db.tenantMembership.create({ data: { identityId: rhIdentity.id, tenantId: highId,
    role: "MEMBER", profileId: rhProfile.id } });
  const rhLegacy = await db.usuario.create({ data: { tenantId: highId, nome: rhIdentity.nome,
    email: rhIdentity.email, senhaHash: hash, papel: "membro" } });
  await db.legacyUserAccessMap.create({ data: { legacyUsuarioId: rhLegacy.id,
    identityId: rhIdentity.id, tenantId: highId, membershipId: rhMembership.id } });
  const fixtureLogin = async (email, tenantId) => {
    const jar = new Map();
    const add = response => { for (const line of response.headers.getSetCookie()) {
      const part = line.split(";", 1)[0]; const split = part.indexOf("=");
      if (split > 0) jar.set(part.slice(0, split), part.slice(split + 1));
    } };
    const header = () => [...jar].map(([key, value]) => `${key}=${value}`).join("; ");
    const csrf = await fetch(`${base}/api/auth/csrf`); add(csrf);
    const { csrfToken: token } = await csrf.json();
    const result = await fetch(`${base}/api/auth/callback/credentials`, { method: "POST", redirect: "manual",
      headers: { Cookie: header(), "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrfToken: token, email, password, callbackUrl: `${base}/selecionar-tenant` }) });
    add(result);
    check("fixture login", header().includes("authjs.session-token="));
    if (tenantId) {
      const selected = await fetch(`${base}/api/tenants/switch`, { method: "POST", redirect: "manual",
        headers: { Cookie: header(), "Content-Type": "application/json" }, body: JSON.stringify({ tenantId }) });
      add(selected);
      check("fixture tenant selected", selected.status === 200);
    }
    return { header, add };
  };
  const api = (path, jar, method = "GET", body) => fetch(`${base}${path}`, { method, redirect: "manual",
    headers: { Cookie: jar.header(), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined });
  const opJar = await fixtureLogin(opIdentity.email, highId);
  const opStart = await api("/inicio", opJar);
  const opStartHtml = await opStart.text();
  check("operational start shows current tenant and profile without OWNER actions", opStart.status === 200 &&
    opStartHtml.includes("FINANCEIRO OPERACIONAL") && opStartHtml.includes("HIGH ACCESS-FINAL") &&
    !opStartHtml.includes("Primeira configuração do tenant"));
  const unselectedJar = await fixtureLogin(opIdentity.email);
  const unselectedStart = await api("/inicio", unselectedJar);
  check("two memberships require tenant selection before start", [307, 308].includes(unselectedStart.status) &&
    (unselectedStart.headers.get("location") ?? "").includes("/selecionar-tenant"));
  let context = await (await api("/api/access/context", opJar)).json();
  check("HIGH operational profile and no sensitive balance", context.profile?.nome === "FINANCEIRO OPERACIONAL" &&
    !context.permissions.includes("fluxo.visao.saldos"));
  check("operational read allowed and balance denied", (await api("/api/lancamentos", opJar)).status === 200 &&
    (await api("/api/fluxo-caixa/resumo?inicio=2026-01-01&fim=2026-01-31", opJar)).status === 403);
  const readerJar = await fixtureLogin(readerIdentity.email, highId);
  const readerRead = await api("/api/lancamentos", readerJar);
  const readerWrite = await api("/api/lancamentos", readerJar, "POST", {});
  check(`CONSULTA reads but cannot write (${readerRead.status}/${readerWrite.status})`,
    readerRead.status === 200 && readerWrite.status === 403);
  await db.tenantMembership.update({ where: { id: readerMembership.id }, data: { role: "OWNER" } });
  const ownerStart = await api("/inicio", readerJar);
  const ownerStartHtml = await ownerStart.text();
  check("OWNER start presents administration shortcuts", ownerStart.status === 200 &&
    ownerStartHtml.includes("Responsável pelo tenant (OWNER)") &&
    ownerStartHtml.includes("Primeira configuração do tenant") && ownerStartHtml.includes("Perfis de Acesso") &&
    !ownerStartHtml.includes('href="/acessos/suporte"'));
  await db.tenantContractualResponsible.create({ data: { tenantId: highId,
    membershipId: readerMembership.id, assignedByIdentityId: readerIdentity.id } });
  const responsibleStart = await api("/inicio", readerJar);
  check("only designated OWNER gets support shortcut", responsibleStart.status === 200 &&
    (await responsibleStart.text()).includes('href="/acessos/suporte"'));
  await db.tenantMembership.update({ where: { id: readerMembership.id }, data: { status: "INACTIVE" } });
  const inactiveMembershipStart = await api("/inicio", readerJar);
  check("inactive membership cannot open start", [307, 308].includes(inactiveMembershipStart.status) &&
    (inactiveMembershipStart.headers.get("location") ?? "").includes("/selecionar-tenant"));
  await db.authIdentity.update({ where: { id: readerIdentity.id }, data: { status: "INACTIVE" } });
  check("inactive identity cannot list tenant choices", (await api("/api/tenants", readerJar)).status === 401);
  const rhJar = await fixtureLogin(rhIdentity.email, highId);
  check("RH can read Pessoas but not financial rows", (await api("/api/pessoas", rhJar)).status === 200 &&
    (await api("/api/lancamentos", rhJar)).status === 403);
  const rhStart = await api("/inicio", rhJar);
  const rhStartHtml = await rhStart.text();
  check("RH start links Pessoas without linking Lançamentos", rhStart.status === 200 &&
    rhStartHtml.includes('href="/estrutura/dimensao-pessoas"') && !rhStartHtml.includes('href="/lancamentos"'));
  await db.tenant.update({ where: { id: highId }, data: { ativo: false } });
  const inactiveTenantStart = await api("/inicio", rhJar);
  check("inactive tenant cannot open start", [307, 308].includes(inactiveTenantStart.status) &&
    (inactiveTenantStart.headers.get("location") ?? "").includes("/selecionar-tenant"));
  await db.tenant.update({ where: { id: highId }, data: { ativo: true } });
  const homeSwitch = await api("/api/tenants/switch", opJar, "POST", { tenantId: homeId }); opJar.add(homeSwitch);
  context = await (await api("/api/access/context", opJar)).json();
  check("same identity has independent THE HOME manager profile", homeSwitch.status === 200 &&
    context.profile?.nome === "FINANCEIRO GERENTE" && context.permissions.includes("fluxo.visao.saldos"));
  await db.tenantMembership.update({ where: { id: opHigh.id }, data: { status: "INACTIVE" } });
  check("revoking HIGH does not revoke THE HOME", (await api("/api/lancamentos", opJar)).status === 200);
  const platformIdentity = await db.authIdentity.findUnique({ where: { email: legacy[5][3] } });
  const platformJar = await fixtureLogin(platformIdentity.email);
  check("PlatformAdmin without membership sees platform only", (await api("/api/platform/tenants", platformJar)).status === 200 &&
    (await api("/api/lancamentos", platformJar)).status !== 200);
  // GO-LIVE-2B: all invite tests stay inside this disposable schema.
  const platformOwnerEmail = `new-owner-${schema}@localhost.invalid`;
  const platformOwnerResponse = await api(`/api/platform/tenants/${homeId}/owner-invitations`, platformJar,
    "POST", { nome: "Owner invited by platform", email: platformOwnerEmail, confirm: true });
  const platformOwnerInvite = await platformOwnerResponse.json();
  const platformOwnerToken = new URL(platformOwnerInvite.devLink).hash.slice("#token=".length);
  check("platform invites first OWNER without password or active membership", platformOwnerResponse.status === 201 &&
    await db.tenantMembership.count({ where: { tenantId: homeId, identity: { email: platformOwnerEmail } } }) === 0);
  const platformOwnerList = await api(`/api/platform/tenants/${homeId}/owner-invitations`, platformJar);
  check("platform lists pending OWNER invitation", platformOwnerList.status === 200 &&
    (await platformOwnerList.json()).some(item => item.id === platformOwnerInvite.id && item.status === "PENDING"));
  const platformOwnerResendResponse = await api(`/api/platform/tenants/${homeId}/owner-invitations`, platformJar,
    "POST", { action: "resend", inviteId: platformOwnerInvite.id });
  const platformOwnerResent = await platformOwnerResendResponse.json();
  const platformOwnerResentToken = new URL(platformOwnerResent.devLink).hash.slice("#token=".length);
  check("platform resend rotates OWNER token", platformOwnerResendResponse.status === 200 &&
    platformOwnerResent.id !== platformOwnerInvite.id &&
    (await db.accessInvite.findUnique({ where: { id: platformOwnerInvite.id } })).status === "REVOKED");
  check("platform old OWNER token rejected", (await fetch(`${base}/api/access/invitations/inspect`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: platformOwnerToken }) })).status === 410);
  const platformOwnerAccept = await fetch(`${base}/api/access/invitations/accept`, { method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: platformOwnerResentToken, password }) });
  check("platform-invited OWNER activates with own password and owner event", platformOwnerAccept.status === 200 &&
    await db.tenantMembership.count({ where: { tenantId: homeId, role: "OWNER",
      identity: { email: platformOwnerEmail } } }) === 1 &&
    await db.accessOwnerEvent.count({ where: { tenantId: homeId,
      targetIdentityId: (await db.authIdentity.findUnique({ where: { email: platformOwnerEmail } })).id } }) === 1);
  const platformOwnerJar = await fixtureLogin(platformOwnerEmail, homeId);
  check("invited OWNER reaches tenant access administration", (await api("/acessos", platformOwnerJar)).status === 200);
  const revokedOwnerEmail = `revoked-owner-${schema}@localhost.invalid`;
  const revokedOwnerResponse = await api(`/api/platform/tenants/${homeId}/owner-invitations`, platformJar,
    "POST", { nome: "Revoked owner fixture", email: revokedOwnerEmail, confirm: true });
  const revokedOwnerInvite = await revokedOwnerResponse.json();
  const ownerRevokeResponse = await api(`/api/platform/tenants/${homeId}/owner-invitations`, platformJar,
    "POST", { action: "revoke", inviteId: revokedOwnerInvite.id });
  check("platform revokes pending OWNER invitation", revokedOwnerResponse.status === 201 &&
    ownerRevokeResponse.status === 200 &&
    (await db.accessInvite.findUnique({ where: { id: revokedOwnerInvite.id } })).status === "REVOKED");
  const ownerIdentity = await db.authIdentity.findUnique({ where: { email: legacy[0][3] } });
  await db.tenantMembership.update({ where: { identityId_tenantId: { identityId: ownerIdentity.id, tenantId: highId } },
    data: { role: "OWNER" } });
  const inviteOwnerJar = await fixtureLogin(ownerIdentity.email, highId);
  const nonDevBase = "http://127.0.0.1:3019";
  const nonDevDatabase = new URL(isolated);
  nonDevDatabase.hostname = "localhost";
  nonDevServer = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", "3019"],
    { cwd: process.cwd(), env: { ...simulatedEnv, DATABASE_URL: nonDevDatabase.toString(),
      NEXTAUTH_URL: nonDevBase, AUTH_TRUST_HOST: "true", EMAIL_PROVIDER: "disabled",
      APP_PUBLIC_URL: "https://example.invalid" }, stdio: ["ignore", "pipe", "pipe"] });
  for (let i = 0; i < 80; i++) {
    if (nonDevServer.exitCode !== null) throw new Error("Non-DEV fixture server exited.");
    try { if ((await fetch(`${nonDevBase}/login`)).status === 200) break; } catch { /* starting */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  const nonDevOrigin = await fetch(`${nonDevBase}/api/access/invitations`, { method: "POST",
    headers: { Cookie: inviteOwnerJar.header(), "Content-Type": "application/json" },
    body: JSON.stringify({ nome: "Blocked fixture", email: `blocked-${schema}@localhost.invalid`,
      role: "MEMBER", profileId: opProfile.id }) });
  check("non-DEV without valid provider fails closed", nonDevOrigin.status === 503 &&
    await db.accessInvite.count({ where: { email: `blocked-${schema}@localhost.invalid` } }) === 0);
  check("direct admin password provisioning disabled", (await api("/api/access/memberships", inviteOwnerJar,
    "POST", { email: `unsafe-${schema}@localhost.invalid`, senha: password })).status === 410);
  const inviteRequest = (jar, body) => api("/api/access/invitations", jar, "POST", body);
  const tokenFrom = result => new URL(result.devLink).hash.slice("#token=".length);
  const newEmail = `invited-${schema}@localhost.invalid`;
  const newInviteResponse = await inviteRequest(inviteOwnerJar, { nome: "Invited fixture", email: newEmail,
    role: "MEMBER", profileId: readerProfile.id });
  const newInvite = await newInviteResponse.json();
  check("new email receives pending invite and no active identity", newInviteResponse.status === 201 &&
    newInvite.delivery?.status === "SIMULATED" && newInvite.delivery?.provider === "mock" &&
    !await db.authIdentity.findUnique({ where: { email: newEmail } }) &&
    await db.tenantMembership.count({ where: { tenantId: highId, identity: { email: newEmail } } }) === 0);
  check("mock delivery has separate audit and never claims real email sent",
    await db.auditEvent.count({ where: { resourceId: newInvite.id, action: "INVITE_EMAIL_SIMULATED" } }) === 1 &&
    await db.auditEvent.count({ where: { resourceId: newInvite.id, action: "INVITE_EMAIL_SENT" } }) === 0);
  const newToken = tokenFrom(newInvite);
  const storedInvite = await db.accessInvite.findUnique({ where: { id: newInvite.id } });
  check("only token hash stored and 72h expiry", storedInvite.tokenHash !== newToken &&
    storedInvite.tokenHash.length === 64 && newInvite.expiresAt &&
    Math.abs(new Date(newInvite.expiresAt).getTime() - Date.now() - 72 * 3600000) < 60000);
  const publicApi = (path, body, jar) => fetch(`${base}${path}`, { method: "POST", redirect: "manual",
    headers: { "Content-Type": "application/json", ...(jar ? { Cookie: jar.header() } : {}) },
    body: JSON.stringify(body) });
  check("invalid token denied without authentication", (await publicApi("/api/access/invitations/inspect",
    { token: "invalid" })).status === 404);
  const inspectNew = await publicApi("/api/access/invitations/inspect", { token: newToken });
  check("new identity activation is public only with valid token", inspectNew.status === 200 &&
    (await inspectNew.json()).mode === "new");
  check("short password rejected without consuming invite", (await publicApi("/api/access/invitations/accept",
    { token: newToken, password: "short" })).status === 400 &&
    (await db.accessInvite.findUnique({ where: { id: newInvite.id } })).status === "PENDING");
  const activated = await publicApi("/api/access/invitations/accept", { token: newToken, password });
  check("new identity and membership activate atomically", activated.status === 200 &&
    (await activated.json()).newlyActivated &&
    await db.authIdentity.count({ where: { email: newEmail } }) === 1 &&
    await db.tenantMembership.count({ where: { tenantId: highId, identity: { email: newEmail }, status: "ACTIVE" } }) === 1);
  check("used token cannot be reused", (await publicApi("/api/access/invitations/accept",
    { token: newToken, password })).status === 404);
  const newJar = await fixtureLogin(newEmail, highId);
  check("activated account enters allowed tenant only", (await api("/inicio", newJar)).status === 200 &&
    (await api("/api/lancamentos", newJar)).status === 200 &&
    (await api("/api/tenants/switch", newJar, "POST", { tenantId: homeId })).status === 403);
  const mismatchProfile = await inviteRequest(inviteOwnerJar, { nome: "Wrong profile", email: `wrong-${schema}@localhost.invalid`,
    role: "MEMBER", profileId: managerProfile.id });
  check("cross-tenant profile rejected", mismatchProfile.status === 400);
  const accessManager = await db.accessProfile.create({ data: { tenantId: highId, nome: "ACCESS MANAGER",
    permissoes: ["acessos.usuarios.view", "acessos.usuarios.manage"] } });
  await db.tenantMembership.update({ where: { id: rhMembership.id }, data: { role: "ADMIN", profileId: accessManager.id } });
  const forbiddenOwnerInvite = await inviteRequest(rhJar, { nome: "Forbidden OWNER",
    email: `forbidden-${schema}@localhost.invalid`, role: "OWNER", profileId: accessManager.id });
  check("ADMIN cannot invite OWNER", forbiddenOwnerInvite.status === 403);
  const revokeResponse = await inviteRequest(inviteOwnerJar, { nome: "Revoked fixture",
    email: `revoked-${schema}@localhost.invalid`, role: "MEMBER", profileId: readerProfile.id });
  const revokeInvite = await revokeResponse.json();
  const revokeToken = tokenFrom(revokeInvite);
  const revoked = await api(`/api/access/invitations/${revokeInvite.id}`, inviteOwnerJar, "POST", { action: "revoke" });
  check("revoked invite no longer activates", revoked.status === 200 &&
    (await publicApi("/api/access/invitations/accept", { token: revokeToken, password })).status === 404);
  const expiredResponse = await inviteRequest(inviteOwnerJar, { nome: "Expired fixture",
    email: `expired-${schema}@localhost.invalid`, role: "MEMBER", profileId: readerProfile.id });
  const expiredInvite = await expiredResponse.json();
  const expiredToken = tokenFrom(expiredInvite);
  await db.accessInvite.update({ where: { id: expiredInvite.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  const expiredInspect = await publicApi("/api/access/invitations/inspect", { token: expiredToken });
  check("expired invite denied and audited", expiredInspect.status === 410 &&
    (await db.accessInvite.findUnique({ where: { id: expiredInvite.id } })).status === "EXPIRED" &&
    await db.auditEvent.count({ where: { resourceId: expiredInvite.id, action: "INVITE_EXPIRED" } }) === 1);
  const resent = await api(`/api/access/invitations/${expiredInvite.id}`, inviteOwnerJar, "POST", { action: "resend" });
  const resentBody = await resent.json();
  check("resend issues different token and leaves one pending", resent.status === 200 &&
    tokenFrom(resentBody) !== expiredToken &&
    await db.accessInvite.count({ where: { tenantId: highId, email: `expired-${schema}@localhost.invalid`, status: "PENDING" } }) === 1);
  await db.tenant.update({ where: { id: highId }, data: { ativo: false } });
  check("inactive tenant blocks invite acceptance", (await publicApi("/api/access/invitations/accept",
    { token: tokenFrom(resentBody), password })).status === 409);
  await db.tenant.update({ where: { id: highId }, data: { ativo: true } });
  await db.tenantMembership.update({ where: { id: opHome.id }, data: { role: "OWNER" } });
  const homeOwnerJar = await fixtureLogin(opIdentity.email, homeId);
  const existingInviteResponse = await inviteRequest(homeOwnerJar, { nome: "Existing fixture", email: rhIdentity.email,
    role: "MEMBER", profileId: managerProfile.id });
  const existingInvite = await existingInviteResponse.json();
  const existingToken = tokenFrom(existingInvite);
  const oldHash = (await db.authIdentity.findUnique({ where: { id: rhIdentity.id } })).senhaHash;
  check("existing identity must authenticate before acceptance", existingInviteResponse.status === 201 &&
    (await publicApi("/api/access/invitations/accept", { token: existingToken })).status === 403);
  check("different logged-in email denied", (await publicApi("/api/access/invitations/accept",
    { token: existingToken }, inviteOwnerJar)).status === 403);
  const existingAccepted = await publicApi("/api/access/invitations/accept", { token: existingToken }, rhJar);
  check("existing identity gains second tenant without password change", existingAccepted.status === 200 &&
    !(await existingAccepted.json()).newlyActivated &&
    await db.authIdentity.count({ where: { email: rhIdentity.email } }) === 1 &&
    (await db.authIdentity.findUnique({ where: { id: rhIdentity.id } })).senhaHash === oldHash &&
    await db.tenantMembership.count({ where: { identityId: rhIdentity.id } }) === 2);
  check("existing identity sees both tenants", (await (await api("/api/tenants", rhJar)).json()).length === 2);
  const concurrentResponse = await inviteRequest(inviteOwnerJar, { nome: "Concurrent fixture",
    email: `concurrent-${schema}@localhost.invalid`, role: "MEMBER", profileId: readerProfile.id });
  const concurrentInvite = await concurrentResponse.json();
  const concurrentToken = tokenFrom(concurrentInvite);
  const both = await Promise.all([1, 2].map(() => publicApi("/api/access/invitations/accept",
    { token: concurrentToken, password })));
  check("concurrent accepts produce exactly one membership", both.filter(r => r.status === 200).length === 1 &&
    await db.tenantMembership.count({ where: { tenantId: highId,
      identity: { email: `concurrent-${schema}@localhost.invalid` } } }) === 1);
  const limitedEmail = `limited-${schema}@localhost.invalid`;
  const firstLimited = await inviteRequest(inviteOwnerJar, { nome: "Rate limit fixture", email: limitedEmail,
    role: "MEMBER", profileId: readerProfile.id });
  let limited = await firstLimited.json();
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await api(`/api/access/invitations/${limited.id}`, inviteOwnerJar, "POST", { action: "resend" });
    check(`rate limit permits resend ${attempt + 1} of two`, response.status === 200);
    limited = await response.json();
  }
  const blockedResend = await api(`/api/access/invitations/${limited.id}`, inviteOwnerJar, "POST", { action: "resend" });
  check("fourth email in 15 minutes is rate-limited without revoking current link", blockedResend.status === 429 &&
    (await db.accessInvite.findUnique({ where: { id: limited.id } })).status === "PENDING" &&
    await db.accessInvite.count({ where: { tenantId: highId, email: limitedEmail } }) === 3);

  // Separate local process exercises a genuine SMTP connection failure, without sending mail.
  const failureBase = "http://127.0.0.1:3018";
  failureServer = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", "3018"],
    { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: isolated.toString(),
      NEXTAUTH_URL: failureBase, AUTH_TRUST_HOST: "true", EMAIL_PROVIDER: "smtp",
      APP_PUBLIC_URL: failureBase, SMTP_HOST: "127.0.0.1", SMTP_PORT: "1", SMTP_SECURE: "false",
      SMTP_USER: "fixture", SMTP_PASSWORD: randomBytes(16).toString("hex"),
      EMAIL_FROM_ADDRESS: "fixture@localhost.invalid", EMAIL_FROM_NAME: "10S Fixture" },
      stdio: ["ignore", "pipe", "pipe"] });
  for (let i = 0; i < 80; i++) {
    if (failureServer.exitCode !== null) throw new Error("SMTP failure fixture server exited.");
    try { if ((await fetch(`${failureBase}/login`)).status === 200) break; } catch { /* starting */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  const failedEmail = `failed-${schema}@localhost.invalid`;
  const failedResponse = await fetch(`${failureBase}/api/access/invitations`, { method: "POST",
    headers: { "Content-Type": "application/json", Cookie: inviteOwnerJar.header() },
    body: JSON.stringify({ nome: "SMTP failure fixture", email: failedEmail,
      role: "MEMBER", profileId: readerProfile.id }) });
  const failedBody = await failedResponse.json();
  check("SMTP connection failure is reported without claiming sent", failedResponse.status === 201 &&
    failedBody.delivery?.status === "FAILED" && failedBody.delivery?.provider === "smtp" && !failedBody.devLink &&
    await db.accessInvite.count({ where: { tenantId: highId, email: failedEmail, status: "PENDING" } }) === 1);
  check("failed delivery is audited without SMTP details", await db.auditEvent.count({ where: {
    resourceId: failedBody.id, action: "INVITE_EMAIL_FAILED", result: "FAILURE" } }) === 1 &&
    !(await db.auditEvent.findMany({ where: { resourceId: failedBody.id }, select: { metadata: true } })).some(row =>
      JSON.stringify(row).includes("SMTP_PASSWORD") || JSON.stringify(row).includes(failedEmail)));
  check("invitation audit excludes token and password", await db.auditEvent.count({ where: { action: "INVITE_ACCEPTED" } }) >= 2 &&
    !(await db.auditEvent.findMany({ select: { metadata: true, changes: true } })).some(row =>
      JSON.stringify(row).includes(newToken) || JSON.stringify(row).includes(password)));
  console.log(`ACCESS-FINAL isolated simulation: ${checks.length} checks passed; ${migrationNames.length} ordered migrations; fixtures removed.`);
} finally {
  if (nonDevServer && nonDevServer.exitCode === null) {
    nonDevServer.kill();
    await Promise.race([new Promise(resolve => nonDevServer.once("exit", resolve)),
      new Promise(resolve => setTimeout(resolve, 5000))]);
    if (nonDevServer.exitCode === null) nonDevServer.kill("SIGKILL");
  }
  if (failureServer && failureServer.exitCode === null) {
    failureServer.kill();
    await Promise.race([new Promise(resolve => failureServer.once("exit", resolve)),
      new Promise(resolve => setTimeout(resolve, 5000))]);
    if (failureServer.exitCode === null) failureServer.kill("SIGKILL");
  }
  if (server && server.exitCode === null) {
    server.kill();
    await Promise.race([new Promise(resolve => server.once("exit", resolve)),
      new Promise(resolve => setTimeout(resolve, 5000))]);
    if (server.exitCode === null) server.kill("SIGKILL");
  }
  if (db) await db.$disconnect();
  if (created) await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await root.end().catch(() => {});
}
