// LOCAL synthetic laboratory only. Credentials enter stdin; no values/cookies emitted.
const assert = require('node:assert/strict');
async function main() {
 let raw=''; for await(const s of process.stdin) raw+=s; const cfg=JSON.parse(raw); raw='';
 const base='http://localhost:3014'; assert(['http://localhost:3014','http://localhost:3015'].includes(base)); assert.equal(cfg.database,'phase11b_lab');
 const checks=[]; let step='login';
 const req=async(j,path,method='GET',body)=>{const r=await fetch(base+path,{method,redirect:'manual',headers:{Cookie:[...j].map(([k,v])=>k+'='+v).join('; '),Origin:base,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});for(const c of r.headers.getSetCookie()){const [part]=c.split(';'),at=part.indexOf('=');if(!part.slice(at+1))j.delete(part.slice(0,at));else j.set(part.slice(0,at),part.slice(at+1));}return r;};
 async function login(name){const j=new Map(),csrf=await(await req(j,'/api/auth/csrf')).json();const r=await fetch(base+'/api/auth/callback/credentials',{method:'POST',redirect:'manual',headers:{Cookie:[...j].map(([k,v])=>k+'='+v).join('; '),'Content-Type':'application/x-www-form-urlencoded','X-Auth-Return-Redirect':'1',Origin:base},body:new URLSearchParams({csrfToken:csrf.csrfToken,email:name+'11b@example.invalid',password:cfg.password,callbackUrl:base+'/inicio'})});for(const c of r.headers.getSetCookie()){const [p]=c.split(';'),at=p.indexOf('=');j.set(p.slice(0,at),p.slice(at+1));}assert((await(await req(j,'/api/auth/session')).json())?.user,'synthetic login');return j;}

 const {execFileSync}=require('node:child_process');
 const sql=q=>execFileSync('docker',['exec','-i','dez-local-pg18-postgres-1','psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','pg18_local_admin','-d','phase11b_lab'],{input:q,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
 assert.equal(sql('SELECT current_database()'),'phase11b_lab');
 const owner=await login('owner'),advisor=await login('advisor');
 let grantId;const marker='AUDIT FAULT '+Date.now();
 try{
  let r=await req(owner,'/api/tenants/switch','POST',{tenantId:cfg.tenants.main});assert.equal(r.status,200);
  r=await req(owner,'/api/access/advisory','POST',{email:'advisor11b@example.invalid',purpose:'Prova sintética de falha de auditoria',permissions:['fluxo.lancamentos.view','fluxo.lancamentos.create'],confirm:true});assert.equal(r.status,201);grantId=(await r.json()).id;
  r=await req(advisor,'/api/tenants/switch','POST',{tenantId:cfg.tenants.main,advisoryGrantId:grantId});assert.equal(r.status,200);
  function fault(action){assert(/^[A-Z_]+$/.test(action));sql(`CREATE OR REPLACE FUNCTION public.phase11b_audit_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.access_mode='ADVISORY' AND NEW.action='${action}' THEN RAISE EXCEPTION 'SYNTHETIC_AUDIT_FAILURE'; END IF; RETURN NEW; END $$;`);}
  fault('ADVISORY_OPERATION_AUTHORIZED');sql('CREATE TRIGGER phase11b_audit_fault BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION phase11b_audit_fault()');
  r=await req(advisor,'/api/lancamentos','POST',{descricao:marker,valor:0});assert.equal(r.status,503);const denied=await r.json();assert(denied.error.includes('não foi iniciada'));assert.equal(sql(`SELECT count(*) FROM lancamentos WHERE descricao='${marker}'`),'0');checks.push('pre-operation audit failure blocks write with sanitized 503');
  fault('ADVISORY_OPERATION');r=await req(advisor,'/api/lancamentos','POST',{descricao:marker,valor:0});assert.equal(r.status,503);const uncertain=await r.json();assert(uncertain.error.includes('Resultado não confirmado'));assert.equal(sql(`SELECT count(*) FROM lancamentos WHERE descricao='${marker}'`),'1');checks.push('post-commit audit failure reports unconfirmed without false rollback');
  console.log(JSON.stringify({state:'ADVISORY_AUDIT_FAILURE_PASSED',checks}));
 }finally{sql('DROP TRIGGER IF EXISTS phase11b_audit_fault ON audit_events;DROP FUNCTION IF EXISTS phase11b_audit_fault()');if(grantId)assert.equal((await req(owner,'/api/access/advisory/'+grantId,'PATCH',{action:'revoke',confirm:true,reason:'Fim do teste de falha de auditoria'})).status,200);}
}
main().catch(e=>{console.log(JSON.stringify({state:'ADVISORY_AUDIT_FAILURE_FAILED',type:e.name,actual:e.actual,expected:e.expected}));process.exitCode=1;});
