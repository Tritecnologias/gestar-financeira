import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { testTenantLabel } from '../src/lib/test-tenant.ts';
const { PLAN, guardEnvironment } = createRequire(import.meta.url)('../scripts/phase3a/provision.cjs');
const homo = { DATABASE_URL: 'postgres://fixture@hd9a0oz02vexqe9u8qadzg6k/gestar_financeira_homolog',
  ACCESS_AUTH_MODE: 'identity', APP_PUBLIC_URL: 'https://homolog.dezsolucoes.com.br', NEXTAUTH_URL: 'https://homolog.dezsolucoes.com.br' };
test('HOMO guard rejects production, wrong schema, host, auth and URL before writes', () => {
  assert.doesNotThrow(() => guardEnvironment(homo));
  for (const diff of [{ DATABASE_URL: homo.DATABASE_URL.replace('homolog', 'prod') },
    { DATABASE_URL: homo.DATABASE_URL + '?schema=private' },
    { DATABASE_URL: homo.DATABASE_URL.replace('hd9a0oz02vexqe9u8qadzg6k', 'gestar_financeira_db') },
    { ACCESS_AUTH_MODE: 'legacy' }, { APP_PUBLIC_URL: 'https://dezsolucoes.com.br' }, { PHASE3A_LAB: '1' }])
    assert.throws(() => guardEnvironment({ ...homo, ...diff }));
});
test('fixture plan keeps global admins independent and no institutional membership', () => {
  assert.equal(PLAN.platformAdmins, 2); assert.equal(PLAN.institutionalMemberships, 0);
  assert.equal(PLAN.principalMemberships, 2); assert.equal(PLAN.tenants, 2);
});
test('test banner uses exact reserved slug, not an arbitrary tenant name', () => {
  assert.equal(testTenantLabel('modo-dev'), 'MODO DEV — DADOS DE TESTE');
  assert.match(testTenantLabel('modo-dev-isolamento'), /DADOS DE TESTE/);
  for (const slug of [undefined, null, '', 'cliente', 'modo-dev-cliente', 'MODO DEV']) assert.equal(testTenantLabel(slug), null);
});
