// A.2.5: real HTTP isolation and recovery, only against the disposable LOCAL laboratory.
const assert=require('node:assert/strict');
const {randomUUID,createHash,createDecipheriv}=require('node:crypto');
const {readFile,writeFile,readdir}=require('node:fs/promises');
const {Pool}=require('pg');
const bcrypt=require('bcryptjs');
const {admissionLab,labHeaders}=require('./admission-lab-helpers.cjs');
const cfg={environment:'ADMISSION_LOCAL',base:'http://localhost:3020'};assert(admissionLab(cfg));
const mode=process.argv[2];assert(['prepare','recovered'].includes(mode));
const db=new Pool({connectionString:'postgresql://postgres@127.0.0.1:5432/special_invite_lab'});
const checks=[],secrets=[],jar=()=>new Map();let stage='start';
const pass=name=>{checks.push(name);console.log('PASS '+name);};
const one=async(text,values=[])=>(await db.query(text,values)).rows[0];
async function q(j,path,method='GET',body,extra={}){
 const headers={Origin:cfg.base,...labHeaders(cfg,j,mode==='prepare'?25:26),Cookie:[...j].filter(([,v])=>path.startsWith(v.path)).map(([k,v])=>k+'='+v.value).join('; '),...extra};
 if(body!==undefined)headers['Content-Type']=body instanceof URLSearchParams?'application/x-www-form-urlencoded':'application/json';
 const r=await fetch(cfg.base+path,{method,headers,redirect:'manual',...(body===undefined?{}:{body:body instanceof URLSearchParams?body:JSON.stringify(body)})});
 for(const c of r.headers.getSetCookie()){const pair=c.split(';')[0],n=pair.indexOf('=');j.set(pair.slice(0,n),{value:pair.slice(n+1),path:/;\s*Path=([^;]+)/i.exec(c)?.[1]||'/'});}
 const bytes=Buffer.from(await r.arrayBuffer());
 return {status:r.status,headers:r.headers,bytes,body:r.headers.get('content-type')?.includes('json')?JSON.parse(bytes.toString()):bytes.toString()};
}
async function login(j,email,password){secrets.push(password);const c=await q(j,'/api/auth/csrf');await q(j,'/api/auth/callback/credentials','POST',new URLSearchParams({csrfToken:c.body.csrfToken,email,password,callbackUrl:cfg.base+'/adesao'}));const s=await q(j,'/api/auth/session');assert(s.body.user?.id,'authenticated synthetic identity');return s.body.user;}
async function digest(tables){const out={};for(const t of tables){assert(/^[a-z_]+$/.test(t));out[t]=(await one(`SELECT md5(coalesce(string_agg(to_jsonb(t)::text,chr(10) ORDER BY to_jsonb(t)::text),'')) hash FROM ${t} t`)).hash;}return out;}
const governance=['auth_identities','admissions','admission_challenges','tenant_memberships','legacy_user_access_maps','access_profiles','term_acceptances','tenant_contractual_responsibles','tenant_contractual_onboarding'];
const transactionTables=[...governance,'tenants','usuarios','access_owner_events','audit_events'];
async function mail(id){const c=await one('SELECT id FROM admission_challenges WHERE admission_id=$1 ORDER BY issued_at DESC LIMIT 1',[id]);assert(c);const b=Buffer.from(await readFile('/tmp/a2-mail/'+c.id+'.mail','utf8'),'base64url'),d=createDecipheriv('aes-256-gcm',Buffer.from(process.env.ADMISSION_LAB_MAIL_KEY,'hex'),b.subarray(0,12));d.setAAD(Buffer.from('dez/admission/synthetic-mail/v1'));d.setAuthTag(b.subarray(12,28));const m=JSON.parse(Buffer.concat([d.update(b.subarray(28)),d.final()]).toString()),url=new URL(/http:\/\/localhost:3020\/adesao#[^\s]+/.exec(m.text)[0]),params=new URLSearchParams(url.hash.slice(1)),token=params.get('token');assert(token);secrets.push(token);return{challengeId:c.id,token};}
async function approve(admin,email){
 const issued=await q(admin,'/api/platform/experiment-invitations','POST',{recipientName:'SINTETICO A25 '+randomUUID(),hours:24});assert.equal(issued.status,201);
 const link=await q(admin,`/api/platform/experiment-invitations/${issued.body.id}/link`,'POST',{action:'copy'});assert.equal(link.status,200);
 const token=new URLSearchParams(new URL(link.body.link).hash.slice(1)).get('convite');assert(token);secrets.push(token);
 assert.equal((await q(jar(),'/api/experimentacao','POST',{action:'interest',token})).status,200);
 const r=await q(admin,`/api/platform/experiment-invitations/${issued.body.id}/admission`,'POST',{email});assert.equal(r.status,201);return {id:r.body.id,email};
}
const provision=(j,id)=>q(j,`/api/admissions/${id}/provision`,'POST',{nome:'ESPACO SINTETICO A25'});
async function verify(j,id){assert.equal((await q(j,`/api/admissions/${id}/verify`,'POST',await mail(id))).status,200);}
const newEmail=()=>`a25-${randomUUID()}@example.invalid`,newPassword='Synthetic-only-A25-password!';
async function identify(j,g){const r=await q(j,`/api/admissions/${g.id}/identity`,'POST',{password:newPassword});assert.equal(r.status,200);assert.equal(r.body.created,true);await login(j,g.email,newPassword);}
async function ready(admin){const g=await approve(admin,newEmail()),j=jar();await verify(j,g.id);await identify(j,g);return {g,j};}
async function independentAdmin(){
 // Earlier suites intentionally exhaust the original admin's 20-invitation budget.
 // A distinct synthetic actor isolates this scenario without clearing any limit.
 const id=randomUUID(),email=newEmail(),j=jar();
 await db.query("INSERT INTO auth_identities(id,email,nome,senha_hash,status,atualizado_em) VALUES($1,$2,'ADMIN SINTETICO A25',$3,'ACTIVE',now())",[id,email,await bcrypt.hash(newPassword,12)]);
 await db.query("INSERT INTO platform_admins(id,identity_id,status,atualizado_em) VALUES($1,$2,'ACTIVE',now())",[randomUUID(),id]);
 await login(j,email,newPassword);return j;
}
async function activated(item){const j=jar();await login(j,item.email,item.password);const r=await provision(j,item.id);assert.equal(r.status,200);const row=await one('SELECT tenant_id,identity_id FROM admissions WHERE id=$1',[item.id]);assert(row.tenant_id);assert.equal((await q(j,'/api/lancamentos')).status,200);return {j,...row};}
async function intactTenant(id){const r=await one(`SELECT a.tenant_id,a.identity_id,(SELECT count(*) FROM tenants t WHERE t.slug='adesao-'||a.id) tenants,
 (SELECT count(*) FROM tenant_memberships m WHERE m.tenant_id=a.tenant_id AND m.identity_id=a.identity_id AND m.role='OWNER' AND m.status='ACTIVE') owners,
 (SELECT count(*) FROM legacy_user_access_maps l WHERE l.tenant_id=a.tenant_id AND l.identity_id=a.identity_id) links
 FROM admissions a WHERE a.id=$1`,[id]);assert.equal(r.tenants,'1');assert.equal(r.owners,'1');assert.equal(r.links,'1');return r;}
async function isolate(a,b,categoryIds){
 for(const [own,other,id] of [[a,b,categoryIds[1]],[b,a,categoryIds[0]]]){
  const list=await q(own.j,'/api/categorias?tenantId='+other.tenant_id);assert.equal(list.status,200);assert(!JSON.stringify(list.body).includes(id));
  assert.equal((await q(own.j,'/api/categorias/'+id,'PUT',{nome:'INDEVIDO',tenantId:other.tenant_id})).status,404);
  assert.equal((await q(own.j,'/api/categorias/'+id,'DELETE')).status,404);
  const evidence=await q(own.j,'/api/access/terms?tenantId='+other.tenant_id);assert.equal(evidence.status,200);assert(evidence.body.rows.length>0);assert(evidence.body.rows.every(r=>r.email!==other.email));
 }
 pass('Tenant selectors and foreign record IDs cannot read, modify or delete the other tenant data or acceptance evidence');
}
async function scan(jars){
 for(const j of jars)for(const [name,v] of j)if(/session|admission/i.test(name)&&v.value.length>15)secrets.push(v.value);
 for(const k of ['AUTH_SECRET','ADMISSION_SESSION_KEY','ADMISSION_LAB_MAIL_KEY','TRUSTED_PROXY_TOKEN'])secrets.push(process.env[k]);
 const files=await readdir('/tmp/a2-mail');for(const file of files.filter(f=>f.endsWith('.mail'))){
  const b=Buffer.from(await readFile('/tmp/a2-mail/'+file,'utf8'),'base64url'),d=createDecipheriv('aes-256-gcm',Buffer.from(process.env.ADMISSION_LAB_MAIL_KEY,'hex'),b.subarray(0,12));d.setAAD(Buffer.from('dez/admission/synthetic-mail/v1'));d.setAuthTag(b.subarray(12,28));const m=JSON.parse(Buffer.concat([d.update(b.subarray(28)),d.final()]).toString()),url=/http:\/\/localhost:3020\/adesao#[^\s]+/.exec(m.text)?.[0];if(url)secrets.push(new URLSearchParams(new URL(url).hash.slice(1)).get('token'));
 }
 const material=(await readFile('/tmp/a2-app.log','utf8'))+JSON.stringify((await db.query('SELECT * FROM audit_events')).rows);
 for(const secret of new Set(secrets.filter(Boolean)))assert(!material.includes(secret),'raw credential or token in application log/audit');
 pass('All captured mail tokens, tested credentials, session proofs and signing keys absent from application logs and audit');
}
async function prepare(){
 const context=JSON.parse(await readFile('/tmp/a25-browser-context.json','utf8'));const [aa,bb]=context.completed;
 stage='active tenants';const a={...await activated(aa),email:aa.email},b={...await activated(bb),email:bb.email};assert.notEqual(a.tenant_id,b.tenant_id);
 const ids=[];for(const [actor,other] of [[a,b],[b,a]]){const r=await q(actor.j,'/api/categorias','POST',{codigo:'81',nome:'SINTETICO A25 '+actor.tenant_id,tenantId:other.tenant_id});assert.equal(r.status,201);ids.push(r.body.id);assert.equal((await one('SELECT tenant_id FROM categorias WHERE id=$1',[r.body.id])).tenant_id,actor.tenant_id);}
 await isolate(a,b,ids);pass('Submitted tenantId ignored in writes; authenticated context owns each record');
 stage='protected contracts';const before=await digest(governance);
 for(const actor of [a,b])assert.equal((await q(actor.j,'/api/onboarding/contractual','POST',{action:'back'})).status,409);
 const receipt=await one('SELECT term_version_id FROM term_acceptances WHERE tenant_id=$1 LIMIT 1',[a.tenant_id]);assert(receipt);
 const accepted=await q(a.j,'/api/terms/accept','POST',{agreed:true,versionId:receipt.term_version_id,tenantId:b.tenant_id,identityId:b.identity_id,membershipId:'forged'});assert.equal(accepted.status,200);assert.deepEqual(await digest(governance),before);pass('Formalized contracts cannot reopen; forged acceptance authority cannot rewrite receipts');
 stage='tenant backup';const backup=await q(a.j,'/api/backups?tenantId='+b.tenant_id);assert.equal(backup.status,200);assert.equal(backup.body.tenant.id,a.tenant_id);
 const wrong=await q(b.j,'/api/backups','POST',backup.body);assert.equal(wrong.status,409);
 const preview=await q(a.j,'/api/backups','POST',backup.body);assert.equal(preview.status,200);const attempt=randomUUID(),headers={'x-backup-confirm':a.tenant_id,'x-backup-preview':preview.body.preview.currentDigest,'x-backup-attempt':attempt};
 const restored=await q(a.j,'/api/backups?action=restore','POST',backup.body,headers);assert.equal(restored.status,200);assert.deepEqual(await digest(governance),before);
 const foreignReceipt=await q(b.j,'/api/backups?attempt='+attempt);assert.equal(foreignReceipt.status,200);assert.equal(foreignReceipt.body.receipt,null);
 pass('Tenant backup and receipt remain tenant scoped; own restore preserves admissions, credentials, links and contracts');
 stage='transaction interruption';const admin=await independentAdmin();
 const {g:interrupted,j:ij}=await ready(admin);const beforeFault=await digest(transactionTables),lock=await db.connect();let pending;
 try{
  await lock.query('BEGIN');await lock.query('LOCK TABLE legacy_user_access_maps IN SHARE MODE');pending=provision(ij,interrupted.id);
  let waiting;for(let n=0;n<80;n++){waiting=await one("SELECT pid FROM pg_stat_activity WHERE datname=current_database() AND usename='a2_runtime' AND wait_event_type='Lock' AND query ILIKE '%INSERT%legacy_user_access_maps%' LIMIT 1");if(waiting)break;await new Promise(r=>setTimeout(r,75));}
  assert(waiting,'runtime transaction reached late mapping INSERT');assert.equal((await one('SELECT pg_terminate_backend($1) terminated',[waiting.pid])).terminated,true);
 }finally{await lock.query('ROLLBACK');lock.release();}
 const failed=await pending;assert.equal(failed.status,503);assert.deepEqual(await digest(transactionTables),beforeFault);pass('Terminated runtime connection after tenant/member writes rolls back every transactional row without schema changes');
 assert.equal((await provision(ij,interrupted.id)).status,201);await intactTenant(interrupted.id);pass('Retry after connection failure creates exactly one tenant, OWNER and legacy link');
 stage='recovery checkpoints';const pendingAdmission=await approve(admin,newEmail()),{g:verified,j:vj}=await ready(admin);
 const docs=(await db.query("SELECT id,storage_key,sha256 FROM term_versions WHERE status='PUBLISHED'")).rows;
 const recovery={...context,categoryIds:ids,attempt,tenantIds:[a.tenant_id,b.tenant_id],pendingAdmission,verified:{...verified,cookies:[...vj]},docs,governance:await digest(governance)};
 await writeFile('/tmp/a25-recovery-context.json',JSON.stringify(recovery),{mode:0o600});
 assert.equal((await one('SELECT status FROM admissions WHERE id=$1',[verified.id])).status,'AUTHORIZED');pass('Unconsumed email challenge and verified pre-provision journey saved for actual recovery');await scan([a.j,b.j,admin,ij,vj]);
}
async function recovered(){
 const c=JSON.parse(await readFile('/tmp/a25-recovery-context.json','utf8'));stage='restore governance';assert.deepEqual(await digest(governance),c.governance);pass('Restored authorization states, identity links and contractual evidence exactly match pre-backup digests');
 const [aa,bb]=c.completed,a={...await activated(aa),email:aa.email},b={...await activated(bb),email:bb.email};assert.deepEqual([a.tenant_id,b.tenant_id],c.tenantIds);
 for(const item of c.completed)await intactTenant(item.id);pass('PF/new and PJ/existing sessions log in and resume original tenants after independent application recovery');
 await isolate(a,b,c.categoryIds);
 for(const doc of c.docs){const r=await q(a.j,`/api/terms/versions/${doc.id}/file`);assert.equal(r.status,200);assert.equal(createHash('sha256').update(r.bytes).digest('hex'),doc.sha256);}pass('Published synthetic PDFs restored with exact hashes and readable through authorized application');
 assert((await q(a.j,'/api/backups?attempt='+c.attempt)).body.receipt);assert.equal((await q(b.j,'/api/backups?attempt='+c.attempt)).body.receipt,null);pass('Restore receipts and tenant isolation remain valid after recovery');
 for(const id of [c.cancelledId,c.expiredId]){assert.equal((await q(jar(),`/api/admissions/${id}/verify`,'POST',await mail(id))).status,409);assert.equal((await provision(a.j,id)).status,409);}
 assert.equal((await q(jar(),`/api/admissions/${aa.id}/verify`,'POST',await mail(aa.id))).status,409);pass('Cancelled, expired and consumed challenges remain unusable after recovery');
 stage='pending email recovery';const pj=jar();await verify(pj,c.pendingAdmission.id);await identify(pj,c.pendingAdmission);assert.equal((await provision(pj,c.pendingAdmission.id)).status,201);await intactTenant(c.pendingAdmission.id);assert.equal((await q(pj,'/api/lancamentos')).status,428);pass('Previously unconsumed email challenge verifies after recovery; new tenant still requires its contract');
 stage='verified recovery';const vj=new Map(c.verified.cookies);await login(vj,c.verified.email,newPassword);const concurrent=await Promise.all([provision(vj,c.verified.id),provision(vj,c.verified.id)]);assert.deepEqual(concurrent.map(x=>x.status).sort(),[200,201]);await intactTenant(c.verified.id);assert.equal((await q(vj,'/api/lancamentos')).status,428);pass('Pre-backup email proof resumes with original keys; concurrent retries produce only one gated tenant');
 await scan([a.j,b.j,pj,vj]);
}
(mode==='prepare'?prepare():recovered()).then(async()=>{await writeFile('/tmp/a25-'+mode+'-result.json',JSON.stringify({state:'PASSED',mode,checks,syntheticOnly:true,realEmail:false},null,2));}).catch(async e=>{await writeFile('/tmp/a25-'+mode+'-result.json',JSON.stringify({state:'FAILED',mode,stage,checks,error:e.code||e.name},null,2));console.error(stage,e.code||e.name,e.message?.replace(/http:\/\/localhost:3020\/adesao#[^\s]+/g,'[redacted]'));process.exitCode=1;}).finally(()=>db.end());
