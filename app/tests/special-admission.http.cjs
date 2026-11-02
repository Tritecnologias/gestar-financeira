// Runs only in the existing disposable, network-none Admission laboratory.
const assert=require('node:assert/strict'),{Pool}=require('pg');
const {randomUUID,randomBytes,createHash,createDecipheriv}=require('node:crypto');
const fs=require('node:fs/promises'),{admissionLab,labHeaders}=require('./admission-lab-helpers.cjs');
const cfg={environment:'ADMISSION_LOCAL',base:'http://localhost:3020'};assert(admissionLab(cfg));
const pool=new Pool({connectionString:'postgresql://postgres@127.0.0.1:5432/special_invite_lab'});
const query=(sql,args=[])=>pool.query(sql,args),one=async(sql,args)=>(await query(sql,args)).rows[0];
const admin=new Map(),guest=new Map(),checks=[],secrets=['Synthetic-only-A22-password!'];
const pass=(name,condition=true)=>{assert(condition,name);checks.push(name);};
async function q(jar,path,method='GET',body,origin=cfg.base){
 const r=await fetch(cfg.base+path,{method,redirect:'manual',headers:{Origin:origin,...labHeaders(cfg,jar,29),Cookie:[...jar].filter(([,v])=>path.startsWith(v.path)).map(([k,v])=>k+'='+v.value).join('; '),...(body===undefined?{}:{'Content-Type':body instanceof URLSearchParams?'application/x-www-form-urlencoded':'application/json'})},...(body===undefined?{}:{body:body instanceof URLSearchParams?body:JSON.stringify(body)})});
 for(const c of r.headers.getSetCookie()){const pair=c.split(';')[0],i=pair.indexOf('=');jar.set(pair.slice(0,i),{value:pair.slice(i+1),path:/;\s*Path=([^;]+)/i.exec(c)?.[1]||'/'});}
 return{status:r.status,body:r.headers.get('content-type')?.includes('json')?await r.json():await r.text(),headers:r.headers};
}
async function login(jar,email){const c=await q(jar,'/api/auth/csrf');await q(jar,'/api/auth/callback/credentials','POST',new URLSearchParams({csrfToken:c.body.csrfToken,email,password:secrets[0],callbackUrl:cfg.base+'/plataforma'}));assert((await q(jar,'/api/auth/session')).body.user);}
const make=()=>({recipientName:'SINTETICO PREAUTORIZADO',email:'pre-'+randomUUID()+'@example.invalid',hours:24,requestId:randomUUID()});
const issue=(body,jar=admin)=>q(jar,'/api/platform/experiment-invitations','POST',body);
const start=(token,jar=guest,extra={})=>q(jar,'/api/experimentacao','POST',{action:'startAdmission',token,...extra});
async function copied(id){const r=await q(admin,'/api/platform/experiment-invitations/'+id+'/link','POST',{action:'copy'});assert.equal(r.status,200);const token=new URLSearchParams(new URL(r.body.link).hash.slice(1)).get('convite');secrets.push(token);return token;}
async function count(sql,args){return Number((await one(sql,args)).n);}
async function mail(id){
 const challenge=await one('SELECT * FROM admission_challenges WHERE admission_id=$1 ORDER BY issued_at DESC LIMIT 1',[id]);
 const encrypted=await fs.readFile('/tmp/a2-mail/'+challenge.id+'.mail','utf8'),bytes=Buffer.from(encrypted,'base64url');
 const d=createDecipheriv('aes-256-gcm',Buffer.from(process.env.ADMISSION_LAB_MAIL_KEY,'hex'),bytes.subarray(0,12));d.setAAD(Buffer.from('dez/admission/synthetic-mail/v1'));d.setAuthTag(bytes.subarray(12,28));
 const message=JSON.parse(Buffer.concat([d.update(bytes.subarray(28)),d.final()])),fragment=new URLSearchParams(new URL(/http:\/\/localhost:3020\/adesao#[^\s]+/.exec(message.text)[0]).hash.slice(1));
 const token=fragment.get('token');secrets.push(token);assert.equal(createHash('sha256').update(token).digest('hex'),challenge.token_hash);assert(!encrypted.includes(token));
 return{token,challengeId:challenge.id,to:message.to,challenge};
}
async function main(){
 const original=await one("SELECT senha_hash FROM auth_identities WHERE email='a22-admin@example.invalid'"),actorId=randomUUID(),email='pre-admin-'+randomUUID()+'@example.invalid';
 await query("INSERT INTO auth_identities(id,email,nome,senha_hash,status,atualizado_em) VALUES($1,$2,'SINTETICO PREAUTH',$3,'ACTIVE',now())",[actorId,email,original.senha_hash]);
 await query("INSERT INTO platform_admins(id,identity_id,status,atualizado_em) VALUES($1,$2,'ACTIVE',now())",[randomUUID(),actorId]);await login(admin,email);
 const nonAdmin=new Map();await login(nonAdmin,'a22-observer@example.invalid');
 pass('anonymous cannot issue',(await issue(make(),guest)).status===401);pass('tenant/user without PlatformAdmin cannot issue',(await issue(make(),nonAdmin)).status===403);
 pass('cross-origin issuance rejected',(await q(admin,'/api/platform/experiment-invitations','POST',make(),'https://evil.invalid')).status===403);
 const missing=make();delete missing.email;pass('recipient display name is not a bound email',(await issue(missing)).status===400);
 pass('mock refuses real recipients',(await issue({...make(),email:'synthetic@example.com'})).status===400);
 for(const field of ['source','paymentConfirmed','identityId','tenantId','authorizedByAdminId'])pass('client cannot inject '+field,(await issue({...make(),[field]:field==='source'?'VALIDATED_PAYMENT':'forged'})).status===400);
 const body=make(),responses=await Promise.all(Array.from({length:4},()=>issue(body))),g=responses[0].body;
 pass('four simultaneous issues create one authorization',responses.every(r=>[200,201].includes(r.status))&&responses.filter(r=>r.status===201).length===1&&responses.every(r=>r.body.admissionId===g.admissionId));
 const stored=await one('SELECT a.*,e.interest_at,e.token_hash,e.encrypted_token FROM admissions a JOIN experiment_invitations e ON e.id=a.experiment_invitation_id WHERE a.id=$1',[g.admissionId]);
 pass('issuance binds email issuer source and same expiration',stored.authorized_email===body.email&&stored.authorized_by_identity_id===actorId&&stored.source==='AUTHORIZED_INVITE'&&stored.source_reference===g.id&&stored.interest_at===null);
 pass('issuance creates neither challenge nor tenant nor identity',!stored.identity_id&&!stored.tenant_id&&await count('SELECT count(*) n FROM admission_challenges WHERE admission_id=$1',[g.admissionId])===0&&await count('SELECT count(*) n FROM auth_identities WHERE email=$1',[body.email])===0);
 const audit=await query("SELECT * FROM audit_events WHERE resource_id=$1 AND action='ADMISSION_AUTHORIZED'",[g.admissionId]);
 pass('single issuance audit records legitimate administrator',audit.rowCount===1&&audit.rows[0].actor_identity_id===actorId&&audit.rows[0].metadata.event==='SPECIAL_INVITATION_ISSUED');
 pass('idempotency cannot change approved recipient',(await issue({...body,email:'other@example.invalid'})).status===409);
 pass('idempotency cannot extend expiration',(await issue({...body,hours:48})).status===409);
 const token=await copied(g.id);pass('original special token encrypted at rest',stored.token_hash===createHash('sha256').update(token).digest('hex')&&!stored.encrypted_token.includes(token));
 pass('guest cannot select delivery recipient',(await start(token,guest,{email:'other@example.invalid'})).status===400);
 pass('start requires same origin',(await q(guest,'/api/experimentacao','POST',{action:'startAdmission',token},'https://evil.invalid')).status===403);
 const starts=await Promise.all([start(token),start(token)]);
 pass('concurrent start uses same grant and one challenge',starts.every(r=>r.status===200&&r.body.id===g.admissionId)&&await count('SELECT count(*) n FROM admission_challenges WHERE admission_id=$1',[g.admissionId])===1);
 pass('start reveals no email proof or account information',starts.every(r=>Object.keys(r.body).sort().join(',')==='delivery,id'&&!r.headers.getSetCookie().length));
 pass('immediate resend is deferred',(await start(token)).body.delivery==='DEFERRED');
 pass('special link creates no authentication',!(await q(guest,'/api/auth/session')).body?.user);
 pass('special link cannot inspect identity',(await q(guest,'/api/admissions/'+g.admissionId)).status===401);
 pass('special link cannot create identity',(await q(guest,'/api/admissions/'+g.admissionId+'/identity','POST',{password:'Synthetic-new-password!'})).status===401);
 pass('special link cannot provision',(await q(guest,'/api/admissions/'+g.admissionId+'/provision','POST',{nome:'SINTETICO'})).status===401);
 const before=await count('SELECT count(*) n FROM admission_challenges WHERE admission_id=$1',[g.admissionId]);
 await q(guest,'/api/admissions/resume','POST',{email:'other@example.invalid',admissionId:g.admissionId});pass('typing another email cannot change destination or prove control',await count('SELECT count(*) n FROM admission_challenges WHERE admission_id=$1',[g.admissionId])===before);
 const delivered=await mail(g.admissionId);pass('only bound email receives independent expiring challenge',delivered.to===body.email&&delivered.token!==token&&delivered.challenge.expires_at-delivered.challenge.issued_at===15*60000);
 pass('Special token is not an email challenge',(await q(guest,'/api/admissions/'+g.admissionId+'/verify','POST',{challengeId:delivered.challengeId,token})).status===409);
 const verified=new Map(),verifyBody={challengeId:delivered.challengeId,token:delivered.token};
 pass('actual email challenge establishes restricted proof',(await q(verified,'/api/admissions/'+g.admissionId+'/verify','POST',verifyBody)).status===200);
 pass('only verified browser can safely repeat consumed challenge',(await q(verified,'/api/admissions/'+g.admissionId+'/verify','POST',verifyBody)).status===200&&(await q(new Map(),'/api/admissions/'+g.admissionId+'/verify','POST',verifyBody)).status===409);
 pass('email proof alone does not create a tenant',await count('SELECT count(*) n FROM tenants WHERE slug=$1',['adesao-'+g.admissionId])===0);
 pass('cancellation invalidates started admission',(await q(admin,'/api/platform/experiment-invitations/'+g.id,'DELETE')).status===200&&(await start(token)).status===404&&(await q(verified,'/api/admissions/'+g.admissionId)).status===409);
 const failure=make();await query('REVOKE INSERT ON audit_events FROM a2_runtime');
 try{pass('issuance fails when audit is unavailable',(await issue(failure)).status>=500);}finally{await query('GRANT INSERT ON audit_events TO a2_runtime');}
 pass('audit failure rolls back invitation and authorization',await count('SELECT count(*) n FROM experiment_invitations WHERE id=$1',[failure.requestId])===0&&await count('SELECT count(*) n FROM admissions WHERE experiment_invitation_id=$1',[failure.requestId])===0);
 pass('retry after rollback creates exactly one issuance',(await issue(failure)).status===201);
 const legacyId=randomUUID(),legacyToken=randomBytes(32).toString('base64url');secrets.push(legacyToken);
 await query("INSERT INTO experiment_invitations(id,recipient_name,token_hash,created_by_identity_id,expires_at) VALUES($1,$2,$3,$4,now()+interval '1 day')",[legacyId,'legacy@example.invalid',createHash('sha256').update(legacyToken).digest('hex'),actorId]);
 pass('legacy email written as name is not silently authorized',(await start(legacyToken)).status===409);
 await q(guest,'/api/experimentacao','POST',{action:'interest',token:legacyToken});pass('legacy interest still does not authorize',await count('SELECT count(*) n FROM admissions WHERE experiment_invitation_id=$1',[legacyId])===0);
 const expired=(await issue(make())).body,expiredToken=await copied(expired.id);await query("UPDATE experiment_invitations SET created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' WHERE id=$1",[expired.id]);
 pass('expired preauthorized special link rejected',(await start(expiredToken)).status===404);
 const active=(await issue(make())).body,activeToken=await copied(active.id);await query("UPDATE platform_admins SET status='INACTIVE' WHERE identity_id=$1",[actorId]);
 try{pass('revoked administrative authority cannot start fresh admission',(await start(activeToken)).status===403);}finally{await query("UPDATE platform_admins SET status='ACTIVE' WHERE identity_id=$1",[actorId]);}
 await assert.rejects(query("UPDATE admissions SET source='VALIDATED_PAYMENT' WHERE id=$1",[active.admissionId]),{code:'23514'});pass('future paid source remains reserved and cannot be client-enabled');
 const logs=await fs.readFile('/tmp/a2-app.log','utf8'),trail=JSON.stringify((await query('SELECT * FROM audit_events')).rows);
 pass('tokens and passwords absent from application logs and audit',secrets.every(secret=>!logs.includes(secret)&&!trail.includes(secret)));
 pass('no schema or ledger change',await count("SELECT count(*) n FROM pg_tables WHERE schemaname='public'")===44&&await count('SELECT count(*) n FROM _prisma_migrations')===8);
 return{state:'PASSED',checks,syntheticOnly:true,realEmail:false};
}
main().then(async r=>{await fs.writeFile('/tmp/special-admission-result.json',JSON.stringify(r,null,2));console.log(JSON.stringify(r));}).catch(async e=>{const r={state:'FAILED',checks,error:e.name,message:secrets.reduce((m,s)=>m.split(s).join('[redacted]'),e.message)};await fs.writeFile('/tmp/special-admission-result.json',JSON.stringify(r,null,2));console.error(JSON.stringify(r));process.exitCode=1;}).finally(()=>pool.end());
