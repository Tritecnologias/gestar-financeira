import { randomBytes, createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import bcrypt from "bcryptjs";
import { Client } from "pg";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const baseUrl = new URL(process.env.DATABASE_URL || "");
if (baseUrl.hostname !== "127.0.0.1" || baseUrl.port !== "55432" || baseUrl.pathname !== "/gestar_vf_dev") {
  throw new Error("ACCESS-5A tests require the isolated local DEV database on port 55432.");
}
const suffix = randomBytes(5).toString("hex");
const schema = `access5a_test_${suffix}`;
const databaseUrl = new URL(baseUrl);
databaseUrl.searchParams.set("schema", schema);
const testStorage = resolve(process.cwd(), ".private", `access5a-test-${suffix}`);
const port = 3015;
const base = `http://127.0.0.1:${port}`;
const password = randomBytes(24).toString("hex");
const checks = [];
const assert = (label, condition) => { if (!condition) throw new Error(`FAIL: ${label}`); checks.push(label); };
const root = new Client({ connectionString: process.env.DATABASE_URL });
let db;
let server;
let schemaCreated = false;

function pdfFixture() {
  const stream = "BT /F1 12 Tf 20 60 Td (ACCESS-5A DEV FIXTURE) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 360 120] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let text = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) { offsets.push(Buffer.byteLength(text)); text += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`; }
  const start = Buffer.byteLength(text);
  text += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) text += `${String(offset).padStart(10, "0")} 00000 n \n`;
  text += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(text);
}
function jar() {
  const values = new Map();
  return { add(response) { for (const line of response.headers.getSetCookie()) {
    const part = line.split(";", 1)[0]; const split = part.indexOf("=");
    if (split > 0) values.set(part.slice(0, split), part.slice(split + 1));
  } }, header() { return [...values].map(([k, v]) => `${k}=${v}`).join("; "); } };
}
async function request(path, cookies, { method = "GET", json, form } = {}) {
  const response = await fetch(`${base}${path}`, { method, redirect: "manual",
    headers: { Cookie: cookies?.header() || "", ...(json === undefined ? {} : { "Content-Type": "application/json" }) },
    body: json === undefined ? form : JSON.stringify(json),
  });
  cookies?.add(response);
  const type = response.headers.get("content-type") || "";
  return { status: response.status, body: type.includes("application/json") ? await response.json() : null,
    response };
}
async function login(email) {
  const cookies = jar();
  const csrf = await fetch(`${base}/api/auth/csrf`); cookies.add(csrf);
  const { csrfToken } = await csrf.json();
  const response = await fetch(`${base}/api/auth/callback/credentials`, { method: "POST", redirect: "manual",
    headers: { Cookie: cookies.header(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken, email, password, callbackUrl: `${base}/lancamentos` }),
  });
  cookies.add(response);
  assert(`login ${email.split("@")[0]}`, cookies.header().includes("authjs.session-token="));
  return cookies;
}
async function choose(cookies, tenantId) {
  const result = await request("/api/tenants/switch", cookies, { method: "POST", json: { tenantId } });
  assert("tenant selection", result.status === 200);
}
async function addMembership(identity, tenant, role, profile) {
  const membership = await db.tenantMembership.create({ data: { identityId: identity.id, tenantId: tenant.id, role, profileId: profile.id } });
  const legacy = await db.usuario.create({ data: { tenantId: tenant.id, nome: identity.nome, email: identity.email, senhaHash: identity.senhaHash, papel: role === "MEMBER" ? "membro" : "admin" } });
  await db.legacyUserAccessMap.create({ data: { tenantId: tenant.id, identityId: identity.id, membershipId: membership.id, legacyUsuarioId: legacy.id } });
  return membership;
}
async function upload(platform, documentId, version, requiresReaccept) {
  const bytes = pdfFixture();
  const form = new FormData();
  form.set("version", version); form.set("title", `Documento DEV ${version}`);
  form.set("requiresReaccept", String(requiresReaccept));
  form.set("file", new Blob([bytes], { type: "application/pdf" }), "termo-dev.pdf");
  const result = await request(`/api/platform/terms/${documentId}/versions`, platform, { method: "POST", form });
  assert(`PDF ${version} uploaded`, result.status === 201);
  assert(`SHA-256 ${version} stored`, result.body.sha256 === createHash("sha256").update(bytes).digest("hex"));
  return result.body;
}
async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw new Error("Isolated Next server exited before readiness.");
    try { const response = await fetch(`${base}/login`); if (response.status === 200) return; } catch { /* booting */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error("Isolated Next server did not become ready.");
}

try {
  await root.connect();
  await root.query(`CREATE SCHEMA "${schema}"`);
  schemaCreated = true;
  const migration = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: databaseUrl.toString() }, encoding: "utf8" });
  if (migration.status !== 0) throw new Error(`Isolated migration failed: ${(migration.stdout + migration.stderr).slice(-1200)}`);
  db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl.toString() }, { schema }) });
  assert("schema starts empty", await db.tenant.count() === 0);
  await mkdir(testStorage, { recursive: true });
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(port)],
    { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: databaseUrl.toString(), NEXTAUTH_URL: base,
      AUTH_TRUST_HOST: "true", TERM_STORAGE_DIR: testStorage }, stdio: ["ignore", "pipe", "pipe"] });
  let serverError = "";
  server.stderr.on("data", bytes => { serverError = (serverError + String(bytes)).slice(-1500); });
  try { await waitForServer(); } catch (cause) { throw new Error(`${cause.message} ${serverError}`); }

  const hash = await bcrypt.hash(password, 12);
  const [tenantA, tenantB] = await Promise.all([
    db.tenant.create({ data: { nome: "ACCESS5A TEST A", slug: `access5a-a-${suffix}`, email: `a-${suffix}@localhost.invalid` } }),
    db.tenant.create({ data: { nome: "ACCESS5A TEST B", slug: `access5a-b-${suffix}`, email: `b-${suffix}@localhost.invalid` } }),
  ]);
  const [profileA, profileB] = await Promise.all([tenantA, tenantB].map(tenant => db.accessProfile.create({ data: {
    tenantId: tenant.id, nome: "TESTE", permissoes: ["fluxo.lancamentos.view", "acessos.usuarios.view"],
  } })));
  const makeIdentity = (name) => db.authIdentity.create({ data: { nome: name, email: `${name.toLowerCase()}-${suffix}@localhost.invalid`, senhaHash: hash } });
  const [platformIdentity, ownerA, userA, ownerB] = await Promise.all([
    makeIdentity("Platform"), makeIdentity("OwnerA"), makeIdentity("UserA"), makeIdentity("OwnerB"),
  ]);
  await db.platformAdmin.create({ data: { identityId: platformIdentity.id } });
  const [ownerAMembership, userAMembership, ownerBMembership] = await Promise.all([
    addMembership(ownerA, tenantA, "OWNER", profileA), addMembership(userA, tenantA, "MEMBER", profileA),
    addMembership(ownerB, tenantB, "OWNER", profileB),
  ]);
  const [platform, ownerAJar, userAJar, ownerBJar] = await Promise.all([
    login(platformIdentity.email), login(ownerA.email), login(userA.email), login(ownerB.email),
  ]);
  await Promise.all([choose(ownerAJar, tenantA.id), choose(userAJar, tenantA.id), choose(ownerBJar, tenantB.id)]);
  let result = await request("/api/access/context", ownerAJar);
  assert("no document means no gate", result.status === 200);
  result = await request("/api/platform/tenants", platform);
  assert("historical tenants have no inferred responsible", result.body.find(t => t.id === tenantA.id).contractualResponsibleMembershipId === null);

  result = await request("/api/platform/terms", platform, { method: "POST", json: { code: "TERM_CONTRATANTE_TEST", audience: "CONTRATANTE", required: true } });
  assert("A PlatformAdmin creates contractor document", result.status === 201);
  const contractor = result.body;
  result = await request("/api/platform/terms", platform, { method: "POST", json: { code: "TERM_USUARIO_TEST", audience: "USUARIO", required: true } });
  assert("separate user document", result.status === 201);
  const userDocument = result.body;
  const contractV1 = await upload(platform, contractor.id, "V1", true);
  const userV1 = await upload(platform, userDocument.id, "V1", true);
  result = await request(`/api/terms/versions/${userV1.id}/file`, platform);
  assert("PlatformAdmin can inspect draft PDF", result.status === 200 && (await result.response.arrayBuffer()).byteLength > 100);
  result = await request(`/api/platform/terms/versions/${contractV1.id}/publish`, ownerAJar, { method: "POST" });
  assert("E tenant admin cannot publish", result.status === 403);
  result = await request(`/api/platform/tenants/${tenantA.id}/contractual-responsible`, platform,
    { method: "POST", json: { membershipId: ownerAMembership.id, confirm: true } });
  assert("explicit responsible assignment", result.status === 200);
  result = await request("/api/platform/tenants", platform);
  assert("responsible readiness reflects active OWNER", result.body.find(t => t.id === tenantA.id).contractualResponsibleReady === true);
  result = await request(`/api/platform/tenants/${tenantB.id}/contractual-responsible`, platform,
    { method: "POST", json: { membershipId: ownerAMembership.id, confirm: true } });
  assert("cross-tenant responsible rejected", result.status === 409);
  for (const item of [contractV1, userV1]) {
    result = await request(`/api/platform/terms/versions/${item.id}/publish`, platform, { method: "POST" });
    assert(`publish ${item.id}`, result.status === 200);
  }
  try { await db.termVersion.update({ where: { id: userV1.id }, data: { title: "MUTATED" } }); throw new Error("Published version changed"); }
  catch (cause) { assert("D published version immutable", cause.message !== "Published version changed"); }
  result = await request("/api/access/context", userAJar);
  assert("I required terms block business API", result.status === 428);
  result = await request("/lancamentos", userAJar);
  assert("I required terms redirect business page", [307, 308].includes(result.status) && result.response.headers.get("location")?.includes("/termos/aceite"));
  result = await request("/api/terms/pending", userAJar);
  assert("pending endpoint remains available", result.status === 200 && result.body.pending.length === 2);
  result = await request(`/api/terms/versions/${userV1.id}/file`, userAJar);
  assert("pending user can view PDF", result.status === 200 && result.response.headers.get("content-type") === "application/pdf");
  result = await request("/api/terms/accept", userAJar, { method: "POST", json: { versionId: userV1.id, agreed: false } });
  assert("acceptance requires unchecked-by-default active consent", result.status === 400);
  result = await request("/api/terms/accept", userAJar, { method: "POST", json: { versionId: contractV1.id, agreed: true, identityId: ownerA.id } });
  assert("H user cannot accept contract for owner", result.status === 403);
  result = await request("/api/terms/accept", userAJar, { method: "POST", json: { versionId: userV1.id, agreed: true, identityId: ownerA.id } });
  assert("G user accepts own term", result.status === 200);
  assert("H forged identity ignored", await db.termAcceptance.count({ where: { identityId: ownerA.id } }) === 0);
  result = await request("/api/terms/accept", ownerAJar, { method: "POST", json: { versionId: userV1.id, agreed: true } });
  assert("owner accepts individual term", result.status === 200);
  result = await request("/api/terms/accept", ownerAJar, { method: "POST", json: { versionId: contractV1.id, agreed: true } });
  assert("F responsible OWNER accepts tenant term", result.status === 200);
  const evidence = await db.termAcceptance.findFirst({ where: { termVersionId: contractV1.id, tenantId: tenantA.id } });
  assert("contract evidence identifies tenant, membership, identity, role and hash", evidence?.membershipId === ownerAMembership.id &&
    evidence.identityId === ownerA.id && evidence.roleAtAcceptance === "OWNER" && evidence.documentHash === contractV1.sha256);
  result = await request("/api/access/context", userAJar);
  assert("J acceptance releases business API", result.status === 200);
  result = await request("/api/terms/pending", ownerBJar);
  assert("N tenant B does not inherit A contractor acceptance", result.body.pending.some(t => t.audience === "CONTRATANTE"));
  result = await request(`/api/platform/tenants/${tenantB.id}/contractual-responsible`, platform,
    { method: "POST", json: { membershipId: ownerBMembership.id, confirm: true } });
  assert("B responsible assignment", result.status === 200);
  for (const item of [userV1, contractV1]) {
    result = await request("/api/terms/accept", ownerBJar, { method: "POST", json: { versionId: item.id, agreed: true } });
    assert(`B accepts ${item.id}`, result.status === 200);
  }
  result = await request("/api/access/terms", ownerBJar);
  assert("N B administration only sees B identities", result.status === 200 && result.body.rows.length === 1 && result.body.rows[0].email === ownerB.email);
  result = await request("/api/access/terms", ownerAJar);
  assert("tenant A administration sees version/date without IP", result.status === 200 && result.body.rows.length === 2 &&
    !JSON.stringify(result.body).includes("ipAddress") && result.body.rows.some(row => row.terms.some(term => term.acceptedVersion === "V1")));
  result = await request("/api/access/terms", userAJar);
  assert("MEMBER cannot inspect administrative acceptance status", result.status === 403);

  const userV2 = await upload(platform, userDocument.id, "V2", true);
  result = await request(`/api/platform/terms/versions/${userV2.id}/publish`, platform, { method: "POST" });
  assert("publish V2 with reaccept", result.status === 200);
  result = await request("/api/access/context", userAJar);
  assert("K reaccept true blocks previously accepted user", result.status === 428);
  for (const cookies of [userAJar, ownerAJar, ownerBJar]) {
    result = await request("/api/terms/accept", cookies, { method: "POST", json: { versionId: userV2.id, agreed: true } });
    assert("V2 accepted per identity", result.status === 200);
  }
  const userV3 = await upload(platform, userDocument.id, "V3", false);
  result = await request(`/api/platform/terms/versions/${userV3.id}/publish`, platform, { method: "POST" });
  assert("publish V3 without reaccept", result.status === 200);
  result = await request("/api/access/context", userAJar);
  assert("L reaccept false preserves prior acceptance", result.status === 200);
  const newcomer = await makeIdentity("Newcomer");
  await addMembership(newcomer, tenantA, "MEMBER", profileA);
  const newcomerJar = await login(newcomer.email);
  await choose(newcomerJar, tenantA.id);
  result = await request("/api/terms/pending", newcomerJar);
  assert("L new identity must accept latest version", result.body.pending.length === 1 && result.body.pending[0].version === "V3");
  result = await request("/api/terms/accept", newcomerJar, { method: "POST", json: { versionId: userV3.id, agreed: true } });
  assert("new identity accepts V3", result.status === 200);
  assert("M historical acceptances retained", await db.termAcceptance.count({ where: { identityId: userA.id } }) === 2);
  result = await request(`/api/platform/terms/versions/${userV3.id}/retire`, platform, { method: "POST" });
  assert("PlatformAdmin retires current version without deleting history", result.status === 200 &&
    (await db.termVersion.findUnique({ where: { id: userV3.id } })).status === "RETIRED");
  assert("no private tenant data in isolated schema", await db.lancamento.count() === 0);
  console.log(`ACCESS-5A DEV: ${checks.length} checks passed in isolated schema; fixtures will be dropped.`);
} finally {
  if (server && server.exitCode === null) {
    server.kill();
    await Promise.race([
      new Promise(resolve => server.once("exit", resolve)),
      new Promise(resolve => setTimeout(resolve, 5000)),
    ]);
    if (server.exitCode === null) server.kill("SIGKILL");
  }
  if (db) await db.$disconnect();
  if (schemaCreated) await root.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await root.end().catch(() => {});
  const expectedRoot = resolve(process.cwd(), ".private");
  if (testStorage.startsWith(expectedRoot + "\\") && testStorage.includes("access5a-test-")) await rm(testStorage, { recursive: true, force: true });
}
