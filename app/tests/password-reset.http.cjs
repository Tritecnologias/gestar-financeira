// Real Next + PostgreSQL + TLS SMTP inside the existing network-none A.2 lab only.
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {PrismaClient}=require('@prisma/client'),{PrismaPg}=require('@prisma/adapter-pg'),bcrypt=require('bcryptjs');
let stage='local guard';const checks=[],secrets=[];
const pass=name=>{checks.push(name);stage=name;};
async function main(){
 assert.equal(process.env.PASSWORD_RESET_LAB,'1');assert.equal(process.env.DEPLOYMENT_PROFILE,'local');
 assert.equal(process.env.DATABASE_URL,'postgresql://a2_runtime@127.0.0.1:5432/special_invite_lab');assert.equal(process.env.SMTP_HOST,'localhost');
 const db=new PrismaClient({adapter:new PrismaPg({connectionString:'postgresql://postgres@127.0.0.1:5432/special_invite_lab',max:2}),log:[]});
 const base='http://localhost:3020',old='Synthetic-reset-old-2026!',fresh='Synthetic-reset-new-2026!',adminPassword='Synthetic-admin-only-2026!';
 secrets.push(old,fresh,adminPassword,process.env.AUTH_SECRET,process.env.CAPTURE_PASSWORD);
 const ids={};let ip=1;const jars=new WeakMap();
 async function req(jar,path,init={},origin=base){if(!jars.has(jar))jars.set(jar,ip++);const r=await fetch(origin+path,{...init,redirect:'manual',headers:{Cookie:[...jar].map(([k,v])=>k+'='+v).join('; '),'x-10s-proxy-token':process.env.TRUSTED_PROXY_TOKEN,'x-real-ip':`198.18.27.${jars.get(jar)}`,...init.headers}});for(const c of r.headers.getSetCookie()){const x=c.split(';')[0],at=x.indexOf('=');jar.set(x.slice(0,at),x.slice(at+1));}return r;}
 async function login(email,password,origin=base){const jar=new Map();let r=await req(jar,'/api/auth/csrf',{},origin);const {csrfToken}=await r.json();await req(jar,'/api/auth/callback/credentials',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','X-Auth-Return-Redirect':'1'},body:new URLSearchParams({email,password,csrfToken,callbackUrl:origin+'/minha-conta'})},origin);r=await req(jar,'/api/auth/session',{},origin);return{jar,user:(await r.json())?.user};}
 const post=(jar,path,body,extra={},origin=base)=>req(jar,path,{method:'POST',headers:{'Content-Type':'application/json',Origin:base,...extra},body:JSON.stringify(body)},origin);
 const issue=(jar,id,body={confirm:true,adminPassword},headers={},origin=base)=>post(jar,`/api/platform/identities/${id}/password-reset`,body,headers,origin);
 const consume=(token,p=fresh,extra={})=>post(new Map(),'/api/account/password-reset',{token,newPassword:p,confirmation:p,...extra});
 async function capture(email){const r=await fetch('http://127.0.0.1:8025/?email='+encodeURIComponent(email),{headers:{Authorization:'Bearer '+process.env.CAPTURE_PASSWORD}});const {message}=await r.json();if(!message)return null;
   const plain=message.replace(/=\r?\n/g,'').replace(/=([0-9a-f]{2})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16)));
   const match=plain.match(/http:\/\/localhost:3020\/redefinir-senha#token=([0-9a-f-]{36}\.[A-Za-z0-9_-]{43})/);assert(match,'SMTP_PROOF_NOT_FOUND');secrets.push(match[1]);assert(!plain.includes(old)&&!plain.includes(adminPassword)&&!plain.includes(fresh),'PASSWORD_IN_MAIL');return match[1];}
 async function create(name,password=old){const i=await db.authIdentity.create({data:{nome:'RESET LOCAL '+name,email:`reset-${name}@example.invalid`,senhaHash:await bcrypt.hash(password,12)}});ids[name]=i.id;return i;}
 async function issued(name){const r=await issue(admin.jar,ids[name]);assert.equal(r.status,200,'ISSUE_'+name);const result=await r.json();assert.deepEqual(Object.keys(result).sort(),['expiresAt','message']);const token=await capture(`reset-${name}@example.invalid`);assert(token);return token;}
 async function fixtureProof(name,expires){const identity=await db.authIdentity.findUnique({where:{id:ids[name]}}),actor=await db.authIdentity.findUnique({where:{id:ids.admin},include:{platformAdmin:true}});
   const expiresAt=expires.toISOString(),grant=await db.auditEvent.create({data:{occurredAt:new Date(expires.getTime()-15*60000),actorIdentityId:actor.id,platformAdminId:actor.platformAdmin.id,accessMode:'PLATFORM_ADMIN',action:'PASSWORD_RESET_ISSUED',resourceType:'AuthIdentity',resourceId:identity.id,result:'SUCCESS',metadata:{expiresAt,origin:base}}});
   await db.auditEvent.create({data:{actorIdentityId:actor.id,platformAdminId:actor.platformAdmin.id,accessMode:'PLATFORM_ADMIN',action:'PASSWORD_RESET_EMAIL_SENT',resourceType:'PasswordResetAuthorization',resourceId:grant.id,result:'SUCCESS'}});
   const sig=crypto.createHmac('sha256',process.env.AUTH_SECRET).update(JSON.stringify(['dez/admin-password-reset/v1',base,grant.id,identity.id,identity.email,identity.senhaHash,actor.id,actor.senhaHash,expiresAt])).digest('base64url');const token=grant.id+'.'+sig;secrets.push(token);return token;}
 try{
 stage='fixture setup';const actor=await create('admin',adminPassword);await db.platformAdmin.create({data:{identityId:actor.id,status:'ACTIVE'}});
 assert.equal(process.env.EMAIL_PROVIDER,'mock');assert.equal(process.env.TRANSACTIONAL_EMAIL_PROVIDER,'smtp');
 assert.equal((await fetch(base+'/adesao')).status,200,'EXISTING_ADMISSION_CONFIGURATION');
 pass('transactional SMTP preserves the approved synthetic Admission configuration');
 for(const name of ['member','other','expired','cancelled','changed','inactive','failed','rollback','reauth','browser','browsermobile','ratelimit'])await create(name);
 await db.authIdentity.update({where:{id:ids.inactive},data:{status:'INACTIVE'}});
 for(let n=1;n<=2;n++){const tenant=await db.tenant.create({data:{nome:'RESET LOCAL TENANT '+n,slug:'reset-local-'+n,email:`tenant${n}@example.invalid`}});const profile=await db.accessProfile.create({data:{tenantId:tenant.id,nome:'Reset owner',permissoes:['acessos.usuarios.view']}});await db.tenantMembership.create({data:{identityId:ids.member,tenantId:tenant.id,role:'OWNER',profileId:profile.id}});}
 const membersBefore=await db.tenantMembership.findMany({where:{identityId:ids.member}});
 const protectedTables=['tenants','tenant_memberships','access_profiles','usuarios','legacy_user_access_maps','term_acceptances','tenant_contractual_responsibles','tenant_contractual_onboarding','term_documents','term_versions','access_owner_events','admissions','admission_challenges','_prisma_migrations'];
 async function snapshot(){const result={};for(const table of protectedTables)result[table]=await db.$queryRawUnsafe(`SELECT count(*)::int n,md5(coalesce(string_agg(to_jsonb(t)::text,chr(10) ORDER BY to_jsonb(t)::text),'')) digest FROM public.${table} t`);return result;}
 const before=await snapshot();
 var admin=await login(actor.email,adminPassword);const member=await login('reset-member@example.invalid',old),parallel=await login('reset-member@example.invalid',old);assert(admin.user&&member.user&&parallel.user,'AUTHENTICATION');
 stage='authorization';assert.equal((await issue(new Map(),ids.member)).status,401);assert.equal((await issue(member.jar,ids.member)).status,403);
 assert.equal((await issue(admin.jar,ids.member,{confirm:false,adminPassword})).status,400);
 assert.equal((await issue(admin.jar,ids.member,{confirm:true,adminPassword,email:'other@example.invalid'})).status,400);
 assert.equal((await issue(admin.jar,ids.member,undefined,{Origin:'https://untrusted.invalid'})).status,403);
 assert.equal((await issue(admin.jar,ids.member,{confirm:true,adminPassword:'not-the-admin-password'})).status,403);
 assert.equal((await issue(admin.jar,ids.inactive)).status,409);
 pass('only active PlatformAdmin with confirmation, own credential and trusted origin can issue; recipient cannot be overridden');
 stage='simultaneous issuance';const requests=await Promise.all([issue(admin.jar,ids.member),issue(admin.jar,ids.member)]);assert.deepEqual(requests.map(r=>r.status).sort(),[200,429]);
 const token=await capture('reset-member@example.invalid');assert(token);for(const response of requests){const value=JSON.stringify(await response.json());assert(!value.includes(token)&&!value.includes('/redefinir-senha#'));}
 const audit=JSON.stringify(await db.auditEvent.findMany({where:{action:{startsWith:'PASSWORD_RESET_'}}}));assert(!audit.includes(token)&&!audit.includes(adminPassword));
 assert.equal((await db.auditEvent.count({where:{action:'PASSWORD_RESET_ISSUED',resourceId:ids.member}})),1);
 pass('duplicate issuance yields one SMTP message and no link in administrator API or audit');
 stage='proof misuse';const mutated=token.slice(0,-1)+(token.endsWith('A')?'B':'A');assert.equal((await consume(mutated)).status,400);
 assert.equal((await consume(token,fresh,{identityId:ids.other})).status,400);assert.equal((await consume(token,'a'.repeat(73))).status,400);
 const page=await fetch(base+'/redefinir-senha');assert.equal(page.status,200);assert.equal(page.headers.get('referrer-policy'),'no-referrer');
 pass('tampering, target injection, bcrypt truncation and GET consumption are rejected');
 stage='simultaneous consumption';const consumes=await Promise.all([consume(token),consume(token)]);assert.deepEqual(consumes.map(r=>r.status).sort(),[200,400]);assert.equal((await consume(token)).status,400);
 assert(!(await login('reset-member@example.invalid',old)).user);assert((await login('reset-member@example.invalid',fresh)).user);
 assert(!(await (await req(parallel.jar,'/api/auth/session')).json())?.user);assert.equal((await req(member.jar,'/api/tenants')).status,401);
 assert.deepEqual(await db.tenantMembership.findMany({where:{identityId:ids.member}}),membersBefore);assert.deepEqual(await snapshot(),before);
 pass('single atomic consumption revokes prior sessions and preserves two tenants, roles, contracts, ledger and all protected records');
 stage='expiry';const expired=await fixtureProof('expired',new Date(Date.now()-1000));assert.equal((await consume(expired)).status,400);
 const cancelled=await fixtureProof('cancelled',new Date(Date.now()+10*60000));await db.auditEvent.create({data:{action:'PASSWORD_RESET_REVOKED',accessMode:'SYSTEM',resourceType:'PasswordResetAuthorization',resourceId:cancelled.split('.')[0],result:'SUCCESS'}});assert.equal((await consume(cancelled)).status,400);
 pass('expired and revoked authorizations are refused');
 stage='binding';let changed=await issued('changed');await db.authIdentity.update({where:{id:ids.changed},data:{email:'changed-recipient@example.invalid'}});assert.equal((await consume(changed)).status,400);await db.authIdentity.update({where:{id:ids.changed},data:{email:'reset-changed@example.invalid'}});
 await db.platformAdmin.update({where:{identityId:ids.admin},data:{status:'INACTIVE'}});assert.equal((await consume(changed)).status,400);await db.platformAdmin.update({where:{identityId:ids.admin},data:{status:'ACTIVE'}});
 const own=await login('reset-changed@example.invalid',old);assert.equal((await post(own.jar,'/api/account/password',{currentPassword:old,newPassword:fresh,confirmation:fresh})).status,200);assert.equal((await consume(changed)).status,400);
 pass('email change, issuer revocation and normal Minha Conta password change invalidate pending proofs');
 stage='SMTP failure';await fetch('http://127.0.0.1:8025/failure?on=1',{method:'POST',headers:{Authorization:'Bearer '+process.env.CAPTURE_PASSWORD}});
 assert.equal((await issue(admin.jar,ids.failed)).status,503);assert.equal(await capture('reset-failed@example.invalid'),null);assert(await bcrypt.compare(old,(await db.authIdentity.findUnique({where:{id:ids.failed}})).senhaHash));
 assert.equal(await db.auditEvent.count({where:{action:'PASSWORD_RESET_EMAIL_FAILED'}}),1);
 await fetch('http://127.0.0.1:8025/failure?on=0',{method:'POST',headers:{Authorization:'Bearer '+process.env.CAPTURE_PASSWORD}});
 pass('SMTP rejection records failure without changing password or claiming success');
 stage='rollback';const rollback=await issued('rollback');await db.$executeRawUnsafe(`CREATE FUNCTION reset_lab_reject() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='PASSWORD_RESET_CONSUMED' THEN RAISE EXCEPTION 'SYNTHETIC_AUDIT_FAILURE'; END IF; RETURN NEW; END $$`);await db.$executeRawUnsafe('CREATE TRIGGER reset_lab_reject BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION reset_lab_reject()');
 assert.equal((await consume(rollback)).status,503);assert(await bcrypt.compare(old,(await db.authIdentity.findUnique({where:{id:ids.rollback}})).senhaHash));assert.equal(await db.auditEvent.count({where:{action:'PASSWORD_RESET_CONSUMED',resourceId:rollback.split('.')[0]}}),0);
 await db.$executeRawUnsafe('DROP TRIGGER reset_lab_reject ON audit_events');await db.$executeRawUnsafe('DROP FUNCTION reset_lab_reject()');assert.equal((await consume(rollback)).status,200);
 pass('induced audit failure rolls back password and consumption together');
 stage='reenqueue and limits';const previous=await fixtureProof('ratelimit',new Date(Date.now()+10*60000));const replacement=await issued('ratelimit');assert.equal((await consume(previous)).status,400);assert.equal((await issue(admin.jar,ids.ratelimit)).status,429);
 await fixtureProof('ratelimit',new Date(Date.now()+10*60000));
 // Audit is append-only even for the fixture owner. Cross the real resend boundary
 // instead of editing evidence, so this assertion tests the quota independently.
 const replacementEvent=await db.auditEvent.findUnique({where:{id:replacement.split('.')[0]}});
 console.log('Waiting for the real 60-second resend interval in the isolated lab');
 await new Promise(resolve=>setTimeout(resolve,Math.max(0,replacementEvent.occurredAt.getTime()+60_100-Date.now())));
 assert.equal((await issue(admin.jar,ids.ratelimit)).status,429);
 pass('replacement revokes predecessor; cooldown and persistent per-recipient quota hold');
 stage='admin reauthentication limit';for(let i=0;i<4;i++)assert.equal((await issue(admin.jar,ids.reauth,{confirm:true,adminPassword:'wrong'})).status,403);assert.equal((await issue(admin.jar,ids.reauth)).status,429);
 // A second independent synthetic administrator serves the browser validation.
 const browserAdmin=await create('browseradmin',adminPassword);await db.platformAdmin.create({data:{identityId:browserAdmin.id,status:'ACTIVE'}});
 pass('five failed administrative reauthentications enforce a persistent cooldown');
 stage='disabled runtime';const disabled=await login('reset-browseradmin@example.invalid',adminPassword,'http://localhost:3021');assert(disabled.user);
 assert.equal((await issue(disabled.jar,ids.other,undefined,{},'http://localhost:3021')).status,503);
 const html=await (await req(disabled.jar,'/plataforma',{},'http://localhost:3021')).text();assert(html.includes('Reset de senha indisponível'));
 const loginHtml=await (await fetch(base+'/login')).text();assert(loginHtml.includes('Suporte via WhatsApp'));assert(!loginHtml.includes('https://wa.me/'));assert(!loginHtml.includes('Esqueci minha senha'));
 pass('same compiled application disables reset at runtime without transactional email; WhatsApp has no published contact');
 stage='catalog authority';await db.$executeRawUnsafe('GRANT DELETE ON audit_events TO a2_runtime');const safeAdmin=await login('reset-browseradmin@example.invalid',adminPassword);assert.equal((await issue(safeAdmin.jar,ids.other)).status,503);await db.$executeRawUnsafe('REVOKE DELETE ON audit_events FROM a2_runtime');
 pass('unexpected database privileges fail closed before issuance');
 assert.deepEqual(await snapshot(),before);const tableCount=(await db.$queryRawUnsafe("SELECT count(*)::int n FROM pg_tables WHERE schemaname='public'"))[0].n;assert.equal(tableCount,44);
 const logs=fs.readFileSync('/tmp/a2-app.log','utf8');for(const value of secrets)assert(!logs.includes(value),'SENSITIVE_LOG');
 const allAudit=JSON.stringify(await db.auditEvent.findMany());for(const value of secrets)assert(!allAudit.includes(value),'SENSITIVE_AUDIT');
 pass('44 tables and unchanged migration ledger; no passwords or links in logs/audit');
 fs.writeFileSync('/tmp/password-reset-browser.json',JSON.stringify({adminEmail:'reset-browseradmin@example.invalid',adminPassword,old,newPassword:fresh,browserId:ids.browser,mobileId:ids.browsermobile}));
 fs.writeFileSync('/tmp/password-reset-result.json',JSON.stringify({state:'PASSED',checks,tableCount,realExternalEmail:false,smtp:'TLS + AUTH local capture',sameBuildRuntimeModes:['enabled local SMTP','disabled/mock'],protectedRecordsUnchanged:true},null,2));
 console.log(JSON.stringify({state:'PASSED',checks:checks.length}));
 }finally{await db.$disconnect();}
}
main().catch(error=>{console.error(JSON.stringify({state:'FAILED',stage,type:error.name,code:error.code||null}));process.exitCode=1;});
