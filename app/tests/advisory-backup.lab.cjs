// Disposable synthetic LOCAL DB; no production/homologation target accepted.
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),{Pool}=require('pg');
async function main(){let raw='';for await(const s of process.stdin)raw+=s;const cfg=JSON.parse(raw);raw='';
 const pool=new Pool({connectionString:process.env.DATABASE_URL});let step='guard';const checks=[];
 try{
 assert.equal((await pool.query('SELECT current_database() d')).rows[0].d,'phase11b_lab');
 const {createBackup,previewRestore,restoreBackup,restoreReceipt}=await import('../src/lib/backup/engine.mjs');
 const {signingConfig}=await import('../src/lib/backup/provenance.mjs');
 const {digest,seal}=await import('../src/lib/backup/format.mjs');
 const ctx={tenantId:cfg.tenants.main,identityId:cfg.ids.owner,membershipId:cfg.members.owner};
 const config={sourceCommit:'0000000000000000000000000000000000000000',termDir:'/tmp/terms',backupDir:'/tmp/backups',signing:signingConfig(process.env)};
 const protectedSnapshot=async()=>{const r={};for(const t of ['auth_identities','tenant_memberships','legacy_user_access_maps','access_profiles','platform_admins','support_operators','advisory_access_grants'])r[t]=(await pool.query(`SELECT md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY id),'')) d FROM ${t} t`)).rows[0].d;return r;};
 const neighborDigest=async()=>digest((await pool.query('SELECT to_jsonb(t) j FROM lancamentos t WHERE tenant_id<>$1 ORDER BY id',[ctx.tenantId])).rows);
 const protectedBefore=await protectedSnapshot(),neighborBefore=await neighborDigest();
 step='historical external references';const other=(await pool.query('SELECT id FROM usuarios WHERE tenant_id=$1 ORDER BY id LIMIT 1',[cfg.tenants.neighbor])).rows[0].id;
 if(!(await pool.query("SELECT id FROM lancamentos WHERE tenant_id=$1 AND descricao='ASSESSORIA HISTORICO LOCAL'",[ctx.tenantId])).rowCount){
 await pool.query("INSERT INTO lancamentos(id,tenant_id,seq,descricao,valor,criado_por) SELECT $1,$2,coalesce(max(seq),0)+1,'ASSESSORIA HISTORICO LOCAL',0.01,$3 FROM lancamentos WHERE tenant_id=$2",[randomUUID(),ctx.tenantId,other]);
 await pool.query("INSERT INTO layouts_colunas(id,tenant_id,usuario_id,nome,colunas) VALUES($1,$2,$3,'Histórico externo sintético','[]'::jsonb)",[randomUUID(),ctx.tenantId,other]);}
 checks.push(step);
 step='real identity authorship';const authors=(await pool.query('SELECT id,criado_por,criado_por_identity_id,valor,revisao FROM lancamentos WHERE criado_por_identity_id=$1',[cfg.ids.advisor])).rows;assert(authors.length>0);assert(authors.every(r=>r.criado_por===null));const layouts=(await pool.query('SELECT id,usuario_id,identity_id FROM layouts_colunas WHERE identity_id=$1',[cfg.ids.advisor])).rows;assert(layouts.length>0&&layouts.every(r=>r.usuario_id===null));checks.push(step);
 step='v3 exact ledger backup preview';const b=await createBackup(pool,ctx,config);assert.equal(b.format,'10s-tenant-backup/3');assert.equal(b.migrations.length,3);assert.equal(b.historicalReferences.bindings.length,2);assert(!JSON.stringify(b).includes('senha_hash'));assert(!b.sections.advisory_access_grants);assert(b.references.identities.some(r=>r.id===cfg.ids.advisor));const preview=await previewRestore(pool,ctx,b,config);checks.push(step);
 step='tampered identity and provenance rejected';const bad=structuredClone(b);bad.sections.lancamentos.rows.find(r=>r.criado_por_identity_id===cfg.ids.advisor).criado_por_identity_id=cfg.ids.tech;bad.sections.lancamentos.checksum=digest(bad.sections.lancamentos.rows);await assert.rejects(previewRestore(pool,ctx,seal(bad),config));checks.push(step);
 step='old ledger fails closed';const old=structuredClone(b);old.migrations=old.migrations.slice(0,1);await assert.rejects(previewRestore(pool,ctx,seal(old),config));checks.push(step);
 step='atomic rollback after intermediate failure';const faultPool={connect:async()=>{const db=await pool.connect();return{release:()=>db.release(),query:(sql,args)=>{if(sql.startsWith('INSERT INTO public."lancamentos"'))throw Object.assign(new Error('LAB_INTERMEDIATE_FAULT'),{code:'P0001'});return db.query(sql,args);}}}};
 await assert.rejects(restoreBackup(faultPool,ctx,b,config,preview.currentDigest,randomUUID()),{code:'DATABASE_VALIDATION'});const afterFailure=await createBackup(pool,ctx,config);assert.deepEqual(afterFailure.sections,b.sections);checks.push(step);
 step='restore and replay preserve identity and grants';const attempt=randomUUID();await restoreBackup(pool,ctx,b,config,preview.currentDigest,attempt);const receipt=await restoreReceipt(pool,ctx,attempt);assert(receipt);await restoreBackup(pool,ctx,b,config,preview.currentDigest,attempt);
 const restored=(await pool.query('SELECT id,criado_por,criado_por_identity_id,valor,revisao FROM lancamentos WHERE criado_por_identity_id=$1 ORDER BY id',[cfg.ids.advisor])).rows;
 for(const before of authors){const after=restored.find(r=>r.id===before.id);assert(after);assert.equal(after.valor,before.valor);assert.equal(after.criado_por_identity_id,before.criado_por_identity_id);assert(BigInt(after.revisao)>BigInt(before.revisao));}
 assert.deepEqual((await pool.query('SELECT id,usuario_id,identity_id FROM layouts_colunas WHERE identity_id=$1',[cfg.ids.advisor])).rows,layouts);
 const afterRestore=await createBackup(pool,ctx,config);assert.deepEqual(afterRestore.historicalReferences.bindings,b.historicalReferences.bindings);
 assert.deepEqual(await protectedSnapshot(),protectedBefore);assert.equal(await neighborDigest(),neighborBefore);checks.push(step);
 step='NULL zero centavo preserved';const values=b.sections.lancamentos.rows.map(r=>r.valor);assert(values.includes(null));assert(values.some(v=>v!==null&&Number(v)===0));assert(values.some(v=>Number(v)===0.01));checks.push(step);
 step='runtime cannot rewrite audit or grant history';await assert.rejects(pool.query("UPDATE audit_events SET action='INVALID' WHERE id=$1",[attempt]));await assert.rejects(pool.query("UPDATE advisory_access_grants SET purpose='INVALID' WHERE identity_id=$1",[cfg.ids.advisor]));await assert.rejects(pool.query('DELETE FROM advisory_access_grants WHERE identity_id=$1',[cfg.ids.advisor]));await assert.rejects(pool.query('CREATE TABLE public.forbidden_ddl(id int)'));checks.push(step);
 step='audited actor tenant authorization result';const events=(await pool.query("SELECT action,result,actor_identity_id,tenant_id,advisory_grant_id,metadata FROM audit_events WHERE access_mode='ADVISORY'")).rows;assert(events.some(e=>e.action==='ADVISORY_OPERATION'&&e.result==='SUCCESS'));assert(events.some(e=>e.action==='ADVISORY_OPERATION'&&e.result==='DENIED'));assert(events.every(e=>e.actor_identity_id&&e.tenant_id&&e.advisory_grant_id));assert(events.every(e=>!/(password|cookie|senha|token)/i.test(JSON.stringify(e.metadata))));checks.push(step);
 console.log(JSON.stringify({state:'ADVISORY_BACKUP_LAB_PASSED',checks,protectedDigestsUnchanged:true,neighborUnchanged:true,identityAuthors:authors.length,identityLayouts:layouts.length}));
 }catch(e){console.log(JSON.stringify({state:'ADVISORY_BACKUP_LAB_FAILED',step,type:e.name,code:e.code,actual:e.actual,expected:e.expected}));process.exitCode=1;}finally{await pool.end();}}
main().catch(e=>{console.log(JSON.stringify({state:'ADVISORY_BACKUP_LAB_FAILED',type:e.name,code:e.code}));process.exitCode=1;});
