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
 pass('issuance creates one private credential and no tenant or identity',!stored.identity_id&&!stored.tenant_id&&await count('SELECT count(*) n FROM admission_challenges WHERE admission_id=$1',[g.admissionId])===1&&await count('SELECT count(*) n FROM auth_identities WHERE email=$1',[body.email])===0);
 const audit=await query("SELECT * FROM audit_events WHERE resource_id=$1 AND action='ADMISSION_AUTHORIZED'",[g.admissionId]);
 pass('single issuance audit records legitimate administrator',audit.rowCount===1&&audit.rows[0].actor_identity_id===actorId&&audit.rows[0].metadata.event==='SPECIAL_INVITATION_ISSUED');
 pass('idempotency cannot change approved recipient',(await issue({...body,email:'other@example.invalid'})).status===409);
 pass('idempotency cannot extend expiration',(await issue({...body,hours:48})).status===409);
 const token=await copied(g.id);pass('original special token encrypted at rest',stored.token_hash===createHash('sha256').update(token).digest('hex')&&!stored.encrypted_token.includes(token));
 pass('guest cannot select delivery recipient',(await start(token,guest,{email:'other@example.invalid'})).status===400);
 pass('start requires same origin',(await q(guest,'/api/experimentacao','POST',{action:'startAdmission',token},'https://evil.invalid')).status===403);
 const starts=await Promise.all([start(token),start(token)]);
 pass('concurrent start uses same grant and one challenge',starts.every(r=>r.status===200&&r.body.id===g.admissionId)&&await count('SELECT count(*) n FROM admission_challenges WHERE admission_id=$1',[g.admissionId])===1);
 pass('start reveals only reference, never recipient or authentication',starts.every(r=>Object.keys(r.body).join(',')==='id'&&!r.headers.getSetCookie().length));
 pass('special link creates no authentication',!(await q(guest,'/api/auth/session')).body?.user);
 pass('reference cannot inspect identity',(await q(guest,'/api/admissions/'+g.admissionId)).status===401);
 pass('reference cannot create identity',(await q(guest,'/api/admissions/'+g.admissionId+'/identity','POST',{password:'Synthetic-new-password!'})).status===401);
 pass('reference cannot provision',(await q(guest,'/api/admissions/'+g.admissionId+'/provision','POST',{nome:'SINTETICO'})).status===401);
 const credential=await one('SELECT * FROM admission_challenges WHERE admission_id=$1',[g.admissionId]);
 pass('private credential is bound to Special token and expires with invitation',credential.purpose==='INVITATION_CREDENTIAL'&&credential.token_hash===stored.token_hash&&credential.expires_at.getTime()===stored.expires_at.getTime());
 const redeem=(jar,t=token,id=g.admissionId)=>q(jar,'/api/admissions/'+id+'/verify','POST',{invitationToken:t});
 pass('another token cannot redeem authorization',(await redeem(guest,randomBytes(32).toString('base64url'))).status===409);
 pass('private token cannot masquerade as mailbox proof',(await q(guest,'/api/admissions/'+g.admissionId+'/verify','POST',{challengeId:credential.id,token})).status===409);
 const browsers=[new Map(),new Map(),new Map()],race=await Promise.all(browsers.map(j=>redeem(j))),verified=browsers[race.findIndex(r=>r.status===200)];
 pass('concurrent browsers consume exactly once',race.filter(r=>r.status===200).length===1&&race.filter(r=>r.status===401).length===2);
 pass('proof is scoped HttpOnly and SameSite Strict',race.find(r=>r.status===200).headers.getSetCookie().some(c=>c.includes('Path=/api/admissions/'+g.admissionId)&&/HttpOnly/i.test(c)&&/SameSite=strict/i.test(c)));
 pass('same browser repeats safely, other browser cannot replay',(await redeem(verified)).status===200&&(await redeem(new Map())).status===401);
 const view=await q(verified,'/api/admissions/'+g.admissionId),redeemed=await one('SELECT * FROM admissions WHERE id=$1',[g.admissionId]);
 pass('email is immutable authorization, not claimed mailbox proof',view.status===200&&view.body.email===body.email&&view.body.emailVerified===false&&view.body.proofMethod==='PRIVATE_INVITATION'&&redeemed.email_verified_at===null&&redeemed.invitation_redeemed_at);
 await q(guest,'/api/admissions/resume','POST',{email:body.email,admissionId:g.admissionId});
 pass('resume by email neither sends mail nor replaces the private credential',await count('SELECT count(*) n FROM admission_challenges WHERE admission_id=$1',[g.admissionId])===1);
 await assert.rejects(fs.access('/tmp/a2-mail/'+credential.id+'.mail'));pass('no synthetic or real message generated for private invitation');
 pass('private credential alone creates no tenant',await count('SELECT count(*) n FROM tenants WHERE slug=$1',['adesao-'+g.admissionId])===0);
 pass('cancellation invalidates started admission',(await q(admin,'/api/platform/experiment-invitations/'+g.id,'DELETE')).status===200&&(await start(token)).status===404&&(await q(verified,'/api/admissions/'+g.admissionId)).status===409);
 const newInput=make(),newGrant=(await issue(newInput)).body,newToken=await copied(newGrant.id),newJar=new Map();
 assert.equal((await redeem(newJar,newToken,newGrant.admissionId)).status,200);
 pass('email injection rejected',(await q(newJar,'/api/admissions/'+newGrant.admissionId+'/identity','POST',{password:secrets[0],email:'other@example.invalid'})).status===400);
 pass('new identity uses existing credential mechanism',(await q(newJar,'/api/admissions/'+newGrant.admissionId+'/identity','POST',{password:secrets[0]})).status===200);
 await login(newJar,newInput.email);
 for(const key of newJar.keys())if(key.startsWith('dez-admission-'))newJar.delete(key);
 pass('own login resumes redeemed grant without browser proof',(await q(newJar,'/api/admissions/'+newGrant.admissionId)).body.state==='IDENTITY_VERIFIED');
 const provision=(j,id)=>q(j,'/api/admissions/'+id+'/provision','POST',{nome:'ESPACO SINTETICO PRIVADO'});
 const provisionRace=await Promise.all(Array.from({length:3},()=>provision(newJar,newGrant.admissionId)));
 pass('concurrent provision creates exactly one complete tenant',provisionRace.every(r=>[200,201].includes(r.status))&&provisionRace.filter(r=>r.status===201).length===1&&await count('SELECT count(*) n FROM tenants WHERE slug=$1',['adesao-'+newGrant.admissionId])===1);
 pass('contractual requirements still block operation',(await q(newJar,'/api/lancamentos')).status===428);
 pass('new browser token alone cannot access completed tenant',(await redeem(new Map(),newToken,newGrant.admissionId)).status===403);
 const existingEmail='owner@example.invalid',oldHash=(await one('SELECT senha_hash FROM auth_identities WHERE email=$1',[existingEmail])).senha_hash;
 const existingBefore=await count('SELECT count(*) n FROM tenant_memberships WHERE identity_id=(SELECT id FROM auth_identities WHERE email=$1)',[existingEmail]);
 const existingGrant=(await issue({...make(),email:existingEmail})).body,existingToken=await copied(existingGrant.id),existingJar=new Map();
 assert.equal((await redeem(existingJar,existingToken,existingGrant.admissionId)).status,200);
 pass('existing identity requires own authentication',(await q(existingJar,'/api/admissions/'+existingGrant.admissionId)).body.state==='LOGIN_REQUIRED'&&(await provision(existingJar,existingGrant.admissionId)).status===401);
 pass('private link cannot overwrite existing password',(await q(existingJar,'/api/admissions/'+existingGrant.admissionId+'/identity','POST',{password:'Different-Synthetic-password!'})).body.created===false&&(await one('SELECT senha_hash FROM auth_identities WHERE email=$1',[existingEmail])).senha_hash===oldHash);
 await login(existingJar,newInput.email);pass('authenticated wrong identity cannot provision',(await provision(existingJar,existingGrant.admissionId)).status===403);
 await login(existingJar,existingEmail);assert.equal((await provision(existingJar,existingGrant.admissionId)).status,201);
 pass('existing credentials and memberships preserved with another legitimate tenant',(await one('SELECT senha_hash FROM auth_identities WHERE email=$1',[existingEmail])).senha_hash===oldHash&&await count('SELECT count(*) n FROM tenant_memberships WHERE identity_id=(SELECT id FROM auth_identities WHERE email=$1)',[existingEmail])===existingBefore+1);
 pass('wrong identity cannot resume another completed grant',(await q(newJar,'/api/admissions/'+existingGrant.admissionId)).status===403);
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
 pass('H9 ledger preserved during private journey',await count("SELECT count(*) n FROM pg_tables WHERE schemaname='public'")===44&&await count('SELECT count(*) n FROM _prisma_migrations')===9);
 return{state:'PASSED',checks,syntheticOnly:true,realEmail:false};
}
main().then(async r=>{await fs.writeFile('/tmp/special-admission-result.json',JSON.stringify(r,null,2));console.log(JSON.stringify(r));}).catch(async e=>{const r={state:'FAILED',checks,error:e.name,message:secrets.reduce((m,s)=>m.split(s).join('[redacted]'),e.message)};await fs.writeFile('/tmp/special-admission-result.json',JSON.stringify(r,null,2));console.error(JSON.stringify(r));process.exitCode=1;}).finally(()=>pool.end());
