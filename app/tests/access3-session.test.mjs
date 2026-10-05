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

function cookieHeader(jar) {
  return [...jar].map(([key, value]) => `${key}=${value}`).join("; ");
}

async function request(base, jar, path, init = {}) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), Cookie: cookieHeader(jar) },
    redirect: "manual",
  });
  collectCookies(jar, response);
  return response;
}

async function login(base, email, password) {
  const jar = new Map();
  const csrf = await request(base, jar, "/api/auth/csrf");
  assert.equal(csrf.status, 200);
  const { csrfToken } = await csrf.json();
  await request(base, jar, "/api/auth/callback/credentials", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Auth-Return-Redirect": "1" },
    body: new URLSearchParams({ csrfToken, email, password, callbackUrl: `${base}/lancamentos`, json: "true" }),
  });
  const session = await request(base, jar, "/api/auth/session");
  assert.equal(session.status, 200);
  return { jar, session: await session.json() };
}

async function switchTenant(base, jar, tenantId, extras = {}) {
  return request(base, jar, "/api/tenants/switch", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tenantId, ...extras }),
  });
}

test("ACCESS-3 sessão real: Renan 0/1/N, isolamento, revogação e plataforma", {
  skip: !process.env.DATABASE_URL || !process.env.ACCESS3_TEST_BASE_URL,
}, async () => {
  const { prisma } = await import("../src/lib/db.ts");
  const [{ database }] = await prisma.$queryRaw`SELECT current_database() AS database`;
  const url = new URL(process.env.DATABASE_URL);
  assert.equal(database, "gestar_vf_dev");
  assert.equal(url.pathname, "/gestar_vf_dev");
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname));

  const base = process.env.ACCESS3_TEST_BASE_URL;
  const marker = randomUUID();
  const password = `access3-${randomUUID()}`;
  const email = `renan-${marker}@example.invalid`;
  const tenantIds = [];
  const identityIds = [];
  const membershipIds = [];
  const legacyIds = [];
  let highId, homeId, renanId, highMembershipId, homeMembershipId, homeLegacyId;
  try {
    for (const [code, name] of [["high", "HIGH EVENTS"], ["home", "THE HOME"], ["other", "OUTRO"]]) {
      const tenant = await prisma.tenant.create({ data: {
        nome: `${name} ACCESS-3 fixture`, slug: `access3-${code}-${marker}`,
        email: `access3-${code}-${marker}@example.invalid`,
      } });
      tenantIds.push(tenant.id);
    }
    [highId, homeId] = tenantIds;
    const hash = await bcrypt.hash(password, 10);
    const renan = await prisma.authIdentity.create({ data: { nome: "RENAN fixture", email, senhaHash: hash } });
    renanId = renan.id;
    identityIds.push(renanId);
    const highMembership = await prisma.tenantMembership.create({ data: { identityId: renanId, tenantId: highId, role: "MEMBER" } });
    const homeMembership = await prisma.tenantMembership.create({ data: { identityId: renanId, tenantId: homeId, role: "ADMIN" } });
    highMembershipId = highMembership.id;
    homeMembershipId = homeMembership.id;
    membershipIds.push(highMembershipId, homeMembershipId);
    for (const [tenantId, membershipId, papel] of [[highId, highMembershipId, "membro"], [homeId, homeMembershipId, "admin"]]) {
      const legacy = await prisma.usuario.create({ data: { tenantId, nome: "RENAN fixture", email, senhaHash: hash, papel } });
      legacyIds.push(legacy.id);
      if (tenantId === homeId) homeLegacyId = legacy.id;
      await prisma.legacyUserAccessMap.create({ data: { legacyUsuarioId: legacy.id, identityId: renanId, tenantId, membershipId } });
    }
    const other = await prisma.authIdentity.create({ data: {
      nome: "Outra identidade fixture", email: `other-${marker}@example.invalid`, senhaHash: hash,
    } });
    identityIds.push(other.id);
    const otherMembership = await prisma.tenantMembership.create({ data: {
      identityId: other.id, tenantId: tenantIds[2], role: "ADMIN",
    } });
    membershipIds.push(otherMembership.id);
    const zero = await prisma.authIdentity.create({ data: {
      nome: "Sem tenant fixture", email: `zero-${marker}@example.invalid`, senhaHash: hash,
    } });
    identityIds.push(zero.id);
    const platform = await prisma.authIdentity.create({ data: {
      nome: "Platform fixture", email: `platform-${marker}@example.invalid`, senhaHash: hash,
    } });
    identityIds.push(platform.id);
    await prisma.platformAdmin.create({ data: { identityId: platform.id } });
    await prisma.categoria.createMany({ data: [
      { tenantId: highId, codigo: `H-${marker}`, nome: "HIGH fixture" },
      { tenantId: homeId, codigo: `T-${marker}`, nome: "HOME fixture" },
    ] });

    const { jar, session } = await login(base, email.toUpperCase(), password);
    assert.equal(session.user.id, renanId);
    assert.equal(session.user.authMode, "identity");
    const list = await request(base, jar, "/api/tenants");
    assert.equal(list.status, 200);
    assert.deepEqual(new Set((await list.json()).map(t => t.id)), new Set([highId, homeId]));
    assert.equal((await request(base, jar, "/api/access/context")).status, 409, "N memberships require selection");
    assert.equal((await request(base, jar, "/api/categorias")).status, 401);
    const blockedPage = await request(base, jar, "/lancamentos");
    assert.equal(blockedPage.status, 307);
    assert.ok(blockedPage.headers.get("location")?.endsWith("/selecionar-tenant"));
    const choicePage = await request(base, jar, "/selecionar-tenant");
    assert.equal(choicePage.status, 200);
    assert.match(await choicePage.text(), /Selecionar empresa/);
    assert.equal((await switchTenant(base, jar, tenantIds[2], { membershipId: otherMembership.id })).status, 403);
    assert.equal((await switchTenant(base, jar, randomUUID())).status, 403);

    assert.equal((await switchTenant(base, jar, highId, { membershipId: otherMembership.id })).status, 200);
    let context = await (await request(base, jar, "/api/access/context")).json();
    assert.equal(context.tenantId, highId);
    assert.equal(context.membershipId, highMembershipId);
    assert.equal(context.role, "MEMBER");
    let rows = await (await request(base, jar, "/api/categorias")).json();
    assert.deepEqual(rows.map(row => row.nome), ["HIGH fixture"]);

    assert.equal((await switchTenant(base, jar, homeId)).status, 200);
    context = await (await request(base, jar, "/api/access/context")).json();
    assert.equal(context.tenantId, homeId);
    assert.equal(context.role, "ADMIN");
    rows = await (await request(base, jar, "/api/categorias")).json();
    assert.deepEqual(rows.map(row => row.nome), ["HOME fixture"]);

    assert.equal((await switchTenant(base, jar, highId)).status, 200);
    await prisma.tenantMembership.update({ where: { id: highMembershipId }, data: { status: "INACTIVE" } });
    assert.equal((await request(base, jar, "/api/access/context")).status, 409, "revoked cookie cannot operate");
    assert.equal((await switchTenant(base, jar, highId)).status, 403);
    assert.equal((await switchTenant(base, jar, homeId)).status, 200);
    assert.equal((await request(base, jar, "/api/access/context")).status, 200);

    const one = await login(base, email, password);
    assert.equal((await request(base, one.jar, "/api/access/context")).status, 200, "one membership auto-selects");
    await prisma.tenant.update({ where: { id: homeId }, data: { ativo: false } });
    assert.equal((await request(base, jar, "/api/access/context")).status, 403, "inactive tenant blocks context");
    await prisma.tenant.update({ where: { id: homeId }, data: { ativo: true } });
    await prisma.authIdentity.update({ where: { id: renanId }, data: { status: "INACTIVE" } });
    assert.equal((await request(base, jar, "/api/access/context")).status, 401, "inactive identity blocks all");
    await prisma.authIdentity.update({ where: { id: renanId }, data: { status: "ACTIVE" } });
    await prisma.legacyUserAccessMap.delete({ where: { legacyUsuarioId: homeLegacyId } });
    assert.equal((await request(base, one.jar, "/api/access/context")).status, 409, "missing explicit mapping blocks");

    const zeroLogin = await login(base, zero.email, password);
    assert.equal(zeroLogin.session.user.id, zero.id);
    assert.equal((await request(base, zeroLogin.jar, "/api/access/context")).status, 403);
    const platformLogin = await login(base, platform.email, password);
    assert.equal((await request(base, platformLogin.jar, "/api/platform/tenants")).status, 200);
    assert.equal((await request(base, platformLogin.jar, "/api/categorias")).status, 401);
    assert.equal((await switchTenant(base, platformLogin.jar, highId)).status, 403);

    const managedEmail = `managed-${marker}@example.invalid`;
    const createdResponse = await request(base, platformLogin.jar, "/api/usuarios", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId: highId, nome: "Managed fixture", email: managedEmail,
        senha: password, papel: "membro" }),
    });
    assert.equal(createdResponse.status, 201, "admin creation must create the new access model");
    const managed = await createdResponse.json();
    legacyIds.push(managed.id);
    const managedMap = await prisma.legacyUserAccessMap.findUnique({ where: { legacyUsuarioId: managed.id } });
    assert.ok(managedMap?.membershipId);
    identityIds.push(managedMap.identityId);
    membershipIds.push(managedMap.membershipId);
    const managedLogin = await login(base, managedEmail, password);
    assert.equal(managedLogin.session.user.id, managedMap.identityId);
    assert.equal((await (await request(base, managedLogin.jar, "/api/access/context")).json()).role, "MEMBER");
    if (process.env.ACCESS3_LEGACY_BASE_URL) {
      const legacyBase = process.env.ACCESS3_LEGACY_BASE_URL;
      const legacyLogin = await login(legacyBase, managedEmail, password);
      assert.equal(legacyLogin.session.user.authMode, "legacy");
      assert.equal((await request(base, legacyLogin.jar, "/api/access/context")).status, 401,
        "legacy token cannot enter identity mode");
      assert.equal((await request(legacyBase, managedLogin.jar, "/api/access/context")).status, 401,
        "identity token cannot enter rollback mode");
    }
    const promoted = await request(base, platformLogin.jar, `/api/usuarios/${managed.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ papel: "admin" }),
    });
    assert.equal(promoted.status, 200);
    assert.equal((await (await request(base, managedLogin.jar, "/api/access/context")).json()).role, "ADMIN",
      "role must be recalculated without a fresh login");
    const deactivated = await request(base, platformLogin.jar, `/api/usuarios/${managed.id}`, { method: "DELETE" });
    assert.equal(deactivated.status, 200);
    assert.equal((await request(base, managedLogin.jar, "/api/access/context")).status, 403);
  } finally {
    if (tenantIds.length) await prisma.categoria.deleteMany({ where: { tenantId: { in: tenantIds } } });
    if (legacyIds.length) await prisma.legacyUserAccessMap.deleteMany({ where: { legacyUsuarioId: { in: legacyIds } } });
    if (legacyIds.length) await prisma.usuario.deleteMany({ where: { id: { in: legacyIds } } });
    if (identityIds.length) await prisma.platformAdmin.deleteMany({ where: { identityId: { in: identityIds } } });
    if (membershipIds.length) await prisma.tenantMembership.deleteMany({ where: { id: { in: membershipIds } } });
    if (identityIds.length) await prisma.authIdentity.deleteMany({ where: { id: { in: identityIds } } });
    if (tenantIds.length) await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  }
});
