// Synthetic identities only, on the isolated Docker network. Never accepts real accounts.
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const base = 'http://10s-phase2a-app:3000';
async function request(jar, route, init = {}) {
  const r = await fetch(base + route, { ...init, redirect: 'manual', headers: { ...init.headers, Cookie: [...jar].map(([k,v]) => `${k}=${v}`).join('; ') } });
  for (const h of r.headers.getSetCookie()) { const entry = h.split(';')[0], index = entry.indexOf('='); jar.set(entry.slice(0,index),entry.slice(index+1)); }
  return r;
}
async function login(email,password) {
  const jar = new Map();
  const csrf = await request(jar,'/api/auth/csrf'); assert.equal(csrf.status,200);
  const { csrfToken } = await csrf.json();
  await request(jar,'/api/auth/callback/credentials',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({csrfToken,email,password,callbackUrl:base+'/inicio',json:'true'})});
  const session = await request(jar,'/api/auth/session'); assert.ok((await session.json()).user, 'synthetic login failed');
  return jar;
}
async function main() {
  const url = new URL(process.env.DATABASE_URL);
  assert.equal(url.hostname,'10s-phase2a-pg'); assert.match(url.pathname,/^\/phase2a_\d+_legacy$/);
  const db = new PrismaClient({adapter:new PrismaPg({connectionString:url.href})});
  try {
    assert.equal(await db.authIdentity.count(),0, 'fresh synthetic lab only');
    const tenantId='00000000-0000-4000-8000-000000000001';
    const password=randomUUID()+randomUUID(), senhaHash=await bcrypt.hash(password,10);
    const pa=await db.authIdentity.create({data:{email:'platform-smoke@example.invalid',nome:'Synthetic PA',senhaHash}});
    await db.platformAdmin.create({data:{identityId:pa.id}});
    const solo=await db.authIdentity.create({data:{email:'solo-smoke@example.invalid',nome:'Synthetic identity only',senhaHash}});
    const member=await db.authIdentity.create({data:{email:'member-smoke@example.invalid',nome:'Synthetic member',senhaHash}});
    const profile=await db.accessProfile.create({data:{tenantId,nome:'Synthetic read smoke',permissoes:['fluxo.lancamentos.view','fluxo.visao.view','fluxo.visao.saldos','estrutura.financeiras.view','estrutura.portfolio.view','estrutura.pessoas.view']}});
    const membership=await db.tenantMembership.create({data:{tenantId,identityId:member.id,role:'MEMBER',profileId:profile.id}});
    await db.legacyUserAccessMap.create({data:{identityId:member.id,tenantId,membershipId:membership.id,legacyUsuarioId:'00000000-0000-4000-8000-000000000101'}});
    const paJar=await login(pa.email,password);
    assert.equal((await request(paJar,'/api/platform/identities')).status,200);
    assert.equal((await request(paJar,'/api/lancamentos')).status,403);
    assert.equal(await db.tenantMembership.count({where:{identityId:pa.id}}),0);
    const soloJar=await login(solo.email,password);
    assert.equal((await request(soloJar,'/api/platform/identities')).status,403);
    assert.equal((await request(soloJar,'/api/lancamentos')).status,403);
    const memberJar=await login(member.email,password), results=[];
    for(const route of ['/api/lancamentos','/api/categorias','/api/plano-contas','/api/produtos','/api/pessoas','/api/fluxo-caixa/resumo?inicio=2020-01-01&fim=2020-12-31']) {
      const response=await request(memberJar,route); assert.equal(response.status,200,route);
      results.push({route,status:response.status});
    }
    assert.equal((await request(memberJar,'/api/platform/identities')).status,403);
    const denied=await request(memberJar,'/api/tenants/switch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tenantId:'00000000-0000-4000-8000-000000000002'})});
    assert.equal(denied.status,403);
    console.log(JSON.stringify({syntheticOnly:true,platformWithoutFinancialAccess:'PASS',identityWithoutMembership:'PASS',crossTenantDenied:'PASS',handlers:results}));
  } finally { await db.$disconnect(); }
}
main().catch(e=>{ console.error('LAB_HTTP_FAILED',e.code ?? '',e.actual ?? '',e.expected ?? '',e.message?.startsWith('/api/')?e.message:''); process.exitCode=1; });
