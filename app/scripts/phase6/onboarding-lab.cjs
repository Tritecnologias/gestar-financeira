// Destructive setup is confined to a fresh, isolated synthetic laboratory database.
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),bcrypt=require('bcryptjs');
const {PrismaClient}=require('@prisma/client'),{PrismaPg}=require('@prisma/adapter-pg');
const checks=[],tokens=[],passwords=[];let step='guard';
const ok=(name,value)=>{step=name;assert.ok(value,name);checks.push(name)};
const json=v=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?x.toString():x);
async function main(){
 const url=new URL(process.env.DATABASE_URL);assert.equal(process.env.PHASE6_LAB,'1');assert.equal(url.hostname,'10s-phase6-pg');assert.equal(url.pathname,'/phase6_lab');
 const db=new PrismaClient({adapter:new PrismaPg({connectionString:url.href})}),base='http://10s-phase6-app:3000';
 const freshPassword=()=>{const p=crypto.randomBytes(32).toString('base64url');passwords.push(p);return p};
 async function req(jar,path,method='GET',data){const form=data instanceof FormData,encoded=data instanceof URLSearchParams;
  const r=await fetch(base+path,{method,redirect:'manual',signal:AbortSignal.timeout(40000),headers:{Cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; '),...(data===undefined||form?{}:{'Content-Type':encoded?'application/x-www-form-urlencoded':'application/json'})},body:data===undefined?undefined:form||encoded?data:json(data)});
  for(const c of r.headers.getSetCookie()){const part=c.split(';')[0],i=part.indexOf('=');jar.set(part.slice(0,i),part.slice(i+1));}
  const type=r.headers.get('content-type')||'';return{status:r.status,headers:r.headers,body:type.includes('json')?await r.json():type.includes('pdf')?Buffer.from(await r.arrayBuffer()):await r.text()};
 }
 const anon=new Map();
 async function login(email,password){const jar=new Map(),c=await req(jar,'/api/auth/csrf');await req(jar,'/api/auth/callback/credentials','POST',new URLSearchParams({csrfToken:c.body.csrfToken,email,password,callbackUrl:base+'/inicio'}));ok('login '+email,(await req(jar,'/api/auth/session')).body.user?.id);return jar}
 async function choose(jar,tenantId,grantId){const r=await req(jar,'/api/tenants/switch','POST',{tenantId,...(grantId?{grantId}:{})});ok('tenant context '+tenantId,r.status===200)}
 async function capture(email){const r=await fetch('http://10s-phase6-smtp:8025/?email='+encodeURIComponent(email),{headers:{Authorization:'Bearer '+process.env.CAPTURE_PASSWORD}});const raw=(await r.json()).message;ok('TLS SMTP received '+email,typeof raw==='string');const decoded=raw.replace(/=\r?\n/g,'').replace(/=3D/gi,'=');const token=decoded.match(/https:\/\/homolog\.dezsolucoes\.com\.br\/ativar-acesso#token=([A-Za-z0-9_-]{43})/)?.[1];ok('HOMO fragment link '+email,!!token);tokens.push(token);return token}
 async function failSmtp(on){await fetch('http://10s-phase6-smtp:8025/failure?on='+(on?'1':'0'),{method:'POST',headers:{Authorization:'Bearer '+process.env.CAPTURE_PASSWORD}})}
 const inspect=token=>req(anon,'/api/access/invitations/inspect','POST',{token});
 async function activate(invite,email,role,tenantId){const password=freshPassword();ok('short password rejected '+role,(await req(anon,'/api/access/invitations/accept','POST',{token:invite.token,password:'short'})).status===400);const r=await req(anon,'/api/access/invitations/accept','POST',{token:invite.token,password,tenantId:'foreign',role:'OWNER'});ok('activation '+role,r.status===200&&r.body.newlyActivated);const id=await db.authIdentity.findUniqueOrThrow({where:{email}}),m=await db.tenantMembership.findUniqueOrThrow({where:{identityId_tenantId:{identityId:id.id,tenantId}}});ok('role derived from invite '+role,m.role===role);ok('bcrypt 12 '+role,bcrypt.getRounds(id.senhaHash)===12&&await bcrypt.compare(password,id.senhaHash));ok('no implicit PlatformAdmin '+role,await db.platformAdmin.count({where:{identityId:id.id}})===0);ok('one compatible mapping '+role,await db.legacyUserAccessMap.count({where:{identityId:id.id,tenantId}})===1);ok('used token rejected '+role,(await req(anon,'/api/access/invitations/accept','POST',{token:invite.token,password})).status>=400);const jar=await login(email,password);await choose(jar,tenantId);return{id,m,jar,password,email}}
 try{
  ok('fresh database',await db.authIdentity.count()===0&&await db.tenant.count()===0);
  const [count]=await db.$queryRawUnsafe('SELECT count(*)::int n FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL');ok('15 migrations',count.n===15);
  const a=await db.tenant.create({data:{nome:'MODO DEV LAB F6',slug:'modo-dev',email:'tenant@example.invalid'}}),b=await db.tenant.create({data:{nome:'MODO DEV ISOLAMENTO LAB F6',slug:'modo-dev-isolamento',email:'isolation@example.invalid'}});
  const paPassword=freshPassword(),paIdentity=await db.authIdentity.create({data:{email:'f6-platform@example.invalid',nome:'F6 Platform',senhaHash:await bcrypt.hash(paPassword,12)}});
  await db.platformAdmin.create({data:{identityId:paIdentity.id}});const pa=await login(paIdentity.email,paPassword);
  const ownerPath=id=>`/api/platform/tenants/${id}/owner-invitations`;
  async function inviteOwner(tenantId,email){const r=await req(pa,ownerPath(tenantId),'POST',{email,nome:'F6 Synthetic',confirm:true});ok('OWNER invite created',r.status===201&&r.body.delivery?.status==='SENT');ok('no raw token in response',!r.body.token&&!r.body.devLink);return{id:r.body.id,token:await capture(email)}}
  ok('unauthenticated admin denied',(await req(anon,ownerPath(a.id),'POST',{})).status===401);
  const oi=await inviteOwner(a.id,'f6-owner@example.invalid');const record=await db.accessInvite.findUniqueOrThrow({where:{id:oi.id}});
  ok('only hash stored',record.tokenHash===crypto.createHash('sha256').update(oi.token).digest('hex')&&!json(record).includes(oi.token));
  ok('expiry 72 hours',Math.abs(record.expiresAt-record.createdAt-72*3600000)<10000);
  ok('invitation does not create identity',await db.authIdentity.count()===1);
  ok('inspect new mode',(await inspect(oi.token)).body.mode==='new');
  ok('duplicate invite blocked',(await req(pa,ownerPath(a.id),'POST',{email:'F6-OWNER@EXAMPLE.INVALID',nome:'F6',confirm:true})).status===409);
  const owner=await activate(oi,'f6-owner@example.invalid','OWNER',a.id);
  ok('no inferred contractual responsible',await db.tenantContractualResponsible.count()===0);
  ok('last OWNER cannot deactivate',(await req(owner.jar,'/api/access/memberships/'+owner.m.id,'PATCH',{status:'INACTIVE'})).status===409);
  const profile=await db.accessProfile.findUniqueOrThrow({where:{id:owner.m.profileId}}),read=await db.accessProfile.create({data:{tenantId:a.id,nome:'CONSULTA F6',permissoes:['fluxo.lancamentos.view','estrutura.empresa.view']}});
  async function invite(jar,email,role='MEMBER',profileId=read.id){const r=await req(jar,'/api/access/invitations','POST',{email,nome:'F6 Synthetic',role,profileId});ok('invite '+role+' '+email,r.status===201&&r.body.delivery?.status==='SENT');return{id:r.body.id,token:await capture(email)}}
  const admin=await activate(await invite(owner.jar,'f6-admin@example.invalid','ADMIN',profile.id),'f6-admin@example.invalid','ADMIN',a.id);
  const member=await activate(await invite(admin.jar,'f6-member@example.invalid'),'f6-member@example.invalid','MEMBER',a.id);
  ok('ADMIN cannot invite ADMIN',(await req(admin.jar,'/api/access/invitations','POST',{email:'forbidden@example.invalid',nome:'F6',role:'ADMIN',profileId:profile.id})).status===403);
  ok('MEMBER cannot invite',(await req(member.jar,'/api/access/invitations','POST',{email:'forbidden@example.invalid',nome:'F6',role:'MEMBER',profileId:read.id})).status===403);
  ok('existing membership duplicate blocked',(await req(owner.jar,'/api/access/invitations','POST',{email:member.email,nome:'F6',role:'MEMBER',profileId:read.id})).status===409);
  const other=await inviteOwner(b.id,member.email);
  ok('existing identity inspect',(await inspect(other.token)).body.mode==='existing');
  ok('existing identity requires login',(await req(anon,'/api/access/invitations/accept','POST',{token:other.token})).status===403);
  ok('wrong identity denied',(await req(owner.jar,'/api/access/invitations/accept','POST',{token:other.token})).status===403);
  ok('existing identity accepts',(await req(member.jar,'/api/access/invitations/accept','POST',{token:other.token})).status===200);
  ok('one identity two memberships',await db.authIdentity.count({where:{email:member.email}})===1&&await db.tenantMembership.count({where:{identityId:member.id.id}})===2);
  const foreign=await db.accessProfile.findFirstOrThrow({where:{tenantId:b.id}});
  ok('foreign profile rejected',(await req(owner.jar,'/api/access/invitations','POST',{email:'foreign@example.invalid',nome:'F6',role:'MEMBER',profileId:foreign.id})).status===400);
  const rotating=await invite(owner.jar,'f6-rotate@example.invalid');
  await choose(member.jar,b.id);
  ok('foreign tenant cannot revoke',(await req(member.jar,'/api/access/invitations/'+rotating.id,'POST',{action:'revoke'})).status===404);
  await choose(member.jar,a.id);
  const resend=await req(owner.jar,'/api/access/invitations/'+rotating.id,'POST',{action:'resend'});ok('resend succeeds',resend.status===200&&resend.body.id!==rotating.id);
  const nextToken=await capture('f6-rotate@example.invalid');ok('token rotated',nextToken!==rotating.token);ok('previous token rejected',(await inspect(rotating.token)).status>=400);ok('new token valid',(await inspect(nextToken)).status===200);
  ok('revoke succeeds',(await req(owner.jar,'/api/access/invitations/'+resend.body.id,'POST',{action:'revoke'})).status===200);ok('revoked token rejected',(await inspect(nextToken)).status>=400);
  const expired=await invite(owner.jar,'f6-expire@example.invalid');await db.accessInvite.update({where:{id:expired.id},data:{expiresAt:new Date(Date.now()-1000)}});
  ok('expiry without scheduler',(await inspect(expired.token)).status===410);ok('expired activation denied',(await req(anon,'/api/access/invitations/accept','POST',{token:expired.token,password:freshPassword()})).status>=400);ok('expired no identity',await db.authIdentity.count({where:{email:'f6-expire@example.invalid'}})===0);
  await db.authIdentity.create({data:{email:'f6-inactive@example.invalid',nome:'F6 inactive',status:'INACTIVE',senhaHash:await bcrypt.hash(freshPassword(),12)}});
  ok('inactive identity blocked',(await req(owner.jar,'/api/access/invitations','POST',{email:'f6-inactive@example.invalid',nome:'F6',role:'MEMBER',profileId:read.id})).status===409);
  await failSmtp(true);const failed=await req(owner.jar,'/api/access/invitations','POST',{email:'f6-smtp-fail@example.invalid',nome:'F6',role:'MEMBER',profileId:read.id});await failSmtp(false);
  ok('SMTP failure preserves pending',failed.status===201&&failed.body.delivery.status==='FAILED'&&(await db.accessInvite.findUniqueOrThrow({where:{id:failed.body.id}})).status==='PENDING');
  const retry=await req(owner.jar,'/api/access/invitations/'+failed.body.id,'POST',{action:'resend'});ok('SMTP retry succeeds',retry.status===200&&retry.body.delivery.status==='SENT');await capture('f6-smtp-fail@example.invalid');
  const third=await req(owner.jar,'/api/access/invitations/'+retry.body.id,'POST',{action:'resend'});ok('third emission allowed',third.status===200);await capture('f6-smtp-fail@example.invalid');
  ok('emission rate limit',(await req(owner.jar,'/api/access/invitations/'+third.body.id,'POST',{action:'resend'})).status===429);
  const racing=await invite(owner.jar,'f6-concurrent@example.invalid'),racePassword=freshPassword();
  const concurrent=await Promise.all([1,2].map(()=>req(new Map(),'/api/access/invitations/accept','POST',{token:racing.token,password:racePassword})));
  ok('concurrent accept single success',concurrent.filter(r=>r.status===200).length===1);
  ok('concurrent accept one identity',await db.authIdentity.count({where:{email:'f6-concurrent@example.invalid'}})===1);
  const raced=await db.authIdentity.findUniqueOrThrow({where:{email:'f6-concurrent@example.invalid'}});
  ok('concurrent accept one membership',await db.tenantMembership.count({where:{identityId:raced.id}})===1);
  const docs={};for(const audience of ['CONTRATANTE','USUARIO']){const r=await req(pa,'/api/platform/terms','POST',{code:'F6_'+audience,audience,required:true});ok('document '+audience,r.status===201);docs[audience]=r.body}
  async function upload(doc,version){const bytes=fs.readFileSync('/fixtures/TERMOS-MODO-DEV-'+version+'.pdf'),form=new FormData();form.set('version',version);form.set('title','TERMOS MODO DEV — TESTE '+version);form.set('requiresReaccept','true');form.set('file',new Blob([bytes],{type:'application/pdf'}),'test.pdf');const r=await req(pa,`/api/platform/terms/${doc.id}/versions`,'POST',form);ok('PDF upload '+doc.code+version,r.status===201);ok('PDF hash exact',r.body.sha256===crypto.createHash('sha256').update(bytes).digest('hex'));return r.body}
  const contract=await upload(docs.CONTRATANTE,'V1'),v1=await upload(docs.USUARIO,'V1');
  ok('anonymous PDF denied',(await req(anon,`/api/terms/versions/${v1.id}/file`)).status===401);ok('draft PDF denied to member',(await req(member.jar,`/api/terms/versions/${v1.id}/file`)).status===403);
  ok('non PA publish denied',(await req(owner.jar,`/api/platform/terms/versions/${v1.id}/publish`,'POST')).status===403);
  const publish=async v=>ok('publish '+v.id,(await req(pa,`/api/platform/terms/versions/${v.id}/publish`,'POST')).status===200);
  await publish(contract);await publish(v1);
  ok('terms gate 428',(await req(owner.jar,'/api/categorias')).status===428);
  const respPath=`/api/platform/tenants/${a.id}/contractual-responsible`;
  ok('MEMBER not contractual OWNER',(await req(pa,respPath,'POST',{membershipId:member.m.id,confirm:true})).status>=400);
  ok('explicit responsible assigned',(await req(pa,respPath,'POST',{membershipId:owner.m.id,confirm:true})).status===200);
  const foreignMembership=await db.tenantMembership.findUniqueOrThrow({where:{identityId_tenantId:{identityId:member.id.id,tenantId:b.id}}});
  ok('foreign responsible blocked',(await req(pa,respPath,'POST',{membershipId:foreignMembership.id,confirm:true})).status>=400);
  const accept=(jar,v)=>req(jar,'/api/terms/accept','POST',{versionId:v.id,agreed:true});
  ok('member cannot accept tenant contract',(await accept(member.jar,contract)).status===403);
  ok('explicit consent required',(await req(owner.jar,'/api/terms/accept','POST',{versionId:contract.id,agreed:false})).status===400);
  ok('responsible accepts contract',(await accept(owner.jar,contract)).status===200);
  for(const user of [owner,admin,member])ok('user accepts v1 '+user.email,(await accept(user.jar,v1)).status===200);
  ok('explicit second OWNER promotion',(await req(owner.jar,'/api/access/memberships/'+admin.m.id,'PATCH',{role:'OWNER'})).status===200);
  ok('responsible change explicit',(await req(pa,respPath,'POST',{membershipId:admin.m.id,confirm:true})).status===200);
  ok('responsible restored explicitly',(await req(pa,respPath,'POST',{membershipId:owner.m.id,confirm:true})).status===200);
  ok('temporary OWNER demoted',(await req(owner.jar,'/api/access/memberships/'+admin.m.id,'PATCH',{role:'ADMIN'})).status===200);
  ok('operation after terms',(await req(owner.jar,'/api/categorias')).status===200);
  const pdf=await req(member.jar,`/api/terms/versions/${v1.id}/file`);ok('authorized PDF exact',pdf.status===200&&crypto.createHash('sha256').update(pdf.body).digest('hex')===v1.sha256);ok('PDF private no-store',pdf.headers.get('cache-control').includes('no-store'));ok('PDF nosniff',pdf.headers.get('x-content-type-options')==='nosniff');
  ok('storage not public',(await req(anon,'/terms/'+v1.storageKey)).status!==200);
  const v2=await upload(docs.USUARIO,'V2');await publish(v2);ok('v2 blocks prior acceptance',(await req(owner.jar,'/api/categorias')).status===428);ok('reaccept v2',(await accept(owner.jar,v2)).status===200);ok('v1 evidence retained',await db.termAcceptance.count({where:{termVersionId:v1.id}})===3);ok('v2 evidence stored',await db.termAcceptance.count({where:{termVersionId:v2.id,identityId:owner.id.id,documentHash:v2.sha256}})===1);
  const grant=await req(pa,'/api/support-grants','POST',{tenantId:a.id,reason:'F6 synthetic authorized support',modules:['ESTRUTURA_EMPRESA'],accessLevel:'READ_ONLY',requestedMinutes:15});ok('support requested',grant.status===201);
  ok('support owner approval',(await req(owner.jar,'/api/support-grants/'+grant.body.id,'PATCH',{action:'approve'})).status===200);await choose(pa,a.id,grant.body.id);
  ok('support cannot bypass user terms',(await req(pa,'/api/empresa')).status===428);ok('support accepts own user terms',(await accept(pa,v2)).status===200);ok('support resumes read',(await req(pa,'/api/empresa')).status===200);ok('support remains read-only',(await req(pa,'/api/areas-negocio','POST',{codigo:'F6',nome:'F6'})).status===403);ok('support no permanent membership',await db.tenantMembership.count({where:{identityId:paIdentity.id}})===0);
  const cv2=await upload(docs.CONTRATANTE,'V2');await publish(cv2);ok('support cannot bypass contract',(await req(pa,'/api/empresa')).status===428);ok('support cannot accept contract',(await accept(pa,cv2)).status===403);ok('responsible reaccepts contract',(await accept(owner.jar,cv2)).status===200);
  ok('support revoked',(await req(owner.jar,'/api/support-grants/'+grant.body.id,'PATCH',{action:'revoke',reason:'F6 finished'})).status===200);ok('revocation effective',(await req(pa,'/api/empresa')).status>=400);
  const audit=await db.auditEvent.findMany();for(const action of ['INVITE_CREATED','INVITE_EMAIL_SENT','INVITE_EMAIL_FAILED','INVITE_REVOKED','INVITE_EXPIRED','IDENTITY_ACTIVATED','INVITE_ACCEPTED','MEMBERSHIP_ACTIVATED','TERM_ACCEPTED','TERM_VERSION_PUBLISHED','SUPPORT_REQUESTED','SUPPORT_APPROVED','SUPPORT_REVOKED'])ok('audit '+action,audit.some(e=>e.action===action));
  const trail=json(audit);ok('audit contains no tokens/passwords',![...tokens,...passwords].some(secret=>trail.includes(secret)));ok('no raw password hashes in audit',!trail.includes('senhaHash')&&!trail.includes('$2b$'));
  ok('no financial data created',await db.lancamento.count()===0);
  ok('OWNER activation has accurate system origin',audit.some(e=>e.action==='OWNER_ASSIGNED'&&e.actorIdentityId===paIdentity.id&&e.accessMode==='SYSTEM'&&e.metadata?.invitationId===oi.id));
  ok('invite audit correlation',audit.filter(e=>e.resourceType==='AccessInvite').every(e=>/^[0-9a-f-]{36}$/.test(e.requestId||'')));
  ok('response correlation',(await inspect(oi.token)).headers.has('X-Request-Id'));
  console.log(json({state:'PASSED',checks,counts:{identities:await db.authIdentity.count(),memberships:await db.tenantMembership.count(),invitations:await db.accessInvite.count(),terms:await db.termVersion.count(),acceptances:await db.termAcceptance.count(),audit:audit.length},versions:[contract,v1,v2,cv2].map(v=>({id:v.id,sha256:v.sha256}))}));
 }finally{await db.$disconnect()}
}
main().catch(e=>{console.log(json({state:'FAILED',step,checks,error:e instanceof assert.AssertionError?e.message:'LAB_RUNTIME_ERROR',code:e.code||null}));process.exitCode=1});
