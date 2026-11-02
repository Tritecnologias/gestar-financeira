// The existing LOCAL runner starts the same OCI in each isolated configuration.
// No remote hostname is contacted: HTTP and PostgreSQL use the shared network-none namespace.
const assert=require('node:assert/strict'),{Pool}=require('pg'),bcrypt=require('bcryptjs'),{randomUUID}=require('node:crypto');
async function main(cfg){
  assert(['local','homolog','production'].includes(cfg.profile));assert(/^http:\/\/127\.0\.0\.1:(3020|3033|3034)$/.test(cfg.base));
  assert(['special_invite_lab','gestar_homolog_pg18','gestar_prod_pg18'].includes(cfg.database));
  const db=new Pool({host:'127.0.0.1',user:'postgres',database:cfg.database,port:5432}),checks=[],secrets=[];
  const pass=n=>checks.push(n),password='Synthetic-private-OCI-2026!',adminEmail='oci-admin-'+randomUUID()+'@example.invalid';secrets.push(password);
  const q=async(jar,path,method='GET',body)=>{
    const response=await fetch(cfg.base+path,{method,redirect:'manual',headers:{Origin:cfg.origin,Host:new URL(cfg.origin).host,
      Cookie:[...jar].filter(([,c])=>path.startsWith(c.path)).map(([k,c])=>k+'='+c.value).join('; '),
      ...(body===undefined?{}:{'Content-Type':body instanceof URLSearchParams?'application/x-www-form-urlencoded':'application/json'})},
      ...(body===undefined?{}:{body:body instanceof URLSearchParams?body:JSON.stringify(body)})});
    for(const c of response.headers.getSetCookie()){const pair=c.split(';')[0],i=pair.indexOf('=');jar.set(pair.slice(0,i),{value:pair.slice(i+1),path:/;\s*Path=([^;]+)/i.exec(c)?.[1]||'/'});}
    return{status:response.status,body:response.headers.get('content-type')?.includes('json')?await response.json():await response.text()};
  };
  async function login(jar,email,secret=password){const csrf=await q(jar,'/api/auth/csrf');await q(jar,'/api/auth/callback/credentials','POST',new URLSearchParams({csrfToken:csrf.body.csrfToken,email,password:secret,callbackUrl:cfg.origin+'/adesao'}));return(await q(jar,'/api/auth/session')).body.user;}
  try{
    const actor=randomUUID();await db.query("INSERT INTO auth_identities(id,email,nome,senha_hash,status,atualizado_em) VALUES($1,$2,'SINTETICO OCI',$3,'ACTIVE',now())",[actor,adminEmail,await bcrypt.hash(password,12)]);
    await db.query("INSERT INTO platform_admins(id,identity_id,status,atualizado_em) VALUES($1,$2,'ACTIVE',now())",[randomUUID(),actor]);
    const admin=new Map(),guest=new Map();assert((await login(admin,adminEmail))?.id===actor);pass('normal identity authentication and PlatformAdmin authorization');
    const email='oci-recipient-'+cfg.profile+'@example.invalid',issued=await q(admin,'/api/platform/experiment-invitations','POST',{requestId:randomUUID(),recipientName:'CONVIDADO OCI SINTETICO',email,hours:24});
    assert.equal(issued.status,201,JSON.stringify(issued.body));const id=issued.body.admissionId;
    const copied=await q(admin,'/api/platform/experiment-invitations/'+issued.body.id+'/link','POST',{action:'copy'});assert.equal(copied.status,200);
    const token=new URLSearchParams(new URL(copied.body.link).hash.slice(1)).get('convite');assert(token);secrets.push(token);
    const interest=await q(guest,'/api/experimentacao','POST',{action:'interest',token});assert.equal(interest.status,200);assert(interest.body.message.includes('convite privado'));assert(!/confirm.*e-mail/i.test(interest.body.message));
    assert.equal((await q(guest,'/api/experimentacao','POST',{action:'startAdmission',token})).body.id,id);
    const verified=await q(guest,'/api/admissions/'+id+'/verify','POST',{invitationToken:token});assert.equal(verified.status,200);assert.equal(verified.body.emailVerified,false);
    const view=await q(guest,'/api/admissions/'+id);assert.equal(view.body.proofMethod,'PRIVATE_INVITATION');assert.equal(view.body.email,email);
    const evidence=(await db.query('SELECT a.email_verified_at,a.invitation_redeemed_at,c.purpose,c.delivery_status FROM admissions a JOIN admission_challenges c ON c.admission_id=a.id WHERE a.id=$1',[id])).rows;
    assert.equal(evidence.length,1);assert.equal(evidence[0].email_verified_at,null);assert(evidence[0].invitation_redeemed_at);assert.equal(evidence[0].purpose,'INVITATION_CREDENTIAL');assert.equal(evidence[0].delivery_status,'PENDING');
    pass('authorized private invitation works with EMAIL_PROVIDER=disabled and no mail keys or directory');
    assert.equal((await q(new Map(),'/api/admissions/'+id+'/verify','POST',{invitationToken:token})).status,401);pass('same credential cannot establish a second browser proof');
    assert.equal((await q(guest,'/api/admissions/'+id+'/identity','POST',{password})).body.created,true);
    const user=await login(guest,email);assert(user?.id);
    const provision=await q(guest,'/api/admissions/'+id+'/provision','POST',{nome:'ESPACO SINTETICO OCI'});assert.equal(provision.status,201);const tenant=provision.body.tenantId;
    assert.equal((await q(guest,'/api/lancamentos')).status,428);assert.equal((await q(guest,'/api/admissions/'+id+'/provision','POST',{nome:'ESPACO SINTETICO OCI'})).body.tenantId,tenant);
    pass('one tenant with OWNER, normal credentials and contractual operational gate');
    const before=(await db.query('SELECT row_to_json(m) v FROM tenant_memberships m WHERE identity_id=$1 ORDER BY id',[user.id])).rows;
    const reset=await q(admin,'/api/platform/identities/'+user.id+'/password-reset','POST',{confirm:true,adminPassword:password});assert.equal(reset.status,200,JSON.stringify(reset.body));
    const temporary=reset.body.temporaryPassword;assert.match(temporary,/^D9![A-Za-z0-9_-]{32}a$/);secrets.push(temporary);
    assert(Date.parse(reset.body.expiresAt)>Date.now()+29*60000&&Date.parse(reset.body.expiresAt)<=Date.now()+30*60000);
    assert([401,403].includes((await q(guest,'/api/admissions/'+id)).status));assert.equal((await q(guest,'/api/admissions/'+id+'/provision','POST',{nome:'FORBIDDEN'})).status,401);
    const limited=new Map();assert((await login(limited,email,temporary)).passwordChangeRequired);
    assert.equal((await q(limited,'/api/admissions/'+id+'/provision','POST',{nome:'FORBIDDEN'})).status,401);
    pass('administrative reset preserves 30 minutes, invalidates old session and denies restricted password on Admission APIs');
    const finalPassword='Synthetic-private-final-2026!';secrets.push(finalPassword);
    const changed=await q(limited,'/api/account/password','POST',{currentPassword:temporary,newPassword:finalPassword,confirmation:finalPassword});assert.equal(changed.status,200,JSON.stringify(changed.body));
    const recovered=new Map();assert((await login(recovered,email,finalPassword))?.id===user.id);
    assert.equal((await q(recovered,'/api/admissions/'+id)).body.tenantId,tenant);
    assert.deepEqual((await db.query('SELECT row_to_json(m) v FROM tenant_memberships m WHERE identity_id=$1 ORDER BY id',[user.id])).rows,before);
    assert.equal((await db.query('SELECT count(*)::int n FROM tenants WHERE slug=$1',['adesao-'+id])).rows[0].n,1);
    pass('definitive change restores authenticated resumption, preserving identity, original OWNER membership and one tenant');
    const audit=JSON.stringify((await db.query('SELECT * FROM audit_events')).rows);assert(secrets.every(s=>!audit.includes(s)));pass('audit records contain no password or private token');
    console.log(JSON.stringify({state:'PASSED',profile:cfg.profile,checks,realEmail:false,remoteOperations:0}));
  } finally{await db.end();}
}
let input='';process.stdin.setEncoding('utf8');process.stdin.on('data',c=>input+=c);process.stdin.on('end',()=>main(JSON.parse(input)).catch(e=>{console.error(JSON.stringify({state:'FAILED',error:e.name,message:e.message.replace(/D9![A-Za-z0-9_-]{32}a/g,'[redacted]')}));process.exitCode=1;}));
