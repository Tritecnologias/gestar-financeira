import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
registerHooks({resolve(s,c,next){if(c.parentURL&&s.startsWith('.')){const u=new URL(s,c.parentURL);if(!/\.[a-z]+$/.test(u.pathname)&&existsSync(fileURLToPath(u)+'.ts'))s=u.href+'.ts';}return next(s,c);}});
const {advisoryPermissions,advisoryRequestAllowed,advisoryActive,ADVISORY_PERMISSIONS}=await import('../src/lib/advisory-policy.ts');
const {authorizedAdvisoryGrant}=await import('../src/lib/advisory-authorization.ts');
const {businessAuthor,layoutOwner}=await import('../src/lib/business-author.ts');
const state=()=>({id:'g',identityId:'advisor',tenantId:'a',status:'ACTIVE',startsAt:new Date(Date.now()-10000),expiresAt:null,revokedAt:null,permissions:['fluxo.lancamentos.view'],identity:{status:'ACTIVE'},tenant:{ativo:true,nome:'synthetic'}});
test('advisory scope never includes platform, governance, support or backup',()=>{
 assert(advisoryPermissions(ADVISORY_PERMISSIONS).length>20);
 for(const p of ['sistema.backup.restore','acessos.usuarios.manage','acessos.assessoria.manage','platform.admin','support.grant'])assert.throws(()=>advisoryPermissions([p]),{status:400});
 for(const input of [[],null,['fluxo.lancamentos.create'],['fluxo.lancamentos.view','unknown']])assert.throws(()=>advisoryPermissions(input),{status:400});
});
test('revocation/expiry/identity/tenant checked fresh; never infer authorization from other capabilities',async()=>{
 let g=state();const db={advisoryAccessGrant:{findUnique:async()=>g}};
 assert.equal((await authorizedAdvisoryGrant(db,'advisor','g','a')).id,'g');
 for(const change of [x=>x.status='INACTIVE',x=>x.revokedAt=new Date(),x=>x.startsAt=new Date(Date.now()+60000),x=>x.expiresAt=new Date(Date.now()-1),x=>x.identity.status='INACTIVE',x=>x.tenant.ativo=false,x=>x.identityId='other',x=>x.tenantId='other']){g=state();change(g);await assert.rejects(authorizedAdvisoryGrant(db,'advisor','g','a'),{status:403});}
 g=null;await assert.rejects(authorizedAdvisoryGrant(db,'advisor','g','a'),{status:403});
 assert.equal(advisoryActive({...state(),expiresAt:new Date(0)}),false);
});
test('reviewed business endpoints only; no unknown descendants or legacy dashboard',()=>{
 for(const [p,m] of [['/api/lancamentos','POST'],['/api/lancamentos/importacao-oficial','POST'],['/api/estrutura-financeira/exportar','GET'],['/inicio','GET']])assert(advisoryRequestAllowed(p,m));
 for(const p of ['/api/dashboard','/api/platform/tenants','/api/backups','/api/access/advisory','/api/support-grants','/api/usuarios','/api/lancamentos/unreviewed'])for(const m of ['GET','POST'])assert.equal(advisoryRequestAllowed(p,m),false,p);
});
test('real identity authorship and exclusive personal ownership without fabricated legacy user',()=>{
 const s={id:'advisory:i',identityId:'i',accessSource:'ADVISORY'};
 assert.deepEqual(businessAuthor(s),{criadoPor:null,criadoPorIdentityId:'i'});assert.deepEqual(layoutOwner(s),{usuarioId:null,identityId:'i'});
 assert.deepEqual(businessAuthor({id:'legacy',accessSource:'MEMBERSHIP'}),{criadoPor:'legacy'});
 assert.deepEqual(layoutOwner({id:'legacy',accessSource:'MEMBERSHIP'}),{usuarioId:'legacy',identityId:null});
});
test('synthetic scenario isolates IDs per tenant and refuses PROD before any query',async()=>{
 const {createRequire}=await import('node:module');const require=createRequire(import.meta.url);const{ROWS,VERSION,id,applyScenario}=require('../scripts/fixtures/modo-dev-v1.cjs');
 assert(ROWS.some(r=>r.valor===null)&&ROWS.some(r=>r.valor===0)&&ROWS.some(r=>r.valor===0.01));
 assert.equal(id('a','row','1'),id('a','row','1'));assert.notEqual(id('a','row','1'),id('b','row','1'));
 await assert.rejects(applyScenario({}, {expectedDatabase:'gestar_prod_pg18',confirm:VERSION}),/FIXTURE_EXPLICIT_ENVIRONMENT_REQUIRED/);
});
