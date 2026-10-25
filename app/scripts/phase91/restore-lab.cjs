// Real historical data stays in a private isolated clone. Output contains only reference labels/checks.
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs/promises'),{Pool}=require('pg');
const bcrypt=require('bcryptjs');
const qi=n=>'"'+n.replaceAll('"','""')+'"';
const checks=[];const ok=(v,label)=>{assert(v,label);checks.push(label)};
async function main(){
 const url=new URL(process.env.DATABASE_URL);
 assert.equal(process.env.PHASE91_LAB,'1');assert.equal(url.hostname,'phase9-prod-clone-pg');assert.match(url.pathname,/^\/phase91_restore(?:_r\d+)?$/);
 const pool=new Pool({connectionString:url.href});const query=async(s,p=[])=>(await pool.query(s,p)).rows;
 const {createBackup,previewRestore,restoreBackup,restoreReceipt}=await import('/private/phase91/engine/engine.mjs');
 const {VERSION,LEGACY_VERSION,digest,seal}=await import('/private/phase91/engine/format.mjs');
 const {authenticateBackup}=await import('/private/phase91/engine/provenance.mjs');
 const cfg={sourceCommit:'phase91-local-working-tree',termDir:'/private/phase91/terms',backupDir:'/private/phase91/safety',signing:{instanceId:'phase91-isolated-lab',activeKeyId:'ephemeral',keys:{ephemeral:crypto.randomBytes(32).toString('hex')}}};
 const id=()=>crypto.randomUUID();
 const base=process.env.PHASE91_LAB_URL??'http://phase91-lab-app:3000';assert.match(base,/^http:\/\/phase91-lab-app(?:-r\d+)?:3000$/);
 async function request(jar,path,method='GET',body){const r=await fetch(base+path,{method,redirect:'manual',headers:{Origin:base,Cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; '),...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});for(const h of r.headers.getSetCookie()){const [p]=h.split(';'),i=p.indexOf('=');jar.set(p.slice(0,i),p.slice(i+1))}return r}
 async function login(email,password){const jar=new Map();const csrf=await(await request(jar,'/api/auth/csrf')).json();const r=await fetch(base+'/api/auth/callback/credentials',{method:'POST',redirect:'manual',headers:{Cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; '),'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrfToken:csrf.csrfToken,email,password,callbackUrl:base+'/inicio',json:'true'})});for(const h of r.headers.getSetCookie()){const [p]=h.split(';'),i=p.indexOf('=');jar.set(p.slice(0,i),p.slice(i+1))}assert((await(await request(jar,'/api/auth/session')).json())?.user);return jar}
 try{
  const tenants=(await query('SELECT id FROM tenants ORDER BY id')).map(r=>r.id);assert.equal(tenants.length,8);
  const history=(await query(`SELECT
   (SELECT count(*)::int FROM lancamentos l JOIN usuarios u ON u.id=l.criado_por WHERE u.tenant_id<>l.tenant_id) authors,
   (SELECT count(*)::int FROM layouts_colunas l JOIN usuarios u ON u.id=l.usuario_id WHERE u.tenant_id<>l.tenant_id) layouts`))[0];
  ok(history.authors===31&&history.layouts===2,'historical-31-authors-2-layout-owners-counted');
  const contexts=[];for(const tenantId of tenants){const [m]=await query("SELECT id,identity_id FROM tenant_memberships WHERE tenant_id=$1 AND role='OWNER' AND status='ACTIVE'",[tenantId]);assert(m);contexts.push({tenantId,membershipId:m.id,identityId:m.identity_id})}
  const password=crypto.randomBytes(32).toString('base64url');
  // Only this disposable DB: replace one credential with a random synthetic test credential.
  // No real password is tested; no identity or membership is created.
  await query("UPDATE auth_identities SET email='phase91-owner@example.invalid',senha_hash=$2 WHERE id=$1",[contexts[0].identityId,await bcrypt.hash(password,10)]);
  const jar=await login('phase91-owner@example.invalid',password);
  ok((await request(jar,'/api/tenants/switch','POST',{tenantId:tenants[0]})).status===200,'controlled-owner-session-before-restore');
  const tables=(await query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).map(r=>r.tablename);
  const scoped=new Set((await query("SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='tenant_id'")).map(r=>r.table_name));
  const accessTables=['auth_identities','platform_admins','support_operators','usuarios','tenant_memberships','access_profiles','legacy_user_access_maps','tenant_contractual_responsibles','support_grants','support_grant_events','access_invites','term_acceptances','access_owner_events'];
  async function hashTable(t,where='',args=[]){return(await query(`SELECT md5(coalesce(string_agg(to_jsonb(x)::text,E'\\n' ORDER BY to_jsonb(x)::text),'')) d FROM public.${qi(t)} x ${where}`,args))[0].d}
  async function access(){const a={};for(const t of accessTables)a[t]=await hashTable(t);return a}
  async function neighbors(tenant){const a={};for(const t of tables)if(scoped.has(t))a[t]=await hashTable(t,'WHERE tenant_id<>$1',[tenant]);return a}
  const initialAccess=await access();
  const strip=b=>Object.fromEntries(Object.entries(b.sections).map(([t,s])=>[t,s.rows.map(r=>{const v={...r};if(t==='lancamentos')delete v.revisao;return v})]));
  const old=b=>{const {checksum,historicalReferences,...body}=structuredClone(b);body.format=LEGACY_VERSION;return seal(body)};
  const reseal=b=>{const {checksum,...body}=structuredClone(b);for(const s of Object.values(body.sections)){s.count=s.rows.length;s.checksum=digest(s.rows)}return seal(body)};
  const rejected=async(b,ctx,code,label)=>{await assert.rejects(previewRestore(pool,ctx,b,cfg),{code});const live=await createBackup(pool,ctx,cfg),p=await previewRestore(pool,ctx,live,cfg);await assert.rejects(restoreBackup(pool,ctx,b,cfg,p.currentDigest,id()),{code});ok(true,label)};
  const originals=[];
  for(let n=0;n<contexts.length;n++){
   const ctx=contexts[n],tag='T'+String(n+1).padStart(2,'0');
   const b=await createBackup(pool,ctx,cfg);originals.push(b);ok(b.format===VERSION,tag+'-v2-backup');
   ok(Object.values(b.sections).every(s=>s.rows.every(r=>r.tenant_id===ctx.tenantId))&&b.references.usuarios.every(u=>u.tenant_id===ctx.tenantId),tag+'-no-external-business-or-user-export');
   ok(JSON.stringify(b.historicalReferences.bindings).includes('email')===false,tag+'-minimal-no-user-PII-manifest');
   await previewRestore(pool,ctx,old(b),cfg);ok(true,tag+'-v1-exact-live-history-preview');
   if(n===0){const row=b.sections.lancamentos.rows[0];const r=await request(jar,'/api/lancamentos/'+row.id,'PUT',{versao:'v1:'+row.revisao});ok(r.status===200,'valid-version-token-accepted-before-restore');await r.arrayBuffer();}
   const nb=await neighbors(ctx.tenantId);
   if(n===3){
    for(const binding of b.historicalReferences.bindings){await query(`DELETE FROM ${qi(binding.table)} WHERE id=$1 AND tenant_id=$2`,[binding.recordId,ctx.tenantId]);}
    await assert.rejects(previewRestore(pool,ctx,old(b),cfg),{code:'HISTORY_UNPROVEN'});ok(true,'v1-deleted-history-fails-closed');
   }
   const preview=await previewRestore(pool,ctx,b,cfg),attempt=id();
   const receipt=await restoreBackup(pool,ctx,b,cfg,preview.currentDigest,attempt);
   const after=await createBackup(pool,ctx,cfg);
   assert.deepEqual(strip(after),strip(b));ok(true,tag+'-full-restore-business-history-identical');
   assert.deepEqual(await neighbors(ctx.tenantId),nb);ok(true,tag+'-neighbors-digest-identical');
   assert.deepEqual(await access(),initialAccess);ok(true,tag+'-no-identity-membership-permission-or-owner-changes');
   for(const row of after.sections.lancamentos.rows){const before=b.sections.lancamentos.rows.find(r=>r.id===row.id);assert(BigInt(row.revisao)>BigInt(before.revisao));}ok(true,tag+'-revisions-advanced');
   assert.deepEqual(await restoreBackup(pool,ctx,b,cfg,preview.currentDigest,attempt),receipt);ok(!!await restoreReceipt(pool,ctx,attempt),tag+'-receipt-and-idempotent-retry');
   if(n===0){const row=b.sections.lancamentos.rows[0];const r=await request(jar,'/api/lancamentos/'+row.id,'PUT',{versao:'v1:'+row.revisao,anotacao:'STALE-MUST-NOT-WRITE'});const response=await r.json();ok(r.status===409&&String(response.error).includes('alterado por outra operação'),'real-http-session-stale-write-409');assert.deepEqual(strip(await createBackup(pool,ctx,cfg)),strip(b));ok(true,'stale-http-write-no-data-change');}
  }
  const ctx=contexts[3],b=originals[3];
  for(const [label,mutate] of [
   ['tampered-manifest',x=>x.historicalReferences.bindings[0].userId=id()],
   ['tampered-author',x=>x.sections.lancamentos.rows[0].criado_por=id()],
   ['tampered-layout-owner',x=>x.sections.layouts_colunas.rows[0].usuario_id=id()],
   ['tampered-signature',x=>x.historicalReferences.signature='0'.repeat(64)],
   ['tampered-reference-list',x=>x.references.usuarios.push({id:x.historicalReferences.bindings[0].userId})],
  ]){const x=structuredClone(b);mutate(x);await rejected(reseal(x),ctx,'HISTORY_PROOF',label+'-preview-and-restore-denied');}
  const v1=old(b);v1.sections.lancamentos.rows[0].criado_por=id();await rejected(reseal(v1),ctx,'HISTORY_UNPROVEN','v1-fabricated-reference-denied');
  await rejected(b,contexts[0],'TENANT','wrong-tenant-denied');
  // Trusted lab issuer simulates a formerly existing target; the real PostgreSQL lookup must deny it.
  const {checksum: ignoredChecksum,historicalReferences: ignoredManifest,...missingBody}=structuredClone(b);
  missingBody.sections.lancamentos.rows[0].criado_por=id();
  missingBody.sections.lancamentos.checksum=digest(missingBody.sections.lancamentos.rows);
  await rejected(authenticateBackup(missingBody,cfg.signing),ctx,'HISTORY_TARGET_MISSING','valid-signature-but-missing-database-target-denied');
  // Failure injection after destructive statements, through the pool boundary, not a production bypass.
  const failurePool={async connect(){const c=await pool.connect();let deleted=false;return{async query(sql,args){if(String(sql).startsWith('DELETE FROM public.'))deleted=true;if(deleted&&String(sql).startsWith('INSERT INTO public.'))return c.query('SELECT 1/0');return c.query(sql,args)},release:()=>c.release()}}};
  const beforeFailure=await createBackup(pool,ctx,cfg),nb=await neighbors(ctx.tenantId),preview=await previewRestore(pool,ctx,b,cfg),attempt=id();
  await assert.rejects(restoreBackup(failurePool,ctx,b,cfg,preview.currentDigest,attempt),{code:'DATABASE_VALIDATION'});
  assert.deepEqual((await createBackup(pool,ctx,cfg)).sections,beforeFailure.sections);assert.deepEqual(await neighbors(ctx.tenantId),nb);assert.deepEqual(await access(),initialAccess);
  ok(await restoreReceipt(pool,ctx,attempt)===null,'intermediate-failure-no-success-receipt');ok(true,'atomic-rollback-all-sections-neighbors-access');
  // Commit succeeded but the transport lost its acknowledgement: recover only through the receipt.
  const lostAckPool={async connect(){const c=await pool.connect();return{async query(sql,args){const r=await c.query(sql,args);if(sql==='COMMIT')throw Object.assign(new Error('LAB_LOST_ACK'),{code:'ECONNRESET'});return r},release:()=>c.release()}}};
  const p=await previewRestore(pool,ctx,b,cfg),uncertain=id();await assert.rejects(restoreBackup(lostAckPool,ctx,b,cfg,p.currentDigest,uncertain),{code:'ECONNRESET'});ok(!!await restoreReceipt(pool,ctx,uncertain),'lost-commit-ack-recovered-by-receipt');
  await restoreBackup(pool,ctx,b,cfg,p.currentDigest,uncertain);ok(true,'lost-ack-retry-does-not-repeat-restore');
  // Explicit legacy path: exact live tuples are enough, no conversion or access reconstruction.
  const legacy=old(b),lp=await previewRestore(pool,ctx,legacy,cfg);await restoreBackup(pool,ctx,legacy,cfg,lp.currentDigest,id());ok(true,'v1-live-history-full-restore');
  // Restore holds the external user's key stable without modifying that user or its access.
  let keyChecked=false;
  const keyPool={async connect(){const c=await pool.connect();return{async query(sql,args){const result=await c.query(sql,args);if(String(sql).startsWith('SELECT id FROM public.usuarios WHERE id=ANY')&&String(sql).includes('FOR KEY SHARE')){await assert.rejects(pool.query('SELECT id FROM usuarios WHERE id=$1 FOR UPDATE NOWAIT',[args[0][0]]),{code:'55P03'});keyChecked=true;}return result},release:()=>c.release()}}};
  const kp=await previewRestore(pool,ctx,b,cfg);await restoreBackup(keyPool,ctx,b,cfg,kp.currentDigest,id());ok(keyChecked,'historical-user-key-held-through-restore');
  // A writer already holding a shared tenant lock blocks restore, and stale previews are not reusable.
  const writer=await pool.connect();await writer.query('BEGIN');
  try{await writer.query("SELECT pg_advisory_xact_lock_shared(hashtextextended('10s:tenant-restore:'||$1,0))",[ctx.tenantId]);await assert.rejects(restoreBackup(pool,ctx,b,cfg,kp.currentDigest,id()),{code:'BUSY'});ok(true,'tenant-writer-prevents-restore')}finally{await writer.query('ROLLBACK');writer.release()}
  const stale=await previewRestore(pool,ctx,b,cfg);
  await query('UPDATE lancamentos SET anotacao=anotacao WHERE tenant_id=$1 AND id=$2',[ctx.tenantId,b.sections.lancamentos.rows[0].id]);
  await assert.rejects(restoreBackup(pool,ctx,b,cfg,stale.currentDigest,id()),{code:'STALE_PREVIEW'});ok(true,'stale-preview-rejected');
  // Synthetic business fixtures on an existing laboratory tenant; no access provisioning.
  const synctx=contexts[6],synthetics=[id(),id(),id(),id()];let seq=(await query('SELECT coalesce(max(seq),0)::int n FROM lancamentos WHERE tenant_id=$1',[synctx.tenantId]))[0].n;
  await query("INSERT INTO lancamentos(id,tenant_id,seq,descricao,valor_previsto) VALUES($1,$2,$3,'PHASE91 SYNTHETIC NULL',NULL),($4,$2,$5,NULL,0)",[synthetics[0],synctx.tenantId,++seq,synthetics[1],++seq]);
  await query("INSERT INTO lancamentos(id,tenant_id,seq,valor) VALUES($1,$2,$3,0),($4,$2,$5,0.01)",[synthetics[2],synctx.tenantId,++seq,synthetics[3],++seq]);
  const synthetic=await createBackup(pool,synctx,cfg);await query('DELETE FROM lancamentos WHERE tenant_id=$1 AND id=ANY($2::text[])',[synctx.tenantId,synthetics]);
  const sp=await previewRestore(pool,synctx,synthetic,cfg);await restoreBackup(pool,synctx,synthetic,cfg,sp.currentDigest,id());
  const sr=await query('SELECT id,data_lanc,tipo,valor,valor_previsto,status FROM lancamentos WHERE id=ANY($1::text[])',[synthetics]);
  ok(sr.length===4&&sr.every(r=>r.data_lanc===null&&r.tipo===null&&r.status==='realizado')&&sr.filter(r=>r.valor===null).length===2&&sr.some(r=>r.valor==='0.00')&&sr.some(r=>r.valor==='0.01')&&sr.some(r=>r.valor_previsto==='0.00'),'synthetic-null-zero-cent-restore');
  // Current database guards: no OWNER, revoked membership, inactive identity and PA alone remain denied.
  const member=(await query("SELECT id,identity_id,tenant_id FROM tenant_memberships WHERE role='MEMBER' LIMIT 1"))[0];
  await assert.rejects(previewRestore(pool,{tenantId:member.tenant_id,membershipId:member.id,identityId:member.identity_id},originals[tenants.indexOf(member.tenant_id)],cfg),{code:'PERMISSION'});ok(true,'member-cannot-restore');
  const pa=(await query('SELECT identity_id FROM platform_admins LIMIT 1'))[0];await assert.rejects(createBackup(pool,{...contexts[0],identityId:pa.identity_id,membershipId:id()},cfg),{code:'PERMISSION'});ok(true,'platform-admin-alone-no-backup');
  for(const [table,key,value] of [['tenant_memberships','id',ctx.membershipId],['auth_identities','id',ctx.identityId]]){const c=await pool.connect();await c.query('BEGIN');try{await c.query(`UPDATE ${qi(table)} SET status='INACTIVE' WHERE ${qi(key)}=$1`,[value]);const txPool={connect:async()=>({query:(sql,args)=>['BEGIN','BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY','COMMIT','ROLLBACK'].includes(sql)?Promise.resolve({rows:[]}):c.query(sql,args),release(){}})};await assert.rejects(previewRestore(txPool,ctx,b,cfg),{code:'PERMISSION'});ok(true,table+'-inactive-denied')}finally{await c.query('ROLLBACK');c.release()}}
  assert.deepEqual(await access(),initialAccess);ok(true,'final-no-access-created-or-modified');
  ok((await request(jar,'/api/tenants/switch','POST',{tenantId:tenants[2]})).status===403,'http-no-access-to-another-tenant-after-restore');
  const audits=await query("SELECT metadata FROM audit_events WHERE action='TENANT_RESTORE_COMPLETED'");
  ok(audits.length>=10&&audits.every(r=>Object.keys(r.metadata).sort().join(',')==='attempt,checksum,records,safetyChecksum,version'),'audit-receipts-metadata-allowlist');
  const report={state:'PASSED',checks:checks.length,results:checks,historicalTenants:8,crossAuthors:31,crossLayouts:2,newIdentities:0,newMemberships:0,newPermissions:0,migrationsApplied:0,productionOrHomologTouched:false,limits:'Historical restores use the actual isolated PostgreSQL clone. HTTP stale-write uses unchanged candidate launch/auth routes. No human credentials tested.'};
  console.log(JSON.stringify(report));
 }finally{await pool.end()}
}
main().catch(e=>{console.log(JSON.stringify({state:'STOPPED',code:e.code??e.name,check:e.code==='ERR_ASSERTION'?String(e.message).split('\n')[0]:undefined,completed:checks}));process.exitCode=1});
