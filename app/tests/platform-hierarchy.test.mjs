import test from 'node:test';import assert from 'node:assert/strict';
import {platformHierarchy as view} from '../src/lib/platform-hierarchy.ts';
const tenant=(id,nome,ativo=true)=>({id,nome,slug:id,email:id+'@example.invalid',plano:'trial',ativo,_count:{memberships:0},activeOwnerCount:0,lastOwnerDesignationAt:null,contractualResponsibleMembershipId:null,contractualResponsibleReady:false,contractualStatus:'Responsável Contratual pendente'});
const identity=(id,nome,admin=false)=>({id,nome,email:id+'@example.invalid',status:'ACTIVE',platformAdmin:admin?{status:'ACTIVE'}:null,memberships:[]});
const ts=[tenant('a','Empresa Árvore'),tenant('b','Empresa Rio',false),tenant('c','Empresa vazia')];
const ids=[identity('multi','José compartilhado'),identity('global','Admin global',true),identity('single','Conta vinculada')];
const member=(id,i,t,role,status,profile)=>({id,role,status,identity:ids[i],tenant:ts[t],profile:profile?{id:'p-'+id,nome:profile}:null});
const ms=[member('v1',0,0,'OWNER','ACTIVE','Essencial'),member('v2',0,1,'MEMBER','INACTIVE','Financeiro'),member('v3',2,0,'MEMBER','ACTIVE',null)];
test('hierarchy preserves every tenant including empty/inactive and joins shared accounts by stable ID',()=>{
 const result=view(ts,ids,ms,'');assert.equal(result.groups.length,3);assert.equal(result.groups[0].memberships.length,2);assert.equal(result.groups[1].memberships[0].identity.id,'multi');assert.equal(result.groups[0].memberships[0].identity.id,'multi');assert.equal(result.groups[2].memberships.length,0);assert.equal(result.groups[1].tenant.ativo,false);assert.equal(ids.length,3);
});
test('unlinked global PlatformAdmin is explicit and never represented as a tenant membership',()=>{
 const r=view(ts,ids,ms,'');assert.deepEqual(r.unlinked.map(i=>i.id),['global']);assert.equal(r.accountById.get('global').platformAdmin.status,'ACTIVE');assert(ms.every(m=>m.identity.id!=='global'));
});
test('global name/email search shows each matching business context without unrelated members',()=>{
 for(const query of ['JOSE','multi@example.invalid']){const r=view(ts,ids,ms,query);assert.deepEqual(r.groups.map(g=>g.tenant.id),['a','b']);assert(r.groups.every(g=>g.memberships.length===1&&g.memberships[0].identity.id==='multi'));assert.equal(r.unlinked.length,0);}
});
test('tenant match retains all linked accounts; membership reference and profile narrow to their context',()=>{
 assert.equal(view(ts,ids,ms,'arvore').groups[0].memberships.length,2);
 for(const query of ['v2','Financeiro']){const r=view(ts,ids,ms,query);assert.equal(r.groups.length,1);assert.equal(r.groups[0].tenant.id,'b');assert.equal(r.groups[0].memberships[0].status,'INACTIVE');assert.equal(r.groups[0].memberships[0].profile.nome,'Financeiro');}
 assert.equal(view(ts,ids,ms,'Sem perfil').groups[0].memberships[0].id,'v3');
});
test('empty search result and account-only result stay distinct; no input mutation or identity duplication',()=>{
 const before=JSON.stringify({ts,ids,ms});assert.equal(view(ts,ids,ms,'missing').groups.length,0);assert.equal(view(ts,ids,ms,'missing').unlinked.length,0);assert.deepEqual(view(ts,ids,ms,'Admin global').unlinked.map(i=>i.id),['global']);assert.equal(JSON.stringify({ts,ids,ms}),before);
});
