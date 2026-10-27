// Fresh, synthetic Docker laboratory only. Never copies accounts from an environment.
const assert = require('node:assert/strict'), crypto = require('node:crypto');
const { PrismaClient } = require('@prisma/client'), { PrismaPg } = require('@prisma/adapter-pg');
const ts = require('typescript'), fs = require('node:fs');
require.extensions['.ts'] = (m, p) => m._compile(ts.transpileModule(fs.readFileSync(p, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, p);
const { ALL_PERMISSIONS } = require('/app/src/lib/access-catalog.ts');
async function main() {
  const url = new URL(process.env.DATABASE_URL);
  assert.equal(process.env.PG18_LAB, '1'); assert.equal(url.hostname, 'phase10b-functional-pg');
  assert.match(url.pathname, /^\/phase10b_(excel|financial)$/);
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url.href }) });
  try {
    assert.equal(await db.tenant.count(), 0); assert.equal(await db.authIdentity.count(), 0);
    const rows = await db.$queryRawUnsafe('SELECT migration_name,checksum FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL');
    const { assertBackupMigrations } = await import('/app/src/lib/backup/schema-contract.mjs'); assertBackupMigrations(rows, 0);
    const bcrypt = require('bcryptjs'), hash = await bcrypt.hash(crypto.randomBytes(32).toString('base64url'), 10);
    const tenants = [], profiles = [];
    for (let i = 0; i < 8; i++) {
      const tenant = await db.tenant.create({ data: { id: '10000000-0000-4000-8000-' + String(i + 1).padStart(12, '0'), nome: 'PG18 SYNTHETIC ' + i,
        slug: i === 0 ? 'modo-dev' : i === 1 ? 'modo-dev-isolamento' : 'pg18-lab-' + i, email: 'pg18-tenant-' + i + '@example.invalid' } });
      tenants.push(tenant);
      profiles.push({ full: await db.accessProfile.create({ data: { tenantId: tenant.id, nome: 'LAB FULL', permissoes: ALL_PERMISSIONS } }),
        read: await db.accessProfile.create({ data: { tenantId: tenant.id, nome: 'LAB READ', permissoes: ALL_PERMISSIONS.filter(p => p.endsWith('.view') && !p.startsWith('acessos.') && !p.startsWith('sistema.backup.')) } }) });
    }
    async function identity(key, tenantIndex, role) {
      const who = await db.authIdentity.create({ data: { email: 'phase3a-' + key + '@example.invalid', nome: 'PG18 synthetic ' + key, senhaHash: hash } });
      const tenantId = tenants[tenantIndex].id;
      const membership = await db.tenantMembership.create({ data: { tenantId, identityId: who.id, role, profileId: profiles[tenantIndex][role === 'MEMBER' ? 'read' : 'full'].id } });
      const legacy = await db.usuario.create({ data: { tenantId, email: who.email, nome: who.nome, senhaHash: hash, papel: role === 'MEMBER' ? 'membro' : 'admin' } });
      await db.legacyUserAccessMap.create({ data: { tenantId, identityId: who.id, membershipId: membership.id, legacyUsuarioId: legacy.id } });
      if (role === 'OWNER') await db.tenantContractualResponsible.create({ data: { tenantId, membershipId: membership.id, assignedByIdentityId: who.id } });
      return who;
    }
    await identity('admin', 0, 'ADMIN'); await identity('member', 0, 'MEMBER');
    await identity('owner', url.pathname.endsWith('excel') ? 1 : 0, 'OWNER');
    if (url.pathname.endsWith('financial')) for (let i = 1; i < 8; i++) await identity('owner-' + i, i, 'OWNER');
    const pa = await db.authIdentity.create({ data: { email: 'pg18-platform@example.invalid', nome: 'PG18 synthetic platform', senhaHash: hash } });
    await db.platformAdmin.create({ data: { identityId: pa.id } });
    if (url.pathname.endsWith('financial')) await db.lancamento.create({ data: { tenantId: tenants[2].id, seq: 1, descricao: 'PG18 isolated neighbor', valor: 0 } });
    console.log(JSON.stringify({ state: 'SYNTHETIC_LAB_SEEDED', tenants: 8, humanAccounts: 0 }));
  } finally { await db.$disconnect(); }
}
main().catch(e => { console.error(JSON.stringify({ state: 'FAILED', code: e.code || e.name, message: e.code === 'ERR_ASSERTION' ? e.message : undefined })); process.exitCode = 1; });
