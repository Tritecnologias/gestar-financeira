import test from 'node:test';
import assert from 'node:assert/strict';
import { contractualReadiness, acceptedUserTerms } from '../src/lib/contractual-state.ts';

function fixture() {
  const user = { id:'u-v1', documentId:'u', sha256:'u-hash', requiresReaccept:true, document:{code:'TERM_USUARIO',audience:'USUARIO'} };
  const contract = { id:'c-v1', documentId:'c', sha256:'c-hash', requiresReaccept:true, document:{code:'TERM_CONTRATANTE',audience:'CONTRATANTE'} };
  const state = { versions:[user,contract], responsible:{membershipId:'owner-m',membership:{tenantId:'a',identityId:'owner-i',role:'OWNER',status:'ACTIVE',identity:{status:'ACTIVE'},tenant:{ativo:true}}}, receipts:[
    {identityId:'owner-i',tenantId:null,termVersionId:'u-v1',documentHash:'u-hash',documentId:'u'},
    {identityId:'owner-i',membershipId:'owner-m',tenantId:'a',termVersionId:'c-v1',documentHash:'c-hash',documentId:'c'},
  ] };
  const db = { termVersion:{findMany:async({where})=>state.versions.filter(v=>v.document.audience===where.document.audience)},
    tenantContractualResponsible:{findUnique:async()=>state.responsible}, termAcceptance:{findFirst:async({where})=>state.receipts.find(r=>Object.entries(where).every(([k,v])=>k==='version'?r.documentId===v.documentId:r[k]===v))??null} };
  return {state,db};
}
test('contract readiness needs active OWNER, identity, tenant and exact scoped receipt',async()=>{
  const {state,db}=fixture();assert((await contractualReadiness(db,'a')).active);
  for(const mutate of [()=>state.responsible=null,()=>state.responsible.membership.status='INACTIVE',()=>state.responsible.membership.role='MEMBER',()=>state.responsible.membership.identity.status='INACTIVE',()=>state.responsible.membership.tenant.ativo=false,()=>state.responsible.membership.tenantId='b']){
    const original=structuredClone(state.responsible);mutate();assert(!(await contractualReadiness(db,'a')).active);state.responsible=original;
  }
  for(const key of ['identityId','membershipId','tenantId','termVersionId','documentHash']){
    const old=state.receipts[1][key];state.receipts[1][key]='other';assert(!(await contractualReadiness(db,'a')).active);state.receipts[1][key]=old;
  }
});
test('USER acceptance is individual/global and never inferred from company acceptance',async()=>{
  const {state,db}=fixture();assert(await acceptedUserTerms(db,'owner-i'));assert(!await acceptedUserTerms(db,'another-i'));
  state.receipts[0].tenantId='a';assert(!await acceptedUserTerms(db,'owner-i'));state.receipts[0].tenantId=null;
  state.receipts[0].documentHash='changed';assert(!await acceptedUserTerms(db,'owner-i'));
});
test('missing official documents fail closed; every required contract must be accepted',async()=>{
  const {state,db}=fixture();const original=state.versions;state.versions=[];assert(!(await contractualReadiness(db,'a')).active);assert(!await acceptedUserTerms(db,'owner-i'));
  state.versions=original;state.versions.push({...original[1],id:'c-extra',documentId:'c2',document:{code:'EXTRA_REQUIRED',audience:'CONTRATANTE'}});assert(!(await contractualReadiness(db,'a')).active);
});
test('reaccept publication and retained old-version policy preserve their distinct contracts',async()=>{
  const {state,db}=fixture();const contract=state.versions[1];contract.id='c-v2';contract.sha256='c2-hash';assert(!(await contractualReadiness(db,'a')).active);
  contract.requiresReaccept=false;assert((await contractualReadiness(db,'a')).active);state.receipts[1].membershipId='former-owner';assert(!(await contractualReadiness(db,'a')).active);
});
