import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { trustedClientIp } from "../src/lib/trusted-proxy.ts";
import { databaseConfig } from "../src/lib/database-config.mjs";
import { allowLoginAttempt, LOGIN_WINDOW_MS } from "../src/lib/login-rate-limit.ts";
import { POST } from "../src/app/api/lancamentos/importar/route.ts";
import { inspectArtifact, forbiddenArtifactPath } from "../scripts/secure-build/artifact-policy.mjs";
import { buildMetadata } from "../scripts/secure-build/metadata.mjs";

test("database configuration fails closed without echoing the input", () => {
  assert.throws(() => databaseConfig(""), /DATABASE_URL is required/);
  const bad = "invalid://synthetic-private-value";
  assert.throws(() => databaseConfig(bad), error => !error.message.includes(bad) && /Invalid DATABASE_URL/.test(error.message));
  assert.equal(databaseConfig("postgresql://fixture@localhost:5432/synthetic?schema=test").schema, "test");
});

test("forged IP/proxy headers cannot choose or rotate the login bucket", async () => {
  const store = new Map();
  for (let index = 0; index < 15; index++) {
    const headers = new Headers({ "x-forwarded-for": `192.0.2.${index}, 198.51.100.1`,
      "x-real-ip": `192.0.2.${index}`, "x-10s-proxy-token": "b".repeat(64) });
    const ip = await trustedClientIp(headers, "a".repeat(64));
    assert.equal(ip, null);
    assert.equal(allowLoginAttempt(ip, 1000, store), index < 10);
    assert.equal(await trustedClientIp(headers, ""), null);
  }
  assert.equal(store.size, 1);
  assert.equal(allowLoginAttempt(null, 1000 + LOGIN_WINDOW_MS, store), true);
});

test("only authenticated edge X-Real-IP is accepted, normalized and isolated", async () => {
  const token = "a".repeat(64); // Synthetic fixture, never an operational secret.
  const headers = new Headers({ "x-10s-proxy-token": token, "x-real-ip": "192.0.2.1",
    "x-forwarded-for": "arbitrary-client-value" });
  assert.equal(await trustedClientIp(headers, token), "192.0.2.1");
  for (const invalid of ["192.0.2.1, 192.0.2.2", "999.0.0.1", "unknown", "192.0.2.1:443", "fe80::1%eth0"]){
    headers.set("x-real-ip", invalid);
    assert.equal(await trustedClientIp(headers, token), null);
  }
  headers.set("x-real-ip", "2001:0db8:0000:0000:0000:0000:0000:0001");
  assert.equal(await trustedClientIp(headers, token), "[2001:db8::1]");
  const store = new Map();
  for (let n = 0; n < 10; n++) assert.equal(allowLoginAttempt("192.0.2.1", 1000, store), true);
  assert.equal(allowLoginAttempt("192.0.2.1", 1000, store), false);
  assert.equal(allowLoginAttempt("192.0.2.2", 1000, store), true);
});

test("retired importer never reads cross-tenant payloads or reaches a database", async () => {
  const request = { json() { throw new Error("body must never be read"); },
    body: { tenantId: "foreign", contaId: "foreign-account" } };
  const response = await POST(request);
  assert.equal(response.status, 410);
  assert.equal((await response.json()).code, "LEGACY_IMPORT_RETIRED");
  const source = readFileSync(new URL("../src/app/api/lancamentos/importar/route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\bimport\s|prisma|\.create\(|\.json\(\)/);
});

test("artifact policy rejects secrets/tools/dumps but retains schema and migrations", () => {
  const root = mkdtempSync(join(tmpdir(), "10s-artifact-"));
  try {
    for (const file of ["scripts/reset-passwords.js", ".env.local", ".private/fixture.pdf", "backup.sql", ".git/config"]){
      mkdirSync(join(root, file, ".."), { recursive: true });
      writeFileSync(join(root, file), "synthetic fixture");
    }
    assert.ok(inspectArtifact(root).length >= 5);
    assert.equal(forbiddenArtifactPath("prisma/migrations/0_legacy_baseline/migration.sql"), false);
    assert.equal(forbiddenArtifactPath("prisma/schema.prisma"), false);
    assert.equal(forbiddenArtifactPath("node_modules/package/.env.local"), true);
    assert.equal(forbiddenArtifactPath("node_modules/package/README.md"), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("build metadata requires a full SHA and contains only safe provenance", () => {
  assert.throws(() => buildMetadata("unknown", "homologacao"));
  const metadata = buildMetadata("a".repeat(40), "homologacao", fileURLToPath(new URL("../", import.meta.url)));
  assert.equal(metadata.sourceCommit, "a".repeat(40));
  assert.equal(metadata.sourceBranch, "homologacao");
  assert.match(metadata.lockfileSha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(Object.keys(metadata).sort(), ["applicationVersion", "lockfileSha256", "nodeVersion", "prismaVersion", "sourceBranch", "sourceCommit"].sort());
});

test("compose has mandatory DB/auth secrets and removed scripts cannot return", () => {
  const root = new URL("../../", import.meta.url);
  const compose = readFileSync(new URL("docker-compose.yml", root), "utf8");
  assert.match(compose, /\$\{DB_PASSWORD:\?/);
  assert.match(compose, /\$\{NEXTAUTH_SECRET:\?/);
  assert.doesNotMatch(compose, /\$\{(?:DB_PASSWORD|NEXTAUTH_SECRET):-/);
  for (const name of ["reset-passwords.js", "generate-seed-hashes.js"])
    assert.equal(existsSync(new URL(`app/scripts/${name}`, root)), false);
});
