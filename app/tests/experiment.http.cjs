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
 const create=await q(j,'/api/platform/experiment-invitations','POST',{recipientName:'PILOTO QA Bruno Lourenço',hours:1});ok('admin creates without unnecessary plaintext link',create.status===201&&!create.body.link);
 const id=create.body.id,path='/api/platform/experiment-invitations/'+id+'/link';
 const copied=await q(j,path,'POST',{action:'copy'});ok('admin explicitly recovers opaque fragment link',copied.status===200&&copied.body.link.startsWith(c.base+'/experimentacao#convite='));
 const token=new URL(copied.body.link).hash.slice('#convite='.length);
 ok('copy same token without regenerating invitation',(await q(j,path,'POST',{action:'copy'})).body.link===copied.body.link);
 ok('copy endpoint forbids anonymous',(await q(anon,path,'POST',{action:'copy'})).status===401);
 ok('copy endpoint forbids non-admin',(await q(m,path,'POST',{action:'copy'})).status===403);
 ok('copy requires same origin',(await q(j,path,'POST',{action:'copy'},'https://evil.invalid')).status===403);
 const fresh=new Map();await login(fresh,c.adminEmail);
 ok('same original link after new administrative session',(await q(fresh,path,'POST',{action:'copy'})).body.link===copied.body.link);
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
 ok('list never returns secret hash ciphertext or full link',!JSON.stringify(list.body).includes(token)&&!JSON.stringify(list.body).includes('tokenHash')&&!JSON.stringify(list.body).includes('encryptedToken')&&!JSON.stringify(list.body).includes('#convite='));
 ok('interest does not disable copy while active',row.canCopyLink&&(await q(j,path,'POST',{action:'copy'})).body.link===copied.body.link);
 ok('legacy binding rejects another token',(await q(j,path,'POST',{action:'bind',link:c.base+'/experimentacao#convite='+'x'.repeat(43)})).status===409);
 ok('no membership or access granted',(await q(m,'/api/empresa')).status===403);
 ok('revoke through admin API',(await q(j,'/api/platform/experiment-invitations/'+id,'DELETE')).status===200);
 ok('open page cannot record after revocation',(await guest('interest')).status===404);
 ok('revoked cannot inspect',(await guest('inspect')).status===404);
 ok('cancelled cannot recover original link',(await q(j,path,'POST',{action:'copy'})).status===410);
 ok('cancelled row copy disabled',!(await q(j,'/api/platform/experiment-invitations')).body.find(x=>x.id===id).canCopyLink);
 if(c.fixtureRecoveryChecks){
  const {Pool}=require('pg'),u=new URL(process.env.DATABASE_URL);
  assert(c.base==='http://localhost:3020'?u.hostname==='127.0.0.1'&&u.pathname==='/special_invite_lab':u.hostname==='0f5rvkjqjdt9fez1ajiascyk'&&u.pathname==='/gestar_homolog_pg18');
  const pool=new Pool({connectionString:process.env.DATABASE_URL});
  try{
   const before=(await pool.query('SELECT token_hash,encrypted_token FROM experiment_invitations WHERE id=$1',[id])).rows[0];
   ok('only encrypted token stored at rest',!!before.encrypted_token&&!before.encrypted_token.includes(token)&&before.token_hash!==token);
   const legacy=await q(j,'/api/platform/experiment-invitations','POST',{recipientName:'PILOTO QA LEGADO',hours:1});ok('legacy fixture created through API',legacy.status===201);
   const lp='/api/platform/experiment-invitations/'+legacy.body.id+'/link',original=(await q(j,lp,'POST',{action:'copy'})).body.link;
   const oldHash=(await pool.query('SELECT token_hash FROM experiment_invitations WHERE id=$1',[legacy.body.id])).rows[0].token_hash;
   const cleared=await pool.query("UPDATE experiment_invitations SET encrypted_token=NULL WHERE id=$1 AND recipient_name='PILOTO QA LEGADO' AND created_by_identity_id=(SELECT id FROM auth_identities WHERE email=$2)",[legacy.body.id,c.adminEmail]);ok('simulate legacy only in synthetic owned row',cleared.rowCount===1);
   ok('legacy link not silently regenerated',(await q(j,lp,'POST',{action:'copy'})).status===409);
   ok('wrong original binding rejected',(await q(j,lp,'POST',{action:'bind',link:copied.body.link})).status===409);
   const bound=await q(j,lp,'POST',{action:'bind',link:original});ok('optional original binding reveals no link',bound.status===200&&bound.body.linked&&!bound.body.link);
   ok('binding preserves original hash',(await pool.query('SELECT token_hash FROM experiment_invitations WHERE id=$1',[legacy.body.id])).rows[0].token_hash===oldHash);
   ok('bound legacy recovers exact original link',(await q(fresh,lp,'POST',{action:'copy'})).body.link===original);
   await q(j,'/api/platform/experiment-invitations/'+legacy.body.id,'DELETE');
   const expired=await q(j,'/api/platform/experiment-invitations','POST',{recipientName:'PILOTO QA EXPIRADO',hours:1}),ep='/api/platform/experiment-invitations/'+expired.body.id+'/link';ok('expiration fixture created',expired.status===201);
   const el=(await q(j,ep,'POST',{action:'copy'})).body.link,et=new URL(el).hash.slice('#convite='.length);
   const changed=await pool.query("UPDATE experiment_invitations SET created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' WHERE id=$1 AND recipient_name='PILOTO QA EXPIRADO' AND created_by_identity_id=(SELECT id FROM auth_identities WHERE email=$2)",[expired.body.id,c.adminEmail]);ok('expire only owned synthetic fixture',changed.rowCount===1);
   ok('expired copy blocked by server',(await q(j,ep,'POST',{action:'copy'})).status===410);
   ok('expired original link invalid',(await guest('inspect',et)).status===404);
   ok('expired row copy disabled',!(await q(j,'/api/platform/experiment-invitations')).body.find(x=>x.id===expired.body.id).canCopyLink);
  }finally{await pool.end();}
 }
 const preview=await q(anon,'/experimentacao');ok('faithful preview without invite',preview.status===200&&preview.body.includes('A tecnologia entra depois do entendimento do negócio')&&preview.body.includes('brand-approved.png'));
 ok('preview noindex private',preview.headers.get('x-robots-tag')==='noindex, nofollow'&&preview.headers.get('cache-control').includes('no-store'));
 ok('preview CTAs stay in environment',!preview.body.includes('href="https://app.dezsolucoes.com.br"')&&preview.body.includes(c.base+'/primeiro-acesso'));
 ok('preview anonymous is never a login session',(await q(anon,'/api/platform/experiment-invitations')).status===401);
 ok('response does not leak token',!JSON.stringify(inspect.body).includes(token));
 console.log(JSON.stringify({state:'EXPERIMENT_HTTP_PASSED',checks,environment:c.base,scriptedInvitationsForQAOnly:true,manualAcceptanceLinkNotPrecreated:true}));
}
main().catch(e=>{console.log(JSON.stringify({state:'EXPERIMENT_HTTP_FAILED',error:e.name,check:e.message}));process.exitCode=1;});
