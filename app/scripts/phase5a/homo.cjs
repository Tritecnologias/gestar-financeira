// Guarded HOMO HTTP smoke: exclusively synthetic accounts and newly created FASE5A records.
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),XLSX=require('xlsx'),bcrypt=require('bcryptjs');
const {PrismaClient}=require('@prisma/client'),{PrismaPg}=require('@prisma/adapter-pg');
let last='guard';const checks=[],saved=[];const ok=(name,v)=>{last=name;assert.ok(v,name);checks.push(name)};
async function main(){
 const url=new URL(process.env.DATABASE_URL),base='https://homolog.dezsolucoes.com.br',endpoint='/api/lancamentos/importacao-oficial';
 assert.equal(url.hostname,'hd9a0oz02vexqe9u8qadzg6k');assert.equal(url.pathname,'/gestar_financeira_homolog');assert.equal(process.env.ACCESS_AUTH_MODE,'identity');
 assert.equal(process.env.NEXTAUTH_URL,base);assert.equal(process.env.APP_PUBLIC_URL,base);
 assert.equal(JSON.parse(fs.readFileSync('/app/build-metadata.json')).sourceCommit,process.env.PHASE5A_EXPECTED_SHA);
 const db=new PrismaClient({adapter:new PrismaPg({connectionString:url.href})});
 async function request(jar,path,method='GET',data,raw=false){
  const form=data instanceof FormData,r=await fetch(base+path,{method,redirect:'manual',signal:AbortSignal.timeout(180000),headers:{Cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; '),...(data===undefined||form?{}:{'Content-Type':raw?'application/x-www-form-urlencoded':'application/json'})},body:data===undefined?undefined:form||raw?data:JSON.stringify(data)});
  for(const cookie of r.headers.getSetCookie()){const f=cookie.split(';')[0],i=f.indexOf('=');jar.set(f.slice(0,i),f.slice(i+1));}
  const type=r.headers.get('content-type')||'';return{status:r.status,body:type.includes('json')?await r.json():type.includes('spreadsheet')?Buffer.from(await r.arrayBuffer()):await r.text()};
 }
 const upload=(jar,file,mode='preview',token='')=>{const f=new FormData();f.set('file',new Blob([file]),'phase5a-synthetic.xlsx');f.set('mode',mode);if(token)f.set('previewToken',token);return request(jar,endpoint,'POST',f)};
 const stringify=v=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?x.toString():x);
 try{
  const [m]=await db.$queryRawUnsafe('SELECT count(*)::int n FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL');assert.equal(m.n,15);
  assert.equal(await db.lancamento.count(),10);assert.equal(await db.importOperation.count(),0);
  const baseline=await db.lancamento.findMany({orderBy:{id:'asc'}});assert.ok(baseline.every(r=>r.descricao.startsWith('FASE4A')));
  const originalIds=baseline.map(r=>r.id),original=stringify(baseline);
  const protectedIdentities=stringify(await db.authIdentity.findMany({where:{NOT:{email:{endsWith:'@example.invalid'}}},orderBy:{id:'asc'}}));
  const permissions=stringify({profiles:await db.accessProfile.findMany({orderBy:{id:'asc'}}),memberships:await db.tenantMembership.findMany({orderBy:{id:'asc'}}),admins:await db.platformAdmin.findMany({orderBy:{id:'asc'}})});
  const a=(await db.tenant.findUniqueOrThrow({where:{slug:'modo-dev'}})).id,b=(await db.tenant.findUniqueOrThrow({where:{slug:'modo-dev-isolamento'}})).id;
  const sessions={};
  for(const key of ['admin','member','owner']){
   const identity=await db.authIdentity.findUniqueOrThrow({where:{email:`phase3a-${key}@example.invalid`}});assert.equal(await db.platformAdmin.count({where:{identityId:identity.id}}),0);
   const password=crypto.randomBytes(32).toString('base64url');saved.push({id:identity.id,senhaHash:identity.senhaHash});await db.authIdentity.update({where:{id:identity.id},data:{senhaHash:await bcrypt.hash(password,12)}});
   const jar=new Map(),csrf=await request(jar,'/api/auth/csrf');await request(jar,'/api/auth/callback/credentials','POST',new URLSearchParams({csrfToken:csrf.body.csrfToken,email:identity.email,password,callbackUrl:base+'/inicio'}).toString(),true);
   ok('login synthetic '+key,!!(await request(jar,'/api/auth/session')).body.user?.id);sessions[key]=jar;
  }
  const {admin,owner,member}=sessions,template=await request(admin,endpoint+'/base?busca=FASE5A');ok('official template',template.status===200);
  const h=XLSX.utils.sheet_to_json(XLSX.read(template.body).Sheets.LANCAMENTOS,{header:1})[0];
  function file(rows,reverse=false){const headers=reverse?[...h].reverse():h,b=XLSX.utils.book_new();XLSX.utils.book_append_sheet(b,XLSX.utils.aoa_to_sheet([headers,...rows.map(r=>headers.map(k=>r[k]??''))]),'LANCAMENTOS');return XLSX.write(b,{bookType:'xlsx',type:'buffer',compression:true})}
  const rows=Array.from({length:10},(_,i)=>({DESCRICAO:'FASE5A HTTP '+i,DATA_LANCAMENTO:'2026-10-24',DIRECAO:'ENTRADA',STATUS:'previsto',VALOR_REALIZADO:'0',VALOR_PREVISTO:i===0?'0':'1',ANOTACAO:'synthetic'}));
  ok('401',(await upload(new Map(),file(rows))).status===401);ok('403',(await upload(member,file(rows))).status===403);
  const invalid=await upload(admin,file([...rows.slice(0,9),{...rows[9],VALOR_PREVISTO:'-1'}]));ok('last invalid no token',invalid.body.preview.errors.length>0&&!invalid.body.previewToken);
  let p=await upload(admin,file(rows));ok('preview no writes',p.body.preview.resumo.novos===10&&await db.lancamento.count()===10&&await db.importOperation.count()===0);
  const pair=await Promise.all([upload(admin,file(rows),'confirm',p.body.previewToken),upload(admin,file(rows),'confirm',p.body.previewToken)]);ok('concurrent confirms',pair.some(r=>r.body.state==='COMPLETED'));
  const receipt=await upload(admin,file([...rows].reverse(),true),'preview');ok('resaved reorder replay',receipt.body.replayed&&await db.lancamento.count()===20&&await db.importOperation.count()===1);
  ok('cross tenant receipt isolated',(await upload(owner,file(rows),'status')).body.state==='UNCONFIRMED');
  const exported=await request(admin,endpoint+'/base?busca=FASE5A'),parsed=XLSX.utils.sheet_to_json(XLSX.read(exported.body).Sheets.LANCAMENTOS,{defval:''}).filter(r=>r.REGISTRO_ID);ok('export roundtrip ten',parsed.length===10);
  const changed=parsed.map(r=>({...r,ANOTACAO:'',VALOR_PREVISTO:'2'}));p=await upload(admin,file(changed));const updated=await upload(admin,file(changed),'confirm',p.body.previewToken);ok('roundtrip update',updated.body.result.atualizados===10&&await db.lancamento.count()===20);
  ok('update replay',(await upload(admin,file(changed),'confirm',p.body.previewToken)).body.operationId===updated.body.operationId);
  const old=await upload(admin,file(parsed));ok('stale revisions blocked',old.body.preview.resumo.conflitos===10&&!old.body.previewToken);
  const foreign=await upload(owner,file([changed[0]]));ok('foreign ID blocked',foreign.body.preview.errors.length>0);
  ok('new records correct',(await db.lancamento.findMany({where:{tenantId:a,descricao:{startsWith:'FASE5A HTTP'}}})).every(r=>r.cont==='1'&&r.dre===null&&r.anotacao===null&&r.valorPrevisto.toString()==='2'));
  ok('isolation entries untouched',await db.lancamento.count({where:{tenantId:b}})===0);
  ok('all FASE4A bytes preserved',stringify(await db.lancamento.findMany({where:{id:{in:originalIds}},orderBy:{id:'asc'}}))===original);
  ok('real identities preserved',stringify(await db.authIdentity.findMany({where:{NOT:{email:{endsWith:'@example.invalid'}}},orderBy:{id:'asc'}}))===protectedIdentities);
  ok('access grants preserved',stringify({profiles:await db.accessProfile.findMany({orderBy:{id:'asc'}}),memberships:await db.tenantMembership.findMany({orderBy:{id:'asc'}}),admins:await db.platformAdmin.findMany({orderBy:{id:'asc'}})})===permissions);
  console.log(JSON.stringify({state:'HOMO_HTTP_VERIFIED',checks,existingEntriesUnchanged:10,newSyntheticEntries:10,receipts:await db.importOperation.count()}));
 }finally{for(const s of saved)await db.authIdentity.update({where:{id:s.id},data:{senhaHash:s.senhaHash}});await db.$disconnect()}
}
main().catch(e=>{console.error(JSON.stringify({state:'FAILED',last,code:e.code||e.name,message:e.name==='AssertionError'?e.message:undefined}));process.exitCode=1});
