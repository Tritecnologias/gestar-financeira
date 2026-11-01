// Real Next/PostgreSQL, no SMTP, network-none disposable LOCAL lab only.
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {PrismaClient}=require('@prisma/client'),{PrismaPg}=require('@prisma/adapter-pg'),bcrypt=require('bcryptjs');
let stage='local guard';const checks=[],secrets=[];
const pass=name=>{checks.push(name);stage=name;};
async function main(){
 assert.equal(process.env.PASSWORD_RESET_LAB,'1');assert.equal(process.env.DEPLOYMENT_PROFILE,'local');
 assert.equal(process.env.DATABASE_URL,'postgresql://a2_runtime@127.0.0.1:5432/special_invite_lab');
 assert(!process.env.SMTP_HOST);assert(!process.env.SMTP_PASSWORD);assert.equal(process.env.EMAIL_PROVIDER,'mock');
 const db=new PrismaClient({adapter:new PrismaPg({connectionString:'postgresql://postgres@127.0.0.1:5432/special_invite_lab',max:3}),log:[]});
 const base='http://localhost:3020',old='Synthetic-reset-old-2026!',fresh='Synthetic-reset-new-2026!',adminPassword='Synthetic-admin-only-2026!';
 secrets.push(old,fresh,adminPassword,process.env.AUTH_SECRET);
 const ids={};let adminRole;let ip=1;const jars=new WeakMap();
 async function req(jar,path,init={},origin=base){if(!jars.has(jar))jars.set(jar,ip++);const r=await fetch(origin+path,{...init,redirect:'manual',headers:{Cookie:[...jar].map(([k,v])=>k+'='+v).join('; '),'x-10s-proxy-token':process.env.TRUSTED_PROXY_TOKEN,'x-real-ip':`198.18.27.${jars.get(jar)}`,...init.headers}});for(const c of r.headers.getSetCookie()){const x=c.split(';')[0],at=x.indexOf('=');jar.set(x.slice(0,at),x.slice(at+1));}return r;}
 async function login(email,password,origin=base){const jar=new Map();const csrf=await req(jar,'/api/auth/csrf',{},origin);const {csrfToken}=await csrf.json();await req(jar,'/api/auth/callback/credentials',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','X-Auth-Return-Redirect':'1'},body:new URLSearchParams({email,password,csrfToken,callbackUrl:origin+'/minha-conta'})},origin);return{jar,user:(await (await req(jar,'/api/auth/session',{},origin)).json())?.user};}
 const post=(jar,path,body,extra={},origin=base)=>req(jar,path,{method:'POST',headers:{'Content-Type':'application/json',Origin:base,...extra},body:JSON.stringify(body)},origin);
 const issue=(jar,id,body={confirm:true,adminPassword},headers={},origin=base)=>post(jar,`/api/platform/identities/${id}/password-reset`,body,headers,origin);
 const change=(jar,password,p=fresh,extra={},origin=base)=>post(jar,'/api/account/password',{currentPassword:password,newPassword:p,confirmation:p,...extra},{},origin);
 async function create(name,password=old){const i=await db.authIdentity.create({data:{nome:'RESET LOCAL '+name,email:`reset-${name}@example.invalid`,senhaHash:await bcrypt.hash(password,4)}});ids[name]=i.id;return i;}
 async function issued(name,actor=admin){const r=await issue(actor.jar,ids[name]);assert.equal(r.status,200,'ISSUE_'+name);assert(r.headers.get('cache-control').includes('no-store'));const value=await r.json();assert.deepEqual(Object.keys(value).sort(),['expiresAt','message','temporaryPassword']);assert.match(value.temporaryPassword,/^D9![A-Za-z0-9_-]{32}a$/);assert(!secrets.includes(value.temporaryPassword));secrets.push(value.temporaryPassword);assert(Date.parse(value.expiresAt)>Date.now()+29*60000&&Date.parse(value.expiresAt)<=Date.now()+30*60000);return value.temporaryPassword;}
 async function fixture(name,expires){const expiresAt=expires.toISOString();return db.auditEvent.create({data:{occurredAt:new Date(expires.getTime()-30*60000),actorIdentityId:ids.admin,platformAdminId:adminRole.id,accessMode:'PLATFORM_ADMIN',action:'PASSWORD_TEMPORARY_ISSUED',resourceType:'AuthIdentity',resourceId:ids[name],result:'SUCCESS',metadata:{expiresAt}}});}
 const noUser=async jar=>assert(!(await(await req(jar,'/api/auth/session')).json())?.user);
 try{
 stage='fixtures';const actor=await create('admin',adminPassword);adminRole=await db.platformAdmin.create({data:{identityId:actor.id,status:'ACTIVE'}});
 const roleId=adminRole.id;
 for(const name of ['aux','browseradmin','limitadmin']){const i=await create(name,adminPassword);await db.platformAdmin.create({data:{identityId:i.id,status:'ACTIVE'}});}
 for(const name of ['member','other','expired','expiringsession','replacement','rollback','rollbackchange','reauth','browser','browsermobile','race','resetvschange','malformed','inactive','disabled','pendingrecovery','normal','quota'])await create(name);
 await db.authIdentity.update({where:{id:ids.inactive},data:{status:'INACTIVE'}});
 for(let n=1;n<=2;n++){const t=await db.tenant.create({data:{nome:'RESET LOCAL TENANT '+n,slug:'reset-local-'+n,email:`tenant${n}@example.invalid`}});const p=await db.accessProfile.create({data:{tenantId:t.id,nome:'Reset owner',permissoes:['acessos.usuarios.view']}});const m=await db.tenantMembership.create({data:{identityId:ids.member,tenantId:t.id,role:'OWNER',profileId:p.id}});
  if(n===1){const u=await db.usuario.create({data:{tenantId:t.id,nome:'RESET LOCAL member',email:'reset-member@example.invalid',senhaHash:await bcrypt.hash(old,4),papel:'admin',ativo:true}});await db.legacyUserAccessMap.create({data:{legacyUsuarioId:u.id,identityId:ids.member,tenantId:t.id,membershipId:m.id}});}
 }
 const protectedTables=['tenants','tenant_memberships','access_profiles','usuarios','legacy_user_access_maps','term_acceptances','tenant_contractual_responsibles','tenant_contractual_onboarding','term_documents','term_versions','access_owner_events','admissions','admission_challenges','_prisma_migrations'];
 async function snapshot(){const result={};for(const table of protectedTables)result[table]=await db.$queryRawUnsafe(`SELECT count(*)::int n,md5(coalesce(string_agg(to_jsonb(t)::text,chr(10) ORDER BY to_jsonb(t)::text),'')) digest FROM public.${table} t`);return result;}
 const before=await snapshot();
 var admin=await login(actor.email,adminPassword),aux=await login('reset-aux@example.invalid',adminPassword);
 const member=await login('reset-member@example.invalid',old),parallel=await login('reset-member@example.invalid',old);assert(admin.user&&aux.user&&member.user&&parallel.user);
 const companies=await(await req(member.jar,'/api/tenants')).json();assert.equal(companies.length,2);
 const legacyBefore=await login('reset-member@example.invalid',old,'http://localhost:3022');assert(legacyBefore.user,'LEGACY_PRECONDITION');
 stage='authority';assert.equal((await issue(new Map(),ids.member)).status,401);assert.equal((await issue(member.jar,ids.member)).status,403);
 for(const body of [{confirm:false,adminPassword},{confirm:true,adminPassword,email:'other@example.invalid'},{confirm:true,adminPassword,temporaryPassword:'Chosen-manually!'}])assert.equal((await issue(admin.jar,ids.member,body)).status,400);
 assert.equal((await issue(admin.jar,ids.member,undefined,{Origin:'https://untrusted.invalid'})).status,403);
 assert.equal((await issue(admin.jar,ids.member,{confirm:true,adminPassword:'wrong'})).status,403);
 assert.equal((await issue(admin.jar,ids.inactive)).status,409);
 pass('active PlatformAdmin, reauthentication, confirmation, origin and fixed target; no manual password or email input');
 stage='duplicate reset';const results=await Promise.all([issue(admin.jar,ids.member),issue(admin.jar,ids.member)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,429]);
 const success=results.find(r=>r.status===200);assert(success.headers.get('cache-control').includes('no-store'));const value=await success.json(),temporary=value.temporaryPassword;secrets.push(temporary);
 assert.equal(await db.auditEvent.count({where:{action:'PASSWORD_TEMPORARY_ISSUED',resourceId:ids.member}}),1);
 const stored=await db.authIdentity.findUnique({where:{id:ids.member}});assert(await bcrypt.compare(temporary,stored.senhaHash));assert.equal(bcrypt.getRounds(stored.senhaHash),12);assert(!await bcrypt.compare(old,stored.senhaHash));assert.equal(stored.id,ids.member);
 await noUser(member.jar);await noUser(parallel.jar);assert(!(await login('reset-member@example.invalid',old)).user);
 assert(!(await login('reset-member@example.invalid',old,'http://localhost:3022')).user);
 assert(!(await(await req(legacyBefore.jar,'/api/auth/session',{},'http://localhost:3022')).json())?.user);
 pass('concurrent reset yields one random credential, bcrypt12, one event; previous password and sessions revoked');
 stage='restriction';const limited=await login('reset-member@example.invalid',temporary),second=await login('reset-member@example.invalid',temporary);assert(limited.user.passwordChangeRequired);assert(second.user.passwordChangeRequired);
 const restricted=['/api/tenants','/api/platform/tenants','/api/lancamentos','/api/usuarios','/api/terms/status','/api/access/context'];
 for(const path of restricted)assert([401,403,428].includes((await req(limited.jar,path)).status),'RESTRICTED_'+path);
 for(const path of ['/inicio','/plataforma','/selecionar-tenant']){const r=await req(limited.jar,path);assert.equal(r.status,307);assert(r.headers.get('location').endsWith('/minha-conta'));}
 assert.equal((await req(limited.jar,'/minha-conta')).status,200);
 // Signed stale claim simulates missing middleware evidence; server must still consult DB.
 const {decode,encode}=await import('next-auth/jwt');const token=await decode({token:limited.jar.get('authjs.session-token'),secret:process.env.AUTH_SECRET,salt:'authjs.session-token'});
 const forged=new Map(limited.jar);forged.set('authjs.session-token',await encode({token:{...token,passwordChangeRequired:false},secret:process.env.AUTH_SECRET,salt:'authjs.session-token'}));
 assert.equal((await req(forged,'/api/tenants')).status,401);assert.equal((await req(forged,'/api/platform/tenants')).status,401);
 const csrfToken=(await(await req(limited.jar,'/api/auth/csrf')).json()).csrfToken;
 await post(limited.jar,'/api/auth/session',{csrfToken,data:{passwordChangeRequired:false,user:{passwordChangeRequired:false}}});
 assert((await(await req(limited.jar,'/api/auth/session')).json()).user.passwordChangeRequired);
 assert.equal((await issue(forged,ids.other)).status,401);
 assert.equal((await change(limited.jar,temporary,temporary)).status,400);assert.equal((await change(limited.jar,temporary,'a'.repeat(73))).status,400);
 assert.equal((await change(limited.jar,temporary,fresh,{identityId:ids.other})).status,400);
 pass('mandatory first change enforced on URLs and APIs, stale/mutated session claims and target tampering; temporary password cannot become definitive');
 stage='concurrent completion';const changes=await Promise.all([change(limited.jar,temporary),change(second.jar,temporary)]);assert.deepEqual(changes.map(r=>r.status).sort(),[200,401]);
 await noUser(limited.jar);await noUser(second.jar);assert(!(await login('reset-member@example.invalid',temporary)).user);
 const restored=await login('reset-member@example.invalid',fresh);assert(restored.user&&!restored.user.passwordChangeRequired);assert.deepEqual(await(await req(restored.jar,'/api/tenants')).json(),companies);
 assert(!(await login('reset-member@example.invalid',old,'http://localhost:3022')).user);
 assert.deepEqual(await snapshot(),before);
 pass('one definitive change under concurrency, all temporary sessions revoked, credential cannot be reused; identity/two tenants/permissions/contracts unchanged');
 stage='normal change';const normal=await login('reset-normal@example.invalid',old),normal2=await login('reset-normal@example.invalid',old);
 assert.equal((await change(normal.jar,'wrong')).status,400);assert.equal((await change(normal.jar,old)).status,200);await noUser(normal2.jar);assert((await login('reset-normal@example.invalid',fresh)).user);
 pass('Minha Conta regular change still requires current password and invalidates concurrent sessions');
 stage='expiry';await fixture('expired',new Date(Date.now()-1000));assert(!(await login('reset-expired@example.invalid',old)).user);
 await fixture('expiringsession',new Date(Date.now()+3500));const expiring=await login('reset-expiringsession@example.invalid',old);assert(expiring.user?.passwordChangeRequired);await new Promise(r=>setTimeout(r,3600));await noUser(expiring.jar);assert.equal((await change(expiring.jar,old)).status,401);
 const renewed=await issued('expired');assert((await login('reset-expired@example.invalid',renewed)).user?.passwordChangeRequired);
 pass('expired temporary credentials and already-issued sessions are rejected; administrator can replace expired password');
 stage='replacement';await fixture('replacement',new Date(Date.now()+10*60000));const prior=await login('reset-replacement@example.invalid',old);assert(prior.user.passwordChangeRequired);
 const replacement=await issued('replacement');await noUser(prior.jar);assert(!(await login('reset-replacement@example.invalid',old)).user);assert((await login('reset-replacement@example.invalid',replacement)).user.passwordChangeRequired);
 assert.equal((await issue(admin.jar,ids.replacement)).status,429);
 pass('replacement closes previous authorization, changes credential and respects cooldown');
 stage='reset login race';const racing=await Promise.all([issue(aux.jar,ids.race),login('reset-race@example.invalid',old)]);assert.equal(racing[0].status,200);const raceValue=await racing[0].json();secrets.push(raceValue.temporaryPassword);await noUser(racing[1].jar);assert(!(await login('reset-race@example.invalid',old)).user);assert((await login('reset-race@example.invalid',raceValue.temporaryPassword)).user.passwordChangeRequired);
 pass('concurrent old-password authentication never retains operational access after reset commits');
 stage='reset change race';await fixture('resetvschange',new Date(Date.now()+10*60000));const raceSession=await login('reset-resetvschange@example.invalid',old);
 const simultaneous=await Promise.all([issue(aux.jar,ids.resetvschange),change(raceSession.jar,old)]);assert.equal(simultaneous[0].status,200);assert([200,401].includes(simultaneous[1].status));const latest=await simultaneous[0].json();secrets.push(latest.temporaryPassword);await noUser(raceSession.jar);
 const current=await db.authIdentity.findUnique({where:{id:ids.resetvschange}});assert(await bcrypt.compare(latest.temporaryPassword,current.senhaHash));assert((await login('reset-resetvschange@example.invalid',latest.temporaryPassword)).user.passwordChangeRequired);
 assert.equal((await change(raceSession.jar,latest.temporaryPassword)).status,401);
 pass('reset versus definitive change serializes on identity; stale session cannot use newly learned temporary password');
 stage='rollback issuance';const initial=(await db.authIdentity.findUnique({where:{id:ids.rollback}})).senhaHash;
 await db.$executeRawUnsafe("CREATE FUNCTION reset_lab_reject() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='PASSWORD_TEMPORARY_ISSUED' THEN RAISE EXCEPTION 'SYNTHETIC_AUDIT_FAILURE'; END IF; RETURN NEW; END $$");
 await db.$executeRawUnsafe('CREATE TRIGGER reset_lab_reject BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION reset_lab_reject()');
 assert.equal((await issue(aux.jar,ids.rollback)).status,503);assert.equal((await db.authIdentity.findUnique({where:{id:ids.rollback}})).senhaHash,initial);assert.equal(await db.auditEvent.count({where:{action:'PASSWORD_TEMPORARY_ISSUED',resourceId:ids.rollback}}),0);
 await db.$executeRawUnsafe('DROP TRIGGER reset_lab_reject ON audit_events');await db.$executeRawUnsafe('DROP FUNCTION reset_lab_reject()');
 stage='rollback completion';const rollback=await issued('rollbackchange',aux),rollbackUser=await login('reset-rollbackchange@example.invalid',rollback);
 await db.$executeRawUnsafe("CREATE FUNCTION reset_lab_reject() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action='PASSWORD_TEMPORARY_COMPLETED' THEN RAISE EXCEPTION 'SYNTHETIC_AUDIT_FAILURE'; END IF; RETURN NEW; END $$");
 await db.$executeRawUnsafe('CREATE TRIGGER reset_lab_reject BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION reset_lab_reject()');
 assert.equal((await change(rollbackUser.jar,rollback)).status,500);assert(await bcrypt.compare(rollback,(await db.authIdentity.findUnique({where:{id:ids.rollbackchange}})).senhaHash));assert((await login('reset-rollbackchange@example.invalid',rollback)).user.passwordChangeRequired);
 await db.$executeRawUnsafe('DROP TRIGGER reset_lab_reject ON audit_events');await db.$executeRawUnsafe('DROP FUNCTION reset_lab_reject()');assert.equal((await change(rollbackUser.jar,rollback)).status,200);
 pass('audit failures roll back both password and restriction atomically on reset and completion');
 stage='malformed state';await db.auditEvent.create({data:{actorIdentityId:ids.admin,platformAdminId:roleId,accessMode:'PLATFORM_ADMIN',action:'PASSWORD_TEMPORARY_ISSUED',resourceType:'AuthIdentity',resourceId:ids.malformed,result:'SUCCESS',metadata:{expiresAt:'invalid'}}});
 assert(!(await login('reset-malformed@example.invalid',old)).user);
 pass('malformed durable state fails closed');
 stage='disabled runtime';const disabledPassword=await issued('disabled',aux),disabled=await login('reset-disabled@example.invalid',disabledPassword,'http://localhost:3021');assert(disabled.user.passwordChangeRequired);
 assert([401,428].includes((await req(disabled.jar,'/api/tenants',{},'http://localhost:3021')).status));
 const disabledAdmin=await login('reset-aux@example.invalid',adminPassword,'http://localhost:3021');assert.equal((await issue(disabledAdmin.jar,ids.other,undefined,{},'http://localhost:3021')).status,503);
 assert.equal((await change(disabled.jar,disabledPassword,fresh,{},'http://localhost:3021')).status,200);
 pass('same build with reset issuance disabled still enforces and completes pending change; no SMTP dependency');
 stage='persistent quotas';const limiter=await login('reset-limitadmin@example.invalid',adminPassword);for(let i=0;i<5;i++)assert.equal((await issue(limiter.jar,ids.reauth,{confirm:true,adminPassword:'wrong'})).status,403);assert.equal((await issue(limiter.jar,ids.reauth)).status,429);
 for(let i=0;i<3;i++){const grant=await fixture('quota',new Date(Date.now()+20*60000));await db.auditEvent.create({data:{actorIdentityId:ids.admin,accessMode:'SYSTEM',action:'PASSWORD_TEMPORARY_REPLACED',resourceType:'TemporaryPassword',resourceId:grant.id,result:'SUCCESS'}});}
 assert.equal((await issue(aux.jar,ids.quota)).status,429);
 pass('persistent administrative reauthentication limit and per-identity issuance quota');
 stage='catalog';await db.$executeRawUnsafe('GRANT DELETE ON audit_events TO a2_runtime');assert.equal((await issue(aux.jar,ids.other)).status,503);await db.$executeRawUnsafe('REVOKE DELETE ON audit_events FROM a2_runtime');
 pass('unexpected ACL fails closed before reset; no additional privileges needed');
 stage='removed public reset';assert([401,404].includes((await post(new Map(),'/api/account/password-reset',{token:'obsolete',newPassword:fresh,confirmation:fresh})).status));
 const loginHtml=await(await fetch(base+'/login')).text();assert(!loginHtml.includes('Esqueci minha senha'));assert(!loginHtml.includes('https://wa.me/'));
 assert.equal((await req(admin.jar,'/api/platform/identities/'+ids.member+'/password-reset')).status,405);
 pass('no public email reset or read-back endpoint; WhatsApp contact remains unpublished');
 await issued('pendingrecovery',aux);
 assert.deepEqual(await snapshot(),before);assert.equal((await db.$queryRawUnsafe("SELECT count(*)::int n FROM pg_tables WHERE schemaname='public'"))[0].n,44);
 const logs=fs.readFileSync('/tmp/a2-app.log','utf8'),audit=JSON.stringify(await db.auditEvent.findMany());
 for(const value of secrets){assert(!logs.includes(value),'SENSITIVE_LOG');assert(!audit.includes(value),'SENSITIVE_AUDIT');}
 pass('no plaintext credentials in logs or audit; 44 tables, unchanged ledger and protected data');
 fs.writeFileSync('/tmp/password-reset-browser.json',JSON.stringify({adminEmail:'reset-browseradmin@example.invalid',adminPassword,old,newPassword:fresh,browserId:ids.browser,mobileId:ids.browsermobile}));
 fs.writeFileSync('/tmp/password-reset-result.json',JSON.stringify({state:'PASSED',checks,tableCount:44,realExternalEmail:false,smtp:'not configured or used',sameBuildRuntimeModes:['issuance enabled','issuance disabled with enforcement active'],protectedRecordsUnchanged:true},null,2));
 console.log(JSON.stringify({state:'PASSED',checks:checks.length}));
 }finally{await db.$disconnect();}
}
main().catch(error=>{console.error(JSON.stringify({state:'FAILED',stage,type:error.name,code:error.code||null,location:(error.stack||'').split('\n').find(v=>v.includes('password-reset.http.cjs'))?.trim()}));process.exitCode=1;});
