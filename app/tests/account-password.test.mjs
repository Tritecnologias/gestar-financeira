import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
registerHooks({resolve(s,c,next){
 if(s.startsWith('@/'))s=new URL('../src/'+s.slice(2)+'.ts',import.meta.url).href;
 else if(c.parentURL&&s.startsWith('.')){const u=new URL(s,c.parentURL);if(!/\.[a-z]+$/.test(u.pathname)&&existsSync(fileURLToPath(u)+'.ts'))s=u.href+'.ts';}
 return next(s,c);
}});
const {changeOwnPassword,validatePasswordChange}=await import('../src/lib/account-password.ts');
const {credentialStamp,matchesCredentialStamp}=await import('../src/lib/credential-session.ts');
const {validIdentityPassword}=await import('../src/lib/password-policy.ts');
const {roleLabel,statusLabel,resourceLabel,messagePtBr}=await import('../src/lib/presentation.ts');
const old='synthetic-current-pass',fresh='synthetic-new-pass';
async function store(){const state={identity:{id:'self',status:'ACTIVE',senhaHash:await bcrypt.hash(old,4)},events:[],other:{id:'other',senhaHash:'untouched'}};
 const tx={ $queryRaw:async()=>[{id:'self'}],authIdentity:{findUnique:async({where})=>where.id===state.identity.id?state.identity:null,updateMany:async({where,data})=>{if(where.id!==state.identity.id||where.senhaHash!==state.identity.senhaHash)return{count:0};state.identity={...state.identity,...data};return{count:1};}},auditEvent:{count:async()=>state.events.filter(e=>e.action==='PASSWORD_CHANGE_DENIED').length,create:async({data})=>{state.events.push(data);return data;}}};
 return {state,db:{$transaction:async(fn)=>{const saved=structuredClone(state);try{return await fn(tx);}catch(e){Object.assign(state,saved);throw e;}}}};
}
test('existing identity policy preserves whitespace and 12–200 length, never coercing values',()=>{
 for(const v of ['',null,12,[],{},'a'.repeat(11),'a'.repeat(201)])assert(!validIdentityPassword(v));
 for(const v of [' '.repeat(12),'a'.repeat(200),'válida-com-acentos'])assert(validIdentityPassword(v));
 assert('error' in validatePasswordChange({currentPassword:old,newPassword:fresh,confirmation:'other'}));
 for(const extra of ['identityId','userId','tenantId','senhaHash','role'])assert('error' in validatePasswordChange({currentPassword:old,newPassword:fresh,confirmation:fresh,[extra]:'other'}));
 assert.deepEqual(validatePasswordChange({currentPassword:old,newPassword:fresh,confirmation:fresh}).value,{currentPassword:old,newPassword:fresh,confirmation:fresh});
});
test('successful self-change writes bcrypt12 and safe audit only; no other identity or access is changed',async()=>{
 const {state,db}=await store(),before=state.identity.senhaHash,other=structuredClone(state.other);
 const result=await changeOwnPassword(db,'self',{currentPassword:old,newPassword:fresh,confirmation:fresh});
 assert(result.ok);assert(await bcrypt.compare(fresh,state.identity.senhaHash));assert(!await bcrypt.compare(old,state.identity.senhaHash));assert.equal(bcrypt.getRounds(state.identity.senhaHash),12);assert.deepEqual(state.other,other);
 assert.equal(state.events.length,1);assert.equal(state.events[0].action,'PASSWORD_CHANGED');assert.equal(state.events[0].actorIdentityId,'self');
 const report=JSON.stringify({result,events:state.events});for(const value of [old,fresh,before,state.identity.senhaHash])assert(!report.includes(value));
});
test('wrong current password preserves credential and records denial; fifth failure enforces a 15 minute wait',async()=>{
 const {state,db}=await store(),before=state.identity.senhaHash;
 for(let i=0;i<5;i++){const r=await changeOwnPassword(db,'self',{currentPassword:'wrong-password',newPassword:fresh,confirmation:fresh});assert.equal(r.status,400);}
 const denied=await changeOwnPassword(db,'self',{currentPassword:old,newPassword:fresh,confirmation:fresh});assert.equal(denied.status,429);assert.equal(state.identity.senhaHash,before);assert.equal(state.events.length,5);
});
test('inactive/missing identity cannot change a credential',async()=>{
 const {state,db}=await store();assert.equal((await changeOwnPassword(db,'other',{currentPassword:old,newPassword:fresh,confirmation:fresh})).status,401);
 state.identity.status='INACTIVE';assert.equal((await changeOwnPassword(db,'self',{currentPassword:old,newPassword:fresh,confirmation:fresh})).status,401);assert.equal(state.events.length,0);
});
test('credential stamps revoke old sessions and are identity/secret-specific without exposing the bcrypt hash',()=>{
 const secret='synthetic-session-secret',hash='$2b$12$synthetic',stamp=credentialStamp('self',hash,secret);
 assert(matchesCredentialStamp(stamp,'self',hash,secret));assert(!matchesCredentialStamp(stamp,'other',hash,secret));assert(!matchesCredentialStamp(stamp,'self','new-hash',secret));assert(!matchesCredentialStamp(stamp,'self',hash,'different-secret'));assert(!matchesCredentialStamp(undefined,'self',hash,secret));assert(!stamp.includes(hash));assert.throws(()=>credentialStamp('self',hash,''));
});
test('Portuguese labels do not alter enum values or permission keys',()=>{
 const value={role:'OWNER',status:'ACTIVE',type:'TenantMembership'};assert.equal(roleLabel(value.role),'Proprietário');assert.equal(statusLabel(value.status),'Ativo');assert.equal(resourceLabel(value.type),'Vínculo com a empresa');assert.deepEqual(value,{role:'OWNER',status:'ACTIVE',type:'TenantMembership'});
 assert.equal(messagePtBr('Forbidden'),'Você não tem permissão para realizar esta ação.');assert.equal(messagePtBr('Membership inactive'),'Seu vínculo com esta empresa está inativo.');assert.equal(messagePtBr('Nenhum tenant encontrado'),'Nenhuma empresa encontrada');
});
