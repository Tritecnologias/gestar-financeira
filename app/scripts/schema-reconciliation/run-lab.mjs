import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// No external URL, .env loader, generic target or production-capable apply mode.
const output = process.argv[3];
assert.equal(process.argv[2], '--local-docker-lab');
assert.ok(output && path.isAbsolute(output), 'provide an absolute private evidence directory');
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const pg = '10s-phase2a-pg', node = '10s-phase2a-node';
const network = '10s-phase2a-lab';
const runId = Date.now();
const name = suffix => `phase2a_${runId}_${suffix}`;
const legacy = name('legacy'), restored = name('restored'), fresh = name('fresh'), target = name('target');
mkdirSync(output, { recursive: true });
function docker(args, input, allowFailure = false, binary = false) {
  const r = spawnSync('docker', args, { input, encoding: binary ? undefined : 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (!allowFailure && r.status !== 0) throw new Error(`LOCAL_DOCKER_FAILED ${args.slice(0, 3).join(' ')}: ${r.stderr}`);
  return r;
}
const context = JSON.parse(docker(['context', 'inspect']).stdout)[0];
assert.match(context.Endpoints.docker.Host, /^npipe:\/\//, 'this runner is restricted to local Windows Docker Desktop');
assert.equal(JSON.parse(docker(['network', 'inspect', network]).stdout)[0].Internal, true);
for (const container of [pg, node]) {
  const c = JSON.parse(docker(['inspect', container]).stdout)[0];
  assert.equal(c.Config.Labels.purpose, 'phase2a-isolated-lab');
  assert.deepEqual(Object.keys(c.NetworkSettings.Networks), [network]);
  assert.equal(Object.keys(c.HostConfig.PortBindings ?? {}).length, 0);
  assert.equal(c.State.Running, true);
}
function sql(db, text, fail = false) {
  assert.ok(db === 'postgres' || /^phase2a_\d+_[a-z_]+$/.test(db));
  const r = docker(['exec','-i',pg,'psql','-X','-Atq','-v','ON_ERROR_STOP=1','-U','postgres','-d',db], text, fail);
  return fail ? r : r.stdout.trim();
}
const read = p => readFileSync(path.join(app, p), 'utf8');
const catalogSql = read('scripts/schema-reconciliation/catalog.sql');
const migration = read('prisma/migrations/20261004_legacy_schema_reconciliation/migration.sql');
const catalog = db => JSON.parse(sql(db, 'SET search_path=public,pg_catalog;' + catalogSql));
const tables = c => c.relations.filter(r => r.kind === 'r').map(r => r.name);
const quote = s => '"' + s.replaceAll('"','""') + '"';
function data(db, original) {
  const result = {};
  for (const t of tables(original)) {
    const columns = original.columns.filter(c => c.tab === t).map(c => quote(c.col)).join(',');
    result[t] = JSON.parse(sql(db, `SET timezone='UTC'; SELECT json_build_array(count(*),md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' ORDER BY x.id::text COLLATE "C"),''))) FROM (SELECT ${columns} FROM ${quote(t)}) x`));
  }
  result.view = sql(db, "SET timezone='UTC'; SELECT md5(coalesce(jsonb_agg(to_jsonb(v) ORDER BY id)::text,'')) FROM vw_powerbi_lancamentos v");
  return result;
}
function migrate(db, command = 'deploy') {
  const r = docker(['exec','-e',`DATABASE_URL=postgresql://postgres@${pg}:5432/${db}`, node,'node','node_modules/prisma/build/index.js','migrate',command]);
  writeFileSync(path.join(output, `${db}-${command}.log`), r.stdout + r.stderr);
  return r.stdout;
}
const report = { localOnly: true, runId, tests: [], databases: [legacy, restored, fresh, target] };
function pass(label) { report.tests.push(label); console.log('PASS ' + label); }
for (const db of report.databases) sql('postgres', `CREATE DATABASE ${db}`);
sql('postgres', "DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='powerbi_reader') THEN CREATE ROLE powerbi_reader NOLOGIN; END IF; END $$;");
sql(legacy, read('tests/fixtures/schema-reconciliation/legacy-schema.sql'));
sql(legacy, 'BEGIN;' + read('tests/fixtures/schema-reconciliation/synthetic-data.sql') + 'COMMIT;');
const before = catalog(legacy), beforeData = data(legacy, before);
const viewAcl = db => sql(db,"SELECT relacl::text FROM pg_class WHERE oid='vw_powerbi_lancamentos'::regclass");
const beforeViewAcl = viewAcl(legacy);
const backup = docker(['exec',pg,'pg_dump','-U','postgres','-d',legacy,'-Fc'], undefined, false, true).stdout;
writeFileSync(path.join(output, 'synthetic-before.dump'), backup);
report.backupSha256 = createHash('sha256').update(backup).digest('hex');
docker(['exec','-i',pg,'pg_restore','--list'], backup);
docker(['exec','-i',pg,'pg_restore','--exit-on-error','--no-owner','-U','postgres','-d',restored], backup);
assert.deepEqual(catalog(restored), before); assert.deepEqual(data(restored, before), beforeData);
pass('backup and full restore preserve catalog, all rows and Power BI view');

// Copy only versioned operational inputs, never local env/private files or node_modules.
docker(['cp',path.join(app,'prisma/migrations/20261004_legacy_schema_reconciliation'),`${node}:/app/prisma/migrations/`]);
docker(['cp',path.join(app,'scripts/schema-reconciliation'),`${node}:/app/scripts/`]);
migrate(legacy);
assert.deepEqual(data(legacy, before), beforeData);
assert.equal(viewAcl(legacy), beforeViewAcl);
assert.equal(sql(legacy,"SET ROLE powerbi_reader; SELECT count(*) FROM vw_powerbi_lancamentos"),'1');
assert.equal(sql(legacy, "SELECT count(*) FROM pg_constraint WHERE connamespace='public'::regnamespace AND NOT convalidated"), '0');
assert.equal(sql(legacy, "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL"), '13');
assert.equal(sql(legacy, "SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL"), '0');
assert.equal(sql(legacy, "SELECT count(*) FROM _prisma_migrations WHERE rolled_back_at IS NOT NULL"), '1');
for (const t of ['auth_identities','platform_admins','tenant_memberships','access_profiles','legacy_user_access_maps']) assert.equal(sql(legacy, `SELECT count(*) FROM ${t}`), '0');
assert.match(migrate(legacy, 'status'), /up to date/i);
pass('standard Prisma deploy: 13 successes, historical rollback preserved, zero access grants');
pass('all legacy values, UUID references, microseconds, dates and cross-tenant authorship preserved');
pass('existing Power BI SELECT grant, owner and UUID view result preserved');
const after = catalog(legacy);
sql(legacy, migration); assert.deepEqual(catalog(legacy), after); assert.deepEqual(data(legacy,before),beforeData);
pass('exact reconciled catalog rerun is a no-op');
assert.notEqual(sql(legacy, `UPDATE lancamentos SET seq=2`, true).status, 0);
assert.notEqual(sql(legacy, `INSERT INTO categorias(tenant_id,codigo,nome) VALUES ('00000000-0000-4000-8000-999999999999','orphan','synthetic')`, true).status, 0);
assert.notEqual(sql(legacy, `UPDATE lancamentos SET valor=0`, true).status, 0);
pass('legacy immutable sequence, financial check and FK still enforce their original rules');

for (const [label, mutation, expected] of [
  ['unknown', 'ALTER TABLE tenants ADD COLUMN unexpected text', 'PHASE2A_UNRECOGNIZED_CATALOG'],
  ['partial', "UPDATE _prisma_migrations SET rolled_back_at=NULL WHERE migration_name='20261005_access_identity_membership'", 'PHASE2A_UNRESOLVED_MIGRATION'],
  ['checksum', "UPDATE _prisma_migrations SET checksum=repeat('0',64) WHERE migration_name='0_legacy_baseline'", 'PHASE2A_UNKNOWN_MIGRATION_OR_CHECKSUM'],
  ['view_acl', 'GRANT SELECT ON vw_powerbi_lancamentos TO PUBLIC', 'PHASE2A_VIEW_PRIVILEGES_OR_COMMENTS_REQUIRE_REVIEW'],
]) {
  const db = name(label); report.databases.push(db);
  sql('postgres', `CREATE DATABASE ${db} TEMPLATE ${restored}`);
  sql(db, mutation); const state = catalog(db);
  const failed = sql(db,migration,true); assert.notEqual(failed.status, 0); assert.match(failed.stderr,new RegExp(expected));
  assert.deepEqual(catalog(db),state); assert.deepEqual(data(db,before),beforeData);
  pass(`negative ${label}: abort without partial DDL or changed rows`);
}
// Target clone path: existing 12 migrations applied BEFORE adding reconciliation.
sql(target,read('tests/fixtures/schema-reconciliation/target-schema.sql'));
sql(target,"INSERT INTO auth_identities(id,email,nome,senha_hash) VALUES ('synthetic-pa-1','pa1@example.invalid','Synthetic PA1','!unusable!'),('synthetic-pa-2','pa2@example.invalid','Synthetic PA2','!unusable!'); INSERT INTO platform_admins(id,identity_id) VALUES ('grant-1','synthetic-pa-1'),('grant-2','synthetic-pa-2');");
const targetBefore = catalog(target);
sql(target, migration); assert.deepEqual(catalog(target), targetBefore);
assert.equal(sql(target,'SELECT count(*) FROM auth_identities'),'2');
assert.equal(sql(target,'SELECT count(*) FROM platform_admins'),'2');
assert.equal(sql(target,'SELECT count(*) FROM tenant_memberships'),'0');
pass('fully migrated HOMO structural fixture is an exact no-op');
migrate(fresh); assert.deepEqual(catalog(fresh), targetBefore);
assert.match(migrate(fresh,'status'), /up to date/i);
pass('fresh database baseline + new barrier + ACCESS has unchanged target catalog');
const smoke = docker(['exec','-e',`DATABASE_URL=postgresql://postgres@${pg}:5432/${legacy}`,node,'node','scripts/schema-reconciliation/lab-prisma.cjs']);
report.prisma = JSON.parse(smoke.stdout.trim());
pass('all Prisma models, relations, aggregation, isolated PlatformAdmin and rollback');
const dry = docker(['exec','-e',`DATABASE_URL=postgresql://postgres@${pg}:5432/${legacy}`,node,'node','scripts/schema-reconciliation/dry-run.mjs',legacy]);
report.identityPlan = JSON.parse(dry.stdout); assert.equal(report.identityPlan.writes,0);
assert.deepEqual(data(legacy,before),beforeData);
pass('read-only identity dry-run leaves all data intact');
const rollbackDb=name('rollback'); report.databases.push(rollbackDb);
sql('postgres',`CREATE DATABASE ${rollbackDb}`);
docker(['exec','-i',pg,'pg_restore','--exit-on-error','--no-owner','-U','postgres','-d',rollbackDb],backup);
assert.deepEqual(catalog(rollbackDb),before); assert.deepEqual(data(rollbackDb,before),beforeData);
assert.equal(viewAcl(rollbackDb),beforeViewAcl);
pass('post-upgrade rollback drill restores original UUID schema, data, ledger and view ACL');
writeFileSync(path.join(output,'catalog-before.json'),JSON.stringify(before,null,2));
writeFileSync(path.join(output,'catalog-after.json'),JSON.stringify(after,null,2));
writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({ tests: report.tests.length, tablesAfter: tables(after).length + 1, ...report.prisma, output },null,2));
// Leave ONLY named local lab databases as evidence. No remote cleanup or mutation.
