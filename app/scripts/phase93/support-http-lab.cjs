// Synthetic technical identities only, in the guarded disposable historical clone.
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs/promises');
const {Pool}=require('pg'),{PrismaClient}=require('@prisma/client'),{PrismaPg}=require('@prisma/adapter-pg'),bcrypt=require('bcryptjs'),XLSX=require('xlsx');
const checks=[],ok=(value,label)=>{assert(value,label);checks.push(label)},id=()=>crypto.randomUUID();
async function main(){
 const url=new URL(process.env.DATABASE_URL),base=process.env.PHASE91_LAB_URL;
 assert.equal(process.env.PHASE93_LAB,'1');assert.equal(url.hostname,'phase9-prod-clone-pg');assert.match(url.pathname,/^\/phase91_restore_r\d+$/);assert.match(base,/^http:\/\/phase91-lab-app-r\d+:3000$/);
 const pool=new Pool({connectionString:url.href}),prisma=new PrismaClient({adapter:new PrismaPg({connectionString:url.href})});
 const q=async(s,p=[])=>(await pool.query(s,p)).rows;
 function cookies(jar,r){for(const h of r.headers.getSetCookie()){const [p]=h.split(';'),n=p.indexOf('=');jar.set(p.slice(0,n),p.slice(n+1));}}
 async function request(jar,path,method='GET',body,extra={}){const form=body instanceof FormData;
  const r=await fetch(base+path,{method,redirect:'manual',headers:{Origin:base,Cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; '),...(body===undefined||form?{}:{'Content-Type':'application/json'}),...extra},body:body===undefined?undefined:form?body:JSON.stringify(body)});cookies(jar,r);return r;}
 async function login(email,password){const jar=new Map(),csrf=await(await request(jar,'/api/auth/csrf')).json();const r=await fetch(base+'/api/auth/callback/credentials',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/x-www-form-urlencoded',Cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; ')},body:new URLSearchParams({csrfToken:csrf.csrfToken,email,password,callbackUrl:base+'/suporte',json:'true'})});cookies(jar,r);assert((await(await request(jar,'/api/auth/session')).json())?.user);return jar;}
 async function expect(jar,path,status,method='GET',body,extra){const r=await request(jar,path,method,body,extra);assert.equal(r.status,status,path);return r;}
 try{
  const tenants=(await q('SELECT id FROM tenants ORDER BY id')).map(r=>r.id),tenant=tenants[0],other=tenants[1];assert.equal(tenants.length,8);
  const owner=(await q("SELECT identity_id FROM tenant_memberships WHERE tenant_id=$1 AND status='ACTIVE' AND role='OWNER'",[tenant]))[0];
  const admin=(await q('SELECT identity_id FROM platform_admins WHERE status=\'ACTIVE\' LIMIT 1'))[0];assert(owner&&admin);
  const ownerPass=crypto.randomBytes(32).toString('base64url'),adminPass=crypto.randomBytes(32).toString('base64url');
  // Existing clone principals get synthetic credentials for controlled HTTP sessions only.
  await q("UPDATE auth_identities SET email='phase93-owner@example.invalid',senha_hash=$2 WHERE id=$1",[owner.identity_id,await bcrypt.hash(ownerPass,10)]);
  await q("UPDATE auth_identities SET email='phase93-platform@example.invalid',senha_hash=$2 WHERE id=$1",[admin.identity_id,await bcrypt.hash(adminPass,10)]);
  const ownerJar=await login('phase93-owner@example.invalid',ownerPass),adminJar=await login('phase93-platform@example.invalid',adminPass);
  await expect(ownerJar,'/api/tenants/switch',200,'POST',{tenantId:tenant});
  let businessAdmin;
  for(const role of ['ADMIN','MEMBER']){
    const m=(await q("SELECT identity_id,tenant_id FROM tenant_memberships WHERE role=$1 AND status='ACTIVE' AND identity_id<>$2 AND identity_id<>$3 ORDER BY id LIMIT 1",[role,owner.identity_id,admin.identity_id]))[0];assert(m);
    const password=crypto.randomBytes(32).toString('base64url'),email='phase93-'+role.toLowerCase()+'@example.invalid';
    await q('UPDATE auth_identities SET email=$2,senha_hash=$3 WHERE id=$1',[m.identity_id,email,await bcrypt.hash(password,10)]);
    const jar=await login(email,password);await expect(jar,'/api/tenants/switch',200,'POST',{tenantId:m.tenant_id});
    const context=await(await expect(jar,'/api/access/context',200)).json();assert.equal(context.role,role);
    await expect(jar,'/api/support-grants?view=operator',403);await expect(jar,'/api/backups',403,'POST',{});
    if(role==='ADMIN')businessAdmin={jar,identityId:m.identity_id,user:(await(await request(jar,'/api/auth/session')).json()).user};
  }
  ok(true,'existing-owner-admin-member-roles-preserved-no-technical-inference');
  const hash=async(t,where='',args=[])=> (await q(`SELECT md5(coalesce(string_agg(to_jsonb(t)::text,'|' ORDER BY to_jsonb(t)::text),'')) d FROM public."${t}" t ${where}`,args))[0].d;
  const membershipBefore=await hash('tenant_memberships'),usersBefore=await hash('usuarios'),mapsBefore=await hash('legacy_user_access_maps'),adminsBefore=await hash('platform_admins');
  const oldAudits=await q('SELECT id FROM audit_events ORDER BY id'),oldAuditHash=await hash('audit_events','WHERE id=ANY($1::text[])',[oldAudits.map(r=>r.id)]);
  const {TABLES}=await import('/private/phase91/engine/catalog.mjs');async function neighbors(){const out={};for(const t of TABLES)out[t]=await hash(t,'WHERE tenant_id<>$1',[tenant]);return out;}
  const neighborBefore=await neighbors();
  const passA=crypto.randomBytes(32).toString('base64url'),passB=crypto.randomBytes(32).toString('base64url');
  const a=await prisma.authIdentity.create({data:{email:'phase93-tech-a@example.invalid',nome:'F93 SYNTHETIC A',senhaHash:await bcrypt.hash(passA,10)}});
  const b=await prisma.authIdentity.create({data:{email:'phase93-tech-b@example.invalid',nome:'F93 SYNTHETIC B',senhaHash:await bcrypt.hash(passB,10)}});
  const jarA=await login(a.email,passA),jarB=await login(b.email,passB);
  const paSession=(await(await request(adminJar,'/api/auth/session')).json()).user;
  const aSession=(await(await request(jarA,'/api/auth/session')).json()).user;
  await expect(adminJar,'/api/platform/tenants',200);
  await expect(adminJar,'/api/support-grants?view=operator',403);
  await expect(adminJar,'/api/support-grants',403,'POST',{tenantId:tenant,reason:'F93 no implicit technical capability',modules:['ESTRUTURA_FINANCEIRA']});ok(true,'platformadmin-not-supportoperator-and-platform-regression');
  const opA=await(await expect(adminJar,'/api/platform/support-operators',201,'POST',{identityId:a.id})).json();
  const opB=await(await expect(adminJar,'/api/platform/support-operators',201,'POST',{identityId:b.id})).json();
  const schemaClient=await pool.connect();await schemaClient.query('BEGIN');
  try{for(const [identity,code] of [[a.id,'23505'],[id(),'23503']]){await schemaClient.query('SAVEPOINT constraint_test');await assert.rejects(schemaClient.query('INSERT INTO support_operators(id,identity_id) VALUES($1,$2)',[id(),identity]),{code});await schemaClient.query('ROLLBACK TO SAVEPOINT constraint_test');}ok(true,'operator-unique-and-identity-fk-enforced-by-postgres');}
  finally{await schemaClient.query('ROLLBACK');schemaClient.release();}
  for(const who of [a,b]){assert.equal(await prisma.tenantMembership.count({where:{identityId:who.id}}),0);assert.equal(await prisma.platformAdmin.count({where:{identityId:who.id}}),0);}
  ok(true,'explicit-capability-no-membership-platformadmin-owner-or-legacy-user');
  assert.deepEqual(await(await expect(jarA,'/api/tenants',200)).json(),[]);await expect(jarA,'/api/categorias',403);await expect(jarA,'/api/tenants/switch',403,'POST',{tenantId:tenant});ok(true,'operator-alone-no-tenant-or-business-read');
  const ui=await(await expect(jarA,'/suporte',200)).text();ok(ui.includes('Área de Suporte')&&!ui.includes('Administração da Plataforma / Suporte'),'separate-operator-ui');
  await expect(jarA,'/api/platform/tenants',403);await expect(jarA,'/api/platform/support-operators/'+opB.id,403,'PATCH',{action:'deactivate',reason:'F93 operator cannot offboard another'});
  const create=async(jar,target=tenant,level)=> (await(await expect(jar,'/api/support-grants',201,'POST',{tenantId:target,reason:'F93 synthetic case: diagnose approved category screen',modules:['ESTRUTURA_FINANCEIRA'],...(level?{accessLevel:level}:{})})).json());
  const enter=async(jar,g,status=200,target=g.tenantId)=>expect(jar,'/api/tenants/switch',status,'POST',{tenantId:target,grantId:g.id});
  const decision=async(g,action)=>expect(ownerJar,'/api/support-grants/'+g.id,200,'PATCH',{action,reason:'F93 explicit business decision'});
  const rejected=await create(jarA);await enter(jarA,rejected,403);await decision(rejected,'reject');await enter(jarA,rejected,403);ok(true,'pending-and-rejected-grants-denied');
  const self=await prisma.supportGrant.create({data:{tenantId:tenant,requesterIdentityId:owner.identity_id,reason:'F93 SELF APPROVAL NEGATIVE FIXTURE',modules:['ESTRUTURA_FINANCEIRA'],requestedMinutes:60}});
  await expect(ownerJar,'/api/support-grants/'+self.id,403,'PATCH',{action:'approve'});ok(true,'self-approval-denied-without-provisioning-owner-as-operator');
  const readA=await create(jarA);assert.equal(readA.accessLevel,'READ_ONLY');
  await expect(ownerJar,'/api/support-grants/'+readA.id,200,'PATCH',{action:'approve',accessLevel:'OPERATIONAL'});assert.equal((await prisma.supportGrant.findUnique({where:{id:readA.id}})).accessLevel,'READ_ONLY');
  await enter(jarA,readA);await expect(jarA,'/api/categorias',200);ok(true,'active-operator-approved-readonly-grant-allows-scoped-read');
  const context=await(await expect(jarA,'/api/access/context',200)).json();ok(context.accessSource==='SUPPORT_GRANT'&&context.membershipId===null&&!context.platformAdmin&&context.permissions.every(p=>p.endsWith('.view')),'effective-context-no-membership-or-admin-permissions');
  const banner=await(await expect(jarA,'/estrutura/dimensoes-financeiras',200)).text();ok(banner.includes('Acesso temporário de suporte')&&banner.includes('Somente leitura')&&banner.includes('Expira:'),'support-ssr-banner-tenant-scope-level-expiration');
  for(const [path,method] of [['/api/categorias','POST'],['/api/empresa','GET'],['/api/lancamentos','GET'],['/api/fluxo-caixa/resumo','GET'],['/api/estrutura-financeira/exportar','GET'],['/api/backups','GET'],['/api/backups','POST'],['/api/usuarios','GET'],['/api/access/profiles','GET'],['/api/access/memberships','POST'],['/api/terms/accept','POST'],['/api/platform/tenants/'+tenant+'/owners','POST']])await expect(jarA,path,403,method,method==='GET'?undefined:{});
  ok(true,'readonly-writes-outside-module-finance-export-admin-owner-terms-backup-denied');
  await expect(jarA,'/api/categorias',403,'POST',{}, {'x-10s-request-path':'/api/access/context','x-10s-request-method':'GET'});ok(true,'forged-routing-headers-do-not-authorize');
  await enter(jarA,readA,403,other);ok(true,'wrong-tenant-switch-denied');
  const readB=await create(jarB);await decision(readB,'approve');await enter(jarB,readB);
  const forged=new Map(jarA);forged.set('support_context',`${a.id}:${aSession.loginNonce}:${readB.id}`);await expect(forged,'/api/categorias',403);ok(true,'wrong-technician-cookie-denied');
  const memberContext=new Map(businessAdmin.jar);memberContext.set('support_context',`${businessAdmin.identityId}:${businessAdmin.user.loginNonce}:${readA.id}`);await expect(memberContext,'/api/access/context',403);ok(true,'support-context-never-silently-falls-back-to-valid-business-membership');
  const paForged=new Map(adminJar);paForged.set('support_context',`${admin.identity_id}:${paSession.loginNonce}:${readA.id}`);await expect(paForged,'/api/platform/tenants',403);ok(true,'support-context-cannot-bypass-into-global-administration');
  await prisma.supportOperator.update({where:{id:opA.id},data:{status:'INACTIVE'}});await expect(jarA,'/api/categorias',403);await prisma.supportOperator.update({where:{id:opA.id},data:{status:'ACTIVE'}});ok(true,'operator-inactivation-blocks-existing-session');
  await prisma.authIdentity.update({where:{id:a.id},data:{status:'INACTIVE'}});await expect(jarA,'/api/categorias',401);await prisma.authIdentity.update({where:{id:a.id},data:{status:'ACTIVE'}});ok(true,'identity-inactivation-blocks-existing-session');
  const original=await prisma.supportGrant.findUnique({where:{id:readA.id}});
  await prisma.supportGrant.update({where:{id:readA.id},data:{startsAt:new Date(Date.now()+60000),expiresAt:new Date(Date.now()+120000)}});await expect(jarA,'/api/categorias',403);
  await prisma.supportGrant.update({where:{id:readA.id},data:{startsAt:original.startsAt,expiresAt:original.expiresAt}});ok(true,'grant-future-window-denied');
  await prisma.supportGrant.update({where:{id:readA.id},data:{startsAt:new Date(Date.now()-120000),expiresAt:new Date(Date.now()-60000)}});await expect(jarA,'/api/categorias',403);await expect(jarA,'/api/tenants',200);assert.equal((await prisma.supportGrant.findUnique({where:{id:readA.id}})).status,'EXPIRED');ok(true,'expired-grant-denied-and-expiration-audited');
  const operational=await create(jarA,tenant,'OPERATIONAL');await decision(operational,'approve');await enter(jarA,operational);
  const used=new Set((await q('SELECT codigo FROM categorias WHERE tenant_id=$1',[tenant])).map(r=>r.codigo));const codes=[];for(let n=99;n>=0&&codes.length<2;n--){const c=String(n).padStart(2,'0');if(!used.has(c))codes.push(c);}assert.equal(codes.length,2);
  const category=await(await expect(jarA,'/api/categorias',201,'POST',{codigo:codes[0],nome:'F93 SYNTHETIC OPERATIONAL'})).json();
  await expect(jarA,'/api/categorias/'+category.id,200,'PUT',{nome:'F93 SYNTHETIC EDITED'});ok(true,'explicit-operational-grant-permits-real-create-and-edit');
  await expect(jarA,'/api/categorias/'+category.id,403,'DELETE');await expect(jarA,'/api/estrutura-financeira/exportar',403);await expect(jarA,'/api/backups',403);ok(true,'operational-still-denies-delete-export-and-backup');
  const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['CODIGO_CATEGORIA','DESCRICAO_CATEGORIA'],[codes[1],'F93 SYNTHETIC IMPORT']]),'CATEGORIAS_N1');XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['CODIGO_CONTA','DESCRICAO_CONTA','CODIGO_CATEGORIA','TIPO_CONTA']]),'CONTAS_N2');const bytes=XLSX.write(book,{type:'buffer',bookType:'xlsx'});
  const form=(mode,token)=>{const f=new FormData();f.set('mode',mode);f.set('file',new Blob([bytes]),'F93-synthetic.xlsx');if(token)f.set('previewToken',token);return f;};
  await expect(jarB,'/api/estrutura-financeira/importar',403,'POST',form('preview'));let r=await expect(jarA,'/api/estrutura-financeira/importar',200,'POST',form('preview'));const preview=await r.json();r=await expect(jarA,'/api/estrutura-financeira/importar',200,'POST',form('confirm',preview.previewToken));assert.equal((await r.json()).state,'COMPLETED');assert.equal(await prisma.categoria.count({where:{tenantId:tenant,codigo:codes[1]}}),1);ok(true,'operational-real-import-approved-readonly-import-denied');
  // Personal consent is a neutral self-service, never acceptance for a customer.
  const pdf=Buffer.from('%PDF-SYNTHETIC-PERSONAL-TERM'),key=id()+'.pdf';await fs.writeFile('/private/phase91/terms/'+key,pdf,{mode:0o600});await fs.chown('/private/phase91/terms/'+key,1001,1001);
  const personal=await prisma.termDocument.create({data:{code:'F93-PERSONAL-'+id(),audience:'USUARIO',required:false}}),contract=await prisma.termDocument.create({data:{code:'F93-CONTRACT-'+id(),audience:'CONTRATANTE',required:false}});
  const termData={version:'1',title:'F93 SYNTHETIC',storageKey:key,mimeType:'application/pdf',byteSize:pdf.length,sha256:crypto.createHash('sha256').update(pdf).digest('hex'),status:'PUBLISHED',publishedAt:new Date(),publishedByIdentityId:admin.identity_id};
  const term=await prisma.termVersion.create({data:{...termData,documentId:personal.id}}),contractTerm=await prisma.termVersion.create({data:{...termData,storageKey:id()+'.pdf',documentId:contract.id}});
  await expect(jarA,'/api/support/terms',403,'POST',{versionId:contractTerm.id,agreed:true,tenantId:tenant});await expect(jarA,'/api/support/terms/'+contractTerm.id,404);
  await expect(jarA,'/api/support/terms',200,'POST',{versionId:term.id,agreed:true,identityId:b.id,tenantId:tenant});await expect(jarA,'/api/support/terms/'+term.id,200);
  const consent=await prisma.termAcceptance.findMany({where:{termVersionId:term.id}});ok(consent.length===1&&consent[0].identityId===a.id&&consent[0].tenantId===null&&consent[0].membershipId===null,'only-own-personal-consent-no-client-or-other-identity-consent');
  await prisma.termDocument.update({where:{id:personal.id},data:{required:true}});const pending=await(await expect(jarB,'/api/support/terms',200)).json();assert(pending.pending.some(t=>t.versionId===term.id));await expect(jarB,'/api/support/terms',200,'POST',{versionId:term.id,agreed:true});await prisma.termDocument.update({where:{id:personal.id},data:{required:false}});ok(true,'personal-consent-pending-and-self-service-work-without-membership');
  await decision(operational,'revoke');await expect(jarA,'/api/categorias',403);assert((await(await expect(jarA,'/api/auth/session',200)).json()).user);ok(true,'real-revocation-during-live-session-next-request-denied');
  const activeA=await create(jarA,tenant,'OPERATIONAL');await decision(activeA,'approve');await enter(jarA,activeA);const pendingA=await create(jarA,other);
  const wrongMember=(await q('SELECT id FROM tenant_memberships ORDER BY id LIMIT 1'))[0].id;
  await expect(adminJar,'/api/platform/support-operators/'+opA.id,409,'PATCH',{action:'deactivate',reason:'F93 invalid unrelated DEV relationship',devMembershipIds:[wrongMember]});assert.equal((await prisma.supportOperator.findUnique({where:{id:opA.id}})).status,'ACTIVE');assert.equal((await prisma.supportGrant.findUnique({where:{id:activeA.id}})).status,'ACTIVE');ok(true,'offboarding-invalid-membership-rolls-back-before-changes');
  const disabled=await(await expect(adminJar,'/api/platform/support-operators/'+opA.id,200,'PATCH',{action:'deactivate',reason:'F93 controlled synthetic operator offboarding'})).json();ok(disabled.revokedGrants===2&&disabled.devMembershipsDisabled===0,'offboarding-revokes-active-and-pending-atomically');
  for(const g of [activeA,pendingA])assert.equal((await prisma.supportGrant.findUnique({where:{id:g.id}})).status,'REVOKED');
  await expect(jarA,'/api/categorias',403);await expect(jarA,'/api/support-grants',403,'POST',{});await expect(jarB,'/api/categorias',200);assert.equal((await prisma.supportOperator.findUnique({where:{id:opB.id}})).status,'ACTIVE');ok(true,'offboarding-invalidates-current-context-without-affecting-operator-B');
  await expect(jarA,'/api/support/context',403,'POST',{}, {Origin:'http://invalid.example'});
  const leave=await(await expect(jarA,'/api/support/context',200,'POST',{})).json();assert.equal(leave.cleared,true);assert.equal(jarA.get('support_context'),'');ok(true,'inactive-operator-explicit-leave-works-cross-origin-denied');
  assert.equal(await hash('tenant_memberships'),membershipBefore);assert.equal(await hash('usuarios'),usersBefore);assert.equal(await hash('legacy_user_access_maps'),mapsBefore);assert.equal(await hash('platform_admins'),adminsBefore);ok(true,'no-membership-legacy-user-mapping-or-platformadmin-created');
  assert.deepEqual(await neighbors(),neighborBefore);ok(true,'all-neighbor-business-digests-unchanged');
  assert.equal(await hash('audit_events','WHERE id=ANY($1::text[])',[oldAudits.map(r=>r.id)]),oldAuditHash);ok(true,'historical-audit-preserved');
  const audit=await prisma.auditEvent.findMany({where:{actorIdentityId:{in:[a.id,b.id]}}});const actions=new Set(audit.map(e=>e.action));for(const action of ['SUPPORT_REQUESTED','SUPPORT_CONTEXT_ENTERED','SUPPORT_ACTION_EXECUTED','SUPPORT_ACTION_AUTHORIZED','SUPPORT_ACTION_DENIED','SUPPORT_CONTEXT_DENIED'])assert(actions.has(action));assert(audit.every(e=>!/password|senha|secret|token|cookie|credential/i.test(JSON.stringify(e.metadata??{})+JSON.stringify(e.changes??{}))));ok(true,'technical-audit-correlation-and-safe-metadata');
  const off=await prisma.auditEvent.findMany({where:{resourceId:opA.id,action:'SUPPORT_OPERATOR_DISABLED'}});ok(off.length===1&&off[0].changes?.after?.status==='INACTIVE','offboarding-audited-with-status-and-counts');
  // Keep fixtures/history; retire test terms so subsequent historical regression is unaffected.
  await prisma.termVersion.updateMany({where:{id:{in:[term.id,contractTerm.id]}},data:{status:'RETIRED'}});
  console.log(JSON.stringify({state:'PASSED',checks:checks.length,results:checks,syntheticOperators:2,realHumanOperatorsProvisioned:0,newMemberships:0,realHTTP:true,ledger:19,productionOrHomologTouched:false}));
 }finally{await prisma.$disconnect();await pool.end();}
}
main().catch(e=>{console.log(JSON.stringify({state:'STOPPED',code:e.code??e.name,check:e.code==='ERR_ASSERTION'?String(e.message).split('\n')[0]:undefined,completed:checks}));process.exitCode=1;});
