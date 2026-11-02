// Runs only inside the disposable network-none A.2.2 worker. Never accepts an external target.
const assert = require('node:assert/strict');
const {randomUUID,randomBytes,createHash,createDecipheriv} = require('node:crypto');
const {readFile,readdir,rename,writeFile,unlink} = require('node:fs/promises');
const {Pool} = require('pg');
const bcrypt = require('bcryptjs');
const base = 'http://localhost:3020', db = new URL(process.env.DATABASE_URL);
assert.equal(db.hostname,'127.0.0.1');assert.equal(db.pathname,'/special_invite_lab');assert.equal(db.username,'a2_runtime');
assert.equal(process.env.ADMISSION_LAB_ENABLED,'true');assert.equal(process.env.ADMISSION_LAB_MAIL_DIR,'/tmp/a2-mail');
const pool = new Pool({connectionString:'postgresql://postgres@127.0.0.1:5432/special_invite_lab'});
const checks=[], secrets=[], password='Synthetic-only-A22-password!';secrets.push(password);
const pass=(name,condition=true)=>{assert(condition,name);checks.push(name);console.log('PASS '+name)};
const query=(sql,params=[])=>pool.query(sql,params), one=async(sql,params)=>(await query(sql,params)).rows[0];
const jar=()=>new Map();
function saveCookies(cookies,response){for(const line of response.headers.getSetCookie()){const pair=line.split(';')[0],offset=pair.indexOf('=');cookies.set(pair.slice(0,offset),{value:pair.slice(offset+1),path:/;\s*Path=([^;]+)/i.exec(line)?.[1]||'/'});}}
async function request(cookies,path,method='GET',body,options={}) {
  const headers={Origin:options.origin??base,Cookie:[...cookies].filter(([,cookie])=>path.startsWith(cookie.path)).map(([name,cookie])=>`${name}=${cookie.value}`).join('; '),
    ...(body===undefined?{}:{'Content-Type':body instanceof URLSearchParams?'application/x-www-form-urlencoded':'application/json'}),...options.headers};
  const response=await fetch(base+path,{method,headers,redirect:'manual',...(body===undefined?{}:{body:body instanceof URLSearchParams?body:JSON.stringify(body)})});
  if(options.save!==false)saveCookies(cookies,response);
  const type=response.headers.get('content-type')||'';const value=type.includes('json')?await response.json():await response.text();
  return {status:response.status,body:value,headers:response.headers};
}
async function login(cookies,email,secret=password,expected=true){
  const csrf=await request(cookies,'/api/auth/csrf');
  await request(cookies,'/api/auth/callback/credentials','POST',new URLSearchParams({csrfToken:csrf.body.csrfToken,email,password:secret,callbackUrl:base+'/adesao'}));
  const session=await request(cookies,'/api/auth/session');assert.equal(!!session.body?.user,expected,'credential authentication');return session.body?.user;
}
async function identity(email){const id=randomUUID();await query('INSERT INTO auth_identities(id,email,nome,senha_hash,status,atualizado_em) VALUES($1,$2,$3,$4,\'ACTIVE\',now())',[id,email,'SINTÉTICO A22',await bcrypt.hash(password,12)]);return id;}
async function fixture(kind='active') {
  const id=randomUUID(),token=randomBytes(32).toString('base64url');
  await query(`INSERT INTO experiment_invitations(id,recipient_name,token_hash,created_by_identity_id,created_at,expires_at,interest_at,revoked_at)
    VALUES($1,'SINTÉTICO A22',$2,$3,now()-interval '1 hour',${kind==='expired'?"now()-interval '1 minute'":"now()+interval '24 hours'"},${kind==='no-interest'?'NULL':"now()-interval '30 minutes'"},${kind==='revoked'?'now()':'NULL'})`,[id,createHash('sha256').update(token).digest('hex'),adminId]);
  return {id,token};
}
const adminPath=id=>`/api/platform/experiment-invitations/${id}/admission`;
async function approve(email,invitation=undefined){
  const f=invitation||await fixture();const response=await request(adminJar,adminPath(f.id),'POST',{email});
  assert.equal(response.status,201,'authorize synthetic grant');assert.equal(response.body.delivery,'SIMULATED');
  return {invitation:f.id,id:response.body.id,email};
}
async function latestMail(id){
  const row=await one('SELECT * FROM admission_challenges WHERE admission_id=$1 ORDER BY issued_at DESC,generation DESC LIMIT 1',[id]);assert(row);
  const ciphertext=await readFile('/tmp/a2-mail/'+row.id+'.mail','utf8'),bytes=Buffer.from(ciphertext,'base64url');
  const cipher=createDecipheriv('aes-256-gcm',Buffer.from(process.env.ADMISSION_LAB_MAIL_KEY,'hex'),bytes.subarray(0,12));
  cipher.setAAD(Buffer.from('dez/admission/synthetic-mail/v1'));cipher.setAuthTag(bytes.subarray(12,28));
  const mail=JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)),cipher.final()]).toString());
  const link=/http:\/\/localhost:3020\/adesao#[^\s]+/.exec(mail.text)?.[0];assert(link,'synthetic mail has fragment link');
  const fragment=new URLSearchParams(new URL(link).hash.slice(1)),token=fragment.get('token');secrets.push(token);
  assert(!ciphertext.includes(token));assert.equal(createHash('sha256').update(token).digest('hex'),row.token_hash);
  return {challengeId:row.id,token,row,mail};
}
async function verify(grant,cookies,mail=undefined,options={}){const m=mail||await latestMail(grant.id);return request(cookies,`/api/admissions/${grant.id}/verify`,'POST',{challengeId:m.challengeId,token:m.token},options);}
async function age(grant,seconds=61){
  await query('BEGIN');
  try {
    await query(`UPDATE admissions SET authorized_at=authorized_at-$2*interval '1 second',expires_at=expires_at-$2*interval '1 second',email_verified_at=email_verified_at-$2*interval '1 second' WHERE id=$1`,[grant.id,seconds]);
    await query(`UPDATE admission_challenges SET issued_at=issued_at-$2*interval '1 second',expires_at=expires_at-$2*interval '1 second',consumed_at=consumed_at-$2*interval '1 second',revoked_at=revoked_at-$2*interval '1 second',last_attempt_at=last_attempt_at-$2*interval '1 second' WHERE admission_id=$1`,[grant.id,seconds]);
    await query('COMMIT');
  } catch(error){await query('ROLLBACK');throw error;}
}
let adminId,memberId,adminJar=jar(),memberJar=jar();
async function main(){
  // Foundation fixtures are historical inputs, even when its dump was just generated.
  // Keep their relative timestamps and evidence; do not disable the real mail budget.
  const inherited=(await query('SELECT id,authorized_email FROM admissions')).rows;
  assert.equal(inherited.length,11);assert(inherited.every(r=>/^(admission-(?:[1-9]|10)|race-approval-[ab])$/.test(r.id)&&r.authorized_email==='owner@example.invalid'));
  const clock=await pool.connect();try{await clock.query('BEGIN');
    for(const [table,columns] of [['experiment_invitations',['created_at','expires_at','revoked_at','viewed_at','acknowledged_at','interest_at']],
      ['admissions',['authorized_at','expires_at','email_verified_at','provisioned_at','cancelled_at']],
      ['admission_challenges',['issued_at','expires_at','consumed_at','revoked_at','last_attempt_at']]])
      await clock.query(`UPDATE ${table} SET ${columns.map(c=>c+"="+c+"-interval '1 day'").join(',')}`);
    await clock.query('COMMIT');
  }catch(error){await clock.query('ROLLBACK');throw error;}finally{clock.release();}
  const protectedTables=['tenants','tenant_memberships','access_profiles','usuarios','legacy_user_access_maps','access_invites','access_owner_events','term_acceptances','tenant_contractual_onboarding','tenant_contractual_responsibles'];
  const snapshot=async()=>{const value={};for(const table of protectedTables)value[table]=(await one(`SELECT md5(coalesce(string_agg(to_jsonb(t)::text,chr(10) ORDER BY to_jsonb(t)::text),'')) hash FROM ${table} t`)).hash;return value;};
  const original=await snapshot();
  const ledger=await one('SELECT count(*)::int n,md5(string_agg(to_jsonb(t)::text,chr(10) ORDER BY id)) hash FROM _prisma_migrations t');
  assert.equal(ledger.n,9);pass('LOCAL H9 migrated with 43 application tables plus Prisma ledger',Number((await one("SELECT count(*) n FROM pg_tables WHERE schemaname='public'")).n)===44);
  adminId=await identity('a22-admin@example.invalid');await identity('a22-observer@example.invalid');memberId='owner-i';
  // Initialize a usable credential ONLY for the known synthetic A.2.1 owner fixture, before baseline capture.
  const ownerFixture=await query("UPDATE auth_identities SET senha_hash=$1 WHERE id='owner-i' AND email='owner@example.invalid' AND senha_hash='unused-synthetic-verifier'",[await bcrypt.hash(password,12)]);
  assert.equal(ownerFixture.rowCount,1,'known synthetic owner fixture only');
  await query("INSERT INTO platform_admins(id,identity_id,status,atualizado_em) VALUES($1,$2,'ACTIVE',now())",[randomUUID(),adminId]);
  await login(adminJar,'a22-admin@example.invalid');await login(memberJar,'owner@example.invalid');
  const existingBefore=await one('SELECT * FROM auth_identities WHERE id=$1',[memberId]);
  const special=await fixture('no-interest'),anon=jar();
  pass('anonymous administrative approval denied',(await request(anon,adminPath(special.id),'POST',{email:'none@example.invalid'})).status===401);
  pass('authenticated identity without PlatformAdmin denied',(await request(memberJar,adminPath(special.id),'POST',{email:'none@example.invalid'})).status===403);
  pass('administrative approval requires same origin',(await request(adminJar,adminPath(special.id),'POST',{email:'none@example.invalid'},{origin:'https://evil.invalid'})).status===403);
  for(const context of ['support_context','advisory_context']){adminJar.set(context,{value:'untrusted-context',path:'/'});pass(context+' cannot authorize',(await request(adminJar,adminPath(special.id),'POST',{email:'none@example.invalid'})).status===403);adminJar.delete(context);}
  pass('no interest cannot be authorized',(await request(adminJar,adminPath(special.id),'POST',{email:'none@example.invalid'})).status===409);
  const interest=await request(anon,'/api/experimentacao','POST',{action:'interest',token:special.token});
  pass('existing interest endpoint remains functional and creates no admission',interest.status===200&&Number((await one('SELECT count(*) n FROM admissions WHERE experiment_invitation_id=$1',[special.id])).n)===0);
  const grant=await approve('a22-new@example.invalid',special),newJar=jar(),mail=await latestMail(grant.id);
  pass('acceptance binds Special Invitation and approved normalized email',mail.row.recipient_email===grant.email&&mail.row.purpose==='EMAIL_VERIFICATION');
  const replay=await request(adminJar,adminPath(special.id),'POST',{email:' A22-NEW@EXAMPLE.INVALID ',hours:1});
  pass('administrative retries preserve grant, email, expiry and original challenge',replay.status===200&&replay.body.id===grant.id&&replay.body.delivery==='UNCHANGED'&&Number((await one('SELECT count(*) n FROM admission_challenges WHERE admission_id=$1',[grant.id])).n)===1);
  pass('approved recipient cannot be transferred',(await request(adminJar,adminPath(special.id),'POST',{email:'another@example.invalid'})).status===409);
  const concurrency=await fixture();const simultaneous=await Promise.all([1,2,3,4].map(()=>request(adminJar,adminPath(concurrency.id),'POST',{email:'a22-concurrency@example.invalid'})));
  pass('concurrent administrative approvals produce one grant and one email',simultaneous.filter(r=>r.status===201).length===1&&simultaneous.filter(r=>r.status===200).length===3&&new Set(simultaneous.map(r=>r.body.id)).size===1);
  for(const kind of ['expired','revoked']){const f=await fixture(kind);pass(kind+' invitation cannot authorize',(await request(adminJar,adminPath(f.id),'POST',{email:'blocked@example.invalid'})).status===409);}
  pass('real recipient refused in LOCAL',(await request(adminJar,adminPath((await fixture()).id),'POST',{email:'person@example.com'})).status===400);
  await query("UPDATE platform_admins SET status='INACTIVE' WHERE identity_id=$1",[adminId]);
  pass('current administrative status revalidated despite existing session',(await request(adminJar,adminPath((await fixture()).id),'POST',{email:'blocked@example.invalid'})).status===403);
  await query("UPDATE platform_admins SET status='ACTIVE' WHERE identity_id=$1",[adminId]);
  const forged=await request(adminJar,adminPath((await fixture()).id),'POST',{email:'forged@example.invalid',actorIdentityId:memberId});pass('browser-supplied authority rejected',forged.status===400);
  pass('unverified browser cannot inspect identity or grant email',(await request(newJar,`/api/admissions/${grant.id}`)).status===401);
  pass('GET and mail scanners never consume challenges',(await request(newJar,`/api/admissions/${grant.id}/verify`)).status===405&&(await one('SELECT status FROM admission_challenges WHERE id=$1',[mail.challengeId])).status==='PENDING');
  pass('verification needs same origin',(await verify(grant,newJar,mail,{origin:'https://evil.invalid'})).status===403);
  pass('verification request body is bounded',(await request(newJar,`/api/admissions/${grant.id}/verify`,'POST',{challengeId:mail.challengeId,token:'x'.repeat(3000)})).status===413);
  const consumed=await verify(grant,newJar,mail);pass('explicit POST verifies email and issues HttpOnly restricted cookie',consumed.status===200&&consumed.headers.getSetCookie().some(x=>x.includes('HttpOnly')&&x.includes('SameSite=strict')&&x.includes('/api/admissions/'+grant.id)));
  pass('restricted proof does not become an operational session',!(await request(newJar,'/api/auth/session')).body?.user&&(await request(newJar,'/api/empresa')).status===401);
  pass('same browser safely repeats completed verification',(await verify(grant,newJar,mail)).status===200);
  pass('consumed token cannot establish another browser proof',(await verify(grant,jar(),mail)).status===409);
  pass('new identity is offered only after email proof',(await request(newJar,`/api/admissions/${grant.id}`)).body.state==='CREATE_IDENTITY');
  pass('unverified browser cannot create identity',(await request(jar(),`/api/admissions/${grant.id}/identity`,'POST',{password})).status===401);
  pass('new password follows existing policy',(await request(newJar,`/api/admissions/${grant.id}/identity`,'POST',{password:'short'})).status===400);
  const activations=await Promise.all([1,2].map(()=>request(newJar,`/api/admissions/${grant.id}/identity`,'POST',{password})));
  pass('concurrent identity activation creates one identity without a tenant',activations.every(x=>x.status===200)&&activations.filter(x=>x.body.created).length===1&&Number((await one('SELECT count(*) n FROM auth_identities WHERE email=$1',[grant.email])).n)===1);
  pass('lost identity response can recover through normal login',(await request(newJar,`/api/admissions/${grant.id}`)).body.state==='LOGIN_REQUIRED');
  const newUser=await login(newJar,grant.email);
  const ready=await request(newJar,`/api/admissions/${grant.id}`);
  pass('authorization plus proof plus authenticated identity reaches IDENTITY_VERIFIED',ready.body.state==='IDENTITY_VERIFIED'&&ready.body.identityId===newUser.id&&ready.body.canProvision===true);
  pass('new identity still has no operational tenant',(await request(newJar,'/api/empresa')).status===403);
  const secondTab=new Map(newJar);pass('multiple tabs read the same authorization and verified identity',(await request(secondTab,`/api/admissions/${grant.id}`)).body.id===grant.id);
  const existing=await approve('owner@example.invalid'),existingMail=await latestMail(existing.id),existingJar=jar();
  await verify(existing,existingJar,existingMail);
  pass('email proof alone does not log in an existing identity',(await request(existingJar,`/api/admissions/${existing.id}`)).body.state==='LOGIN_REQUIRED'&&!(await request(existingJar,'/api/auth/session')).body?.user);
  const untouched=await request(existingJar,`/api/admissions/${existing.id}/identity`,'POST',{password:'A-different-synthetic-password!'});
  pass('admission cannot reset an existing password',untouched.status===200&&untouched.body.created===false);assert.deepEqual(await one('SELECT * FROM auth_identities WHERE id=$1',[memberId]),existingBefore);
  await login(existingJar,'owner@example.invalid','incorrect-password',false);await login(existingJar,'owner@example.invalid');
  pass('only the existing credential completes identity verification',(await request(existingJar,`/api/admissions/${existing.id}`)).body.identityId===memberId);
  pass('reused identity retains both existing tenant memberships',Number((await one('SELECT count(*) n FROM tenant_memberships WHERE identity_id=$1',[memberId])).n)===2);
  const wrongIdentity=new Map(newJar);for(const [key,value]of existingJar)if(key.startsWith('dez-admission-'))wrongIdentity.set(key,value);
  pass('session of another identity is not accepted',(await request(wrongIdentity,`/api/admissions/${existing.id}`)).body.state==='LOGIN_REQUIRED');
  const tampered=new Map(existingJar),cookieKey='dez-admission-'+existing.id,originalCookie=tampered.get(cookieKey).value;
  tampered.set(cookieKey,{value:(originalCookie[0]==='A'?'B':'A')+originalCookie.slice(1),path:'/'});
  pass('modified restricted cookie is denied',(await request(tampered,`/api/admissions/${existing.id}`)).status===401);
  const cross=new Map(existingJar);cross.set('dez-admission-'+grant.id,{...existingJar.get(cookieKey),path:'/'});
  pass('proof for another authorization is denied',(await request(cross,`/api/admissions/${grant.id}`)).status===401);
  await query("UPDATE auth_identities SET status='INACTIVE' WHERE id=$1",[memberId]);
  pass('disabled identity cannot continue',(await request(existingJar,`/api/admissions/${existing.id}`)).status===403);
  await query("UPDATE auth_identities SET status='ACTIVE' WHERE id=$1",[memberId]);
  const bad=await approve('a22-bad@example.invalid'),badMail=await latestMail(bad.id);
  pass('challenge is bound to its own grant',(await request(jar(),`/api/admissions/${bad.id}/verify`,'POST',{challengeId:mail.challengeId,token:mail.token})).status===409);
  for(let n=0;n<5;n++)assert.equal((await request(jar(),`/api/admissions/${bad.id}/verify`,'POST',{challengeId:badMail.challengeId,token:'x'.repeat(43)})).status,409);
  const exhausted=await one('SELECT attempt_count,status FROM admission_challenges WHERE id=$1',[badMail.challengeId]);pass('five invalid attempts persist and revoke the challenge',exhausted.attempt_count===5&&exhausted.status==='REVOKED');
  pass('valid token cannot revive an exhausted challenge',(await verify(bad,jar(),badMail)).status===409);
  const expired=await approve('a22-expired@example.invalid'),expiredMail=await latestMail(expired.id);await age(expired,901);
  pass('expired challenge is refused and revoked',(await verify(expired,jar(),expiredMail)).status===409&&(await one('SELECT status FROM admission_challenges WHERE id=$1',[expiredMail.challengeId])).status==='REVOKED');
  const race=await approve('a22-race@example.invalid'),raceMail=await latestMail(race.id);
  const raced=await Promise.all([1,2,3].map(()=>verify(race,jar(),raceMail)));pass('concurrent consumption has one winner: '+raced.map(r=>r.status).sort().join('/'),raced.filter(r=>r.status===200).length===1&&raced.filter(r=>r.status===409).length===2);
  const lost=await approve('a22-lost@example.invalid'),lostMail=await latestMail(lost.id);
  await verify(lost,jar(),lostMail,{save:false});await age(lost);
  const proofBefore=await one('SELECT verified_challenge_id,email_verified_at FROM admissions WHERE id=$1',[lost.id]);
  const resume=await request(jar(),'/api/admissions/resume','POST',{email:lost.email,admissionId:lost.id}),resumedMail=await latestMail(lost.id),resumed=jar();
  pass('lost verification response resumes the same grant with a new one-time challenge',resume.status===200&&resumedMail.row.purpose==='RESUME'&&resumedMail.challengeId!==lostMail.challengeId&&(await verify(lost,resumed,resumedMail)).status===200);
  assert.deepEqual(await one('SELECT verified_challenge_id,email_verified_at FROM admissions WHERE id=$1',[lost.id]),proofBefore);pass('resumption preserves original email verification evidence');
  const multiEmail='a22-multi@example.invalid',multiId=await identity(multiEmail),multiFirst=await approve(multiEmail);await age(multiFirst);
  const multiSecond=await approve(multiEmail),multiJar=jar();await verify(multiFirst,multiJar);await verify(multiSecond,multiJar);await login(multiJar,multiEmail);
  pass('two grants reuse one identity with independently scoped browser proofs',(await request(multiJar,`/api/admissions/${multiFirst.id}`)).body.identityId===multiId&&(await request(multiJar,`/api/admissions/${multiSecond.id}`)).body.identityId===multiId);
  await age(multiSecond);const countBefore=Number((await one('SELECT count(*) n FROM admission_challenges WHERE recipient_email=$1',[multiEmail])).n);
  await request(jar(),'/api/admissions/resume','POST',{email:multiEmail});
  pass('email-only recovery never guesses between multiple valid grants',Number((await one('SELECT count(*) n FROM admission_challenges WHERE recipient_email=$1',[multiEmail])).n)===countBefore);
  await request(jar(),'/api/admissions/resume','POST',{email:multiEmail,admissionId:multiSecond.id});
  pass('explicit interrupted reference resumes the selected grant only',(await latestMail(multiSecond.id)).row.purpose==='RESUME'&&Number((await one('SELECT count(*) n FROM admission_challenges WHERE admission_id=$1',[multiFirst.id])).n)===1);
  const resend=await approve('a22-resend@example.invalid'),old=await latestMail(resend.id);
  await request(jar(),'/api/admissions/resume','POST',{email:resend.email,admissionId:resend.id});pass('immediate resend respects persistent cooldown',Number((await one('SELECT count(*) n FROM admission_challenges WHERE admission_id=$1',[resend.id])).n)===1);
  await age(resend);await request(jar(),'/api/admissions/resume','POST',{email:resend.email,admissionId:resend.id});const newer=await latestMail(resend.id);
  pass('resend revokes previous generation without deleting evidence',newer.row.generation===2&&(await verify(resend,jar(),old)).status===409);
  await age(resend);await request(jar(),'/api/admissions/resume','POST',{email:resend.email,admissionId:resend.id});await age(resend);
  await request(jar(),'/api/admissions/resume','POST',{email:resend.email,admissionId:resend.id});pass('three issues per recipient per 15 minutes persist in database',Number((await one('SELECT count(*) n FROM admission_challenges WHERE admission_id=$1',[resend.id])).n)===3);
  const emailOnly=await request(jar(),'/api/admissions/resume','POST',{email:'absent@example.invalid'}),limited=await request(jar(),'/api/admissions/resume','POST',{email:resend.email,admissionId:resend.id});
  pass('absence and throttling have the same public response',emailOnly.status===limited.status&&JSON.stringify(emailOnly.body)===JSON.stringify(limited.body));
  const cancelled=await approve('a22-cancel@example.invalid'),cancelMail=await latestMail(cancelled.id);
  await request(adminJar,adminPath(cancelled.invitation),'DELETE',{reason:'Cancelamento sintético A22'});
  pass('cancellation preserves evidence and invalidates pending challenge',(await verify(cancelled,jar(),cancelMail)).status===409&&(await one('SELECT status FROM admission_challenges WHERE id=$1',[cancelMail.challengeId])).status==='REVOKED');
  pass('cancelled authorization cannot be reopened',(await request(adminJar,adminPath(cancelled.invitation),'POST',{email:cancelled.email})).status===409);
  const revoke=await approve('a22-revoke@example.invalid'),revokeMail=await latestMail(revoke.id),revokeJar=jar();await verify(revoke,revokeJar,revokeMail);
  await request(adminJar,`/api/platform/experiment-invitations/${revoke.invitation}`,'DELETE');
  pass('existing Special Invitation cancellation also blocks verified resumption',(await request(revokeJar,`/api/admissions/${revoke.id}`)).status===409);
  const timed=await approve('a22-expired-grant@example.invalid'),timedMail=await latestMail(timed.id);await age(timed,25*3600);
  pass('expired authorization rejects even the correct challenge',(await verify(timed,jar(),timedMail)).status===409);
  const verifyOutage=await approve('a22-proof-outage@example.invalid'),verifyOutageMail=await latestMail(verifyOutage.id);
  const outage=await fixture();await query('REVOKE INSERT ON audit_events FROM a2_runtime');
  try{
    const response=await request(adminJar,adminPath(outage.id),'POST',{email:'a22-outage@example.invalid'});pass('audit outage rolls back the administrative authorization',response.status===503&&Number((await one('SELECT count(*) n FROM admissions WHERE experiment_invitation_id=$1',[outage.id])).n)===0);
    const proofResponse=await verify(verifyOutage,jar(),verifyOutageMail);pass('audit outage cannot consume a challenge or issue a restricted session',proofResponse.status===503&&!proofResponse.headers.getSetCookie().length&&(await one('SELECT status FROM admission_challenges WHERE id=$1',[verifyOutageMail.challengeId])).status==='PENDING'&&!(await one('SELECT email_verified_at FROM admissions WHERE id=$1',[verifyOutage.id])).email_verified_at);
  }finally{await query('GRANT INSERT ON audit_events TO a2_runtime');}
  pass('verification can retry after temporary audit outage',(await verify(verifyOutage,jar(),verifyOutageMail)).status===200);
  const failedInvitation=await fixture();await rename('/tmp/a2-mail','/tmp/a2-mail-held');await writeFile('/tmp/a2-mail','synthetic transport failure');let failed;
  try{failed=await request(adminJar,adminPath(failedInvitation.id),'POST',{email:'a22-delivery-failure@example.invalid'});pass('delivery failure preserves authorized grant with explicit FAILED status',failed.status===201&&failed.body.delivery==='FAILED');}
  finally{await unlink('/tmp/a2-mail');await rename('/tmp/a2-mail-held','/tmp/a2-mail');}
  const failedGrant={id:failed.body.id,email:'a22-delivery-failure@example.invalid'};await age(failedGrant);await request(jar(),'/api/admissions/resume','POST',{email:failedGrant.email,admissionId:failedGrant.id});
  pass('temporary delivery failure recovers on the same authorization',(await verify(failedGrant,jar(),await latestMail(failedGrant.id))).status===200);
  const page=await request(jar(),'/adesao');
  console.log('PAGE_HEADERS '+JSON.stringify({status:page.status,referrer:page.headers.get('referrer-policy'),cache:page.headers.get('cache-control'),robots:page.headers.get('x-robots-tag'),heading:page.body.includes('Seu próximo passo começa aqui')}));
  pass('admission page is private and noindex with no-referrer',page.status===200&&page.headers.get('referrer-policy')==='no-referrer'&&page.headers.get('cache-control').includes('no-store')&&page.body.includes('Seu próximo passo começa aqui'));
  pass('no new tenant, membership, owner, operational invitation or contractual record',JSON.stringify(await snapshot())===JSON.stringify(original));
  assert.deepEqual(await one('SELECT * FROM auth_identities WHERE id=$1',[memberId]),existingBefore);pass('existing identity password and all prior fields preserved');
  assert.deepEqual(await one('SELECT count(*)::int n,md5(string_agg(to_jsonb(t)::text,chr(10) ORDER BY id)) hash FROM _prisma_migrations t'),ledger);pass('A.2.1 schema and migration ledger unchanged');
  const audit=JSON.stringify((await query("SELECT * FROM audit_events WHERE action LIKE 'ADMISSION_%'")).rows);
  const log=await readFile('/tmp/a2-app.log','utf8');for(const secret of secrets){assert(!audit.includes(secret),'audit contains no raw challenge or password');assert(!log.includes(secret),'server log contains no raw challenge or password');}
  pass('raw tokens and passwords absent from audit and application logs');
  pass('synthetic mail sink stores only encrypted envelopes',(await readdir('/tmp/a2-mail')).every(name=>name.endsWith('.mail')));
  await writeFile('/tmp/a2-http-result.json',JSON.stringify({state:'PASSED',phase:'A.2.2',checks,tenantsCreated:0,realEmail:false,ledger:'H9',tables:44},null,2));
  console.log(JSON.stringify({state:'A2_2_HTTP_PASSED',checks:checks.length}));
}
main().catch(async error=>{await writeFile('/tmp/a2-http-result.json',JSON.stringify({state:'FAILED',checks,error:String(error.message).slice(0,250)}));console.error('A2_2_HTTP_FAILED '+String(error.message).slice(0,250));process.exitCode=1;}).finally(()=>pool.end());
