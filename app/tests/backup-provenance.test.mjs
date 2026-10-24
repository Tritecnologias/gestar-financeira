import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { TABLES, COLUMNS } from '../src/lib/backup/catalog.mjs';
import { VERSION, LEGACY_VERSION, digest, seal, validate } from '../src/lib/backup/format.mjs';
import { authenticateBackup, verifyProvenance, signingConfig } from '../src/lib/backup/provenance.mjs';
const config = () => ({ instanceId: 'lab-instance', activeKeyId: 'first', keys: { first: randomBytes(32).toString('hex') } });
function body() {
  const b = { format: VERSION, tenant: { id: 'tenant-a' }, sections: Object.fromEntries(TABLES.map(t => [t, { rows: [], count: 0, checksum: digest([]) }])), files: [], migrations: [], references: { usuarios: [{ id: 'local-user' }] } };
  for (const [table, column] of [['lancamentos','criado_por'], ['layouts_colunas','usuario_id']]) {
    const row = { ...Object.fromEntries(COLUMNS[table].map(c => [c, null])), id: table+'-row', tenant_id: 'tenant-a', [column]: 'historical-user' };
    b.sections[table] = { rows: [row], count: 1, checksum: digest([row]) };
  }
  return b;
}
function reseal(b) {
  const { checksum, ...copy } = structuredClone(b);
  for (const s of Object.values(copy.sections)) { s.count=s.rows.length; s.checksum=digest(s.rows); }
  return seal(copy);
}
test('v2 binds only exact external history; both sources, no external user data', () => {
  const c=config(), b=authenticateBackup(body(),c); validate(b,'tenant-a');
  const bindings=verifyProvenance(b,c);
  assert.equal(bindings.length,2);
  assert(bindings.every(x=>Object.keys(x).sort().join(',')==='column,recordId,table,userId'));
  assert.equal(b.references.usuarios.length,1);
  assert(!JSON.stringify(b).includes(c.keys.first));
  assert.equal(b.historicalReferences.instanceId,c.instanceId);
});
test('v2 authenticates empty/synthetic backups too; local/null references need no exception', () => {
  const c=config(), b=body(); b.sections.lancamentos.rows[0].criado_por=null;
  b.sections.layouts_colunas.rows[0].usuario_id='local-user';
  assert.deepEqual(verifyProvenance(authenticateBackup(b,c),c),[]);
});
test('recomputed public checksums cannot authorize changes to manifest, data or scope', () => {
  const c=config(), original=authenticateBackup(body(),c);
  const attacks=[
    b=>b.historicalReferences.bindings[0].userId='other-user',
    b=>b.historicalReferences.bindings.push({...b.historicalReferences.bindings[0],recordId:'fabricated'}),
    b=>b.historicalReferences.bindings.pop(),
    b=>b.sections.lancamentos.rows[0].criado_por='other-user',
    b=>b.sections.layouts_colunas.rows[0].usuario_id='other-user',
    b=>b.sections.lancamentos.rows[0].id='other-record',
    b=>b.sections.lancamentos.rows[0].descricao='changed',
    b=>b.tenant.id='tenant-b',
    b=>b.references.usuarios.push({id:'historical-user'}),
    b=>b.historicalReferences.instanceId='other-instance',
    b=>b.historicalReferences.keyId='missing',
    b=>b.historicalReferences.backupId='00000000-0000-0000-0000-000000000000',
    b=>b.historicalReferences.signature='0'.repeat(64),
    b=>b.historicalReferences.extra='not-allowed',
  ];
  for(const attack of attacks){const b=structuredClone(original);attack(b);assert.throws(()=>verifyProvenance(reseal(b),c),{code:'HISTORY_PROOF'});}
});
test('unknown key, wrong key and different installation fail closed; retained key supports rotation', () => {
  const c=config(), b=authenticateBackup(body(),c);
  assert.throws(()=>verifyProvenance(b,config()),{code:'HISTORY_PROOF'});
  assert.throws(()=>verifyProvenance(b,{...c,instanceId:'another'}),{code:'HISTORY_PROOF'});
  const rotated={...c,activeKeyId:'second',keys:{...c.keys,second:randomBytes(32).toString('hex')}};
  assert.equal(verifyProvenance(b,rotated).length,2);
  assert.equal(authenticateBackup(body(),rotated).historicalReferences.keyId,'second');
  delete rotated.keys.first;assert.throws(()=>verifyProvenance(b,rotated),{code:'HISTORY_PROOF'});
});
test('v1 stays distinguishable and unsigned; version downgrade never retains a proof', () => {
  const c=config(), b=body();b.format=LEGACY_VERSION;const legacy=seal(b);
  validate(legacy,'tenant-a');assert.equal(verifyProvenance(legacy,c),null);
  const signed=authenticateBackup(body(),c);
  assert.throws(()=>validate(reseal({...signed,format:LEGACY_VERSION}),'tenant-a'),{code:'HISTORY_PROOF'});
  const {historicalReferences,...stripped}=signed;
  assert.throws(()=>validate(reseal(stripped),'tenant-a'),{code:'HISTORY_PROOF'});
  assert.throws(()=>validate(reseal({...signed,format:'10s-tenant-backup/99'}),'tenant-a'),{code:'VERSION'});
});
test('configuration has no default key, validates private keyring and prohibits auth-secret reuse', () => {
  for(const env of [{},{TENANT_BACKUP_SIGNING_KEYS:'{bad'},{TENANT_BACKUP_INSTANCE_ID:'a',TENANT_BACKUP_SIGNING_KEY_ID:'k',TENANT_BACKUP_SIGNING_KEYS:'{"k":"short"}'}]){
    assert.throws(()=>signingConfig(env),{code:'BACKUP_SIGNING_CONFIG'});
  }
  const c=config(), env={TENANT_BACKUP_INSTANCE_ID:c.instanceId,TENANT_BACKUP_SIGNING_KEY_ID:c.activeKeyId,TENANT_BACKUP_SIGNING_KEYS:JSON.stringify(c.keys)};
  assert.equal(signingConfig(env).activeKeyId,'first');
  assert.throws(()=>signingConfig({...env,NEXTAUTH_SECRET:c.keys.first}),{code:'BACKUP_SIGNING_CONFIG'});
  assert.throws(()=>authenticateBackup(body(),undefined),{code:'BACKUP_SIGNING_CONFIG'});
});
