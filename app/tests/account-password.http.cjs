// Disposable LOCAL lab only. Synthetic credentials enter stdin and stay in memory.
const assert=require('node:assert/strict');
async function main(){let raw='';for await(const s of process.stdin)raw+=s;const cfg=JSON.parse(raw);raw='';
 const base=cfg.base||'http://localhost:3011';assert(['localhost','127.0.0.1'].includes(new URL(base).hostname));assert.equal(cfg.database,'phase11a_lab');
 const results=[];async function req(jar,path,init={}){const r=await fetch(base+path,{...init,redirect:'manual',headers:{Cookie:[...jar].map(([k,v])=>k+'='+v).join('; '),...init.headers}});for(const c of r.headers.getSetCookie()){const part=c.split(';')[0],at=part.indexOf('=');jar.set(part.slice(0,at),part.slice(at+1));}return r;}
 async function login(email,password){const j=new Map(),c=await req(j,'/api/auth/csrf');assert.equal(c.status,200);const{csrfToken}=await c.json();await req(j,'/api/auth/callback/credentials',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','X-Auth-Return-Redirect':'1'},body:new URLSearchParams({csrfToken,email,password,callbackUrl:base+'/minha-conta'})});const r=await req(j,'/api/auth/session');return{j,user:(await r.json())?.user};}
 const change=(j,body,origin=base,extra={})=>req(j,'/api/account/password',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,...extra},body:JSON.stringify(body)});
 const value={currentPassword:cfg.password,newPassword:cfg.newPassword,confirmation:cfg.newPassword};
 let r=await change(new Map(),value);assert.equal(r.status,401);results.push('anonymous_401');
 const admin=await login('admin11a@example.invalid',cfg.password),parallel=await login('admin11a@example.invalid',cfg.password),member=await login('member11a@example.invalid',cfg.password);assert(admin.user,'admin login');assert(parallel.user,'parallel login');assert(member.user,'member login');
 r=await req(admin.j,'/api/tenants');assert.deepEqual(await r.json(),[]);assert.equal((await req(admin.j,'/api/platform/tenants')).status,200);results.push('platform_admin_without_membership');
 r=await req(member.j,'/api/tenants');const memberCompanies=await r.json();assert.equal(memberCompanies.length,1);assert.equal(memberCompanies[0].nome,'MODO DEV FASE11A a');assert.equal((await req(member.j,'/api/platform/tenants')).status,403);results.push('member_isolation_no_platform_access');
 r=await change(admin.j,value,'https://untrusted.example');assert.equal(r.status,403);r=await change(admin.j,value,base,{'Sec-Fetch-Site':'cross-site'});assert.equal(r.status,403);results.push('origin_and_cross_site_rejected');
 for(const body of [{...value,identityId:member.user.id},{...value,currentPassword:'wrong-password'},{...value,confirmation:'different'}]){r=await change(admin.j,body);assert.equal(r.status,400);const j=await r.json();assert(j.error);assert(!JSON.stringify(j).includes(cfg.password));}
 assert((await login('admin11a@example.invalid',cfg.password)).user);results.push('wrong_current_confirmation_and_target_rejected');
 r=await req(admin.j,'/minha-conta');assert.equal(r.status,200);const text=await r.text();assert(text.includes('Minha conta'));assert(!text.includes('senhaHash'));results.push('account_without_company');
 r=await change(admin.j,value);assert.equal(r.status,200);const response=await r.json();assert.equal(response.message,'Senha alterada com sucesso. Entre novamente com a nova senha.');assert(!JSON.stringify(response).includes(cfg.newPassword));
 for(const j of [admin.j,parallel.j]){const s=await req(j,'/api/auth/session');assert(!(await s.json())?.user);assert.equal((await req(j,'/api/platform/tenants')).status,401);}results.push('successful_change_revokes_both_previous_sessions');
 assert(!(await login('admin11a@example.invalid',cfg.password)).user);assert((await login('admin11a@example.invalid',cfg.newPassword)).user);results.push('old_password_rejected_new_password_accepted');
 assert((await(await req(member.j,'/api/auth/session')).json()).user);assert.deepEqual(await(await req(member.j,'/api/tenants')).json(),memberCompanies);results.push('other_identity_session_and_access_unchanged');
 r=await change(member.j,value);assert.equal(r.status,200);const newMember=await login('member11a@example.invalid',cfg.newPassword);assert(newMember.user);assert.equal((await req(newMember.j,'/api/platform/tenants')).status,403);assert.deepEqual(await(await req(newMember.j,'/api/tenants')).json(),memberCompanies);results.push('member_self_change_preserves_exact_membership');
 const limited=await login('member11b@example.invalid',cfg.password);assert(limited.user);
 for(let i=0;i<5;i++)assert.equal((await change(limited.j,{...value,currentPassword:'incorrect'})).status,400);
 r=await change(limited.j,value);assert.equal(r.status,429);assert.equal(r.headers.get('Retry-After'),'900');results.push('persistent_per_identity_attempt_limit');
 console.log(JSON.stringify({state:'ACCOUNT_PASSWORD_HTTP_LAB_PASSED',checks:results,count:results.length,syntheticOnly:true,credentialOrCookieValuesEmitted:false}));
}
main().catch(e=>{console.log(JSON.stringify({state:'ACCOUNT_PASSWORD_HTTP_LAB_FAILED',type:e.name,assertion:e.code||'SANITIZED',safeMessage:['admin login','parallel login','member login'].includes(e.message)?e.message:undefined,stackLocation:(e.stack||'').split('\n').find(s=>s.includes('account-password.http.cjs'))?.trim()}));process.exitCode=1;});
