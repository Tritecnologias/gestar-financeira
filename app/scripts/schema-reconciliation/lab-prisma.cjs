const assert = require('node:assert/strict');
const { PrismaClient, Prisma } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

async function main() {
  const url = new URL(process.env.DATABASE_URL);
  assert.match(url.hostname, /^10s-phase2a-pg$/);
  assert.match(url.pathname, /^\/phase2a_[a-z0-9_]+$/);
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.href }) });
  try {
    const [guard] = await prisma.$queryRawUnsafe('SELECT current_database() AS db');
    assert.equal('/' + guard.db, url.pathname);
    let models = 0;
    for (const model of Prisma.dmmf.datamodel.models) {
      const client = prisma[model.name[0].toLowerCase() + model.name.slice(1)];
      await client.findMany({ take: 1 });
      models++;
    }
    const tenantId = '00000000-0000-4000-8000-000000000001';
    const rows = await prisma.lancamento.findMany({ where: { tenantId }, include: { conta: { include: { categoria: true } }, clienteRef: true, fornecedorRef: true, criador: true } });
    assert.equal(rows.length, 1);
    assert.notEqual(rows[0].criador.tenantId, rows[0].tenantId, 'historical authorship must remain unchanged');
    assert.equal((await prisma.lancamento.aggregate({ where: { tenantId }, _sum: { valor: true } }))._sum.valor.toString(), '123.45');
    assert.equal(await prisma.authIdentity.count(), 0);
    assert.equal(await prisma.tenantMembership.count(), 0);
    assert.equal(await prisma.accessProfile.count(), 0);
    let concurrencyExactMatch;
    const rollback = new Error('LAB_ROLLBACK');
    try {
      await prisma.$transaction(async tx => {
        const i = await tx.authIdentity.create({ data: { email: 'pa-lab@example.invalid', nome: 'Synthetic platform only', senhaHash: '!unusable!' } });
        await tx.platformAdmin.create({ data: { identityId: i.id } });
        assert.equal(await tx.tenantMembership.count({ where: { identityId: i.id } }), 0);
        assert.equal(await tx.legacyUserAccessMap.count({ where: { identityId: i.id } }), 0);
        assert.equal(await tx.tenant.count(), 2);
        // Quantify the pre-existing millisecond-vs-microsecond optimistic-lock limitation.
        concurrencyExactMatch = (await tx.lancamento.updateMany({ where: { id: rows[0].id, atualizadoEm: rows[0].atualizadoEm }, data: { anotacao: 'synthetic write' } })).count;
        await tx.lancamento.update({ where: { id: rows[0].id }, data: { anotacao: 'synthetic inline write' } });
        throw rollback;
      });
    } catch (e) { if (e !== rollback) throw e; }
    assert.equal(await prisma.authIdentity.count(), 0);
    assert.equal(await prisma.lancamento.count(), 1);
    console.log(JSON.stringify({ modelsRead: models, relationsAndAggregates: 'PASS', platformWithoutMembership: 'PASS', transactionRollback: 'PASS', microsecondOptimisticLockMatches: concurrencyExactMatch }));
  } finally { await prisma.$disconnect(); }
}
main().catch(() => { console.error('LAB_PRISMA_FAILED'); process.exitCode = 1; });
