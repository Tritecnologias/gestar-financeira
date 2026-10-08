import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

const envPath = fileURLToPath(new URL("../.env.local", import.meta.url));
if (!process.env.DATABASE_URL && existsSync(envPath)) {
  const line = readFileSync(envPath, "utf8").split(/\r?\n/).find(value => /^DATABASE_URL\s*=/.test(value));
  if (line) {
    let value = line.slice(line.indexOf("=") + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env.DATABASE_URL = value;
  }
}

test("Prisma escopado nunca lê nem grava dados do outro tenant", { skip: !process.env.DATABASE_URL }, async () => {
  const { prisma, getTenantPrisma } = await import("../src/lib/db.ts");
  const [{ database }] = await prisma.$queryRaw`SELECT current_database() AS database`;
  assert.equal(database, "gestar_vf_dev", "fixtures só podem ser criadas no sandbox DEV");

  const marker = randomUUID();
  const ids = [];
  try {
    for (const name of ["a", "b"]) {
      const tenant = await prisma.tenant.create({ data: {
        nome: `ACCESS-1A ${name}`, slug: `access-1a-${name}-${marker}`,
        email: `access-1a-${name}-${marker}@example.invalid`,
      } });
      ids.push(tenant.id);
    }
    const [tenantA, tenantB] = ids;
    const a = getTenantPrisma(tenantA);
    const b = getTenantPrisma(tenantB);
    const aRow = await a.categoria.create({ data: { tenantId: tenantB, codigo: "001", nome: "A" } });
    const bRow = await b.categoria.create({ data: { codigo: "001", nome: "B" } });
    assert.equal(aRow.tenantId, tenantA);

    assert.deepEqual((await a.categoria.findMany({ where: { tenantId: tenantB } })).map(row => row.id), [aRow.id]);
    assert.equal((await a.categoria.findFirst({ where: { id: bRow.id, tenantId: tenantB } })), null);
    assert.equal(await a.categoria.findUnique({ where: { id: bRow.id, tenantId: tenantB } }), null);
    await assert.rejects(a.categoria.findUniqueOrThrow({ where: { id: bRow.id } }), { code: "P2025" });
    assert.equal(await a.categoria.count({ where: { tenantId: tenantB } }), 1);
    assert.equal((await a.categoria.aggregate({ where: { tenantId: tenantB }, _count: true }))._count, 1);
    assert.deepEqual((await a.categoria.groupBy({ by: ["tenantId"], where: { tenantId: tenantB }, _count: true })).map(row => row.tenantId), [tenantA]);

    await assert.rejects(a.categoria.update({ where: { id: bRow.id }, data: { nome: "VIOLATION" } }), { code: "P2025" });
    await assert.rejects(a.categoria.delete({ where: { id: bRow.id } }), { code: "P2025" });
    assert.equal((await a.categoria.update({ where: { id: aRow.id }, data: { tenantId: tenantB, nome: "A2" } })).tenantId, tenantA);
    assert.equal((await a.categoria.updateMany({ where: { id: bRow.id, tenantId: tenantB }, data: { tenantId: tenantB, nome: "VIOLATION" } })).count, 0);
    assert.equal((await a.categoria.deleteMany({ where: { id: bRow.id, tenantId: tenantB } })).count, 0);
    await assert.rejects(a.categoria.upsert({ where: { id: bRow.id }, update: { nome: "VIOLATION" }, create: { id: bRow.id, tenantId: tenantB, codigo: "002", nome: "VIOLATION" } }));
    assert.equal((await prisma.categoria.findUnique({ where: { id: bRow.id } })).nome, "B");

    const created = await a.categoria.createManyAndReturn({ data: [{ tenantId: tenantB, codigo: "003", nome: "A3" }] });
    assert.equal(created[0].tenantId, tenantA);
    const updated = await a.categoria.updateManyAndReturn({ where: { id: created[0].id, tenantId: tenantB }, data: { tenantId: tenantB, nome: "A4" } });
    assert.equal(updated[0].tenantId, tenantA);
    assert.equal((await prisma.categoria.findUnique({ where: { id: bRow.id } })).nome, "B");
    await a.categoria.createMany({ data: [{ tenantId: tenantB, codigo: "004", nome: "A5" }] });
    assert.equal((await a.categoria.findFirst({ where: { codigo: "004" } })).tenantId, tenantA);
    const upserted = await a.categoria.upsert({ where: { tenantId_codigo: { tenantId: tenantA, codigo: "004" } },
      create: { tenantId: tenantB, codigo: "004", nome: "WRONG" }, update: { tenantId: tenantB, nome: "A6" } });
    assert.equal(upserted.tenantId, tenantA);
    assert.equal(upserted.nome, "A6");
  } finally {
    if (ids.length) await prisma.tenant.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  }
});
