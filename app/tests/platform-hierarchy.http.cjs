// Real protocol regression: approved isolated operational DEV only; synthetic records owned by this run.
const assert=require('node:assert/strict'),{randomUUID}=require('node:crypto'),bcrypt=require('bcryptjs');
const {PrismaClient}=require('@prisma/client'),{PrismaPg}=require('@prisma/adapter-pg');
async function main(){
 let raw='';for await(const chunk of process.stdin)raw+=chunk;const cfg=JSON.parse(raw);raw='';
 const db=new URL(process.env.DATABASE_URL);assert(cfg.base==='http://localhost:3023'&&db.hostname==='127.0.0.1'&&db.port==='55432'&&db.pathname==='/gestar_vf_dev');
 const transport=cfg.transportBase??cfg.base;assert(transport===cfg.base||transport==='http://127.0.0.1:3022');
 assert(cfg.adminEmail==='dev18-admin@example.invalid'&&cfg.memberEmail==='dev18-member@example.invalid');
 const p=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})}),suffix=randomUUID().slice(0,8),checks=[];let step='start',last;
 const check=(name,value)=>{step=name;assert(value,name);checks.push(name);};
 async function q(j,path,method='GET',body){
  const r=await fetch(transport+path,{method,redirect:'manual',headers:{Origin:cfg.base,Host:new URL(cfg.base).host,Cookie:[...j].map(([k,v])=>k+'='+v).join('; '),...(body===undefined?{}:{'Content-Type':body instanceof URLSearchParams?'application/x-www-form-urlencoded':'application/json'})},...(body===undefined?{}:{body:body instanceof URLSearchParams?body:JSON.stringify(body)})});
  for(const c of r.headers.getSetCookie()){const pair=c.split(';')[0],i=pair.indexOf('=');j.set(pair.slice(0,i),pair.slice(i+1));}
  const b=r.headers.get('content-type')?.includes('json')?await r.json():await r.text();last={status:r.status,error:typeof b?.error==='string'?b.error.slice(0,160):undefined};return{status:r.status,body:b,headers:r.headers};
 }
 async function login(email){const j=new Map(),c=await q(j,'/api/auth/csrf');check('login CSRF readable',c.status===200);await q(j,'/api/auth/callback/credentials','POST',new URLSearchParams({csrfToken:c.body.csrfToken,email,password:cfg.password,callbackUrl:cfg.base+'/plataforma'}));check('synthetic identity authenticated',!!(await q(j,'/api/auth/session')).body?.user);return j;}
 try{
  const admin=await login(cfg.adminEmail),member=await login(cfg.memberEmail);
  for(const path of ['/api/platform/tenants','/api/platform/identities','/api/platform/memberships']){
   check('anonymous catalog denied '+path,(await q(new Map(),path)).status===401);check('non-PlatformAdmin denied '+path,(await q(member,path)).status===403);check('PlatformAdmin catalog readable '+path,(await q(admin,path)).status===200);
  }
  check('global PlatformAdmin has no automatic business choices',(await q(admin,'/api/tenants')).body.length===0);
  check('global PlatformAdmin cannot read operational records',(await q(admin,'/api/lancamentos')).status!==200);
  async function tenant(label){const email=`pa-evo-${label}-${suffix}@example.invalid`,r=await q(admin,'/api/tenants','POST',{nome:`PLATFORM HIERARCHY QA ${label} ${suffix}`,email,plano:'trial'});check('manual tenant creation '+label,r.status===201);return r.body;}
  const a=await tenant('A'),b=await tenant('B');
  check('editing preserves original administrative endpoint',(await q(admin,'/api/platform/tenants/'+a.id,'PATCH',{nome:a.nome+' Editada',plano:'mensal'})).status===200);
  check('invalid tenant plan still rejected',(await q(admin,'/api/platform/tenants/'+a.id,'PATCH',{plano:'invalid'})).status===400);
  check('empty tenant remains ownerless',(await q(admin,'/api/platform/tenants')).body.find(t=>t.id===a.id).activeOwnerCount===0);
  const email=`pa-evo-owner-${suffix}@example.invalid`;
  async function invite(t){const r=await q(admin,'/api/platform/tenants/'+t.id+'/owner-invitations','POST',{nome:'PROPRIETÁRIO QA '+suffix,email,confirm:true,channel:'MANUAL_SHARE'});check('new owner uses official invitation',r.status===201);check('no real email sent',r.body.delivery?.status==='MANUAL_SHARE');const u=new URL(r.body.share.link);assert(u.origin===cfg.base&&u.pathname==='/ativar-acesso');return new URLSearchParams(u.hash.slice(1)).get('token');}
  const tokenA=await invite(a);check('owner activation through official public flow',(await q(new Map(),'/api/access/invitations/accept','POST',{token:tokenA,password:cfg.password})).status===200);
  const owner=await login(email),tokenB=await invite(b);
  check('existing identity cannot accept anonymously',(await q(new Map(),'/api/access/invitations/accept','POST',{token:tokenB,password:cfg.password})).status===403);
  check('same authenticated identity joins second tenant',(await q(owner,'/api/access/invitations/accept','POST',{token:tokenB,password:cfg.password})).status===200);
  const identity=await p.authIdentity.findUniqueOrThrow({where:{email}}),ownMemberships=await p.tenantMembership.findMany({where:{identityId:identity.id}}),ma=ownMemberships.find(m=>m.tenantId===a.id),mb=ownMemberships.find(m=>m.tenantId===b.id);
  check('one global identity across multiple tenants',(await p.authIdentity.count({where:{email}}))===1&&ownMemberships.length===2);
  const owned=await p.tenant.findMany({where:{id:{in:[a.id,b.id]}},select:{nome:true}});assert(owned.length===2&&owned.every(t=>t.nome.startsWith('PLATFORM HIERARCHY QA ')));
  check('owned membership has exactly one explicit legacy mapping',await p.legacyUserAccessMap.count({where:{membershipId:mb.id,tenantId:b.id,identityId:identity.id}})===1);
  const legacy=await p.legacyUserAccessMap.findFirstOrThrow({where:{membershipId:mb.id,tenantId:b.id,identityId:identity.id}});
  // Controlled initial MEMBER fixture in this run's tenant only, with the real activation-created mapping/profile.
  await p.$transaction([p.tenantMembership.update({where:{id:mb.id},data:{role:'MEMBER'}}),p.usuario.update({where:{id:legacy.legacyUsuarioId},data:{papel:'membro'}})]);
  check('owner designation still requires explicit confirmation',(await q(admin,'/api/platform/tenants/'+b.id+'/owners','POST',{email})).status===400);
  check('existing mapped member promoted through official designation',(await q(admin,'/api/platform/tenants/'+b.id+'/owners','POST',{email,confirm:true})).status===201);
  const promoted=await p.tenantMembership.findUniqueOrThrow({where:{id:mb.id}});check('designation preserves identity membership and profile',promoted.identityId===identity.id&&promoted.profileId===mb.profileId&&promoted.role==='OWNER'&&await p.tenantMembership.count({where:{identityId:identity.id}})===2);
  check('responsible designation rejects another business membership',(await q(admin,'/api/platform/tenants/'+a.id+'/contractual-responsible','POST',{membershipId:mb.id,confirm:true})).status===409);
  check('responsible designation requires explicit confirmation',(await q(admin,'/api/platform/tenants/'+a.id+'/contractual-responsible','POST',{membershipId:ma.id})).status===400);
  check('explicit contractual responsible retained',(await q(admin,'/api/platform/tenants/'+a.id+'/contractual-responsible','POST',{membershipId:ma.id,confirm:true})).status===200);
  check('ordinary owner remains outside PlatformAdmin catalog',(await q(owner,'/api/platform/tenants')).status===403);
  check('unrelated identity cannot select synthetic tenant',(await q(member,'/api/tenants/switch','POST',{tenantId:a.id})).status===403);
  const inactiveEmail=`pa-evo-member-${suffix}@example.invalid`,hash=await bcrypt.hash(cfg.password,12),profile=await p.accessProfile.create({data:{tenantId:a.id,nome:'Perfil de consulta QA '+suffix,permissoes:[]}});
  const inactive=await p.authIdentity.create({data:{nome:'MEMBRO INATIVO QA '+suffix,email:inactiveEmail,senhaHash:hash}});
  const im=await p.tenantMembership.create({data:{identityId:inactive.id,tenantId:a.id,role:'MEMBER',status:'INACTIVE',profileId:profile.id}});
  const lu=await p.usuario.create({data:{tenantId:a.id,nome:inactive.nome,email:inactiveEmail,senhaHash:hash,papel:'membro',ativo:false}});await p.legacyUserAccessMap.create({data:{tenantId:a.id,identityId:inactive.id,membershipId:im.id,legacyUsuarioId:lu.id}});
  const global=await p.authIdentity.create({data:{nome:'CONTA GLOBAL SEM VÍNCULO QA '+suffix,email:`pa-evo-global-${suffix}@example.invalid`,senhaHash:hash,status:'INACTIVE'}});
  check('tenant deactivation uses existing restrictions',(await q(admin,'/api/platform/tenants/'+b.id,'PATCH',{ativo:false})).status===200);
  check('tenant activation uses existing restrictions',(await q(admin,'/api/platform/tenants/'+b.id,'PATCH',{ativo:true})).status===200);
  check('leave inactive fixture for visual validation',(await q(admin,'/api/platform/tenants/'+b.id,'PATCH',{ativo:false})).status===200);
  const tenants=(await q(admin,'/api/platform/tenants')).body,accounts=(await q(admin,'/api/platform/identities')).body,links=(await q(admin,'/api/platform/memberships')).body;
  check('tenant statuses remain independent',tenants.find(t=>t.id===a.id).ativo===true&&tenants.find(t=>t.id===b.id).ativo===false);
  check('profile role and membership status survive catalog composition',links.some(m=>m.id===im.id&&m.role==='MEMBER'&&m.status==='INACTIVE'&&m.profile.id===profile.id));
  check('multi-tenant identity represented without database duplication',links.filter(m=>m.identity.id===identity.id).length===2&&accounts.filter(i=>i.id===identity.id).length===1);
  check('unlinked account remains global',accounts.find(i=>i.id===global.id).memberships.length===0);
  check('contractual responsible remains explicit',tenants.find(t=>t.id===a.id).contractualResponsibleMembershipId===ma.id);
  check('Fase 12A contract is not automatically accepted',tenants.find(t=>t.id===a.id).contractualStatus!=='Contrato ativo');
  const head=(await q(admin,'/plataforma')).body;check('operational DEV preserves separately scoped special invitation guard',typeof head==='string'&&!head.includes('href="/plataforma/convites-especiais"')&&(await q(admin,'/api/platform/experiment-invitations')).status===404);
  console.log(JSON.stringify({state:'PLATFORM_HIERARCHY_LOCAL_HTTP_PASSED',checks,fixtureTenantIds:[a.id,b.id],fixtureIdentityIds:[identity.id,inactive.id,global.id],fixtureMarker:suffix,syntheticOnly:true,environment:cfg.base,noEmails:true,noMigrations:true,homologOrProdMutated:false}));
 }catch(e){console.log(JSON.stringify({state:'PLATFORM_HIERARCHY_LOCAL_HTTP_FAILED',step,last,error:e.name,checks}));process.exitCode=1;}finally{await p.$disconnect();}
}
main().catch(e=>{console.log(JSON.stringify({state:'PLATFORM_HIERARCHY_GUARD_FAILED',error:e.name}));process.exitCode=1;});
