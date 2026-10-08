import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";

function collectCookies(jar, response) {
  for (const header of response.headers.getSetCookie()) {
    const entry = header.split(";", 1)[0];
    const separator = entry.indexOf("=");
    if (separator > 0) jar.set(entry.slice(0, separator), entry.slice(separator + 1));
  }
}

async function login(baseUrl, email, password) {
  const jar = new Map();
  const csrf = await fetch(`${baseUrl}/api/auth/csrf`);
  assert.equal(csrf.status, 200);
  collectCookies(jar, csrf);
  const { csrfToken } = await csrf.json();
  const payload = new URLSearchParams({ csrfToken, email, password, callbackUrl: `${baseUrl}/lancamentos`, json: "true" });
  const response = await fetch(`${baseUrl}/api/auth/callback/credentials`, {
    method: "POST", redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded",
      Cookie: [...jar].map(([key, value]) => `${key}=${value}`).join("; "),
      "X-Auth-Return-Redirect": "1" },
    body: payload,
  });
  collectCookies(jar, response);
  const session = await fetch(`${baseUrl}/api/auth/session`, {
    headers: { Cookie: [...jar].map(([key, value]) => `${key}=${value}`).join("; ") },
  });
  assert.equal(session.status, 200);
  return session.json();
}

test("login legado funciona e email ambíguo falha sem escolher tenant", {
  skip: !process.env.DATABASE_URL || !process.env.ACCESS2_TEST_BASE_URL,
}, async () => {
  const { prisma } = await import("../src/lib/db.ts");
  const [{ database }] = await prisma.$queryRaw`SELECT current_database() AS database`;
  assert.equal(database, "gestar_vf_dev");
  const marker = randomUUID();
  const tenantIds = [];
  const email = `access2-login-${marker}@example.invalid`;
  const password = `fixture-${randomUUID()}`;
  try {
    for (const code of ["a", "b"]) {
      const tenant = await prisma.tenant.create({ data: {
        nome: `ACCESS-2 Login ${code}`, slug: `access2-login-${code}-${marker}`,
        email: `access2-login-${code}-${marker}@example.invalid`,
      } });
      tenantIds.push(tenant.id);
    }
    const first = await prisma.usuario.create({ data: {
      tenantId: tenantIds[0], nome: "ACCESS-2 Login fixture", email,
      senhaHash: await bcrypt.hash(password, 10), papel: "membro",
    } });
    const baseUrl = process.env.ACCESS2_TEST_BASE_URL;
    const valid = await login(baseUrl, email.toUpperCase(), password);
    assert.equal(valid?.user?.id, first.id);
    assert.equal(valid?.user?.tenantId, tenantIds[0]);

    await prisma.usuario.create({ data: {
      tenantId: tenantIds[1], nome: "ACCESS-2 Login fixture B", email,
      senhaHash: await bcrypt.hash(`different-${password}`, 10), papel: "membro",
    } });
    const ambiguous = await login(baseUrl, email, password);
    assert.ok(!ambiguous?.user?.id, "ambiguous email must not authenticate");
  } finally {
    if (tenantIds.length) await prisma.usuario.deleteMany({ where: { tenantId: { in: tenantIds } } });
    if (tenantIds.length) await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  }
});
