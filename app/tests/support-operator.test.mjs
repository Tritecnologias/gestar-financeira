import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
registerHooks({resolve(s,c,next){if(c.parentURL&&s.startsWith('.')){const u=new URL(s,c.parentURL);if(!/\.[a-z]+$/.test(u.pathname)&&existsSync(fileURLToPath(u)+'.ts'))s=u.href+'.ts';}return next(s,c);}});
const {supportPermissions,supportRequestAllowed,validSupportModules}=await import('../src/lib/support-policy.ts');
const {authorizedSupportGrant}=await import('../src/lib/support-authorization.ts');
const module='ESTRUTURA_FINANCEIRA',uid='11111111-1111-4111-8111-111111111111';
function state(){return {identity:{id:'tech',status:'ACTIVE',supportOperator:{id:'op',status:'ACTIVE'}},grant:{id:'grant',requesterIdentityId:'tech',tenantId:'tenant',status:'ACTIVE',modules:[module],accessLevel:'READ_ONLY',approvedAt:new Date(),approvedByMembershipId:'owner',startsAt:new Date(Date.now()-1000),expiresAt:new Date(Date.now()+60000),tenant:{ativo:true,contractualResponsible:{membershipId:'owner'}},approver:{id:'owner',tenantId:'tenant',identityId:'someone-else',status:'ACTIVE',role:'OWNER',identity:{status:'ACTIVE'}}}};}
const db=s=>({authIdentity:{findUnique:async()=>s.identity},supportGrant:{findUnique:async()=>s.grant}});

test('explicit operator and current business approval are required independently of PlatformAdmin',async()=>{
 const s=state();await authorizedSupportGrant(db(s),'tech','grant','tenant');
 for(const mutate of [s=>s.identity.supportOperator=null,s=>s.identity.supportOperator.status='INACTIVE',s=>s.identity.status='INACTIVE',s=>s.grant=null,s=>s.grant.requesterIdentityId='other',s=>s.grant.tenantId='other',s=>s.grant.tenant.ativo=false,s=>s.grant.approvedAt=null,s=>s.grant.approvedByMembershipId='other',s=>s.grant.approver=null,s=>s.grant.approver.status='INACTIVE',s=>s.grant.approver.role='ADMIN',s=>s.grant.approver.identity.status='INACTIVE',s=>s.grant.approver.identityId='tech',s=>s.grant.tenant.contractualResponsible=null,s=>s.grant.modules=[],s=>s.grant.accessLevel='UNKNOWN',s=>s.grant.startsAt=new Date(Date.now()+60000),s=>s.grant.expiresAt=new Date(Date.now()-1000)]){
   const bad=state();bad.identity.platformAdmin={status:'ACTIVE'};mutate(bad);await assert.rejects(authorizedSupportGrant(db(bad),'tech','grant','tenant'),{status:403});
 }
 for(const status of ['PENDING','REJECTED','REVOKED','EXPIRED']){const bad=state();bad.grant.status=status;await assert.rejects(authorizedSupportGrant(db(bad),'tech','grant','tenant'),{status:403});}
});

test('READ_ONLY and OPERATIONAL are closed scopes: no export/delete/admin/terms/finance',()=>{
 assert.deepEqual([...supportPermissions([module],'READ_ONLY')],['estrutura.financeiras.view']);
 assert.deepEqual([...supportPermissions([module],'OPERATIONAL')].sort(),['create','edit','import','view'].map(a=>'estrutura.financeiras.'+a).sort());
 for(const level of ['READ_ONLY','OPERATIONAL']){
  assert(supportRequestAllowed('/api/categorias','GET',[module],level));
  for(const [path,method] of [['/api/categorias/'+uid,'DELETE'],['/api/platform/tenants','GET'],['/api/access/context','POST'],['/api/terms/accept','POST'],['/termos/aceite','GET'],['/api/backups','GET'],['/api/backups','POST'],['/api/usuarios','POST'],['/api/access-profiles','GET'],['/api/lancamentos','GET'],['/api/fluxo-caixa/resumo','GET'],['/api/dados-bancarios','GET'],['/api/estrutura-financeira/exportar','GET'],['/api/estrutura-financeira/exportar','POST'],['/api/categorias/unknown/new-action','POST']])assert.equal(supportRequestAllowed(path,method,[module],level),false,path+':'+method);
 }
 for(const [path,method] of [['/api/categorias','POST'],['/api/categorias/'+uid,'PUT'],['/api/estrutura-financeira/importar','POST']]){
  assert.equal(supportRequestAllowed(path,method,[module],'READ_ONLY'),false);assert(supportRequestAllowed(path,method,[module],'OPERATIONAL'));
 }
 for(const modules of [[],['toString'],['__proto__'],['UNKNOWN'],[module,module]]){assert.equal(validSupportModules(modules),false);assert.equal(supportRequestAllowed('/api/access/context','GET',modules,'READ_ONLY'),false);assert.equal(supportPermissions(modules,'READ_ONLY').size,0);}
});

test('same session rechecks the database after revocation, offboarding and approval loss',async()=>{
 const s=state(),store=db(s);await authorizedSupportGrant(store,'tech','grant');s.grant.status='REVOKED';await assert.rejects(authorizedSupportGrant(store,'tech','grant'),{status:403});s.grant.status='ACTIVE';s.identity.supportOperator.status='INACTIVE';await assert.rejects(authorizedSupportGrant(store,'tech','grant'),{status:403});s.identity.supportOperator.status='ACTIVE';s.grant.approver.role='MEMBER';await assert.rejects(authorizedSupportGrant(store,'tech','grant'),{status:403});
});

test('operator UI does not enumerate platform customers; support capability excluded from tenant catalog',()=>{
 const ui=readFileSync(new URL('../src/components/access/SupportClient.tsx',import.meta.url),'utf8');assert(!ui.includes('/api/platform/tenants'));assert(ui.includes('Área de Suporte'));
 const catalog=readFileSync(new URL('../src/lib/backup/catalog.mjs',import.meta.url),'utf8');assert(!catalog.includes('support_operators'));
});
