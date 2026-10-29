// Synthetic-only protocol tests. UI acceptance is separately required; never hand off a scripted invitation.
const assert=require('node:assert/strict');
async function main(){let raw='';for await(const b of process.stdin)raw+=b;const c=JSON.parse(raw);raw='';
 assert(['http://localhost:3020','https://homolog.dezsolucoes.com.br'].includes(c.base));
 assert(c.adminEmail.endsWith('@example.invalid')&&c.memberEmail.endsWith('@example.invalid'));
 const checks=[],j=new Map(),m=new Map(),anon=new Map();
 const ok=(n,v)=>{assert(v,n);checks.push(n);};
 async function q(jar,path,method='GET',body,origin=c.base){const r=await fetch(c.base+path,{method,redirect:'manual',headers:{Origin:origin,Cookie:[...jar].map(([k,v])=>k+'='+v).join('; '),...(body===undefined?{}:{'Content-Type':body instanceof URLSearchParams?'application/x-www-form-urlencoded':'application/json'})},...(body===undefined?{}:{body:body instanceof URLSearchParams?body:JSON.stringify(body)})});for(const cookie of r.headers.getSetCookie()){const pair=cookie.split(';')[0],i=pair.indexOf('=');jar.set(pair.slice(0,i),pair.slice(i+1));}return{status:r.status,headers:r.headers,body:r.headers.get('content-type')?.includes('json')?await r.json():await r.text()};}
 async function login(jar,email){const t=await q(jar,'/api/auth/csrf');const login=await q(jar,'/api/auth/callback/credentials','POST',new URLSearchParams({csrfToken:t.body.csrfToken,email,password:c.password,callbackUrl:c.base+'/plataforma'}));const session=await q(jar,'/api/auth/session');ok('synthetic login '+(jar===j?'admin':'without capability')+' status='+login.status+' location='+login.headers.get('location')+' cookies='+[...jar.keys()].join(','),!!session.body?.user);}
 await login(j,c.adminEmail);await login(m,c.memberEmail);
 ok('anonymous admin API denied',(await q(anon,'/api/platform/experiment-invitations')).status===401);
 ok('authenticated non-admin denied',(await q(m,'/api/platform/experiment-invitations')).status===403);
 ok('cross-origin create denied',(await q(j,'/api/platform/experiment-invitations','POST',{recipientName:'PILOTO QA'},'https://evil.invalid')).status===403);
 ok('invalid expiration rejected',(await q(j,'/api/platform/experiment-invitations','POST',{recipientName:'PILOTO QA',hours:0})).status===400);
 const create=await q(j,'/api/platform/experiment-invitations','POST',{recipientName:'PILOTO QA Bruno Lourenço',hours:1});ok('admin issues opaque fragment link',create.status===201&&create.body.link.startsWith(c.base+'/experimentacao#convite='));
 const token=new URL(create.body.link).hash.slice('#convite='.length),id=create.body.id;
 const guest=(action,t=token)=>q(anon,'/api/experimentacao','POST',{action,token:t});
 const inspect=await guest('inspect');ok('valid invite first name only',inspect.status===200&&inspect.body.firstName==='PILOTO'&&!JSON.stringify(inspect.body).includes('Lourenço'));
 ok('no guest authentication',!(await q(anon,'/api/auth/session')).body?.user);
 ok('invalid token unavailable',(await guest('inspect','x'.repeat(43))).status===404);
 ok('public mutation needs same origin',(await q(anon,'/api/experimentacao','POST',{action:'interest',token},'https://evil.invalid')).status===403);
 ok('welcome acknowledgment recorded',(await guest('acknowledge')).body.acknowledged===true);
 const interested=await guest('interest');ok('interest has clear result',interested.status===200&&interested.body.interested&&interested.body.message.includes('convite de acesso separado'));
 ok('interest retry idempotent',(await guest('interest')).body.interested===true);
 const list=await q(j,'/api/platform/experiment-invitations');const row=list.body.find(x=>x.id===id);
 ok('admin verifies all progress',!!row?.viewedAt&&!!row?.acknowledgedAt&&!!row?.interestAt);
 ok('list never returns secret or hash',!JSON.stringify(list.body).includes(token)&&!JSON.stringify(list.body).includes('tokenHash'));
 ok('no membership or access granted',(await q(m,'/api/empresa')).status===403);
 ok('revoke through admin API',(await q(j,'/api/platform/experiment-invitations/'+id,'DELETE')).status===200);
 ok('open page cannot record after revocation',(await guest('interest')).status===404);
 ok('revoked cannot inspect',(await guest('inspect')).status===404);
 const preview=await q(anon,'/experimentacao');ok('faithful preview without invite',preview.status===200&&preview.body.includes('A tecnologia entra depois do entendimento do negócio')&&preview.body.includes('brand-approved.png'));
 ok('preview noindex private',preview.headers.get('x-robots-tag')==='noindex, nofollow'&&preview.headers.get('cache-control').includes('no-store'));
 ok('preview CTAs stay in environment',!preview.body.includes('href="https://app.dezsolucoes.com.br"')&&preview.body.includes(c.base+'/primeiro-acesso'));
 ok('preview anonymous is never a login session',(await q(anon,'/api/platform/experiment-invitations')).status===401);
 ok('response does not leak token',!JSON.stringify(inspect.body).includes(token));
 console.log(JSON.stringify({state:'EXPERIMENT_HTTP_PASSED',checks,environment:c.base,scriptedInvitationsForQAOnly:true,manualAcceptanceLinkNotPrecreated:true}));
}
main().catch(e=>{console.log(JSON.stringify({state:'EXPERIMENT_HTTP_FAILED',error:e.name,check:e.message}));process.exitCode=1;});
