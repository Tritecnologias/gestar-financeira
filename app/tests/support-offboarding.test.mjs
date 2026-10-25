import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
let s;
const moduleUrl=code=>'data:text/javascript,'+encodeURIComponent(code);
registerHooks({resolve(specifier,context,next){
 if(context.parentURL?.endsWith('/support-operators.ts')&&specifier==='./db')return{url:moduleUrl('export const prisma=globalThis.offboardingDb;'),shortCircuit:true};
 if(context.parentURL?.endsWith('/support-operators.ts')&&specifier==='./audit')return{url:moduleUrl('export const writeAudit=async(tx,input)=>globalThis.offboardingAudit(input);'),shortCircuit:true};
 if(context.parentURL&&specifier.startsWith('.')){const u=new URL(specifier,context.parentURL);if(!/\.[a-z]+$/.test(u.pathname)&&existsSync(fileURLToPath(u)+'.ts'))specifier=u.href+'.ts';}return next(specifier,context);
}});
function fresh(){s={operator:{id:'operator-a',identityId:'tech-a',status:'ACTIVE'},grants:[{id:'active-a',tenantId:'client',status:'ACTIVE',requesterIdentityId:'tech-a'},{id:'pending-a',tenantId:'client2',status:'PENDING',requesterIdentityId:'tech-a'},{id:'active-b',tenantId:'client',status:'ACTIVE',requesterIdentityId:'tech-b'}],memberships:[{id:'dev-a',identityId:'tech-a',role:'MEMBER',tenantId:'dev',tenant:{slug:'modo-dev'},status:'ACTIVE'},{id:'dev-b',identityId:'tech-b',role:'MEMBER',tenantId:'dev',tenant:{slug:'modo-dev'},status:'ACTIVE'}],audit:[{action:'HISTORICAL'}],events:[{type:'HISTORICAL'}]};}
const tx={
 $queryRaw:async()=>[],authIdentity:{findUnique:async()=>({status:'ACTIVE',platformAdmin:{status:'ACTIVE'}})},
 supportOperator:{findUnique:async()=>s.operator,update:async({data})=>Object.assign(s.operator,data)},
 tenantMembership:{findMany:async({where})=>s.memberships.filter(m=>where.id.in.includes(m.id)&&m.identityId===where.identityId),update:async({where,data})=>Object.assign(s.memberships.find(m=>m.id===where.id),data)},
 supportGrant:{findMany:async({where})=>s.grants.filter(g=>g.requesterIdentityId===where.requesterIdentityId&&where.status.in.includes(g.status)),update:async({where,data})=>Object.assign(s.grants.find(g=>g.id===where.id),data)},
 supportGrantEvent:{create:async({data})=>s.events.push(data)},
};
globalThis.offboardingDb={$transaction:async fn=>{const before=structuredClone(s);try{return await fn(tx);}catch(e){s=before;throw e;}}};
globalThis.offboardingAudit=input=>s.audit.push(input);
const {offboardSupportOperator}=await import('../src/lib/support-operators.ts');
test('default offboarding revokes ACTIVE/PENDING only for A; preserves B, DEV membership and audit history',async()=>{
 fresh();const result=await offboardSupportOperator('platform','operator-a','Explicit termination');
 assert.equal(result.revokedGrants,2);assert.equal(result.devMembershipsDisabled,0);assert.equal(s.operator.status,'INACTIVE');assert.deepEqual(s.grants.map(g=>g.status),['REVOKED','REVOKED','ACTIVE']);assert(s.memberships.every(m=>m.status==='ACTIVE'));assert.equal(s.audit[0].action,'HISTORICAL');assert.equal(s.events[0].type,'HISTORICAL');assert.equal(s.audit.at(-1).action,'SUPPORT_OPERATOR_DISABLED');
});
test('explicit DEV relationship removal is limited to the target technician',async()=>{
 fresh();await offboardSupportOperator('platform','operator-a','Explicit DEV removal',['dev-a']);assert.equal(s.memberships[0].status,'INACTIVE');assert.equal(s.memberships[1].status,'ACTIVE');
});
test('foreign, customer and OWNER relationship requests fail atomically',async()=>{
 for(const scenario of ['foreign','customer','owner']){fresh();const ids=[scenario==='foreign'?'dev-b':'dev-a'];if(scenario==='customer')s.memberships[0].tenant.slug='real-client';if(scenario==='owner')s.memberships[0].role='OWNER';const before=structuredClone(s);await assert.rejects(offboardSupportOperator('platform','operator-a','Invalid relationship removal',ids),{status:409});assert.deepEqual(s,before);}
});
