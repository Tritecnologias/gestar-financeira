// Real HTTP + Prisma + PostgreSQL. Explicit synthetic-only LOCAL/HOMOLOG allowlist.
const assert = require('node:assert/strict');
const {randomUUID, randomBytes, createHash} = require('node:crypto');
const bcrypt = require('bcryptjs');
const {PrismaClient} = require('@prisma/client');
const {PrismaPg} = require('@prisma/adapter-pg');

async function main() {
 let raw=''; for await (const s of process.stdin) raw+=s;
 const cfg=JSON.parse(raw); raw='';
 const url=new URL(process.env.DATABASE_URL), local=cfg.environment==='LOCAL';
 assert(local ? url.hostname==='127.0.0.1' && url.port==='55432' && url.pathname==='/gestar_vf_dev' && cfg.base==='http://localhost:3020' :
  cfg.environment==='HOMOLOG' && url.hostname==='0f5rvkjqjdt9fez1ajiascyk' && url.pathname==='/gestar_homolog_pg18' && cfg.base==='https://homolog.dezsolucoes.com.br');
 const p=new PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});
 const base=cfg.base, suffix=randomUUID().slice(0,8), checks=[], ids=[], tids=[], tokens=[];
 let step='guard', pa;
 const check=(name,value)=>{step=name; assert(value); checks.push(name);};
 async function q(j,path,method='GET',body,origin=base,extraHeaders={}) {
  const r=await fetch(base+path,{method,redirect:'manual',headers:{Origin:origin,...extraHeaders,Cookie:[...j].map(([k,v])=>k+'='+v).join('; '),
   ...(body===undefined?{}:{'Content-Type':body instanceof URLSearchParams?'application/x-www-form-urlencoded':'application/json'})},
   ...(body===undefined?{}:{body:body instanceof URLSearchParams?body:JSON.stringify(body)})});
  for(const c of r.headers.getSetCookie()){const pair=c.split(';')[0],i=pair.indexOf('=');j.set(pair.slice(0,i),pair.slice(i+1));}
  const result={status:r.status,headers:r.headers,body:r.headers.get('content-type')?.includes('json')?await r.json():await r.text()};
  return result;
 }
 async function login(email) {
  const j=new Map(),c=await q(j,'/api/auth/csrf');
  const callback=await q(j,'/api/auth/callback/credentials','POST',new URLSearchParams({csrfToken:c.body.csrfToken,email,password:cfg.password,callbackUrl:base+'/inicio'}));
  check('login not throttled',callback.status!==429);
  check('synthetic login',!!(await q(j,'/api/auth/session')).body?.user);return j;
 }
 async function switchTo(w,t){check('own context selected',(await q(w.j,'/api/tenants/switch','POST',{tenantId:t.id})).status===200);}
 async function state(w){return (await q(w.j,'/api/onboarding/contractual')).body;}
 async function action(w,body){return q(w.j,'/api/onboarding/contractual','POST',body);}
 async function terms(w,audience){const r=await q(w.j,'/api/terms/pending');check('terms readable during gate',r.status===200);for(const doc of r.body.pending.filter(x=>x.audience===audience&&x.actionable))check('explicit synthetic '+audience+' acceptance',(await q(w.j,'/api/terms/accept','POST',{versionId:doc.versionId,agreed:true})).status===200);if(audience==='USUARIO'){const m=await p.tenantMembership.findUniqueOrThrow({where:{id:w.m.id}});if((await p.tenant.findUniqueOrThrow({where:{id:m.tenantId}})).escolhaModalidadePendente)check('OWNER explicitly selects PF before contracting',(await q(w.j,'/api/onboarding/modalidade','POST',{modalidade:'PF'})).status===200);}}
 async function blocked(w){for(const path of ['/api/lancamentos','/api/plano-contas','/api/tarefas','/api/fluxo-caixa/resumo'])check('business gate '+path,(await q(w.j,path)).status===428);}
 async function active(w){check('contract ACTIVE',(await state(w)).status==='ACTIVE');check('business unlocked next request',(await q(w.j,'/api/lancamentos')).status===200);}
 function link(r){check('one-shot manual delivery',r.body.share?.link?.startsWith(base+'/ativar-acesso#token='));const token=new URL(r.body.share.link).hash.slice(7);tokens.push(token);return {id:r.body.id,token};}
 async function tenant(label){const t=await p.tenant.create({data:{nome:'MODO DEV FASE12A '+label+' '+suffix,slug:'p12a-'+label+'-'+suffix,email:'p12a-'+label+'-'+suffix+'@example.invalid'}});tids.push(t.id);return t;}
 async function owner(t,label){const email='p12a-'+label+'-'+suffix+'@example.invalid';const r=await q(pa.j,'/api/platform/tenants/'+t.id+'/owner-invitations','POST',{nome:'PROPRIETÁRIO SINTÉTICO '+label,email,confirm:true,channel:'MANUAL_SHARE'});check('official OWNER invitation',r.status===201);const i=link(r);check('official OWNER activation',(await q(new Map(),'/api/access/invitations/accept','POST',{token:i.token,password:cfg.password})).status===200);const a=await p.authIdentity.findUniqueOrThrow({where:{email}});ids.push(a.id);const m=await p.tenantMembership.findUniqueOrThrow({where:{identityId_tenantId:{identityId:a.id,tenantId:t.id}}});const w={a,m,j:await login(email)};await switchTo(w,t);return w;}
 async function existingOwner(t,who){const r=await q(pa.j,'/api/platform/tenants/'+t.id+'/owner-invitations','POST',{nome:who.a.nome,email:who.a.email,confirm:true,channel:'MANUAL_SHARE'});check('existing OWNER official invitation',r.status===201);const i=link(r),j=new Map(who.j);check('existing OWNER joins with own session',(await q(j,'/api/access/invitations/accept','POST',{token:i.token})).status===200);const m=await p.tenantMembership.findUniqueOrThrow({where:{identityId_tenantId:{identityId:who.a.id,tenantId:t.id}}});const w={a:who.a,m,j};await switchTo(w,t);return w;}
 async function nomination(w,label,email){email??='p12a-'+label+'-'+suffix+'@example.invalid';const r=await action(w,{action:'other',nome:'INDICADO SINTÉTICO '+label,email});check('OTHER invitation created',r.status===201);const i=link(r);return {...i,email};}
 async function memberPending(t){const email='p12a-member-'+suffix+'@example.invalid',token=randomBytes(32).toString('base64url');tokens.push(token);const profile=await p.accessProfile.create({data:{tenantId:t.id,nome:'CONSULTA 12A '+suffix,permissoes:['fluxo.lancamentos.view']}});await p.accessInvite.create({data:{tenantId:t.id,email,name:'MEMBRO SINTÉTICO PRÉ-CONVIDADO',role:'MEMBER',profileId:profile.id,tokenHash:createHash('sha256').update(token).digest('hex'),invitedByIdentityId:pa.a.id,expiresAt:new Date(Date.now()+3600000)}});check('pending MEMBER activates during gate',(await q(new Map(),'/api/access/invitations/accept','POST',{token,password:cfg.password})).status===200);const a=await p.authIdentity.findUniqueOrThrow({where:{email}});ids.push(a.id);const m=await p.tenantMembership.findUniqueOrThrow({where:{identityId_tenantId:{identityId:a.id,tenantId:t.id}}});const w={a,m,j:await login(email)};await switchTo(w,t);return w;}
 try {
  check('exact completed ledger',(await p.$queryRaw`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`).length===(cfg.expectedMigrationCount??3));
  if(local) {
   const [acl]=await p.$queryRaw`SELECT current_user AS role, has_table_privilege(current_user,'tenant_contractual_responsibles','DELETE') AS delete,
     has_table_privilege(current_user,'tenant_contractual_responsibles','UPDATE') AS update,
     has_table_privilege(current_user,'term_acceptances','DELETE') AS receipt_delete,
     has_table_privilege(current_user,'term_acceptances','UPDATE') AS receipt_update,
     has_table_privilege(current_user,'audit_events','DELETE') AS audit_delete,
     has_table_privilege(current_user,'audit_events','UPDATE') AS audit_update`;
   check('restricted runtime has UPDATE but no responsible DELETE or evidence mutation',acl.role==='pg18_prod_runtime'&&acl.update&&!acl.delete&&!acl.receipt_delete&&!acl.receipt_update&&!acl.audit_delete&&!acl.audit_update);
  }
  if(cfg.baseline){step='existing tenant unchanged';const f=cfg.baseline.fixture,t={id:f.tenantId};const proof={tenant:await p.tenant.findUniqueOrThrow({where:{id:t.id}}),responsible:await p.tenantContractualResponsible.findUniqueOrThrow({where:{tenantId:t.id}}),memberships:await p.tenantMembership.findMany({where:{tenantId:t.id}}),acceptances:await p.termAcceptance.findMany({where:{identityId:f.ownerId}})};
   const oldProof=structuredClone(cfg.baseline.proof),currentProof=JSON.parse(JSON.stringify(proof));for(const key of ['memberships','acceptances']){oldProof[key].sort((a,b)=>a.id.localeCompare(b.id));currentProof[key].sort((a,b)=>a.id.localeCompare(b.id));}
   assert.deepEqual(currentProof,oldProof);check('pre-migration tenant links and receipts byte-equivalent',true);check('no backfill onboarding row',await p.tenantContractualOnboarding.count({where:{tenantId:t.id}})===0);const old={j:await login(f.ownerEmail)};await switchTo(old,t);await active(old);
  }
  const a=await p.authIdentity.create({data:{email:'p12a-pa-'+suffix+'@example.invalid',nome:'PLATAFORMA SINTÉTICA 12A',senhaHash:await bcrypt.hash(cfg.password,12)}});ids.push(a.id);await p.platformAdmin.create({data:{identityId:a.id}});pa={a,j:await login(a.email)};
  check('anonymous onboarding denied',(await q(new Map(),'/api/onboarding/contractual')).status===401);
  check('PA no implicit business or nomination',(await action(pa,{action:'self'})).status===403);
  const ta=await tenant('self'),wa=await owner(ta,'self');
  check('user terms first',(await state(wa)).status==='USER_TERMS_REQUIRED');check('SELF cannot skip user acceptance',(await action(wa,{action:'self'})).status===428);
  await blocked(wa);await terms(wa,'USUARIO');
  check('explicit SELF chooser',(await state(wa)).canChoose===true);
  check('foreign origin rejected',(await q(wa.j,'/api/onboarding/contractual','POST',{action:'self'},'https://evil.invalid')).status===403);
  check('forged tenant input rejected',(await action(wa,{action:'self',tenantId:randomUUID()})).status===400);
  check('SELF assigns current active OWNER',(await action(wa,{action:'self'})).status===200);
  check('SELF assignment exact',(await p.tenantContractualResponsible.findUniqueOrThrow({where:{tenantId:ta.id}})).membershipId===wa.m.id);
  check('SELF awaiting real contract receipt',(await state(wa)).status==='AWAITING_CONTRACT');await blocked(wa);
  check('own provisional SELF exposes return',(await state(wa)).canReturnToChoice===true);
  check('anonymous return denied',(await q(new Map(),'/api/onboarding/contractual','POST',{action:'back'})).status===401);
  check('PA cannot reopen a business choice',(await action(pa,{action:'back'})).status===403);
  check('cross-origin return denied',(await q(wa.j,'/api/onboarding/contractual','POST',{action:'back'},'https://evil.invalid')).status===403);
  check('forged tenant return denied',(await action(wa,{action:'back',tenantId:randomUUID()})).status===400);
  const membershipsBefore=await p.tenantMembership.count(),identitiesBefore=await p.authIdentity.count();
  const provisionalBefore=await p.tenantContractualResponsible.findUniqueOrThrow({where:{tenantId:ta.id}});
  const staleContract=(await q(wa.j,'/api/terms/pending')).body.pending.find(x=>x.audience==='CONTRATANTE'&&x.actionable);
  check('provisional SELF returns',(await action(wa,{action:'back'})).status===200);
  assert.deepEqual(await p.tenantContractualResponsible.findUniqueOrThrow({where:{tenantId:ta.id}}),provisionalBefore);
  check('return preserves exact provisional row without authority',(await state(wa)).canChoose&&!(await state(wa)).canAcceptContract);
  check('stale contract acceptance after return denied',(await q(wa.j,'/api/terms/accept','POST',{versionId:staleContract.versionId,agreed:true})).status===403);
  check('pending contract no longer actionable',(await q(wa.j,'/api/terms/pending')).body.pending.filter(x=>x.audience==='CONTRATANTE').every(x=>!x.actionable));
  check('return creates no acceptance',await p.termAcceptance.count({where:{tenantId:ta.id}})===0);
  check('return grants no access',await p.tenantMembership.count()===membershipsBefore&&await p.authIdentity.count()===identitiesBefore);await blocked(wa);
  const switched=await nomination(wa,'switched-from-self');
  check('SELF to OTHER remains pending',(await state(wa)).status==='AWAITING_RESPONSIBLE');
  check('former SELF cannot accept while OTHER pending',(await q(wa.j,'/api/terms/accept','POST',{versionId:staleContract.versionId,agreed:true})).status===403);
  check('back does not revoke pending OTHER',(await action(wa,{action:'back'})).status===409);
  check('existing explicit revoke returns to chooser',(await action(wa,{action:'revoke'})).status===200&&(await state(wa)).canChoose);
  check('old OTHER link invalidated',(await q(new Map(),'/api/access/invitations/inspect','POST',{token:switched.token})).status===410);
  check('OTHER to SELF allowed before contract',(await action(wa,{action:'self'})).status===200);

  await terms(wa,'CONTRATANTE');await active(wa);
  const sealedCount=await p.termAcceptance.count({where:{tenantId:ta.id}});
  check('formalized contract never exposes return',(await state(wa)).canReturnToChoice===false);
  check('formalized contract cannot reopen',(await action(wa,{action:'back'})).status===409);
  check('formalized receipts remain intact',await p.termAcceptance.count({where:{tenantId:ta.id}})===sealedCount);
  check('SELF repeated idempotently',(await action(wa,{action:'self'})).body.unchanged===true);
  const backup=await q(wa.j,'/api/backups');check('compiled API backup v3 exact ledger',backup.status===200&&backup.body.format==='10s-tenant-backup/3'&&backup.body.migrations.length===(cfg.expectedMigrationCount??3));
  const preview=await q(wa.j,'/api/backups','POST',backup.body);check('compiled API preview',preview.status===200&&preview.body.preview?.currentDigest);
  const beforeAccess=JSON.stringify(await p.tenantContractualOnboarding.findUnique({where:{tenantId:ta.id}})),attempt=randomUUID();
  const restoreHeaders={'x-backup-confirm':ta.id,'x-backup-preview':preview.body.preview.currentDigest,'x-backup-attempt':attempt};
  check('compiled API synthetic restore',(await q(wa.j,'/api/backups?action=restore','POST',backup.body,base,restoreHeaders)).status===200);
  check('compiled API restore replay',(await q(wa.j,'/api/backups?action=restore','POST',backup.body,base,restoreHeaders)).status===200);
  check('compiled API keeps live onboarding',beforeAccess===JSON.stringify(await p.tenantContractualOnboarding.findUnique({where:{tenantId:ta.id}})));await active(wa);
  const oldTenant=await p.tenant.create({data:{nome:'MODO DEV LEGADO UX04 '+suffix,slug:'ux04-old-'+suffix,email:'old@example.invalid',escolhaModalidadePendente:false}});tids.push(oldTenant.id);
  const oldOwner=await owner(oldTenant,'legacy-unclassified');await terms(oldOwner,'USUARIO');
  check('legacy unclassified can continue without forced modality',(await action(oldOwner,{action:'self'})).status===200);await terms(oldOwner,'CONTRATANTE');await active(oldOwner);
  check('legacy remains unclassified',(await p.tenant.findUniqueOrThrow({where:{id:oldTenant.id}})).modalidade===null);
  check('legacy cannot be silently classified',(await q(oldOwner.j,'/api/onboarding/modalidade','POST',{modalidade:'PJ'})).status===409);
  check('existing PF cannot be reclassified',(await q(wa.j,'/api/onboarding/modalidade','POST',{modalidade:'PJ'})).status===409);
  const tb=await tenant('other'),wb=await owner(tb,'other');await terms(wb,'USUARIO');const other=await nomination(wb,'nominee');
  check('explicit pending association',(await p.tenantContractualOnboarding.findUniqueOrThrow({where:{tenantId:tb.id}})).invitationId===other.id);
  check('nomination creates no identity or access',await p.authIdentity.count({where:{email:other.email}})===0&&await p.tenantMembership.count({where:{tenantId:tb.id}})===1);
  check('creator waiting not operational',(await state(wb)).status==='AWAITING_RESPONSIBLE');await blocked(wb);
  check('GET never recovers invitation link',!JSON.stringify(await state(wb)).includes(other.token));
  const wm=await memberPending(tb);await terms(wm,'USUARIO');await blocked(wm);check('MEMBER cannot self-assign',(await action(wm,{action:'self'})).status===403);check('MEMBER cannot nominate',(await action(wm,{action:'other',nome:'X',email:'x@example.invalid'})).status===403);
  check('MEMBER return denied',(await action(wm,{action:'back'})).status===403);check('MEMBER receives no nominee PII',(await state(wm)).invitation===null);
  check('nominee activates',(await q(new Map(),'/api/access/invitations/accept','POST',{token:other.token,password:cfg.password})).status===200);
  const an=await p.authIdentity.findUniqueOrThrow({where:{email:other.email}});ids.push(an.id);const mn=await p.tenantMembership.findUniqueOrThrow({where:{identityId_tenantId:{identityId:an.id,tenantId:tb.id}}});const wn={a:an,m:mn,j:await login(other.email)};await switchTo(wn,tb);
  check('nominee OWNER but no premature designation',mn.role==='OWNER'&&await p.tenantContractualResponsible.count({where:{tenantId:tb.id}})===0);
  await terms(wn,'USUARIO');check('nominee auto-designated without chooser',(await p.tenantContractualResponsible.findUniqueOrThrow({where:{tenantId:tb.id}})).membershipId===mn.id&&(await state(wn)).canAcceptContract===true);
  check('nominee cannot undo explicit OTHER designation',(await action(wn,{action:'back'})).status===409&&(await state(wn)).canReturnToChoice===false);check('creator cannot sign for nominee',(await q(wb.j,'/api/terms/accept','POST',{versionId:(await q(wn.j,'/api/terms/pending')).body.pending.find(x=>x.audience==='CONTRATANTE').versionId,agreed:true})).status===403);
  await blocked(wm);await terms(wn,'CONTRATANTE');await active(wn);await active(wb);await active(wm);
  check('restricted MEMBER no administrative access',(await q(wm.j,'/api/access/invitations')).status===403);
  const tc=await tenant('existing'),wc=await existingOwner(tc,wb);await terms(wc,'USUARIO');
  check('retained SELF set before nominee reassignment',(await action(wc,{action:'self'})).status===200);
  const retained=await p.tenantContractualResponsible.findUniqueOrThrow({where:{tenantId:tc.id}});
  check('retained SELF reopened before nominee reassignment',(await action(wc,{action:'back'})).status===200);
  const existing=await nomination(wc,'existing-nominee',wa.a.email);
  assert.deepEqual(await p.tenantContractualResponsible.findUniqueOrThrow({where:{tenantId:tc.id}}),retained);
  check('pending OTHER cannot regain retained SELF authority',!(await state(wc)).canAcceptContract&&(await state(wc)).status==='AWAITING_RESPONSIBLE');
  const countBefore=await p.authIdentity.count({where:{email:wa.a.email}}),hashBefore=(await p.authIdentity.findUniqueOrThrow({where:{id:wa.a.id}})).senhaHash;
  check('existing identity requires own session',(await q(new Map(),'/api/access/invitations/accept','POST',{token:existing.token})).status===403);
  check('existing identity accepts own nomination',(await q(wa.j,'/api/access/invitations/accept','POST',{token:existing.token})).status===200);
  const existingMember=await p.tenantMembership.findUniqueOrThrow({where:{identityId_tenantId:{identityId:wa.a.id,tenantId:tc.id}}});await switchTo(wa,tc);
  check('existing identity not duplicated or credential reset',await p.authIdentity.count({where:{email:wa.a.email}})===countBefore&&(await p.authIdentity.findUniqueOrThrow({where:{id:wa.a.id}})).senhaHash===hashBefore);
  check('accepted global user term resolves at activation',(await p.tenantContractualResponsible.findUniqueOrThrow({where:{tenantId:tc.id}})).membershipId===existingMember.id);
  check('contract scoped to new tenant',(await state(wa)).status==='AWAITING_CONTRACT');await terms(wa,'CONTRATANTE');await active(wa);await switchTo(wa,ta);await active(wa);
  const td=await tenant('revocation'),wd=await owner(td,'revocation');await terms(wd,'USUARIO');const revoked=await nomination(wd,'revoke');check('nomination revoke succeeds',(await action(wd,{action:'revoke'})).status===200);
  check('revoked token rejected by generic activation 404',(await q(new Map(),'/api/access/invitations/accept','POST',{token:revoked.token,password:cfg.password})).status===404);
  check('revoked cannot designate',await p.tenantContractualResponsible.count({where:{tenantId:td.id}})===0);
  const exp=await nomination(wd,'expired');await p.accessInvite.update({where:{id:exp.id},data:{expiresAt:new Date(Date.now()-1000)}});
  check('expired token rejected by generic activation 404',(await q(new Map(),'/api/access/invitations/accept','POST',{token:exp.token,password:cfg.password})).status===404);
  const rr=await action(wd,{action:'resend'});check('reissue succeeds',rr.status===200);const reissued=link(rr);
  check('reissue updates explicit association',(await p.tenantContractualOnboarding.findUniqueOrThrow({where:{tenantId:td.id}})).invitationId===reissued.id);
  check('old token invalid after reissue',(await q(new Map(),'/api/access/invitations/inspect','POST',{token:exp.token})).status===410);
  const rr2=await q(pa.j,'/api/platform/tenants/'+td.id+'/owner-invitations','POST',{action:'resend',inviteId:reissued.id,channel:'MANUAL_SHARE'});check('PA contingency reissue integrated',rr2.status===200);const ri2=link(rr2);check('PA reissue retains explicit intent',(await p.tenantContractualOnboarding.findUniqueOrThrow({where:{tenantId:td.id}})).invitationId===ri2.id);
  check('PA contingency revoke integrated',(await q(pa.j,'/api/platform/tenants/'+td.id+'/owner-invitations','POST',{action:'revoke',inviteId:ri2.id})).status===200&&(await p.tenantContractualOnboarding.findUniqueOrThrow({where:{tenantId:td.id}})).status==='CANCELLED');
  await blocked(wd);
  const tf=await tenant('race'),w1=await existingOwner(tf,wa),w2=await existingOwner(tf,wb);await terms(w1,'USUARIO');await terms(w2,'USUARIO');
  const race=await Promise.all([action(w1,{action:'self'}),action(w2,{action:'self'})]);check('concurrent choices one winner and one conflict',race.filter(x=>x.status===200).length===1&&race.filter(x=>x.status===409).length===1);
  check('one responsible after race',await p.tenantContractualResponsible.count({where:{tenantId:tf.id}})===1);
  const winning=(await p.tenantContractualResponsible.findUniqueOrThrow({where:{tenantId:tf.id}})).membershipId===w1.m.id?w1:w2,losing=winning===w1?w2:w1;
  check('different OWNER cannot undo SELF',(await action(losing,{action:'back'})).status===409);
  const doc=(await q(winning.j,'/api/terms/pending')).body.pending.find(t=>t.audience==='CONTRATANTE'&&t.actionable);
  const sealRace=await Promise.all([action(winning,{action:'back'}),q(winning.j,'/api/terms/accept','POST',{versionId:doc.versionId,agreed:true})]);
  check('return versus acceptance serializes',sealRace.filter(r=>r.status===200).length===1&&sealRace.every(r=>[200,403,409].includes(r.status)));
  const raceReceipts=await p.termAcceptance.count({where:{tenantId:tf.id}}),raceResponsible=await p.tenantContractualResponsible.count({where:{tenantId:tf.id}});
  check('race preserves evidence or safely reopens',raceResponsible===1&&(raceReceipts===1?!(await state(winning)).canReturnToChoice:(await state(winning)).canChoose));
  if(!raceReceipts)check('race fixture reassigned before FK proof',(await action(winning,{action:'self'})).status===200);

  await assert.rejects(p.tenantContractualOnboarding.update({where:{tenantId:tf.id},data:{assignedMembershipId:wa.m.id}}));check('database composite FK rejects cross-tenant assignee',true);
  await assert.rejects(p.tenantContractualOnboarding.update({where:{tenantId:td.id},data:{invitationId:other.id}}));check('database composite FK rejects cross-tenant invitation',true);
  check('cross-tenant switch denied',(await q(wd.j,'/api/tenants/switch','POST',{tenantId:tb.id})).status===403);
  await p.tenantMembership.update({where:{id:mn.id},data:{status:'INACTIVE'}});await blocked(wb);check('revoked responsible blocks next member request',(await q(wm.j,'/api/lancamentos')).status===428);check('inactive OWNER context revoked before nomination',(await action(wn,{action:'self'})).status===409);await p.tenantMembership.update({where:{id:mn.id},data:{status:'ACTIVE'}});await active(wm);
  await p.authIdentity.update({where:{id:an.id},data:{status:'INACTIVE'}});await blocked(wb);await p.authIdentity.update({where:{id:an.id},data:{status:'ACTIVE'}});await active(wb);
  await p.tenant.update({where:{id:tb.id},data:{ativo:false}});check('inactive tenant context revoked',(await q(wb.j,'/api/lancamentos')).status===409);await p.tenant.update({where:{id:tb.id},data:{ativo:true}});
  check('PA manual contingency retained',(await q(pa.j,'/api/platform/tenants/'+td.id+'/contractual-responsible','POST',{membershipId:wd.m.id,confirm:true})).status===200);check('contingency fabricates no acceptance',await p.termAcceptance.count({where:{tenantId:td.id}})===0);await blocked(wd);
  check('manual designation is not reopened as provisional SELF',(await action(wd,{action:'back'})).status===409);
  await switchTo(wc,tc); // A fresh, unrelated tenant remains active while another choice changes.
  const neighborBefore=JSON.stringify({responsible:await p.tenantContractualResponsible.findUnique({where:{tenantId:ta.id}}),choice:await p.tenantContractualOnboarding.findUnique({where:{tenantId:ta.id}}),receipts:await p.termAcceptance.findMany({where:{tenantId:ta.id},orderBy:{id:'asc'}})});
  check('active nominee context cannot reopen another tenant via payload',(await action(wc,{action:'back',tenantId:ta.id})).status===400);
  check('unrelated tenant authority and evidence unchanged',neighborBefore===JSON.stringify({responsible:await p.tenantContractualResponsible.findUnique({where:{tenantId:ta.id}}),choice:await p.tenantContractualOnboarding.findUnique({where:{tenantId:ta.id}}),receipts:await p.termAcceptance.findMany({where:{tenantId:ta.id},orderBy:{id:'asc'}})}));
  // Reusing the same OWNER through the administrative contingency must explicitly
  // replace a cancelled marker, rather than falsely treating its row as current.
  await switchTo(wd,td);
  const tg=await tenant('manual-after-return'),wg=await existingOwner(tg,wd);await terms(wg,'USUARIO');
  check('SELF before administrative contingency',(await action(wg,{action:'self'})).status===200);
  check('return before administrative contingency',(await action(wg,{action:'back'})).status===200);
  check('PA can explicitly designate retained same OWNER',(await q(pa.j,'/api/platform/tenants/'+tg.id+'/contractual-responsible','POST',{membershipId:wg.m.id,confirm:true})).body.unchanged===false);
  check('administrative designation remains current and cannot reopen',(await state(wg)).canAcceptContract&&(await action(wg,{action:'back'})).status===409);
  if(local)check('runtime still has no responsible DELETE',(await p.$queryRaw`SELECT NOT has_table_privilege(current_user,'tenant_contractual_responsibles','DELETE') AS ok`)[0].ok);
  const platform=await q(pa.j,'/api/platform/tenants');check('platform statuses explicit',platform.status===200&&JSON.stringify(platform.body).includes('Contrato ativo')&&JSON.stringify(platform.body).includes('Aguardando aceite'));
  const events=await p.auditEvent.findMany({where:{tenantId:{in:tids}}});const actions=events.map(e=>e.action);
  for(const name of ['CONTRACTUAL_CHOICE_REOPENED','CONTRACTUAL_ONBOARDING_STARTED','CONTRACTUAL_SELF_SELECTED','CONTRACTUAL_PERSON_NOMINATED','CONTRACTUAL_INVITE_CREATED','CONTRACTUAL_INVITE_REISSUED','CONTRACTUAL_INVITE_REVOKED','CONTRACTUAL_RESPONSIBLE_ASSIGNED','TERM_ACCEPTED','CONTRACTUAL_TENANT_RELEASED'])check('append-only audit '+name,actions.includes(name));
  const stored=JSON.stringify(events)+JSON.stringify(await p.accessInvite.findMany({where:{tenantId:{in:tids}}}))+JSON.stringify(await p.tenantContractualOnboarding.findMany({where:{tenantId:{in:tids}}}));
  check('no raw token persisted',tokens.every(token=>!stored.includes(token)));
  check('no email sent in manual flow',!events.some(e=>e.action.startsWith('INVITE_EMAIL_')));
  console.log(JSON.stringify({state:'CONTRACTUAL_HTTP_PASSED',environment:cfg.environment,checks,syntheticTenants:tids.length,syntheticTenantIds:tids,syntheticIdentityIds:ids,tokenCountChecked:tokens.length,rawSecretsPrinted:false,baselinePreserved:!!cfg.baseline}));
 } catch(e) {console.log(JSON.stringify({state:'CONTRACTUAL_HTTP_FAILED',step,type:e.name,code:e.code,checks,location:e.stack?.split('\n').find(l=>l.includes('/app/tests/')),fetchFailure:e.message==='fetch failed',actual:typeof e.actual==='number'?e.actual:undefined,expected:typeof e.expected==='number'?e.expected:undefined}));process.exitCode=1;}
 finally {
  try{await p.$transaction(async tx=>{await tx.accessInvite.updateMany({where:{tenantId:{in:tids},status:'PENDING'},data:{status:'REVOKED',revokedAt:new Date(),revokedByIdentityId:pa?.a.id}});await tx.tenantMembership.updateMany({where:{tenantId:{in:tids}},data:{status:'INACTIVE'}});await tx.platformAdmin.updateMany({where:{identityId:{in:ids}},data:{status:'INACTIVE'}});await tx.authIdentity.updateMany({where:{id:{in:ids}},data:{status:'INACTIVE'}});await tx.usuario.updateMany({where:{tenantId:{in:tids}},data:{ativo:false}});await tx.tenant.updateMany({where:{id:{in:tids}},data:{ativo:false}});if(pa)await tx.auditEvent.create({data:{actorIdentityId:pa.a.id,accessMode:'SYSTEM',action:'CONTRACTUAL_SYNTHETIC_TEST_CLOSED',resourceType:'TestScenario',result:'SUCCESS',metadata:{tenantsClosed:tids.length}}});});console.log(JSON.stringify({state:'CONTRACTUAL_FIXTURES_CLOSED',syntheticOnly:true,auditRetained:true}));}finally{await p.$disconnect();cfg.password=undefined;}
 }
}
main().catch(e=>{console.log(JSON.stringify({state:'CONTRACTUAL_HTTP_ABORTED',type:e.name,code:e.code}));process.exitCode=1;});
