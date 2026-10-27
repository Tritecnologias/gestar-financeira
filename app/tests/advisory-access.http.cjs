// LOCAL synthetic laboratory only. Credentials enter stdin; no values/cookies emitted.
const assert = require('node:assert/strict');
async function main() {
 let raw=''; for await(const s of process.stdin) raw+=s; const cfg=JSON.parse(raw); raw='';
 const base=cfg.base||'http://localhost:3015'; assert(['http://localhost:3014','http://localhost:3015'].includes(base)); assert.equal(cfg.database,'phase11b_lab');
 const checks=[]; let step='login';
 const req=async(j,path,method='GET',body)=>{const r=await fetch(base+path,{method,redirect:'manual',headers:{Cookie:[...j].map(([k,v])=>k+'='+v).join('; '),Origin:base,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});for(const c of r.headers.getSetCookie()){const [part]=c.split(';'),at=part.indexOf('=');if(!part.slice(at+1))j.delete(part.slice(0,at));else j.set(part.slice(0,at),part.slice(at+1));}return r;};
 async function login(name){const j=new Map(),csrf=await(await req(j,'/api/auth/csrf')).json();const r=await fetch(base+'/api/auth/callback/credentials',{method:'POST',redirect:'manual',headers:{Cookie:[...j].map(([k,v])=>k+'='+v).join('; '),'Content-Type':'application/x-www-form-urlencoded','X-Auth-Return-Redirect':'1',Origin:base},body:new URLSearchParams({csrfToken:csrf.csrfToken,email:name+'11b@example.invalid',password:cfg.password,callbackUrl:base+'/inicio'})});for(const c of r.headers.getSetCookie()){const [p]=c.split(';'),at=p.indexOf('=');j.set(p.slice(0,at),p.slice(at+1));}assert((await(await req(j,'/api/auth/session')).json())?.user,'synthetic login');return j;}
 const jars={};for(const name of ['owner','owner2','advisor','tech','member','member2','privateowner','delegate'])jars[name]=await login(name);
 const main=cfg.tenants.main;
 async function expect(r,status){assert.equal(r.status,status,step);return r.json();}
 const switchTo=(j,tenantId,advisoryGrantId)=>req(j,'/api/tenants/switch','POST',{tenantId,...(advisoryGrantId?{advisoryGrantId}:{})});
 const permissions=['fluxo.lancamentos.view','fluxo.lancamentos.create','fluxo.lancamentos.edit','fluxo.lancamentos.delete','fluxo.lancamentos.import','fluxo.lancamentos.export','fluxo.visao.view','fluxo.visao.saldos','fluxo.relatorios.view'];
 const grant=(j,email,scope=permissions,extra={})=>req(j,'/api/access/advisory','POST',{email,purpose:'Assessoria sintética de laboratório',permissions:scope,confirm:true,...extra});
 try {
 step='global capabilities do not imply business';
 for(const name of ['advisor','tech']){assert.equal((await req(jars[name],'/api/tenants')).status,200);await expect(await switchTo(jars[name],main),403);assert.notEqual((await req(jars[name],'/api/lancamentos')).status,200);}
 checks.push(step);
 step='multiple owners and explicit delegated manager';
 for(const name of ['owner','owner2','delegate','member2'])await expect(await switchTo(jars[name],main),200);
 await expect(await req(jars.owner2,'/api/access/advisory'),200);
 await expect(await grant(jars.member2,'advisor11b@example.invalid'),403);
 await expect(await grant(jars.delegate,'advisor11b@example.invalid'),403);
 checks.push(step);
 step='tenant isolation';await expect(await switchTo(jars.member,cfg.tenants.neighbor),200);await expect(await switchTo(jars.member,main),403);await expect(await switchTo(jars.privateowner,cfg.tenants.private),200);await expect(await switchTo(jars.privateowner,main),403);checks.push(step);
 step='grant separate from membership';const g=await expect(await grant(jars.owner,'advisor11b@example.invalid'),201);await expect(await grant(jars.owner,'advisor11b@example.invalid'),409);await expect(await switchTo(jars.advisor,main,g.id),200);const ctx=await expect(await req(jars.advisor,'/api/access/context'),200);assert.equal(ctx.accessSource,'ADVISORY');checks.push(step);
 step='business CRUD and zero';const row=await expect(await req(jars.advisor,'/api/lancamentos','POST',{descricao:'FASE11B ASSESSORIA HTTP',valor:0}),201);assert.equal(Number(row.valor),0);const edited=await expect(await req(jars.advisor,'/api/lancamentos/'+row.id,'PUT',{anotacao:'TESTE SINTETICO',versao:row.versao}),200);assert.equal(edited.anotacao,'TESTE SINTETICO');await expect(await req(jars.advisor,'/api/lancamentos/'+row.id,'PUT',{valor:1,versao:row.versao}),409);await expect(await req(jars.advisor,'/api/lancamentos','POST',{valor:-1}),400);checks.push(step);
 step='layout real identity owner';const layout=await expect(await req(jars.advisor,'/api/layouts','POST',{nome:'Assessoria laboratório',colunas:['descricao','valor']}),201);assert.equal(layout.identityId,cfg.ids.advisor);assert.equal(layout.usuarioId,null);checks.push(step);
 step='no governance or backup via advisory';for(const path of ['/api/platform/tenants','/api/access/advisory','/api/backup/export','/api/dashboard']){assert.notEqual((await req(jars.advisor,path)).status,200,path);}checks.push(step);
 step='authorized export';assert.equal((await req(jars.advisor,'/api/lancamentos/exportar')).status,200);assert.equal((await req(jars.advisor,'/api/lancamentos/importacao-oficial/base')).status,200);checks.push(step);
 step='revocation cuts existing session next request';await expect(await req(jars.owner2,'/api/access/advisory/'+g.id,'PATCH',{action:'revoke',confirm:true,reason:'Encerramento da prova sintética'}),200);await expect(await req(jars.advisor,'/api/lancamentos'),403);await expect(await req(jars.advisor,'/api/lancamentos/'+row.id,'PUT',{valor:1,versao:edited.versao}),403);checks.push(step);
 step='delegated read only cannot escalate';const ro=await expect(await grant(jars.delegate,'advisor11b@example.invalid',['fluxo.lancamentos.view']),201);await expect(await switchTo(jars.advisor,main,ro.id),200);await expect(await req(jars.advisor,'/api/lancamentos'),200);await expect(await req(jars.advisor,'/api/lancamentos','POST',{valor:0}),403);await expect(await req(jars.advisor,'/api/lancamentos/exportar'),403);checks.push(step);
 step='context exit restores only independent global capability';await expect(await req(jars.advisor,'/api/access/context/clear','POST',{}),200);await expect(await req(jars.advisor,'/api/platform/tenants'),200);assert.notEqual((await req(jars.advisor,'/api/lancamentos')).status,200);checks.push(step);
 await expect(await req(jars.owner,'/api/access/advisory/'+ro.id,'PATCH',{action:'revoke',confirm:true,reason:'Fim do teste somente leitura'}),200);
 step='membership selection clears advisory context';const ownGrant=await expect(await grant(jars.owner,'owner11b@example.invalid',['fluxo.lancamentos.view']),201);await expect(await switchTo(jars.owner,main,ownGrant.id),200);await expect(await switchTo(jars.owner,main),200);assert(!jars.owner.has('advisory_context'));await expect(await req(jars.owner,'/api/access/advisory'),200);await expect(await req(jars.owner,'/api/access/advisory/'+ownGrant.id,'PATCH',{action:'revoke',confirm:true,reason:'Fim teste de contexto explícito'}),200);checks.push(step);
 console.log(JSON.stringify({state:'ADVISORY_HTTP_PASSED',checks,recordId:row.id,layoutId:layout.id,grantIds:[g.id,ro.id,ownGrant.id],secretsEmitted:false}));
 }catch(e){console.log(JSON.stringify({state:'ADVISORY_HTTP_FAILED',step,type:e.name,actual:e.actual,expected:e.expected,checks}));process.exitCode=1;}
}
main().catch(e=>{console.log(JSON.stringify({state:'ADVISORY_HTTP_FAILED',type:e.name,code:e.code,causeCode:e.cause?.code}));process.exitCode=1;});




