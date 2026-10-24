// Synthetic laboratory only. Credentials remain in memory and are restored.
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs');
const XLSX=require('xlsx'),bcrypt=require('bcryptjs');
const {PrismaClient}=require('@prisma/client'),{PrismaPg}=require('@prisma/adapter-pg');
const {Client}=require('pg');
const url=new URL(process.env.DATABASE_URL),base=process.env.APP_PUBLIC_URL;
const passed=[],hashes=[];let last='guards';
function ok(label,value){last=label;assert.ok(value,label);passed.push(label);}
async function main(){
  assert.equal(url.hostname,'10s-phase5a-pg');assert.equal(url.pathname,'/phase5a_lab');
  assert.equal(base,'http://10s-phase5a-app:3000');assert.equal(process.env.NEXTAUTH_URL,base);
  assert.equal(process.env.ACCESS_AUTH_MODE,'identity');
  assert.equal(JSON.parse(fs.readFileSync('/app/build-metadata.json')).sourceCommit,process.env.PHASE5A_EXPECTED_SHA);
  const db=new PrismaClient({adapter:new PrismaPg({connectionString:url.href})});
  const endpoint='/api/lancamentos/importacao-oficial';
  async function request(jar,path,method='GET',data,raw=false,signal){
    const form=data instanceof FormData;
    const r=await fetch(base+path,{method,redirect:'manual',signal:signal||AbortSignal.timeout(180000),headers:{Cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; '),...(data===undefined||form?{}:{'Content-Type':raw?'application/x-www-form-urlencoded':'application/json'})},body:data===undefined?undefined:form||raw?data:JSON.stringify(data)});
    for(const cookie of r.headers.getSetCookie()){const f=cookie.split(';')[0],i=f.indexOf('=');jar.set(f.slice(0,i),f.slice(i+1));}
    const type=r.headers.get('content-type')||'';
    return {status:r.status,body:type.includes('json')?await r.json():type.includes('spreadsheet')?Buffer.from(await r.arrayBuffer()):await r.text()};
  }
  function upload(jar,file,mode='preview',token='',signal){const f=new FormData();f.set('file',new Blob([file]),'synthetic.xlsx');f.set('mode',mode);if(token)f.set('previewToken',token);return request(jar,endpoint,'POST',f,false,signal);}
  try{
    const [ledger]=await db.$queryRawUnsafe('SELECT count(*)::int AS n FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL');assert.equal(ledger.n,15);
    assert.equal(await db.lancamento.count(),0);assert.equal(await db.importOperation.count(),0);
    assert.equal(await db.authIdentity.count({where:{NOT:{email:{endsWith:'@example.invalid'}}}}),0);
    const a=(await db.tenant.findUniqueOrThrow({where:{slug:'modo-dev'}})).id,b=(await db.tenant.findUniqueOrThrow({where:{slug:'modo-dev-isolamento'}})).id;
    const sessions={};
    for(const key of ['admin','member','owner']){
      const identity=await db.authIdentity.findUniqueOrThrow({where:{email:`phase3a-${key}@example.invalid`}});
      const password=crypto.randomBytes(32).toString('base64url');hashes.push({id:identity.id,senhaHash:identity.senhaHash});
      await db.authIdentity.update({where:{id:identity.id},data:{senhaHash:await bcrypt.hash(password,12)}});
      const jar=new Map(),csrf=await request(jar,'/api/auth/csrf');
      await request(jar,'/api/auth/callback/credentials','POST',new URLSearchParams({csrfToken:csrf.body.csrfToken,email:identity.email,password,callbackUrl:base+'/inicio'}).toString(),true);
      ok('synthetic login '+key,!!(await request(jar,'/api/auth/session')).body.user?.id);sessions[key]=jar;
    }
    const {admin,member,owner}=sessions;
    const template=await request(admin,endpoint+'/base');ok('download empty official XLSX',template.status===200&&Buffer.isBuffer(template.body));
    const wb=XLSX.read(template.body),headers=XLSX.utils.sheet_to_json(wb.Sheets.LANCAMENTOS,{header:1})[0];
    function file(rows,reverse=false){const h=reverse?[...headers].reverse():headers,w=XLSX.utils.book_new();XLSX.utils.book_append_sheet(w,XLSX.utils.aoa_to_sheet([h,...rows.map(r=>h.map(k=>r[k]??''))]),'LANCAMENTOS');return XLSX.write(w,{type:'buffer',bookType:'xlsx',compression:true});}
    const row=name=>({DESCRICAO:'FASE5A '+name,DATA_LANCAMENTO:'2026-10-24',DIRECAO:'ENTRADA',STATUS:'previsto',VALOR_PREVISTO:'1',VALOR_REALIZADO:'0'});
    const snapshot=async()=>JSON.stringify({rows:await db.lancamento.findMany({orderBy:{id:'asc'}}),ops:await db.importOperation.findMany({orderBy:{id:'asc'}})},(_,v)=>typeof v==='bigint'?v.toString():v);
    const initial=await snapshot();
    ok('401 unauthenticated',(await upload(new Map(),file([row('unauthorized')]))).status===401);
    ok('403 CONSULTA',(await upload(member,file([row('denied')]))).status===403);
    ok('empty base rejected',(await upload(admin,template.body)).status===400);
    for(const patch of [{VALOR_PREVISTO:'-1'},{DATA_LANCAMENTO:'31/02/2026'},{DRE:'manual'},{CATEGORIA_N1:'FOREIGN'},{REGISTRO_ID:crypto.randomUUID(),REGISTRO_VERSAO:'v1:0'}]){
      const r=await upload(admin,file([row('valid'),{...row('last invalid'),...patch}]));
      ok('invalid last row '+Object.keys(patch)[0],r.status===200&&r.body.preview.errors.length>0&&!r.body.previewToken);
    }
    ok('preview/access no writes',await snapshot()===initial);
    const ten=Array.from({length:10},(_,i)=>({...row('roundtrip '+i),VALOR_PREVISTO:i===0?'0':'1',ANOTACAO:'clear me'}));
    let preview=await upload(admin,file(ten));ok('ten preview',preview.body.preview.resumo.novos===10);
    let result=await upload(admin,file(ten),'confirm',preview.body.previewToken);
    ok('ten persisted with receipt',result.status===200&&result.body.result.criados===10&&await db.lancamento.count()===10&&await db.importOperation.count()===1);
    ok('CONT automatic DRE null',(await db.lancamento.findMany()).every(r=>r.cont==='1'&&r.dre===null));
    const id=result.body.operationId;
    for(const [mode,bytes] of [['confirm',file(ten)],['preview',file([...ten].reverse(),true)],['status',file(ten)]]){
      result=await upload(admin,bytes,mode,preview.body.previewToken);ok('replay '+mode,result.body.operationId===id&&result.body.replayed===true&&await db.lancamento.count()===10);
    }
    const exported=await request(admin,endpoint+'/base'),x=XLSX.read(exported.body);let exportedRows=XLSX.utils.sheet_to_json(x.Sheets.LANCAMENTOS,{defval:''}).filter(r=>r.REGISTRO_ID);
    ok('roundtrip export ten',exportedRows.length===10);
    const updates=exportedRows.map((r,i)=>({...r,ANOTACAO:'',...(i===0?{DESCRICAO:'FASE5A updated',VALOR_PREVISTO:'2'}:{})}));
    preview=await upload(admin,file(updates));ok('update preview by id',preview.body.preview.resumo.alterados===10);
    result=await upload(admin,file(updates),'confirm',preview.body.previewToken);ok('updates no creates',result.body.result.atualizados===10&&await db.lancamento.count()===10);
    ok('optional empty clears',(await db.lancamento.findMany()).every(r=>r.anotacao===null));
    ok('update replay stale versions', (await upload(admin,file([...updates].reverse()),'confirm',preview.body.previewToken)).body.operationId===result.body.operationId);
    const stale=await upload(admin,file(exportedRows));ok('optimistic old revision conflict',stale.body.preview.resumo.conflitos===10&&!stale.body.previewToken);
    const foreign=await upload(owner,file([{...row('foreign'),REGISTRO_ID:exportedRows[0].REGISTRO_ID,REGISTRO_VERSAO:exportedRows[0].REGISTRO_VERSAO}]));ok('cross tenant ID blocked',foreign.body.preview.errors.length>0);
    // Same content in another authorized tenant is a different operation.
    preview=await upload(owner,file(ten));result=await upload(owner,file(ten),'confirm',preview.body.previewToken);ok('tenant receipt isolation',result.body.operationId!==id&&await db.lancamento.count({where:{tenantId:b}})===10);
    const twins=[row('identical legitimate'),row('identical legitimate')],twinFile=file(twins);preview=await upload(admin,twinFile);
    const parallel=await Promise.all([upload(admin,twinFile,'confirm',preview.body.previewToken),upload(admin,twinFile,'confirm',preview.body.previewToken)]);
    ok('concurrent same batch no duplicates',parallel.some(r=>r.body.state==='COMPLETED')&&await db.lancamento.count({where:{tenantId:a,descricao:twins[0].DESCRICAO}})===2);
    ok('concurrent receipt recovered',(await upload(admin,twinFile,'status')).body.state==='COMPLETED');
    // Database constraint remains effective even without the application lock.
    const receipt=await db.importOperation.findFirstOrThrow();let unique=false;
    try{await db.importOperation.create({data:{...receipt,id:crypto.randomUUID()}})}catch(e){unique=e.code==='P2002'}ok('database UNIQUE protects concurrency',unique);
    // Force failure on the final INSERT only inside disposable lab, proving transaction rollback.
    await db.$executeRawUnsafe("CREATE FUNCTION phase5a_fail_last() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.descricao='FASE5A forced last failure' THEN RAISE EXCEPTION 'synthetic'; END IF; RETURN NEW; END $$");
    await db.$executeRawUnsafe('CREATE TRIGGER phase5a_fail_last BEFORE INSERT ON lancamentos FOR EACH ROW EXECUTE FUNCTION phase5a_fail_last()');
    const before=await snapshot(),failed=file([row('first would insert'),row('forced last failure')]);preview=await upload(admin,failed);result=await upload(admin,failed,'confirm',preview.body.previewToken);
    ok('final insert failure leaves no entries or receipt',result.body.state==='UNCONFIRMED'&&await snapshot()===before);
    await db.$executeRawUnsafe('DROP TRIGGER phase5a_fail_last ON lancamentos');await db.$executeRawUnsafe('DROP FUNCTION phase5a_fail_last()');
    // Client interruption while server waits on SEQ. The transaction can still commit.
    const lock=new Client({connectionString:url.href});await lock.connect();
    const delayed=file([row('client interrupted')]);preview=await upload(admin,delayed);
    await lock.query('SELECT pg_advisory_lock(hashtextextended($1,0))',['lancamento-seq:'+a]);
    const controller=new AbortController();const pending=upload(admin,delayed,'confirm',preview.body.previewToken,controller.signal).catch(()=>null);
    await new Promise(r=>setTimeout(r,1000));controller.abort();await pending;
    const during=await upload(admin,delayed,'status');ok('timeout absence means unconfirmed',during.body.state==='UNCONFIRMED');
    await lock.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',['lancamento-seq:'+a]);await lock.end();
    let recovered;for(let i=0;i<30;i++){recovered=await upload(admin,delayed,'status');if(recovered.body.state==='COMPLETED')break;await new Promise(r=>setTimeout(r,200));}
    ok('lost response recovered by receipt',recovered.body.state==='COMPLETED');
    ok('retry lost response no duplicate',(await upload(admin,delayed,'confirm',preview.body.previewToken)).body.operationId===recovered.body.operationId&&await db.lancamento.count({where:{descricao:'FASE5A client interrupted'}})===1);
    const huge=new Uint8Array(10*1024*1024+1);ok('HTTP actual file limit',(await upload(admin,huge)).status===413);
    const large=Array.from({length:10000},(_,i)=>row('boundary '+i));
    ok('HTTP 10001 rejected',(await upload(admin,file([...large,row('overflow')]))).status===400);
    const started=Date.now(),largeFile=file(large);preview=await upload(admin,largeFile);
    ok('HTTP 10000 preview',preview.status===200&&preview.body.preview.resumo.novos===10000);
    result=await upload(admin,largeFile,'confirm',preview.body.previewToken);
    ok('HTTP 10000 atomic confirm',result.body.state==='COMPLETED'&&result.body.result.criados===10000);
    ok('HTTP 10000 replay',(await upload(admin,file([...large].reverse()),'preview')).body.operationId===result.body.operationId);
    const boundaryMs=Date.now()-started;
    console.log(JSON.stringify({state:'LAB_HTTP_VERIFIED',checks:passed,entries:await db.lancamento.count(),receipts:await db.importOperation.count(),boundaryMs}));
  }finally{for(const h of hashes)await db.authIdentity.update({where:{id:h.id},data:{senhaHash:h.senhaHash}});await db.$disconnect();}
}
main().catch(e=>{console.error(JSON.stringify({state:'FAILED',last,code:e.code||e.name,message:e.name==='AssertionError'?e.message:undefined}));process.exitCode=1});
