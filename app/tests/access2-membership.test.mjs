import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

test("RENAN: uma identity, dois tenants, papéis e estados independentes", {
  skip: !process.env.DATABASE_URL,
}, async () => {
  const { prisma, getTenantPrisma } = await import("../src/lib/db.ts");
  const [{ database }] = await prisma.$queryRaw`SELECT current_database() AS database`;
  const url = new URL(process.env.DATABASE_URL);
  assert.equal(database, "gestar_vf_dev");
  assert.equal(url.pathname, "/gestar_vf_dev");
  assert.ok(["localhost", "127.0.0.1"].includes(url.hostname));

  const marker = randomUUID();
  const tenantIds = [];
  let identityId;
  let legacyUserId;
  try {
    for (const [code, name] of [["high", "HIGH EVENTS"], ["home", "THE HOME"]]) {
      const tenant = await prisma.tenant.create({ data: {
        nome: `${name} ACCESS-2 fixture`, slug: `access2-${code}-${marker}`,
        email: `access2-${code}-${marker}@example.invalid`,
      } });
      tenantIds.push(tenant.id);
    }
    const [highId, homeId] = tenantIds;
    const identity = await prisma.authIdentity.create({ data: {
      nome: "RENAN ACCESS-2 fixture", email: `renan-${marker}@example.invalid`, senhaHash: "fixture-hash",
    } });
    identityId = identity.id;
    const high = await prisma.tenantMembership.create({ data: {
      identityId, tenantId: highId, role: "MEMBER", status: "ACTIVE",
    } });
    const home = await prisma.tenantMembership.create({ data: {
      identityId, tenantId: homeId, role: "ADMIN", status: "ACTIVE",
    } });
    assert.equal(await prisma.authIdentity.count({ where: { id: identityId } }), 1);
    assert.equal(await prisma.tenantMembership.count({ where: { identityId } }), 2);
    assert.deepEqual([high.role, home.role], ["MEMBER", "ADMIN"]);
    await assert.rejects(prisma.tenantMembership.create({ data: {
      identityId, tenantId: highId, role: "OWNER",
    } }), { code: "P2002" });

    await prisma.tenantMembership.update({ where: { id: high.id }, data: { status: "INACTIVE" } });
    assert.equal((await prisma.tenantMembership.findUnique({ where: { id: home.id } })).status, "ACTIVE");
    await prisma.tenantMembership.delete({ where: { id: high.id } });
    assert.equal(await prisma.tenantMembership.count({ where: { identityId, tenantId: homeId } }), 1);

    const a = getTenantPrisma(highId);
    const b = getTenantPrisma(homeId);
    const rowA = await a.categoria.create({ data: { codigo: "001", nome: "ACCESS-2 A" } });
    const rowB = await b.categoria.create({ data: { codigo: "001", nome: "ACCESS-2 B" } });
    assert.equal(await a.categoria.findUnique({ where: { id: rowB.id } }), null);
    assert.equal(await b.categoria.findUnique({ where: { id: rowA.id } }), null);

    const legacy = await prisma.usuario.create({ data: {
      tenantId: highId, nome: "ACCESS-2 fixture", email: `legacy-${marker}@example.invalid`,
      senhaHash: "fixture-hash", papel: "membro",
    } });
    legacyUserId = legacy.id;
    await assert.rejects(prisma.legacyUserAccessMap.create({ data: {
      legacyUsuarioId: legacy.id, tenantId: highId,
      identityId, membershipId: home.id,
    } }), { code: "P2003" });
  } finally {
    if (tenantIds.length) await prisma.categoria.deleteMany({ where: { tenantId: { in: tenantIds } } });
    if (legacyUserId) await prisma.usuario.delete({ where: { id: legacyUserId } });
    if (identityId) {
      await prisma.tenantMembership.deleteMany({ where: { identityId } });
      await prisma.authIdentity.delete({ where: { id: identityId } });
    }
    if (tenantIds.length) await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await prisma.$disconnect();
  }
});
