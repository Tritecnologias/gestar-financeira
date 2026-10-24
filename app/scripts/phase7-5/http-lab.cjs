// Synthetic LOCAL laboratory only. Never run against HOMO or production.
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),bcrypt=require('bcryptjs'),{Pool}=require('pg');
async function main(){
 if(process.env.PHASE7_5_LAB!=='1'||new URL(process.env.DATABASE_URL).pathname!=='/phase7_lab')throw Error('LAB_ONLY');
 const pool=new Pool({connectionString:process.env.DATABASE_URL}),q=async(s,p=[])=>(await pool.query(s,p)).rows;
 const tenants=await q("SELECT id,slug FROM tenants ORDER BY slug");assert.deepEqual(tenants.map(t=>t.slug),['lab-a','lab-b']);
 const a=tenants[0].id,b=tenants[1].id,base='http://10s-phase75-app:3000',results=[];
 function ok(value,label){assert.ok(value,label);results.push(label)}
 async function req(jar,path,method='GET',data){const form=data instanceof URLSearchParams;
 const r=await fetch(base+path,{method,redirect:'manual',signal:AbortSignal.timeout(60000),headers:{Cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; '),Origin:base,...(data===undefined?{}:{'Content-Type':form?'application/x-www-form-urlencoded':'application/json'})},body:data===undefined?undefined:form?data:JSON.stringify(data)});
 for(const c of r.headers.getSetCookie()){const p=c.split(';')[0],i=p.indexOf('=');jar.set(p.slice(0,i),p.slice(i+1))}
 return{status:r.status,location:r.headers.get('location'),body:(r.headers.get('content-type')||'').includes('json')?await r.json():await r.text()};}
 const all=['acessos.usuarios.view','acessos.perfis.view','acessos.auditoria.view','sistema.configuracoes.view','sistema.backup.view','sistema.backup.create','sistema.backup.restore'];
 async function actor(label,pa,role,perms,second=false){const id=crypto.randomUUID(),email=`phase75-${id}@example.invalid`,password=crypto.randomBytes(30).toString('base64url');
 await q("INSERT INTO auth_identities(id,email,nome,senha_hash) VALUES($1,$2,$3,$4)",[id,email,label,await bcrypt.hash(password,12)]);
 if(pa)await q('INSERT INTO platform_admins(id,identity_id) VALUES($1,$2)',[crypto.randomUUID(),id]);
 async function membership(t,r,p){const profile=crypto.randomUUID(),mid=crypto.randomUUID(),uid=crypto.randomUUID();await q('INSERT INTO access_profiles(id,tenant_id,nome,permissoes) VALUES($1,$2,$3,$4)',[profile,t,label,p]);await q('INSERT INTO tenant_memberships(id,identity_id,tenant_id,role,profile_id) VALUES($1,$2,$3,$4,$5)',[mid,id,t,r,profile]);await q('INSERT INTO usuarios(id,tenant_id,nome,email,senha_hash) VALUES($1,$2,$3,$4,$5)',[uid,t,label,email,'disabled-lab-legacy']);await q('INSERT INTO legacy_user_access_maps(id,legacy_usuario_id,identity_id,tenant_id,membership_id) VALUES($1,$2,$3,$4,$5)',[crypto.randomUUID(),uid,id,t,mid]);}
 if(role)await membership(a,role,perms);if(second)await membership(b,'MEMBER',[]);
 const jar=new Map();let r=await req(jar,'/api/auth/csrf');await req(jar,'/api/auth/callback/credentials','POST',new URLSearchParams({csrfToken:r.body.csrfToken,email,password,callbackUrl:base+'/inicio'}));ok((await req(jar,'/api/auth/session')).body.user?.id,`${label}: login`);
 if(role){r=await req(jar,'/api/tenants/switch','POST',{tenantId:a});ok(r.status===200,`${label}: selected tenant`)}
 return{jar,id};}
 const pa=await actor('PA no membership',true,null,[]),owner=await actor('OWNER',false,'OWNER',all),admin=await actor('ADMIN limited',false,'ADMIN',['acessos.usuarios.view']),member=await actor('CONSULTA',false,'MEMBER',[]),explicit=await actor('MEMBER explicit',false,'MEMBER',all),multi=await actor('PA multi',true,'OWNER',all,true);
 const routes=['/acessos','/acessos/perfis','/acessos/auditoria','/configuracoes','/backups'];
 const menuLabels=['Acessos / Usuários','Perfis de Acesso','Auditoria do Sistema','Configurações','Backup e Restauração'];
 function menu(html){return String(html).match(/<nav[^>]*aria-label="Menu principal"[\s\S]*?<\/nav>/)?.[0]||''}
 for(const [label,actor,visible,platform]of[['PA',pa,[],true],['OWNER',owner,routes,false],['ADMIN',admin,['/acessos'],false],['CONSULTA',member,[],false],['MEMBER explicit',explicit,['/configuracoes','/backups'],false],['PA multi',multi,routes,true]]){
 const p=await req(actor.jar,'/plataforma');ok(platform?p.status===200:p.status===307,`${label}: platform direct guard`);
 for(const route of routes){const r=await req(actor.jar,route);ok(visible.includes(route)?r.status===200:r.status===307,`${label}: ${route} direct guard`)}
 if(actor!==pa){const r=await req(actor.jar,'/inicio'),nav=menu(r.body);ok(r.status===200&&nav,`${label}: tenant UI`);ok(nav.includes('href="/plataforma"')===platform,`${label}: global visibility`);
 ok(nav.includes('aria-label="Administração do Sistema"')===(visible.length>0),`${label}: system visibility`);
 routes.forEach(route=>ok(nav.includes(`href="${route}"`)===visible.includes(route),`${label}: menu ${route}`));}
 else ok(!String(p.body).includes('Administração do Sistema'), 'PA no tenant navigation');
 }
 // Server guards remain authoritative even when a MEMBER profile contains admin view keys.
 ok((await req(explicit.jar,'/api/audit?view=tenant')).status===403,'MEMBER audit denied despite profile');
 ok((await req(pa.jar,'/api/backups')).status===403,'PA alone backup denied');
 ok((await req(explicit.jar,'/api/backups','POST',{})).status===403,'MEMBER restore denied despite permission');
 ok((await req(owner.jar,'/backups')).body.includes('Restaurar nesta empresa'),'OWNER restore control');
 ok(!(await req(explicit.jar,'/backups')).body.includes('Restaurar nesta empresa'),'MEMBER restore control hidden');
 ok((await req(owner.jar,'/api/backups')).status===200,'OWNER backup download');
 const events=[{tenant:null,mode:'SYSTEM',action:'PHASE75_GLOBAL'},{tenant:a,mode:'MEMBERSHIP',action:'PHASE75_A'},{tenant:b,mode:'MEMBERSHIP',action:'PHASE75_B'}];
 for(const e of events)await q("INSERT INTO audit_events(id,tenant_id,actor_identity_id,access_mode,action,resource_type,result) VALUES($1,$2,$3,$4,$5,'Lab','SUCCESS')",[crypto.randomUUID(),e.tenant,owner.id,e.mode,e.action]);
 let r=await req(owner.jar,'/api/audit?view=tenant');ok(r.status===200&&r.body.rows.some(x=>x.action==='PHASE75_A')&&!r.body.rows.some(x=>['PHASE75_B','PHASE75_GLOBAL'].includes(x.action)),'tenant audit scoped');
 r=await req(pa.jar,'/api/audit?view=platform');ok(r.status===200&&r.body.rows.some(x=>x.action==='PHASE75_GLOBAL')&&!r.body.rows.some(x=>['PHASE75_A','PHASE75_B'].includes(x.action)),'platform audit scoped');
 ok((await req(owner.jar,'/api/audit?view=platform')).status===403,'OWNER global audit denied');
 await req(multi.jar,'/api/tenants/switch','POST',{tenantId:b});r=await req(multi.jar,'/inicio');ok(!menu(r.body).includes('Administração do Sistema')&&menu(r.body).includes('href="/plataforma"'),'multi context recalculates menu');ok((await req(multi.jar,'/backups')).status===307,'multi context backup denied');
 await req(multi.jar,'/api/tenants/switch','POST',{tenantId:a});
 // Lab-only cookies for isolated browser checks; never repository or stdout.
 fs.writeFileSync('/evidence/browser-session.private.json',JSON.stringify({cookies:[...multi.jar].map(([name,value])=>({name,value,domain:'127.0.0.1',path:'/',httpOnly:true,secure:false,sameSite:'Lax'}))}),{mode:0o600});
 await pool.end();console.log(JSON.stringify({state:'PASSED',checks:results.length,results}));
}
main().catch(e=>{console.error('PHASE75_LAB_FAILED',e.code||e.name,e.message);process.exitCode=1});
