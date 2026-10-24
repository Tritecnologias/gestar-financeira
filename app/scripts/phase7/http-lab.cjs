const assert=require('node:assert/strict'),crypto=require('node:crypto'),bcrypt=require('bcryptjs'),fs=require('node:fs');
const {Pool}=require('pg');
async function main(){
 if(process.env.PHASE7_LAB!=='1'||new URL(process.env.DATABASE_URL).pathname!=='/phase7_lab')throw Error('LAB_ONLY');
 const pool=new Pool({connectionString:process.env.DATABASE_URL}),q=async(s,p=[])=>(await pool.query(s,p)).rows;
 const base='http://10s-phase7-app:3000';let checks=0;const ok=(v,label)=>{assert.ok(v,label);checks++};
 async function req(jar,path,method='GET',data,headers={}){const encoded=data instanceof URLSearchParams;
  const r=await fetch(base+path,{method,redirect:'manual',signal:AbortSignal.timeout(65000),headers:{Cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; '),Origin:base,...(data===undefined?{}:{'Content-Type':encoded?'application/x-www-form-urlencoded':'application/json'}),...headers},body:data===undefined?undefined:encoded?data:JSON.stringify(data)});
  for(const c of r.headers.getSetCookie()){const p=c.split(';')[0],i=p.indexOf('=');jar.set(p.slice(0,i),p.slice(i+1))}
  return{status:r.status,headers:r.headers,body:(r.headers.get('content-type')||'').includes('json')?await r.json():await r.text()};
 }
 const [owner]=await q("SELECT m.*,u.id AS legacy_id FROM tenant_memberships m JOIN usuarios u ON u.tenant_id=m.tenant_id WHERE m.role='OWNER'");
 const password=crypto.randomBytes(32).toString('base64url');await q('UPDATE auth_identities SET senha_hash=$2 WHERE id=$1',[owner.identity_id,await bcrypt.hash(password,12)]);
 await q("INSERT INTO legacy_user_access_maps(id,legacy_usuario_id,identity_id,tenant_id,membership_id) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",[crypto.randomUUID(),owner.legacy_id,owner.identity_id,owner.tenant_id,owner.id]);
 const jar=new Map(),anon=new Map();let r=await req(jar,'/api/auth/csrf');
 await req(jar,'/api/auth/callback/credentials','POST',new URLSearchParams({csrfToken:r.body.csrfToken,email:'owner@example.invalid',password,callbackUrl:base+'/inicio'}));
 ok((await req(jar,'/api/auth/session')).body.user?.id,'login');
 ok((await req(anon,'/api/backups')).status===401,'anonymous');
 ok((await req(jar,'/backups')).status===200,'page');
 r=await req(jar,'/api/backups');ok(r.status===200,'download');const backup=r.body;
 ok(r.headers.get('cache-control')==='no-store','private download');ok(r.headers.get('content-disposition').includes('.json'),'filename');
 ok((await req(jar,'/api/backups','POST',backup,{Origin:'https://other.invalid'})).status===403,'cross-origin');
 const [entry]=await q('SELECT id FROM lancamentos WHERE tenant_id=$1',[owner.tenant_id]);
 await q("UPDATE lancamentos SET descricao='HTTP B' WHERE id=$1",[entry.id]);
 r=await req(jar,'/api/backups','POST',backup);ok(r.status===200,'preview');const preview=r.body.preview;
 ok((await req(jar,'/api/backups?action=restore','POST',backup)).status===400,'explicit confirmation');
 const attempt=crypto.randomUUID();r=await req(jar,'/api/backups?action=restore','POST',backup,{'x-backup-confirm':owner.tenant_id,'x-backup-preview':preview.currentDigest,'x-backup-attempt':attempt});ok(r.status===200,'restore');
 ok((await q('SELECT descricao FROM lancamentos WHERE id=$1',[entry.id]))[0].descricao===backup.sections.lancamentos.rows[0].descricao,'persisted A');
 ok((await req(jar,'/api/backups?attempt='+attempt)).body.receipt?.id===attempt,'receipt');
 const [count]=await q("SELECT count(*)::int n FROM audit_events WHERE action='TENANT_RESTORE_COMPLETED' AND id=$1",[attempt]);ok(count.n===1,'audit');
 await q("UPDATE tenant_memberships SET role='MEMBER' WHERE id=$1",[owner.id]);
 ok((await req(jar,'/api/backups')).status===403,'PA with unprivileged membership denied');
 ok((await req(jar,'/api/backups','POST',backup)).status===403,'restore denied MEMBER');
 await q("UPDATE access_profiles SET permissoes=ARRAY['sistema.backup.view','sistema.backup.create'] WHERE id=$1",[owner.profile_id]);
 ok((await req(jar,'/api/backups')).status===200,'explicit export permission');
 ok((await req(jar,'/api/backups','POST',backup)).status===403,'export is not restore permission');
 await q("UPDATE tenant_memberships SET role='OWNER' WHERE id=$1",[owner.id]);
 ok(!(await req(jar,'/api/backups')).body.references.usuarios.some(r=>'senha_hash' in r),'credential exclusion');
 console.log(JSON.stringify({state:'PASSED',httpChecks:checks}));await pool.end();
}
main().catch(e=>{console.error('HTTP_LAB_FAILED',e.code||e.name,e.message);process.exitCode=1});
