import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {modalityPending,validTenantModality,requireTenantModalityReady,tenantModalityErrorStatus} from '../src/lib/tenant-modality-state.ts';
import {PRE_MODALITY_HOMOLOG_MIGRATIONS as h5,PRE_MODALITY_PRODUCTION_MIGRATIONS as p4,PRE_RETURN_HOMOLOG_MIGRATIONS as h6,PRE_RETURN_PRODUCTION_MIGRATIONS as p5,compatibleBackupMigrations,assertBackupMigrations,TENANT_MODALITY_MIGRATION as migration} from '../src/lib/backup/schema-contract.mjs';
const rows=list=>list.map(m=>({migration_name:m.name,checksum:m.sha256}));
test('only serialization/deadlock conflicts become retryable 409; unknown database failures stay 500',()=>{
 for(const e of [{code:'P2034'},{code:'P2010',meta:{code:'40001'}},{code:'P2010',meta:{code:'40P01'}},{code:'P2010',meta:{driverAdapterError:{cause:{originalCode:'40001',kind:'TransactionWriteConflict'}}}}])assert.equal(tenantModalityErrorStatus(e),409);
 for(const e of [{code:'P2010',meta:{code:'42501'}},{code:'P2010'},new Error('private'),null])assert.equal(tenantModalityErrorStatus(e),500);
 assert.equal(tenantModalityErrorStatus(new SyntaxError()),400);assert.equal(tenantModalityErrorStatus({status:403}),403);
});
test('legacy null is not classified or gated; only flagged new tenants require a choice',async()=>{
 assert.equal(modalityPending({modalidade:null,escolhaModalidadePendente:false}),false);
 assert.equal(modalityPending({modalidade:null,escolhaModalidadePendente:true}),true);
 for(const modalidade of ['PF','PJ'])assert.equal(modalityPending({modalidade,escolhaModalidadePendente:false}),false);
 for(const modalidade of ['XX','', 'PF'])assert.throws(()=>modalityPending({modalidade,escolhaModalidadePendente:true}),e=>e.status===409);
 assert(validTenantModality('PF')&&validTenantModality('PJ'));for(const v of [null,{},'pf','PJ ',true])assert(!validTenantModality(v));
 const db={tenant:{findUnique:async()=>({id:'t',nome:'Sintético',ativo:true,modalidade:null,escolhaModalidadePendente:true})}};
 await assert.rejects(requireTenantModalityReady(db,'t'),e=>e.status===428);
});
test('same finalized migration bytes in both independent catalogs; historical ledgers remain exact',()=>{
 assert.equal(h5.length,5);assert.equal(p4.length,4);assert.equal(h6.length,6);assert.equal(p5.length,5);
 for(const dir of ['migrations','production-migrations'])assert.equal(createHash('sha256').update(readFileSync(`prisma/${dir}/${migration.name}/migration.sql`)).digest('hex'),migration.sha256);
 for(const list of [h5,p4,h6,p5])assertBackupMigrations(rows(list),0);
 assert.throws(()=>assertBackupMigrations([...rows(h6),rows(h6)[0]],0));assert.throws(()=>assertBackupMigrations(rows(h6),1));
 const sql=readFileSync(`prisma/migrations/${migration.name}/migration.sql`,'utf8');assert(sql.includes('boolean NOT NULL DEFAULT false'));assert(sql.includes('escolha_modalidade_pendente SET DEFAULT true'));
});
test('business backups restore forward only within their profile; modality is not a writable backup field',()=>{
 assert(compatibleBackupMigrations(rows(h5),rows(h6)));assert(compatibleBackupMigrations(rows(p4),rows(p5)));
 for(const [a,b] of [[h6,h5],[p5,p4],[h6,p5],[p5,h6],[h5,p5],[p4,h6]])assert(!compatibleBackupMigrations(rows(a),rows(b)));
 const engine=readFileSync('src/lib/backup/engine.mjs','utf8');assert(!/UPDATE tenants[^;]+modalidade/s.test(engine));
});
