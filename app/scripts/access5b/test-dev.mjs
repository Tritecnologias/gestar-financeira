import { randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import bcrypt from "bcryptjs";
import { Client } from "pg";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const source = new URL(process.env.DATABASE_URL || "");
if (source.hostname !== "127.0.0.1" || source.port !== "55432" || source.pathname !== "/gestar_vf_dev") {
  throw new Error("ACCESS-5B requires the isolated local DEV PostgreSQL on port 55432.");
}
const suffix = randomBytes(5).toString("hex");
const schema = `access5b_test_${suffix}`;
const isolated = new URL(source);
isolated.searchParams.set("schema", schema);
isolated.searchParams.set("sslmode", "disable");
const base = "http://127.0.0.1:3016";
const password = randomBytes(24).toString("hex");
const root = new Client({ connectionString: process.env.DATABASE_URL });
const passed = [];
const ok = (name, test) => { if (!test) throw new Error(`FAIL ${name}`); passed.push(name); };
let db, server, created = false;

function jar() {
  const values = new Map();
  return { add(response) { for (const line of response.headers.getSetCookie()) {
    const part = line.split(";", 1)[0]; const split = part.indexOf("=");
    if (split > 0) values.set(part.slice(0, split), part.slice(split + 1));
  } }, header() { return [...values].map(([k, v]) => `${k}=${v}`).join("; "); } };
}
async function request(path, cookies, method = "GET", json) {
  const response = await fetch(`${base}${path}`, { method, redirect: "manual",
    headers: { Cookie: cookies?.header() || "", ...(json === undefined ? {} : { "Content-Type": "application/json" }) },
    body: json === undefined ? undefined : JSON.stringify(json),
  });
  cookies?.add(response);
  const type = response.headers.get("content-type") || "";
  return { status: response.status, body: type.includes("application/json") ? await response.json() :
    type.includes("text/html") ? await response.text() : null, response };
}
async function login(email) {
  const cookies = jar();
  const csrf = await fetch(`${base}/api/auth/csrf`); cookies.add(csrf);
  const { csrfToken } = await csrf.json();
  const response = await fetch(`${base}/api/auth/callback/credentials`, { method: "POST", redirect: "manual",
    headers: { Cookie: cookies.header(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken, email, password, callbackUrl: `${base}/selecionar-tenant` }),
  });
  cookies.add(response);
  ok(`login ${email.split("@")[0]}`, cookies.header().includes("authjs.session-token="));
  return cookies;
}
async function waitForServer() {
  for (let i = 0; i < 80; i++) {
    if (server.exitCode !== null) throw new Error("Isolated server exited before readiness.");
    try { if ((await fetch(`${base}/login`)).status === 200) return; } catch { /* starting */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error("Isolated server did not start.");
}
async function choose(cookies, tenantId, grantId) {
  return request("/api/tenants/switch", cookies, "POST", { tenantId, ...(grantId ? { grantId } : {}) });
}
async function requestGrant(cookies, tenantId, modules, accessLevel = "READ_ONLY", minutes = 60) {
  return request("/api/support-grants", cookies, "POST", {
    tenantId, reason: `Investigação autorizada de erro técnico ${suffix}`, modules, accessLevel, requestedMinutes: minutes,
  });
}
async function term(code, audience, publishedByIdentityId) {
  const document = await db.termDocument.create({ data: { code, audience, required: true } });
  return db.termVersion.create({ data: { documentId: document.id, version: "V1", title: code,
    description: "Fixture de aceite", storageKey: `access5b/${code}.pdf`, mimeType: "application/pdf",
    byteSize: 10, sha256: "a".repeat(64), status: "PUBLISHED", publishedAt: new Date(),
    publishedByIdentityId } });
}

try {
  await root.connect();
  await root.query(`CREATE SCHEMA "${schema}"`);
  created = true;
  const migration = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: isolated.toString() }, encoding: "utf8" });
  if (migration.status !== 0) throw new Error(`Isolated migration failed: ${(migration.stdout + migration.stderr).slice(-1800)}`);
  db = new PrismaClient({ adapter: new PrismaPg({ connectionString: isolated.toString() }, { schema }) });
  ok("isolated schema empty", await db.tenant.count() === 0);
  const hash = await bcrypt.hash(password, 12);
  const [high, home] = await Promise.all([
    db.tenant.create({ data: { nome: "HIGH ACCESS-5B DEV", slug: `high-access5b-${suffix}`, email: `high-${suffix}@localhost.invalid` } }),
    db.tenant.create({ data: { nome: "THE HOME ACCESS-5B DEV", slug: `home-access5b-${suffix}`, email: `home-${suffix}@localhost.invalid` } }),
  ]);
  const [platform, otherPlatform, owner, member, ownerHome] = await Promise.all([
    ...["platform", "other-platform", "owner", "member", "owner-home"].map(name =>
      db.authIdentity.create({ data: { nome: name, email: `${name}-${suffix}@localhost.invalid`, senhaHash: hash } })),
  ]);
  await Promise.all([platform, otherPlatform].map(p => db.platformAdmin.create({ data: { identityId: p.id } })));
  const profile = await db.accessProfile.create({ data: { tenantId: high.id, nome: "ACCESS-5B DEV",
    permissoes: ["estrutura.empresa.view"] } });
  async function addMembership(identity, role) {
    const membership = await db.tenantMembership.create({ data: { identityId: identity.id, tenantId: high.id, role, profileId: profile.id } });
    const legacy = await db.usuario.create({ data: { tenantId: high.id, nome: identity.nome, email: identity.email, senhaHash: hash, papel: role === "OWNER" ? "admin" : "membro" } });
    await db.legacyUserAccessMap.create({ data: { identityId: identity.id, tenantId: high.id,
      membershipId: membership.id, legacyUsuarioId: legacy.id } });
    return membership;
  }
  const ownerMembership = await addMembership(owner, "OWNER");
  await addMembership(member, "MEMBER");
  const homeProfile = await db.accessProfile.create({ data: { tenantId: home.id, nome: "ACCESS-5B HOME", permissoes: [] } });
  const homeOwnerMembership = await db.tenantMembership.create({ data: { identityId: ownerHome.id, tenantId: home.id,
    role: "OWNER", profileId: homeProfile.id } });
  const homeLegacy = await db.usuario.create({ data: { tenantId: home.id, nome: ownerHome.nome,
    email: ownerHome.email, senhaHash: hash, papel: "admin" } });
  await db.legacyUserAccessMap.create({ data: { tenantId: home.id, identityId: ownerHome.id,
    membershipId: homeOwnerMembership.id, legacyUsuarioId: homeLegacy.id } });
  await db.tenantContractualResponsible.create({ data: { tenantId: high.id,
    membershipId: ownerMembership.id, assignedByIdentityId: platform.id } });
  await db.tenantContractualResponsible.create({ data: { tenantId: home.id,
    membershipId: homeOwnerMembership.id, assignedByIdentityId: platform.id } });
  await db.empresa.create({ data: { tenantId: high.id, razaoSocial: "HIGH FIXTURE" } });
  await db.empresa.create({ data: { tenantId: home.id, razaoSocial: "HOME FIXTURE" } });
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", "3016"],
    { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: isolated.toString(), NEXTAUTH_URL: base, AUTH_TRUST_HOST: "true" },
      stdio: ["ignore", "pipe", "pipe"] });
  let serverError = "";
  server.stderr.on("data", bytes => { serverError = (serverError + String(bytes)).slice(-2000); });
  await waitForServer().catch(e => { throw new Error(`${e.message} ${serverError}`); });
  const [adminJar, otherJar, ownerJar, memberJar, homeJar] = await Promise.all([
    login(platform.email), login(otherPlatform.email), login(owner.email), login(member.email), login(ownerHome.email),
  ]);
  ok("M normal membership selected", (await choose(ownerJar, high.id)).status === 200);
  ok("M member membership selected", (await choose(memberJar, high.id)).status === 200);
  ok("K HOME owner membership selected", (await choose(homeJar, home.id)).status === 200);
  ok("M normal member reads own tenant", (await request("/api/empresa", memberJar)).status === 200);
  let result = await request("/plataforma/suporte", adminJar);
  ok("O platform support page renders", result.status === 200 && typeof result.body === "string" && result.body.includes("Solicitar acesso"));
  result = await request("/acessos/suporte", ownerJar);
  ok("O tenant support page renders", result.status === 200 && typeof result.body === "string" && result.body.includes("Acessos / Suporte"));
  ok("O member cannot open tenant support", [307, 308].includes((await request("/acessos/suporte", memberJar)).status));

  result = await request("/api/empresa", adminJar);
  ok("A PlatformAdmin without grant denied", result.status === 403);
  ok("B generic motive rejected", (await request("/api/support-grants", adminJar, "POST", {
    tenantId: high.id, reason: "Suporte técnico", modules: ["ESTRUTURA_EMPRESA"],
    accessLevel: "READ_ONLY", requestedMinutes: 60,
  })).status === 400);
  const noResponsible = await db.tenant.create({ data: { nome: "SEM RESPONSÁVEL ACCESS-5B DEV",
    slug: `unready-access5b-${suffix}`, email: `unready-${suffix}@localhost.invalid` } });
  ok("B unready tenant cannot receive unapprovable request",
    (await requestGrant(adminJar, noResponsible.id, ["ESTRUTURA_EMPRESA"])).status === 409);
  result = await requestGrant(adminJar, high.id, ["ESTRUTURA_EMPRESA"]);
  ok("B request pending, read-only default", result.status === 201 && result.body.status === "PENDING" && result.body.accessLevel === "READ_ONLY");
  const readGrant = result.body;
  result = await request("/api/support-grants?view=tenant", ownerJar);
  ok("B owner sees explicit request", result.status === 200 && result.body.some(g => g.id === readGrant.id));
  result = await request(`/api/support-grants/${readGrant.id}`, memberJar, "PATCH", { action: "approve" });
  ok("C ordinary member cannot approve", result.status === 403);
  ok("K other tenant OWNER cannot approve", (await request(`/api/support-grants/${readGrant.id}`, homeJar, "PATCH", { action: "approve" })).status === 403);
  result = await request(`/api/support-grants/${readGrant.id}`, adminJar, "PATCH", { action: "approve" });
  ok("C requester cannot approve", [403, 409].includes(result.status));
  result = await request(`/api/support-grants/${readGrant.id}`, ownerJar, "PATCH", { action: "approve" });
  ok("C responsible OWNER approves", result.status === 200 && result.body.status === "ACTIVE");
  ok("C approval is single-use", (await request(`/api/support-grants/${readGrant.id}`, ownerJar, "PATCH", { action: "approve" })).status === 409);
  ok("B duplicate live request denied", (await requestGrant(adminJar, high.id, ["ESTRUTURA_EMPRESA"])).status === 409);
  result = await request("/api/tenants", adminJar);
  ok("authorized support separate from membership", result.body.some(t => t.kind === "SUPPORT_GRANT" && t.grantId === readGrant.id));
  ok("L wrong PlatformAdmin denied", (await choose(otherJar, high.id, readGrant.id)).status === 403);
  ok("K wrong tenant denied", (await choose(adminJar, home.id, readGrant.id)).status === 403);
  ok("E support context selected", (await choose(adminJar, high.id, readGrant.id)).status === 200);
  result = await request("/api/empresa", adminJar);
  ok("E read-only sees only approved tenant", result.status === 200 && result.body.length === 1 && result.body[0].razaoSocial === "HIGH FIXTURE");
  ok("H read-only write denied", (await request("/api/areas-negocio", adminJar, "POST", { codigo: "X", nome: "X" })).status === 403);
  ok("E read-only export is allowed", (await request("/api/estrutura-gerencial/exportar", adminJar)).status === 200);
  ok("G other module denied", (await request("/api/categorias", adminJar)).status === 403);
  result = await request("/estrutura/dimensao-empresa", adminJar);
  ok("O support banner rendered", result.status === 200 && typeof result.body === "string" && result.body.includes("MODO SUPORTE"));
  result = await request(`/api/support-grants/${readGrant.id}`, ownerJar, "PATCH", { action: "revoke", reason: "Fim do atendimento" });
  ok("J owner revokes immediately", result.status === 200);
  ok("J revoked context denied", [403, 409].includes((await request("/api/empresa", adminJar)).status));

  result = await requestGrant(adminJar, high.id, ["ESTRUTURA_EMPRESA"]);
  const rejected = result.body;
  result = await request(`/api/support-grants/${rejected.id}`, ownerJar, "PATCH", { action: "reject", reason: "Não autorizado" });
  ok("D rejection terminal", result.status === 200 && result.body.status === "REJECTED");
  ok("D rejection cannot be approved later", (await request(`/api/support-grants/${rejected.id}`, ownerJar, "PATCH", { action: "approve" })).status === 409);
  ok("D rejected grant cannot be activated", (await choose(adminJar, high.id, rejected.id)).status === 403);

  result = await requestGrant(adminJar, high.id, ["ESTRUTURA_FINANCEIRA"], "OPERATIONAL", 15);
  const operational = result.body;
  ok("F explicit operational request", result.status === 201 && operational.accessLevel === "OPERATIONAL");
  ok("F owner approves operational", (await request(`/api/support-grants/${operational.id}`, ownerJar, "PATCH", { action: "approve" })).status === 200);
  ok("F operational context selected", (await choose(adminJar, high.id, operational.id)).status === 200);
  result = await request("/api/categorias", adminJar, "POST", { codigo: "X01", nome: "Categoria fixture" });
  ok("F operational write in approved screen", result.status === 201);
  ok("H operational delete not granted", (await request(`/api/categorias/${result.body.id}`, adminJar, "DELETE")).status === 403);
  ok("H operational outside screen denied", (await request("/api/areas-negocio", adminJar, "POST", { codigo: "X", nome: "X" })).status === 403);
  ok("G unapproved page denied", [307, 308, 403].includes((await request("/estrutura/dimensao-empresa", adminJar)).status));
  await db.supportGrant.update({ where: { id: operational.id }, data: {
    startsAt: new Date(Date.now() - 60_000), expiresAt: new Date(Date.now() - 1000),
  } });
  ok("I expired by clock without job", [403, 409].includes((await request("/api/categorias", adminJar)).status));
  ok("I expiration recorded", (await db.supportGrant.findUnique({ where: { id: operational.id } })).status === "EXPIRED");

  result = await requestGrant(adminJar, high.id, ["ESTRUTURA_EMPRESA"]);
  const termGrant = result.body;
  ok("N additional request", result.status === 201);
  ok("N owner approves", (await request(`/api/support-grants/${termGrant.id}`, ownerJar, "PATCH", { action: "approve" })).status === 200);
  ok("N support reselected", (await choose(adminJar, high.id, termGrant.id)).status === 200);
  const userTerm = await term(`USER_${suffix}`, "USUARIO", platform.id);
  ok("N user terms block support", (await request("/api/empresa", adminJar)).status === 428);
  ok("N support accepts own user term", (await request("/api/terms/accept", adminJar, "POST", { versionId: userTerm.id, agreed: true })).status === 200);
  ok("N support resumes after own acceptance", (await request("/api/empresa", adminJar)).status === 200);
  const contractTerm = await term(`CONTRACT_${suffix}`, "CONTRATANTE", platform.id);
  ok("N tenant contract terms block support", (await request("/api/empresa", adminJar)).status === 428);
  ok("N only responsible accepts tenant terms", (await request("/api/terms/accept", ownerJar, "POST", { versionId: contractTerm.id, agreed: true })).status === 200);
  ok("N support resumes after tenant acceptance", (await request("/api/empresa", adminJar)).status === 200);
  ok("J requester may end own grant", (await request(`/api/support-grants/${termGrant.id}`, adminJar, "PATCH", { action: "revoke", reason: "Fim do atendimento" })).status === 200);
  ok("J own revocation immediate", [403, 409].includes((await request("/api/empresa", adminJar)).status));

  const events = await db.supportGrantEvent.findMany({ where: { tenantId: high.id } });
  ok("audit events requested/approved/rejected/activated/used/revoked/expired",
    ["REQUESTED", "APPROVED", "REJECTED", "ACTIVATED", "USED", "REVOKED", "EXPIRED"].every(type => events.some(e => e.type === type)));
  ok("fixtures never touched HOM-REAL", await db.lancamento.count() === 0);
  console.log(`ACCESS-5B DEV: ${passed.length} checks passed in isolated schema. Fixtures will be dropped.`);
} finally {
  if (server && server.exitCode === null) {
    server.kill();
    await Promise.race([new Promise(resolve => server.once("exit", resolve)), new Promise(resolve => setTimeout(resolve, 5000))]);
    if (server.exitCode === null) server.kill("SIGKILL");
  }
  if (db) await db.$disconnect();
  if (created) await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await root.end().catch(() => {});
}
