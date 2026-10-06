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
let db, server, created = false;
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
  check("all migrations applied in chronological order", migrationNames.length === 11);
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

  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", "3017"],
    { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: isolated.toString(),
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
  const rhJar = await fixtureLogin(rhIdentity.email, highId);
  check("RH can read Pessoas but not financial rows", (await api("/api/pessoas", rhJar)).status === 200 &&
    (await api("/api/lancamentos", rhJar)).status === 403);
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
  console.log(`ACCESS-FINAL isolated simulation: ${checks.length} checks passed; ${migrationNames.length} ordered migrations; fixtures removed.`);
} finally {
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
