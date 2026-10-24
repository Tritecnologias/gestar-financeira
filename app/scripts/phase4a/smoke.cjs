// Guarded synthetic operational test. Never uses Ricardo's credentials.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const XLSX = require('xlsx');

async function smoke(db, base) {
  const passed = [], oldHashes = [], jars = [];
  const ok = (label, condition) => { if (!condition) throw Error('CHECK_FAILED: '+label); passed.push(label); global.phase4aLastCheck=label; };
  async function request(jar, path, method='GET', data, raw=false) {
    const form = data instanceof FormData;
    const response=await fetch(base+path,{method,redirect:'manual',signal:AbortSignal.timeout(60000),
      headers:{Cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; '),...(data===undefined||form?{}:{'Content-Type':raw?'application/x-www-form-urlencoded':'application/json'})},
      body:data===undefined?undefined:form||raw?data:JSON.stringify(data)});
    for(const cookie of response.headers.getSetCookie()){const first=cookie.split(';')[0],at=first.indexOf('=');jar.set(first.slice(0,at),first.slice(at+1));}
    const type=response.headers.get('content-type')||'';
    const body=type.includes('json')?await response.json():type.includes('spreadsheet')?new Uint8Array(await response.arrayBuffer()):await response.text();
    return {status:response.status,body};
  }
  const empty=new Map();
  try {
    const tenants=await db.tenant.findMany({where:{slug:{in:['modo-dev','modo-dev-isolamento']}}});
    assert.equal(tenants.length,2);
    const a=tenants.find(t=>t.slug==='modo-dev').id,b=tenants.find(t=>t.slug==='modo-dev-isolamento').id;
    const setup=[];
    for(const [index,tenantId] of [a,b].entries()) {
      const code=String(40+index);
      assert.equal(await db.categoria.count({where:{tenantId,codigo:code}}),0,'Fixture exists: stop, never overwrite');
      setup.push(await db.$transaction(async tx=>{
        const category=await tx.categoria.create({data:{tenantId,codigo:code,nome:'FASE4A categoria sintética '+code}});
        const account=await tx.planoContas.create({data:{tenantId,codigo:code+'.01',descricao:'FASE4A receita sintética',tipo:'RECEITA',categoriaId:category.id}});
        const area=await tx.areaNegocio.create({data:{tenantId,codigo:'F4A'+code,nome:'FASE4A área sintética'}});
        const center=await tx.centroCusto.create({data:{tenantId,codigo:'F4A'+code,nome:'FASE4A centro sintético',areaId:area.id}});
        const client=await tx.cliente.create({data:{tenantId,codigo:'C4A'+code,nome:'FASE4A cliente sintético'}});
        const supplier=await tx.fornecedor.create({data:{tenantId,codigo:'F4A'+code,nome:'FASE4A fornecedor sintético'}});
        const status=await tx.statusManualTipo.create({data:{tenantId,codigo:'F4A'+code,nome:'FASE4A conferência'}});
        await tx.auditEvent.create({data:{accessMode:'SYSTEM',result:'SUCCESS',action:'TEST_FIXTURES_CREATED',resourceType:'Tenant',resourceId:tenantId,tenantId,reason:'FASE 4A autorizada: somente fixtures sintéticas',metadata:{records:7}}});
        return {category,account,area,center,client,supplier,status};
      }));
    }
    const [fa,fb]=setup,sessions={};
    // Temporary credentials for pre-existing, exclusively synthetic identities.
    // Passwords and prior hashes stay in memory; restore every hash in finally.
    for(const key of ['admin','member','owner','multi','none']) {
      const identity=await db.authIdentity.findUniqueOrThrow({where:{email:`phase3a-${key}@example.invalid`}});
      assert.equal(await db.platformAdmin.count({where:{identityId:identity.id}}),0);
      const password=crypto.randomBytes(32).toString('base64url');
      const hash=await bcrypt.hash(password,12);
      oldHashes.push({id:identity.id,old:identity.senhaHash,temporary:hash});
      await db.authIdentity.update({where:{id:identity.id},data:{senhaHash:hash}});
      const jar=new Map();jars.push(jar);
      const csrf=await request(jar,'/api/auth/csrf');
      await request(jar,'/api/auth/callback/credentials','POST',new URLSearchParams({csrfToken:csrf.body.csrfToken,email:identity.email,password,callbackUrl:base+'/inicio'}).toString(),true);
      const session=await request(jar,'/api/auth/session');
      ok('login synthetic '+key,!!session.body.user?.id);sessions[key]={jar,user:session.body.user};
    }
    const admin=sessions.admin.jar,member=sessions.member.jar,owner=sessions.owner.jar;
    const choose=(s,id)=>request(s.jar,'/api/tenants/switch','POST',{tenantId:id});
    ok('multi selects isolation', (await choose(sessions.multi,b)).status===200);
    const baseRow=(f,description)=>({dataLanc:'2026-10-23',descricao:description,tipo:'ENTRADA',status:'previsto',valor:'0',valorPrevisto:'1.234,56',categoria:f.category.codigo,contaId:f.account.id,clienteId:f.client.id,centroCusto:f.center.codigo,statusManual:f.status.codigo,dataVencOriginal:'2026-10-25',anotacao:'Somente dados sintéticos FASE4A'});
    const fresh=baseRow(fa,'FASE4A simples');
    const first=await request(admin,'/api/lancamentos','POST',{...fresh,tenantId:b});
    ok('single create and manipulated tenant ignored',first.status===201&&(await db.lancamento.findUnique({where:{id:first.body.id}})).tenantId===a);
    ok('zero, Brazilian decimal, CONT automatic',first.body.valor===0&&first.body.valorPrevisto===1234.56&&first.body.cont==='1'&&first.body.dre===null);
    let current=first.body;const ids=[current.id];
    for(const count of [2,5]) {
      const result=await request(admin,'/api/lancamentos/lote','POST',{lancamentos:Array.from({length:count},(_,i)=>baseRow(fa,`FASE4A lote${count}-${i}`))});
      ok('atomic batch '+count,result.status===201&&result.body.criados===count);ids.push(...result.body.data.map(r=>r.id));
    }
    const rows=await db.lancamento.findMany({where:{id:{in:ids}},orderBy:{seq:'asc'}});
    ok('SEQ distinct and contiguous',new Set(rows.map(r=>r.seq)).size===8&&rows.every((r,i)=>r.seq===rows[0].seq+i));
    const foreign=await request(owner,'/api/lancamentos','POST',baseRow(fb,'FASE4A isolamento OWNER'));
    ok('OWNER creates in own tenant',foreign.status===201);
    const bSnapshot=JSON.stringify(await db.lancamento.findMany({where:{tenantId:b}}),(_,v)=>typeof v==='bigint'?String(v):v);
    ok('401 unauthenticated',(await request(empty,'/api/lancamentos')).status===401);
    ok('403 no membership',(await request(sessions.none.jar,'/api/lancamentos')).status===403);
    for(const [path,method] of [['/api/lancamentos','POST'],['/api/lancamentos/lote','POST'],[`/api/lancamentos/${current.id}`,'PUT'],[`/api/lancamentos/${current.id}`,'DELETE'],['/api/lancamentos/edicao-em-massa','POST']])ok('CONSULTA denies '+method+path,(await request(member,path,method,{})).status===403);
    const read=await request(member,'/api/lancamentos?porPagina=all');
    ok('CONSULTA reads without balances',read.status===200&&read.body.totais.valorPrevisto===undefined&&read.body.data.length===8);
    for(const patch of [{valor:'1x'},{valor:-1},{valor:'NaN'},{valorPrevisto:-1},{dataLanc:'2026-02-31'},{tipo:'BAD'},{status:'BAD'},{descricao:' '},{dre:'manual'},{cont:'2'}]) {
      const single=await request(admin,'/api/lancamentos','POST',{...fresh,...patch});
      const batch=await request(admin,'/api/lancamentos/lote','POST',{lancamentos:[fresh,{...fresh,...patch}]});
      const edit=await request(admin,`/api/lancamentos/${current.id}`,'PUT',{...patch,versao:current.versao});
      ok('shared invalid '+Object.keys(patch)[0]+' '+String(Object.values(patch)[0]),single.status===400&&batch.status===400&&edit.status===400);
    }
    ok('invalid batches leave no rows',(await db.lancamento.count({where:{tenantId:a}}))===8);
    for(const [field,value] of [['categoria',fb.category.codigo],['categoria',fb.category.id],['contaId',fb.account.id],['centroCusto',fb.center.codigo],['centroCusto',fb.center.id],['clienteId',fb.client.id],['fornecedorId',fb.supplier.id],['statusManual',fb.status.codigo]]) {
      const payload={...fresh,[field]:value,...(field==='fornecedorId'?{clienteId:null}:{})};
      const create=await request(admin,'/api/lancamentos','POST',payload);
      const edit=await request(admin,`/api/lancamentos/${current.id}`,'PUT',{[field]:value,versao:current.versao});
      ok('foreign controlled reference '+field+' '+(value.includes('-')?'id':'code'),[400,422].includes(create.status)&&[400,422].includes(edit.status));
    }
    for(const method of ['PUT','DELETE'])ok('foreign entry '+method,(await request(admin,`/api/lancamentos/${foreign.body.id}`,method,{descricao:'not written',versao:foreign.body.versao})).status===404);
    ok('missing DELETE 404',(await request(admin,'/api/lancamentos/00000000-0000-4000-8000-000000000000','DELETE')).status===404);
    const forged=new Map(admin);forged.set('tenant_context',`${sessions.admin.user.id}:${sessions.admin.user.loginNonce}:${b}`);
    ok('forged context denied',(await request(forged,'/api/lancamentos')).status===409);
    for(const filter of ['porPagina=all','pagina=1&porPagina=2','busca=FASE4A','tipo=ENTRADA','categoria='+fa.category.codigo,'contaId='+fa.account.id,'clienteId='+fa.client.id,'centroCusto='+fa.center.codigo,'statusManual='+fa.status.codigo,'inicio=2026-10-23&fim=2026-10-23','status=previsto']) {
      const result=await request(admin,'/api/lancamentos?'+filter+'&tenantId='+b);
      ok('filter '+filter,result.status===200&&result.body.data.length>0&&result.body.data.every(r=>ids.includes(r.id)));
    }
    ok('foreign filter empty',(await request(admin,'/api/lancamentos?clienteId='+fb.client.id)).body.total===0);
    const summary=await request(admin,'/api/fluxo-caixa/resumo?inicio=2026-10-23&fim=2026-10-23');
    ok('summary available',summary.status===200);
    for(const patch of [{descricao:'FASE4A edited'},{valor:'12,34'},{dataEvento:'24/10/2026'},{clienteId:null,fornecedorId:fa.supplier.id},{anotacao:null},{valorPrevisto:0}]) {
      const saved=await request(admin,`/api/lancamentos/${current.id}`,'PUT',{...patch,versao:current.versao});
      ok('inline patch '+Object.keys(patch).join(','),saved.status===200&&saved.body.versao!==current.versao);current=saved.body;
    }
    // Legacy microseconds are deliberately inserted ONLY into this synthetic fixture.
    await db.$executeRaw`UPDATE lancamentos SET atualizado_em=TIMESTAMP '2026-10-23 12:34:56.123456',dre='LEGADO SINTETICO',cont='9' WHERE id=${current.id} AND tenant_id=${a}`;
    const micro=await db.$queryRaw`SELECT to_char(atualizado_em,'YYYY-MM-DD HH24:MI:SS.US') AS value FROM lancamentos WHERE id=${current.id} AND tenant_id=${a}`;
    ok('microsecond fixture retains six digits',micro[0].value.endsWith('123456'));
    current=(await request(admin,'/api/lancamentos?porPagina=all')).body.data.find(r=>r.id===current.id);
    const token=current.versao;
    const concurrent=await Promise.all(['A','B'].map(label=>request(admin,`/api/lancamentos/${current.id}`,'PUT',{descricao:'FASE4A concurrent '+label,versao:token})));
    ok('real concurrency exactly one writer',concurrent.filter(r=>r.status===200).length===1&&concurrent.filter(r=>r.status===409).length===1);
    current=concurrent.find(r=>r.status===200).body;
    ok('legacy DRE CONT visible unchanged',current.dre==='LEGADO SINTETICO'&&current.cont==='9');
    ok('stale token cannot overwrite',(await request(admin,`/api/lancamentos/${current.id}`,'PUT',{descricao:'STALE',versao:token})).status===409);
    ok('version required',(await request(admin,`/api/lancamentos/${current.id}`,'PUT',{descricao:'MISSING'})).status===409);
    for(const count of [2,5]) {
      const selection=ids.slice(0,count),changes={banco:'FASE4A bulk '+count,centroCusto:fa.center.codigo};
      const preview=await request(admin,'/api/lancamentos/edicao-em-massa','POST',{mode:'preview',ids:selection,changes});
      const apply=await request(admin,'/api/lancamentos/edicao-em-massa','POST',{mode:'apply',ids:selection,changes,versions:preview.body.versions});
      ok('bulk '+count+' current tokens',preview.status===200&&apply.status===200&&apply.body.count===count);
    }
    const selection=ids.slice(0,5),changes={banco:'SHOULD ROLLBACK'};
    const preview=await request(admin,'/api/lancamentos/edicao-em-massa','POST',{mode:'preview',ids:selection,changes});
    await db.lancamento.update({where:{id:selection.at(-1)},data:{anotacao:'FASE4A concurrent last row'}});
    const failed=await request(admin,'/api/lancamentos/edicao-em-massa','POST',{mode:'apply',ids:selection,changes,versions:preview.body.versions});
    ok('bulk last row conflict atomic',failed.status===409&&(await db.lancamento.count({where:{tenantId:a,banco:'SHOULD ROLLBACK'}}))===0);
    for(const key of ['dre','cont','valor','tenantId'])ok('bulk whitelist '+key,(await request(admin,'/api/lancamentos/edicao-em-massa','POST',{mode:'preview',ids:[ids[0]],changes:{[key]:'x'}})).status===400);
    ok('bulk foreign id denied',(await request(admin,'/api/lancamentos/edicao-em-massa','POST',{mode:'preview',ids:[ids[0],foreign.body.id],changes:{banco:'X'}})).status===404);
    ok('bulk foreign center denied',(await request(admin,'/api/lancamentos/edicao-em-massa','POST',{mode:'preview',ids:[ids[0]],changes:{centroCusto:fb.center.codigo}})).status===422);
    // Only the official version/CAS integration, not the six full Excel importers.
    const exported=await request(admin,'/api/lancamentos/importacao-oficial/base?busca=FASE4A');
    ok('official version export',exported.status===200);
    const book=XLSX.read(exported.body,{type:'array'}),sheet=book.Sheets.LANCAMENTOS;
    const matrix=XLSX.utils.sheet_to_json(sheet,{header:1,defval:''}),heads=matrix[0];
    const target=matrix.findIndex((r,i)=>i>0&&r[heads.indexOf('REGISTRO_ID')]===current.id);
    assert.ok(target>0);const versionCol=heads.indexOf('REGISTRO_VERSAO'),descriptionCol=heads.indexOf('DESCRICAO');
    ok('XLSX token uses revision',String(matrix[target][versionCol]).startsWith('v1:'));
    sheet[XLSX.utils.encode_cell({r:target,c:descriptionCol})].v='FASE4A official CAS';
    const bytes=XLSX.write(book,{type:'buffer',bookType:'xlsx'});
    const upload=async(mode,previewToken)=>{const form=new FormData();form.set('mode',mode);form.set('file',new Blob([bytes]),'fixture.xlsx');if(previewToken)form.set('previewToken',previewToken);return request(admin,'/api/lancamentos/importacao-oficial','POST',form);};
    const planned=await upload('preview');
    ok('official current version accepted',planned.status===200&&planned.body.preview.errors.length===0);
    const applied=await upload('confirm',planned.body.previewToken);ok('official CAS applied',applied.status===200&&applied.body.result.atualizados===1);
    const stale=await upload('preview');ok('official obsolete version blocked',stale.body.preview.resumo.conflitos===1);
    ok('official preserves legacy DRE',(await db.lancamento.findUnique({where:{id:current.id}})).dre==='LEGADO SINTETICO');
    ok('legacy endpoint remains 410',(await request(admin,'/api/lancamentos/importar','POST',{})).status===410);
    ok('isolation snapshot unchanged',bSnapshot===JSON.stringify(await db.lancamento.findMany({where:{tenantId:b}}),(_,v)=>typeof v==='bigint'?String(v):v));
    ok('ADMIN deletes own fixture',(await request(admin,`/api/lancamentos/${ids.at(-1)}`,'DELETE')).status===200);
    ok('OWNER deletes own fixture',(await request(owner,`/api/lancamentos/${foreign.body.id}`,'DELETE')).status===200);
    ok('deletions persisted',!(await db.lancamento.findUnique({where:{id:ids.at(-1)}}))&&!(await db.lancamento.findUnique({where:{id:foreign.body.id}})));
    return {count:passed.length,passed,remainingSyntheticEntries:await db.lancamento.count({where:{tenantId:a}}),fixturePrefix:'FASE4A',tenants:[a,b]};
  } finally {
    for(const jar of jars) {try {const csrf=await request(jar,'/api/auth/csrf');await request(jar,'/api/auth/signout','POST',new URLSearchParams({csrfToken:csrf.body.csrfToken}).toString(),true);}catch{}}
    for(const item of oldHashes) {const restored=await db.authIdentity.updateMany({where:{id:item.id,senhaHash:item.temporary},data:{senhaHash:item.old}});assert.equal(restored.count,1,'Synthetic credential restore failed');}
  }
}
module.exports={smoke};
