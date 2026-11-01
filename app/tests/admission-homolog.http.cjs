// Only stdin-executed inside the network-none, synthetic candidate rehearsal.
const assert=require('node:assert/strict'),{randomUUID,randomBytes,createHash,createDecipheriv}=require('node:crypto');
const {readFileSync}=require('node:fs'),{Pool}=require('pg'),bcrypt=require('bcryptjs');
const origin='https://homolog.dezsolucoes.com.br',base='http://127.0.0.1:3000';
assert.equal(process.env.DEPLOYMENT_PROFILE,'homolog');assert.equal(process.env.ADMISSION_HOMOLOG_ENABLED,'true');assert.equal(process.env.EMAIL_PROVIDER,'mock');
const db=new Pool({connectionString:'postgresql://postgres@127.0.0.1:5432/gestar_homolog_pg18'}),checks=[],secrets=[];
const pass=n=>{checks.push(n);console.log('PASS '+n)},query=(s,v)=>db.query(s,v),one=async(s,v)=>(await query(s,v)).rows[0];
const password='Synthet1c!A26-'+randomBytes(12).toString('hex');secrets.push(password);
async function q(j,path,method='GET',body){
  const r=await fetch(base+path,{method,redirect:'manual',headers:{Origin:origin,Host:'homolog.dezsolucoes.com.br','X-Forwarded-Proto':'https',
    'X-Forwarded-Host':'homolog.dezsolucoes.com.br',Cookie:[...j].filter(([,v])=>path.startsWith(v.path)).map(([k,v])=>k+'='+v.value).join('; '),
    ...(body===undefined?{}:{'Content-Type':body instanceof URLSearchParams?'application/x-www-form-urlencoded':'application/json'})},
    ...(body===undefined?{}:{body:body instanceof URLSearchParams?body:JSON.stringify(body)})});
  for(const c of r.headers.getSetCookie()){const pair=c.split(';')[0],i=pair.indexOf('=');j.set(pair.slice(0,i),{value:pair.slice(i+1),path:/;\s*Path=([^;]+)/i.exec(c)?.[1]||'/'});}
  return {status:r.status,headers:r.headers,body:r.headers.get('content-type')?.includes('json')?await r.json():await r.text()};
}
async function login(j,email){const csrf=await q(j,'/api/auth/csrf');await q(j,'/api/auth/callback/credentials','POST',new URLSearchParams({email,password,csrfToken:csrf.body.csrfToken,callbackUrl:origin+'/adesao'}));assert((await q(j,'/api/auth/session')).body.user);}
let stage='start',resume;
(async()=>{try{
  const hash=await bcrypt.hash(password,12),adminId=randomUUID(),adminEmail='a26-'+randomUUID()+'@example.invalid',adminJar=new Map();
  await query("INSERT INTO auth_identities(id,email,nome,senha_hash) VALUES($1,$2,'ADMIN SINTETICO A26',$3)",[adminId,adminEmail,hash]);
  await query("INSERT INTO platform_admins(id,identity_id,status) VALUES($1,$2,'ACTIVE')",[randomUUID(),adminId]);
  await login(adminJar,adminEmail);pass('HOMOLOG image authenticates synthetic PlatformAdmin');
  async function invitation(interested=true){const id=randomUUID();await query("INSERT INTO experiment_invitations(id,recipient_name,token_hash,created_by_identity_id,expires_at,interest_at) VALUES($1,'SINTETICO A26',$2,$3,now()+interval '2 hours',"+(interested?'now()':'NULL')+')',[id,createHash('sha256').update(randomBytes(32)).digest('hex'),adminId]);return id;}
  const noInterest=await invitation(false);assert.equal((await q(adminJar,'/api/platform/experiment-invitations/'+noInterest+'/admission','POST',{email:adminEmail})).status,409);pass('HOMOLOG interest without approval cannot provision');
  for(const existing of [false,true]){
    stage=existing?'existing identity':'new identity';const j=new Map(),email=existing?'owner@example.invalid':'a26-new-'+randomUUID()+'@example.invalid';
    if(existing)await query("UPDATE auth_identities SET senha_hash=$1 WHERE id='owner-i'",[hash]);
    const before=existing?await one("SELECT senha_hash,(SELECT count(*) FROM tenant_memberships WHERE identity_id='owner-i')::int memberships FROM auth_identities WHERE id='owner-i'"):null;
    const inv=await invitation(),path='/api/platform/experiment-invitations/'+inv+'/admission';
    const approvals=await Promise.all([q(adminJar,path,'POST',{email}),q(adminJar,path,'POST',{email})]);
    assert(approvals.every(r=>[200,201].includes(r.status)),'approval status: '+approvals.map(r=>r.status).join('/'));assert.equal(approvals[0].body.id,approvals[1].body.id);const id=approvals[0].body.id;
    assert.equal((await one('SELECT count(*)::int n FROM admissions WHERE experiment_invitation_id=$1',[inv])).n,1);pass(stage+': concurrent approval produces one authorization');
    const c=await one('SELECT * FROM admission_challenges WHERE admission_id=$1 ORDER BY generation DESC LIMIT 1',[id]);
    const ciphertext=readFileSync(process.env.ADMISSION_LAB_MAIL_DIR+'/'+c.id+'.mail','utf8'),bytes=Buffer.from(ciphertext,'base64url');
    const cipher=createDecipheriv('aes-256-gcm',Buffer.from(process.env.ADMISSION_LAB_MAIL_KEY,'hex'),bytes.subarray(0,12));cipher.setAAD(Buffer.from('dez/admission/synthetic-mail/v1'));cipher.setAuthTag(bytes.subarray(12,28));
    const mail=JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)),cipher.final()]).toString());
    const link=/https:\/\/homolog\.dezsolucoes\.com\.br\/adesao#[^\s]+/.exec(mail.text)[0],params=new URLSearchParams(new URL(link).hash.slice(1)),token=params.get('token');secrets.push(token);
    assert(!ciphertext.includes(token));assert.equal(mail.to,email);
    const verify=await q(j,'/api/admissions/'+id+'/verify','POST',{challengeId:c.id,token});assert.equal(verify.status,200);assert(verify.headers.getSetCookie().some(c=>/; Secure/i.test(c)));pass(stage+': encrypted synthetic email verified with secure proof cookie');
    assert.equal((await q(new Map(),'/api/admissions/'+id+'/verify','POST',{challengeId:c.id,token})).status,409);pass(stage+': consumed challenge rejected in another session');
    if(!existing)assert.equal((await q(j,'/api/admissions/'+id+'/identity','POST',{password})).status,200);
    await login(j,email);
    const provisions=await Promise.all([q(j,'/api/admissions/'+id+'/provision','POST',{nome:'ESPACO SINTETICO A26'}),q(j,'/api/admissions/'+id+'/provision','POST',{nome:'ESPACO SINTETICO A26'})]);
    assert(provisions.every(r=>[200,201].includes(r.status)));assert.equal(provisions[0].body.tenantId,provisions[1].body.tenantId);
    const row=await one('SELECT * FROM admissions WHERE id=$1',[id]);assert.equal(row.status,'PROVISIONED');
    assert.equal((await one("SELECT count(*)::int n FROM tenant_memberships m JOIN access_profiles p ON p.id=m.profile_id AND p.tenant_id=m.tenant_id JOIN legacy_user_access_maps l ON l.membership_id=m.id AND l.tenant_id=m.tenant_id JOIN usuarios u ON u.id=l.legacy_usuario_id AND u.tenant_id=m.tenant_id WHERE m.id=$1 AND m.role='OWNER' AND m.status='ACTIVE'",[row.membership_id])).n,1);pass(stage+': concurrent provisioning creates one tenant with complete OWNER links');
    const resumed=await q(j,'/api/admissions/'+id);assert.equal(resumed.status,200);assert.equal(resumed.body.state,'PROVISIONED');pass(stage+': interrupted journey resumes the durable result');
    assert.equal((await q(j,'/api/lancamentos')).status,428);pass(stage+': mandatory documents still block operational API');
    if(existing){const after=await one("SELECT senha_hash,(SELECT count(*) FROM tenant_memberships WHERE identity_id='owner-i')::int memberships FROM auth_identities WHERE id='owner-i'");assert.equal(after.senha_hash,before.senha_hash);assert.equal(after.memberships,before.memberships+1);pass('existing identity retains password and all prior memberships');}
    await query('GRANT DELETE ON admissions TO pg18_homolog_runtime');
    assert.equal((await q(j,'/api/admissions/'+id)).status,404);await query('REVOKE DELETE ON admissions FROM pg18_homolog_runtime');
    assert.equal((await q(j,'/api/admissions/'+id)).status,200);pass(stage+': real API fails closed on catalog/ACL drift and recovers after correction');
    resume={id,cookies:[...j]};
  }
  require('node:fs').writeFileSync('/tmp/a26-secrets.json',JSON.stringify(secrets),{mode:0o600});
  require('node:fs').writeFileSync('/tmp/a26-client.json',JSON.stringify(resume),{mode:0o600});
  console.log(JSON.stringify({state:'PASSED',checks}));
}catch(e){console.error('HOMOLOG_SYNTHETIC_HTTP_FAILED '+stage+' '+(e.code||e.name)+' '+(e.stack||'').split('\n').find(l=>l.includes('[stdin]')));process.exitCode=1;}finally{await db.end();}})();
