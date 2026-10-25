// Integration runner: real isolated PostgreSQL/Prisma and the built HTTP artifact.
// Never run against shared environments; emit check labels, not historical rows/secrets.
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs/promises');
const {Pool}=require('pg'),{PrismaClient}=require('@prisma/client'),{PrismaPg}=require('@prisma/adapter-pg');
const bcrypt=require('bcryptjs'),XLSX=require('xlsx');
const checks=[],ok=(value,label)=>{assert(value,label);checks.push(label)},id=()=>crypto.randomUUID();
async function main(){
 const url=new URL(process.env.DATABASE_URL),base=process.env.PHASE91_LAB_URL;
 assert.equal(process.env.PHASE92A_LAB,'1');assert.equal(url.hostname,'phase9-prod-clone-pg');assert.match(url.pathname,/^\/phase91_restore_r\d+$/);assert.match(base,/^http:\/\/phase91-lab-app-r\d+:3000$/);
 const pool=new Pool({connectionString:url.href}),prisma=new PrismaClient({adapter:new PrismaPg({connectionString:url.href})});
 const q=async(s,p=[])=>(await pool.query(s,p)).rows;
 function cookies(jar,r){for(const h of r.headers.getSetCookie()){const [p]=h.split(';'),n=p.indexOf('=');jar.set(p.slice(0,n),p.slice(n+1));}}
 async function request(jar,path,method='GET',body,extra={}){
  const form=body instanceof FormData,r=await fetch(base+path,{method,redirect:'manual',headers:{Origin:base,Cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; '),...(body===undefined||form?{}:{'Content-Type':'application/json'}),...extra},body:body===undefined?undefined:form?body:JSON.stringify(body)});cookies(jar,r);return r;
 }
 async function login(email,password){const jar=new Map(),csrf=await(await request(jar,'/api/auth/csrf')).json();const r=await fetch(base+'/api/auth/callback/credentials',{method:'POST',redirect:'manual',headers:{'Content-Type':'application/x-www-form-urlencoded',Cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; ')},body:new URLSearchParams({csrfToken:csrf.csrfToken,email,password,callbackUrl:base+'/inicio',json:'true'})});cookies(jar,r);assert((await(await request(jar,'/api/auth/session')).json())?.user);return jar;}
 try{
  const tenants=(await q('SELECT id FROM tenants ORDER BY id')).map(r=>r.id),tenant=tenants[0],neighbor=tenants[2];assert.equal(tenants.length,8);
  const owner=(await q("SELECT id,identity_id FROM tenant_memberships WHERE tenant_id=$1 AND role='OWNER' AND status='ACTIVE'",[tenant]))[0];
  const member=(await q("SELECT id,identity_id FROM tenant_memberships WHERE role='MEMBER' AND status='ACTIVE' ORDER BY id LIMIT 1"))[0];
  const pass=crypto.randomBytes(32).toString('base64url'),memberPass=crypto.randomBytes(32).toString('base64url');
  // Only the disposable copy; no human password is tested or logged, no access is granted.
  await q("UPDATE auth_identities SET email='phase92a-owner@example.invalid',senha_hash=$2 WHERE id=$1",[owner.identity_id,await bcrypt.hash(pass,10)]);
  await q("UPDATE auth_identities SET email='phase92a-member@example.invalid',senha_hash=$2 WHERE id=$1",[member.identity_id,await bcrypt.hash(memberPass,10)]);
  const jar=await login('phase92a-owner@example.invalid',pass);assert.equal((await request(jar,'/api/tenants/switch','POST',{tenantId:tenant})).status,200);
  const accessTables=['auth_identities','tenant_memberships','platform_admins','access_profiles','legacy_user_access_maps','usuarios','tenant_contractual_responsibles','support_grants','support_grant_events','access_owner_events'];
  const hash=async(t,where='',p=[])=> (await q(`SELECT md5(coalesce(string_agg(to_jsonb(t)::text,'|' ORDER BY to_jsonb(t)::text),'')) d FROM public."${t}" t ${where}`,p))[0].d;
  async function access(){const out={};for(const t of accessTables)out[t]=await hash(t);return out;}
  const scoped=(await q("SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='tenant_id' ORDER BY table_name")).map(r=>r.table_name);
  async function neighbors(){const out={};for(const t of scoped)out[t]=await hash(t,'WHERE tenant_id<>$1',[tenant]);return out;}
  const initialAccess=await access(),initialNeighbors=await neighbors();
  const migrations=await q('SELECT migration_name,checksum FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name');ok(migrations.length===18,'postgres-ledger18-complete');
  const constraint=(await q("SELECT pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid='public.lancamentos'::regclass AND conname='lancamentos_valor_check'"))[0].definition;ok(constraint.includes('valor IS NULL')&&constraint.includes('valor >= '),'postgres-constraint-null-or-nonnegative');
  let seq=(await q('SELECT coalesce(max(seq),0)::int n FROM lancamentos WHERE tenant_id=$1',[tenant]))[0].n;
  for(const valor of [null,0,.01]){const r=await prisma.lancamento.create({data:{tenantId:tenant,seq:++seq,descricao:'F92A PRISMA',valor,cont:'1'}});assert.equal(r.valor===null?null:r.valor.toFixed(2),valor===null?null:Number(valor).toFixed(2));}
  ok(true,'real-prisma-null-zero-cent-created');
  await assert.rejects(prisma.lancamento.create({data:{tenantId:tenant,seq:++seq,descricao:'F92A PRISMA NEGATIVE',valor:-.01,cont:'1'}}));ok(true,'real-prisma-negative-rejected');
  await assert.rejects(q("INSERT INTO lancamentos(tenant_id,seq,descricao,valor) VALUES($1,$2,'F92A SQL NEGATIVE',-1)",[tenant,++seq]),{code:'23514'});ok(true,'real-postgres-negative-check-violation');
  const post=async body=>{const r=await request(jar,'/api/lancamentos','POST',body);assert.equal(r.status,201);return r.json();};
  const zero=await post({valor:0}),absence=await post({descricao:'F92A HTTP NULL',valor:null}),cent=await post({valor:.01,anotacao:'F92A HTTP CENT'});
  ok(zero.valor===0&&zero.dataLanc===null&&zero.tipo===null&&zero.status==='realizado'&&zero.statusAuto!=='PAGO','real-http201-zero-only-automatic-status-no-direction-date');
  ok(absence.valor===null&&cent.valor===.01,'real-http201-null-and-cent');
  const stored=(await q('SELECT valor,data_lanc,tipo,status FROM lancamentos WHERE id=$1 AND tenant_id=$2',[zero.id,tenant]))[0];ok(stored.valor==='0.00'&&stored.data_lanc===null&&stored.tipo===null&&stored.status==='realizado','http-zero-confirmed-directly-in-postgres');
  for(const body of [{valor:-1},{valor:-.01},{}])assert.equal((await request(jar,'/api/lancamentos','POST',body)).status,400);ok(true,'real-http400-negatives-and-empty');
  let r=await request(jar,'/api/lancamentos/'+cent.id,'PUT',{valor:0,versao:cent.versao});assert.equal(r.status,200);let edited=await r.json();ok(edited.valor===0,'real-http-put-positive-to-zero');
  r=await request(jar,'/api/lancamentos/'+cent.id,'PUT',{valor:null,versao:edited.versao});assert.equal(r.status,200);edited=await r.json();ok(edited.valor===null&&edited.anotacao==='F92A HTTP CENT','real-http-put-zero-to-null-other-field-preserved');
  r=await request(jar,'/api/lancamentos/'+cent.id,'PUT',{valor:99,versao:cent.versao});const stale=await r.json();ok(r.status===409&&stale.error.includes('alterado por outra operação'),'real-http-stale-version409');
  r=await request(jar,'/api/lancamentos/lote','POST',{lancamentos:[{valor:0,anotacao:'F92A BATCH ZERO'},{valor:.01,anotacao:'F92A BATCH CENT'}]});assert.equal(r.status,201);const lote=await r.json();ok(lote.criados===2&&lote.data.some(x=>x.valor===0),'real-http-batch-with-zero');
  const before=await hash('lancamentos','WHERE tenant_id=$1',[tenant]);r=await request(jar,'/api/lancamentos/lote','POST',{lancamentos:[{valor:0},{valor:-1}]});ok(r.status===400&&await hash('lancamentos','WHERE tenant_id=$1',[tenant])===before,'real-http-batch-negative-atomic');
  r=await request(jar,'/api/lancamentos/importacao-oficial/base?busca=F92A-NO-MATCH');assert.equal(r.status,200);const basebook=XLSX.read(Buffer.from(await r.arrayBuffer()),{type:'buffer'}),headers=XLSX.utils.sheet_to_json(basebook.Sheets.LANCAMENTOS,{header:1})[0];
  const book=XLSX.utils.book_new(),values={VALOR_REALIZADO:0,ANOTACAO:'F92A I1 ZERO'};XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([headers,headers.map(h=>values[h]??'')]),'LANCAMENTOS');const bytes=XLSX.write(book,{type:'buffer',bookType:'xlsx'});
  const upload=(mode,token)=>{const f=new FormData();f.set('mode',mode);f.set('file',new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),'F92A-synthetic.xlsx');if(token)f.set('previewToken',token);return f;};
  r=await request(jar,'/api/lancamentos/importacao-oficial','POST',upload('preview'));assert.equal(r.status,200);const plan=await r.json();assert.equal(plan.state,'READY');
  r=await request(jar,'/api/lancamentos/importacao-oficial','POST',upload('confirm',plan.previewToken));assert.equal(r.status,200);const receipt=await r.json();ok(receipt.state==='COMPLETED'&&receipt.result.criados===1,'real-http-i1-zero-preview-confirm');
  r=await request(jar,'/api/lancamentos/importacao-oficial','POST',upload('confirm',plan.previewToken));const replay=await r.json();ok(r.status===200&&replay.replayed&&replay.operationId===receipt.operationId,'real-http-i1-idempotent-replay');
  ok((await q("SELECT valor FROM lancamentos WHERE tenant_id=$1 AND anotacao='F92A I1 ZERO'",[tenant]))[0].valor==='0.00','i1-zero-confirmed-directly-in-postgres');
  r=await request(jar,'/api/lancamentos?porPagina=all');assert.equal(r.status,200);const listing=await r.json();ok(listing.data.find(x=>x.id===zero.id).valor===0&&listing.data.find(x=>x.id===absence.id).valor===null,'real-http-get-dto-null-distinct-zero');
  const sum=(await q('SELECT coalesce(sum(valor),0)::text total FROM lancamentos WHERE tenant_id=$1',[tenant]))[0].total;ok(Number(listing.totais.valorRealizado)===Number(sum),'real-http-totals-match-postgres');
  r=await request(jar,'/api/lancamentos/exportar?busca=F92A I1 ZERO');assert.equal(r.status,200);const csv=await r.text();ok(csv.split('\n')[1].split(';')[15]==='"0"','real-http-csv-zero-preserved');
  r=await request(jar,'/api/lancamentos/importacao-oficial/base?busca=F92A I1 ZERO');assert.equal(r.status,200);const exported=XLSX.read(Buffer.from(await r.arrayBuffer()),{type:'buffer'});const sheet=XLSX.utils.sheet_to_json(exported.Sheets.LANCAMENTOS,{header:1});ok(sheet[1][sheet[0].indexOf('VALOR_REALIZADO')]==='0.00','real-http-xlsx-zero-preserved');
  const period='inicio=1900-01-01&fim=2100-12-31&dataReferencia=2026-10-25&dataBase=DATA_LANCAMENTO';r=await request(jar,'/api/fluxo-caixa/resumo?'+period+'&busca=F92A');assert.equal(r.status,200);const cash=await r.json();ok(cash.realizado.componentes.length===0&&cash.saldoPeriodo.total==='0.00'&&cash.previsaoAberta.componentes.length===0,'real-http-cashflow-no-artificial-movements');
  for(const row of listing.data.filter(x=>x.valor===0))assert.notEqual(row.statusAuto,'PAGO');ok(true,'real-http-zero-not-automatic-paid');
  const foreign=(await q('SELECT id FROM lancamentos WHERE tenant_id=$1 LIMIT 1',[neighbor]))[0];assert(foreign);
  ok((await request(jar,'/api/lancamentos/'+foreign.id,'PUT',{versao:'v1:0',valor:0})).status===404,'real-http-foreign-row-not-editable');
  ok((await request(jar,'/api/tenants/switch','POST',{tenantId:neighbor})).status===403,'real-http-no-unauthorized-tenant-switch');
  // Exercise the compiled backup endpoint, not only the directly imported engine.
  r=await request(jar,'/api/backups');assert.equal(r.status,200);const backup=await r.json();ok(backup.format==='10s-tenant-backup/2'&&backup.migrations.length===18,'real-http-backup-v2-ledger18');
  const previous=JSON.parse(await fs.readFile('/private/phase91/backup17.json','utf8'));assert.equal(previous.migrations.length,17);
  r=await request(jar,'/api/backups','POST',previous);const rejected17=await r.json();ok(r.status===409&&rejected17.code==='SCHEMA_VERSION','genuine-unaltered-backup17-preview-fails-schema18');
  const liveZero=listing.data.find(x=>x.id===zero.id);r=await request(jar,'/api/lancamentos/'+zero.id,'PUT',{valor:4,versao:liveZero.versao});assert.equal(r.status,200);const changed=await r.json();
  r=await request(jar,'/api/backups','POST',backup);assert.equal(r.status,200);const preview=(await r.json()).preview;const attempt=id();
  const confirm={'x-backup-confirm':tenant,'x-backup-preview':preview.currentDigest,'x-backup-attempt':attempt};
  r=await request(jar,'/api/backups?action=restore','POST',backup,confirm);assert.equal(r.status,200);const restored=await r.json();ok(restored.receipt.version==='10s-tenant-backup/2','real-http-backup18-preview-and-restore');
  r=await request(jar,'/api/backups?action=restore','POST',backup,confirm);assert.equal(r.status,200);assert.deepEqual(await r.json(),restored);ok(true,'real-http-restore-receipt-idempotent');
  r=await request(jar,'/api/lancamentos/'+zero.id,'PUT',{versao:changed.versao,valor:8});const staleRestore=await r.json();ok(r.status===409&&staleRestore.error.includes('alterado por outra operação'),'real-http-stale-after-http-restore409');
  const afterRows=await prisma.lancamento.findMany({where:{tenantId:tenant,id:{in:[zero.id,absence.id,lote.data[1].id]}}});ok(afterRows.length===3&&afterRows.find(x=>x.id===zero.id).valor.toFixed(2)==='0.00'&&afterRows.find(x=>x.id===absence.id).valor===null&&afterRows.find(x=>x.id===lote.data[1].id).valor.toFixed(2)==='0.01','real-http-restore-null-zero-cent-prisma-confirmed');
  r=await request(jar,'/api/backups','POST',backup);const current=(await r.json()).preview;r=await request(jar,'/api/backups?action=restore','POST',previous,{'x-backup-confirm':tenant,'x-backup-preview':current.currentDigest,'x-backup-attempt':id()});ok(r.status===409&&(await r.json()).code==='SCHEMA_VERSION','genuine-backup17-restore-fails-schema18');
  const memberJar=await login('phase92a-member@example.invalid',memberPass);r=await request(memberJar,'/api/backups','POST',backup);ok(r.status===403,'real-http-member-cannot-restore');
  assert.deepEqual(await access(),initialAccess);ok(true,'all-access-digests-unchanged-no-grants-created');assert.deepEqual(await neighbors(),initialNeighbors);ok(true,'all-neighbor-tenant-digests-unchanged');
  console.log(JSON.stringify({state:'PASSED',checks:checks.length,results:checks,realPostgreSQL:true,realPrisma:true,realHTTP:true,migrations:18,newAccess:0,productionOrHomologTouched:false}));
 }finally{await prisma.$disconnect();await pool.end();}
}
main().catch(e=>{console.log(JSON.stringify({state:'STOPPED',code:e.code??e.name,check:e.code==='ERR_ASSERTION'?String(e.message).split('\n')[0]:undefined,completed:checks}));process.exitCode=1;});
