import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";

function remember(jar, response) {
  for (const header of response.headers.getSetCookie()) {
    const entry = header.split(";", 1)[0];
    const separator = entry.indexOf("=");
    if (separator > 0) jar.set(entry.slice(0, separator), entry.slice(separator + 1));
  }
}

async function request(base, jar, path, init = {}) {
  const response = await fetch(`${base}${path}`, { ...init, redirect: "manual",
    headers: { ...(init.headers ?? {}), Cookie: [...jar].map(([key, value]) => `${key}=${value}`).join("; ") } });
  remember(jar, response);
  return response;
}

async function login(base, email, password) {
  const jar = new Map();
  const csrf = await request(base, jar, "/api/auth/csrf");
  assert.equal(csrf.status, 200);
  const { csrfToken } = await csrf.json();
  await request(base, jar, "/api/auth/callback/credentials", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken, email, password, callbackUrl: `${base}/lancamentos`, json: "true" }),
  });
  const session = await request(base, jar, "/api/auth/session");
  assert.equal(session.status, 200);
  return { jar, user: (await session.json()).user };
}

test("ACCESS-3B DEV: backfill, rerun, plataforma isolada e identidade combinada", {
  skip: !process.env.DATABASE_URL || !process.env.ACCESS3B_TEST_BASE_URL,
}, async () => {
  const { prisma, requireDevDatabase, loadPlatformAdminPlan } = await import("../scripts/access3b/context.mjs");
  const { runPlatformAdminBackfill } = await import("../scripts/access3b/migration.mjs");
  await requireDevDatabase();
  assert.equal(await prisma.usuario.count({ where: { papel: "admin_global" } }), 0,
    "test only runs when DEV has no pre-existing global admins");
  const base = process.env.ACCESS3B_TEST_BASE_URL;
  const marker = randomUUID().slice(0, 8);
  const tenantIds = [], identityIds = [], legacyIds = [];
  const password = `Fixture-${randomUUID()}`;
  const hash = await bcrypt.hash(password, 10);
  try {
    for (const label of ["a", "b"]) {
      const tenant = await prisma.tenant.create({ data: {
        nome: `ACCESS-3B ${label} ${marker}`, slug: `access3b-${label}-${marker}`,
        email: `tenant-${label}-${marker}@example.invalid`,
      } });
      tenantIds.push(tenant.id);
    }
    const [tenantA, tenantB] = tenantIds;
    const soloEmail = `solo-${marker}@example.invalid`;
    const soloLegacy = await prisma.usuario.create({ data: {
      tenantId: tenantA, nome: "Global solo fixture", email: soloEmail,
      senhaHash: hash, papel: "admin_global",
    } });
    legacyIds.push(soloLegacy.id);
    const inactiveLegacy = await prisma.usuario.create({ data: {
      tenantId: tenantA, nome: "Global inactive fixture",
      email: `inactive-${marker}@example.invalid`, senhaHash: hash,
      papel: "admin_global", ativo: false,
    } });
    legacyIds.push(inactiveLegacy.id);

    const comboEmail = `combo-${marker}@example.invalid`;
    const comboGlobal = await prisma.usuario.create({ data: {
      tenantId: tenantA, nome: "Global combo fixture", email: comboEmail,
      senhaHash: hash, papel: "admin_global",
    } });
    legacyIds.push(comboGlobal.id);

    const adminEmail = `admin-${marker}@example.invalid`;
    const adminIdentity = await prisma.authIdentity.create({ data: {
      email: adminEmail, nome: "Tenant admin fixture", senhaHash: hash,
    } });
    identityIds.push(adminIdentity.id);
    const adminMember = await prisma.tenantMembership.create({ data: {
      identityId: adminIdentity.id, tenantId: tenantA, role: "ADMIN",
    } });
    const adminLegacy = await prisma.usuario.create({ data: {
      tenantId: tenantA, nome: adminIdentity.nome, email: adminEmail,
      senhaHash: hash, papel: "admin",
    } });
    legacyIds.push(adminLegacy.id);
    await prisma.legacyUserAccessMap.create({ data: {
      legacyUsuarioId: adminLegacy.id, identityId: adminIdentity.id,
      tenantId: tenantA, membershipId: adminMember.id,
    } });

    const before = await loadPlatformAdminPlan();
    assert.equal(before.report.safeCreate, 3);
    const membershipCount = await prisma.tenantMembership.count();
    const result = await runPlatformAdminBackfill();
    assert.deepEqual(result.changes, { createdIdentities: 3, createdPlatformAdmins: 3, linkedMappings: 3 });
    assert.equal(await prisma.tenantMembership.count(), membershipCount);
    const soloMap = await prisma.legacyUserAccessMap.findUnique({ where: { legacyUsuarioId: soloLegacy.id } });
    const comboMap = await prisma.legacyUserAccessMap.findUnique({ where: { legacyUsuarioId: comboGlobal.id } });
    const inactiveMap = await prisma.legacyUserAccessMap.findUnique({
      where: { legacyUsuarioId: inactiveLegacy.id },
      include: { identity: true, platformAdmin: true },
    });
    identityIds.push(soloMap.identityId);
    identityIds.push(comboMap.identityId);
    identityIds.push(inactiveMap.identityId);
    assert.equal(soloMap.membershipId, null);
    assert.ok(soloMap.platformAdminId);
    assert.equal(comboMap.membershipId, null);
    assert.equal(inactiveMap.identity.status, "INACTIVE");
    assert.equal(inactiveMap.platformAdmin.status, "INACTIVE");
    const member = await prisma.tenantMembership.create({ data: {
      identityId: comboMap.identityId, tenantId: tenantA, role: "MEMBER",
    } });
    const comboBusiness = await prisma.usuario.create({ data: {
      tenantId: tenantA, nome: "Business fixture", email: `business-${marker}@example.invalid`,
      senhaHash: hash, papel: "membro",
    } });
    legacyIds.push(comboBusiness.id);
    await prisma.legacyUserAccessMap.create({ data: {
      legacyUsuarioId: comboBusiness.id, identityId: comboMap.identityId,
      tenantId: tenantA, membershipId: member.id,
    } });
    assert.deepEqual((await runPlatformAdminBackfill()).changes,
      { createdIdentities: 0, createdPlatformAdmins: 0, linkedMappings: 0 });

    const solo = await login(base, soloEmail, password);
    assert.ok(solo.user?.id);
    assert.equal((await request(base, solo.jar, "/api/platform/tenants")).status, 200);
    assert.deepEqual(await (await request(base, solo.jar, "/api/tenants")).json(), []);
    assert.equal((await request(base, solo.jar, "/api/access/context")).status, 403);
    assert.equal((await request(base, solo.jar, "/api/categorias")).status, 401);
    const soloSwitch = await request(base, solo.jar, "/api/tenants/switch", { method: "POST",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenantId: tenantB }) });
    assert.equal(soloSwitch.status, 403);

    const combo = await login(base, comboEmail, password);
    assert.ok(combo.user?.id);
    assert.equal((await request(base, combo.jar, "/api/platform/tenants")).status, 200);
    const choices = await (await request(base, combo.jar, "/api/tenants")).json();
    assert.deepEqual(choices.map(item => [item.id, item.role]), [[tenantA, "MEMBER"]]);
    const context = await (await request(base, combo.jar, "/api/access/context")).json();
    assert.equal(context.role, "MEMBER");
    const comboSwitch = await request(base, combo.jar, "/api/tenants/switch", { method: "POST",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenantId: tenantB }) });
    assert.equal(comboSwitch.status, 403);

    const admin = await login(base, adminEmail, password);
    assert.ok(admin.user?.id);
    assert.equal((await request(base, admin.jar, "/api/platform/tenants")).status, 403);
    const listed = await (await request(base, admin.jar, "/api/usuarios")).json();
    assert.ok(!listed.some(item => item.id === soloLegacy.id || item.id === comboGlobal.id));
    const edit = await request(base, admin.jar, `/api/usuarios/${comboBusiness.id}`, { method: "PUT",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: "Blocked" }) });
    assert.equal(edit.status, 410);
    assert.equal((await request(base, admin.jar, `/api/usuarios/${comboBusiness.id}`, { method: "DELETE" })).status, 410);
    const promote = await request(base, admin.jar, "/api/usuarios", { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId: tenantA, nome: "Blocked", email: `blocked-${marker}@example.invalid`,
        senha: password, papel: "admin_global" }) });
    assert.equal(promote.status, 410);

    await prisma.platformAdmin.update({ where: { identityId: comboMap.identityId }, data: { status: "INACTIVE" } });
    assert.equal((await request(base, combo.jar, "/api/platform/tenants")).status, 403);
    assert.equal((await request(base, combo.jar, "/api/access/context")).status, 200,
      "inactive platform grant does not revoke business membership");
  } finally {
    if (legacyIds.length) {
      const mappings = await prisma.legacyUserAccessMap.findMany({
        where: { legacyUsuarioId: { in: legacyIds } }, select: { identityId: true },
      });
      identityIds.push(...mappings.map(map => map.identityId));
    }
    const cleanupIdentityIds = [...new Set(identityIds)];
    if (legacyIds.length) await prisma.legacyUserAccessMap.deleteMany({ where: { legacyUsuarioId: { in: legacyIds } } });
    if (cleanupIdentityIds.length) await prisma.platformAdmin.deleteMany({ where: { identityId: { in: cleanupIdentityIds } } });
    if (cleanupIdentityIds.length) await prisma.tenantMembership.deleteMany({ where: { identityId: { in: cleanupIdentityIds } } });
    if (legacyIds.length) await prisma.usuario.deleteMany({ where: { id: { in: legacyIds } } });
    if (cleanupIdentityIds.length) await prisma.authIdentity.deleteMany({ where: { id: { in: cleanupIdentityIds } } });
    if (tenantIds.length) await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  }
});
