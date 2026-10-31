import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {experimentOrigin,experimentStatus,experimentInput} from '../src/lib/experiment-policy.ts';
import {compatibleBackupMigrations,PRE_RETURN_HOMOLOG_MIGRATIONS as REQUIRED_MIGRATIONS,PRE_EXPERIMENT_MIGRATIONS} from '../src/lib/backup/schema-contract.mjs';
const ledger = list => list.map(m=>({migration_name:m.name,checksum:m.sha256}));
test('pilot permits only explicitly enabled LOCAL laboratory or exact HOMOLOG database and origin',()=>{
 const env={SPECIAL_INVITATIONS_ENABLED:'true',APP_PUBLIC_URL:'https://homolog.dezsolucoes.com.br',DATABASE_URL:'postgresql://runtime@0f5rvkjqjdt9fez1ajiascyk/gestar_homolog_pg18'};
 assert.equal(experimentOrigin(env),env.APP_PUBLIC_URL);
 for(const changes of [{SPECIAL_INVITATIONS_ENABLED:'false'},{APP_PUBLIC_URL:'https://app.dezsolucoes.com.br'},{DATABASE_URL:'postgresql://runtime@0f5rvkjqjdt9fez1ajiascyk/gestar_prod_pg18'},{APP_PUBLIC_URL:'https://homolog.dezsolucoes.com.br.evil.test'},{DATABASE_URL:'invalid'}])assert.equal(experimentOrigin({...env,...changes}),null);
 assert.equal(experimentOrigin({...env,APP_PUBLIC_URL:'http://localhost:3020',DATABASE_URL:'postgresql://runtime@127.0.0.1/special_invite_lab'}),'http://localhost:3020');
 assert.equal(experimentOrigin({...env,APP_PUBLIC_URL:'http://localhost:3020',DATABASE_URL:'postgresql://runtime@127.0.0.1/gestar_local_pg18'}),null);
});
test('revocation precedes expiration and invalid inputs never create invitations',()=>{
 const now=new Date('2026-10-29T00:00Z');
 assert.equal(experimentStatus({revokedAt:now,expiresAt:now},now),'REVOKED');
 assert.equal(experimentStatus({revokedAt:null,expiresAt:now},now),'EXPIRED');
 assert.equal(experimentStatus({revokedAt:null,expiresAt:new Date(+now+1)},now),'ACTIVE');
 assert.deepEqual(experimentInput({recipientName:'  Bruno  Lourenço '}),{recipientName:'Bruno Lourenço',hours:72});
 for(const body of [{},{recipientName:'a',hours:169},{recipientName:'a',hours:0},{recipientName:'a',hours:'72'},{recipientName:'x'.repeat(161)}])assert.throws(()=>experimentInput(body));
});
test('only exact ledger3 to exact ledger4 migration compatibility is allowed; unknown and reverse rejected',()=>{
 const old=ledger(PRE_EXPERIMENT_MIGRATIONS),cur=ledger(REQUIRED_MIGRATIONS);
 assert(compatibleBackupMigrations(old,cur));assert(compatibleBackupMigrations(cur,cur));assert(!compatibleBackupMigrations(cur,old));
 assert(!compatibleBackupMigrations(old.map(x=>({...x,checksum:'0'.repeat(64)})),cur));
 assert(!compatibleBackupMigrations(old.slice(0,2),cur));assert(!compatibleBackupMigrations([...cur,{migration_name:'unknown',checksum:'x'}],cur));
});
test('official preview assets match pinned provenance; business restore excludes global pilot',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../public/experimentacao/assets/provenance.json',import.meta.url),'utf8'));
 assert.equal(manifest.sourceCommit,'ed17a4407949479ca1d8407feeef8704bd9e0451');
 for(const [name,hash] of Object.entries(manifest.hashes)){
  const bytes=name==='index.html'?Buffer.from(JSON.parse(readFileSync(new URL('../src/lib/official-landing.ts',import.meta.url),'utf8').match(/export const officialLanding = (.*);/)[1])):readFileSync(new URL('../public/experimentacao/assets/'+name,import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),hash,name);
 }
 const catalog=readFileSync(new URL('../src/lib/backup/catalog.mjs',import.meta.url),'utf8');assert(!catalog.includes('experiment_invitations'));
 const api=readFileSync(new URL('../src/app/api/experimentacao/route.ts',import.meta.url),'utf8');assert(!api.includes('tenantMembership.create'));assert(!api.includes('authIdentity.create'));
});
