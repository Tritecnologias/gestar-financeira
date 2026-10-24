// Synthetic integration suite. No real credentials; restored in finally. No production mode.
const assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs'),XLSX=require('xlsx'),bcrypt=require('bcryptjs');
const {PrismaClient}=require('@prisma/client'),{PrismaPg}=require('@prisma/adapter-pg');
const {Client}=require('pg');
const checks=[],saved=[];let last='guard';
const ok=(name,v)=>{last=name;assert.ok(v,name);checks.push(name)};
const encode=v=>JSON.stringify(v,(_,x)=>typeof x==='bigint'?x.toString():x);
async function main(){
 const url=new URL(process.env.DATABASE_URL),homo=process.argv.includes('--homo');
 const base=homo?'https://homolog.dezsolucoes.com.br':'http://10s-phase5a-app:3000';
 assert.equal(url.hostname,homo?'hd9a0oz02vexqe9u8qadzg6k':'10s-phase5a-pg');assert.equal(url.pathname,homo?'/gestar_financeira_homolog':'/phase5a_lab');
 assert.equal(process.env.ACCESS_AUTH_MODE,'identity');assert.equal(process.env.APP_PUBLIC_URL,base);assert.equal(process.env.NEXTAUTH_URL,base);
 assert.equal(JSON.parse(fs.readFileSync('/app/build-metadata.json')).sourceCommit,process.env.PHASE5B_EXPECTED_SHA);
 const db=new PrismaClient({adapter:new PrismaPg({connectionString:url.href})});
 const models=['categoria','planoContas','areaNegocio','centroCusto','pessoa','cliente','fornecedor','produtoGrupo','produtoTipo','produtoLinha','produto','produtoSequencia'];
 const snapshot=async()=>encode(await Promise.all([...models,'importOperation'].map(m=>db[m].findMany({orderBy:{id:'asc'}}))));
 async function request(jar,path,method='GET',data,raw=false,signal){
  const form=data instanceof FormData,r=await fetch(base+path,{method,redirect:'manual',signal:signal||AbortSignal.timeout(180000),headers:{Cookie:[...jar].map(([k,v])=>`${k}=${v}`).join('; '),...(data===undefined||form?{}:{'Content-Type':raw?'application/x-www-form-urlencoded':'application/json'})},body:data===undefined?undefined:form||raw?data:encode(data)});
  for(const c of r.headers.getSetCookie()){const f=c.split(';')[0],i=f.indexOf('=');jar.set(f.slice(0,i),f.slice(i+1));}
  const type=r.headers.get('content-type')||'';return{status:r.status,body:type.includes('json')?await r.json():type.includes('spreadsheet')?Buffer.from(await r.arrayBuffer()):await r.text()};
 }
 const routes={FIN:'estrutura-financeira',EMP:'estrutura-gerencial',PES:'pessoas',CAD:'dimensoes-cadastrais',PORT:'produtos'},headers={};
 function file(kind,sections,reverse=false){const b=XLSX.utils.book_new();XLSX.utils.book_append_sheet(b,XLSX.utils.aoa_to_sheet([['F5B synthetic']]),'INSTRUCOES');for(const[n,original]of Object.entries(headers[kind])){const h=reverse?[...original].reverse():original;XLSX.utils.book_append_sheet(b,XLSX.utils.aoa_to_sheet([h,...(sections[n]||[]).map(r=>h.map(k=>r[k]??''))]),n)}return XLSX.write(b,{type:'buffer',bookType:'xlsx',compression:true})}
 const upload=(jar,kind,bytes,mode='preview',token='',signal)=>{const f=new FormData();f.set('file',new Blob([bytes]),'F5B-synthetic.xlsx');f.set('mode',mode);if(token)f.set('previewToken',token);return request(jar,`/api/${routes[kind]}/importar`,'POST',f,false,signal)};
 async function commit(jar,kind,sections,label){const bytes=file(kind,sections),before=await snapshot(),p=await upload(jar,kind,bytes);ok(label+' preview',p.status===200&&p.body.state==='READY');ok(label+' preview zero writes',await snapshot()===before);const r=await upload(jar,kind,bytes,'confirm',p.body.previewToken);ok(label+' committed',r.status===200&&r.body.state==='COMPLETED');return r;}
 async function reject(jar,kind,sections,label){const before=await snapshot(),bytes=file(kind,sections),p=await upload(jar,kind,bytes);ok(label+' blocked',p.status===400||p.body.state==='INVALID');ok(label+' no confirm token',!p.body.previewToken);const r=await upload(jar,kind,bytes,'confirm');ok(label+' confirm blocked',r.status>=400);ok(label+' atomic no writes',await snapshot()===before);}
 try{
  const [m]=await db.$queryRawUnsafe('SELECT count(*)::int n FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL');assert.equal(m.n,15);
  const originalLedger=encode(await db.lancamento.findMany({orderBy:{id:'asc'}}));
  const protectedAccess=encode(await Promise.all(['tenant','tenantMembership','platformAdmin','accessProfile','legacyUserAccessMap','usuario'].map(m=>db[m].findMany({orderBy:{id:'asc'}}))));
  const realIdentities=encode(await db.authIdentity.findMany({where:{NOT:{email:{endsWith:'@example.invalid'}}},orderBy:{id:'asc'}}));
  const a=(await db.tenant.findUniqueOrThrow({where:{slug:'modo-dev'}})).id,b=(await db.tenant.findUniqueOrThrow({where:{slug:'modo-dev-isolamento'}})).id;
  assert.equal(await db.categoria.count({where:{tenantId:a,codigo:'81'}}),0,'fresh F5B run only');
  const sessions={};
  for(const key of ['admin','member','owner']){
   const identity=await db.authIdentity.findUniqueOrThrow({where:{email:`phase3a-${key}@example.invalid`}});assert.equal(await db.platformAdmin.count({where:{identityId:identity.id}}),0);
   const password=crypto.randomBytes(32).toString('base64url');saved.push({id:identity.id,senhaHash:identity.senhaHash});await db.authIdentity.update({where:{id:identity.id},data:{senhaHash:await bcrypt.hash(password,12)}});
   const jar=new Map(),csrf=await request(jar,'/api/auth/csrf');await request(jar,'/api/auth/callback/credentials','POST',new URLSearchParams({csrfToken:csrf.body.csrfToken,email:identity.email,password,callbackUrl:base+'/inicio'}).toString(),true);
   ok('synthetic login '+key,!!(await request(jar,'/api/auth/session')).body.user?.id);sessions[key]=jar;
  }
  const {admin,member,owner}=sessions;
  for(const[k,path]of Object.entries(routes)){
   const t=await request(admin,`/api/${path}/exportar?template=1`);ok(k+' empty template download',t.status===200&&Buffer.isBuffer(t.body));
   const book=XLSX.read(t.body);headers[k]=Object.fromEntries(book.SheetNames.filter(n=>n!=='INSTRUCOES').map(n=>[n,XLSX.utils.sheet_to_json(book.Sheets[n],{header:1})[0]]));
   ok(k+' template empty',book.SheetNames.filter(n=>n!=='INSTRUCOES').every(n=>XLSX.utils.sheet_to_json(book.Sheets[n]).every(r=>Object.values(r).every(v=>String(v).trim()===''))));
   ok(k+' 401',(await upload(new Map(),k,t.body)).status===401);ok(k+' 403',(await upload(member,k,t.body)).status===403);
  }
  const foreign={
   FIN:{CATEGORIAS_N1:[{CODIGO_CATEGORIA:'89',DESCRICAO_CATEGORIA:'F5B FIN ISOLAMENTO'}],CONTAS_N2:[{CODIGO_CONTA:'89.01',DESCRICAO_CONTA:'F5B FIN FOREIGN',CODIGO_CATEGORIA:'89',TIPO_CONTA:'RECEITA'}]},
   EMP:{AREAS_NEGOCIO:[{CODIGO_AREA:'F5B-X',DESCRICAO_AREA:'F5B EMP ISOLAMENTO'}],CENTROS_CUSTO:[{CODIGO_CC:'F5B-X-CC',DESCRICAO_CC:'F5B EMP FOREIGN CC',CODIGO_AREA:'F5B-X'}]},
   PORT:{GRUPOS:[{NOME_GRUPO:'F5B PORT ISOLAMENTO'},{NOME_GRUPO:'F5B PORT FOREIGN ONLY'}],TIPOS:[{CODIGO_GRUPO:'@3',NOME_TIPO:'F5B PORT FOREIGN TYPE'}],LINHAS:[{CODIGO_GRUPO:'@3',CODIGO_TIPO:'@2',NOME_LINHA:'F5B PORT FOREIGN LINE'}],ITENS:[]},
  };
  for(const k of ['FIN','EMP','PORT'])await commit(owner,k,foreign[k],k+' isolation setup');
  const valid={
   FIN:{CATEGORIAS_N1:[{CODIGO_CATEGORIA:'81',DESCRICAO_CATEGORIA:'F5B FIN São José'}],CONTAS_N2:[{CODIGO_CONTA:'81.01',DESCRICAO_CONTA:'F5B FIN Conta 漢字',CODIGO_CATEGORIA:'81',TIPO_CONTA:'RECEITA'}]},
   EMP:{AREAS_NEGOCIO:[{CODIGO_AREA:'F5B-001',DESCRICAO_AREA:'F5B EMP Área'}],CENTROS_CUSTO:[{CODIGO_CC:'F5B-001-CC',DESCRICAO_CC:'F5B EMP Centro',CODIGO_AREA:'F5B-001'}]},
   PES:{PESSOAS:[{CODIGO_PESSOA:'F5B-001',NOME:'F5B PES sem CC'},{CODIGO_PESSOA:'F5B-002',NOME:'F5B PES com CC',CODIGO_CC:'F5B-001-CC',EMAIL:'f5b-person@example.invalid',TELEFONE:'001234',CARGO:'Teste'}]},
   CAD:{CLIENTES:[{NOME:'F5B CAD Cliente',TIPO_PESSOA:'PJ',DOCUMENTO:'00.000.000/0000-00',CODIGO_CATEGORIA:'81',CODIGO_CONTA:'81.01',NOME_FANTASIA:'F5B CAD Fantasia'}],FORNECEDORES:[{NOME:'F5B CAD Fornecedor',TIPO_PESSOA:'PF',DOCUMENTO:'000.000.000-00',EMAIL:'f5b-supplier@example.invalid'}]},
   PORT:{GRUPOS:[{NOME_GRUPO:'F5B PORT Grupo'}],TIPOS:[{CODIGO_GRUPO:'@2',NOME_TIPO:'F5B PORT Tipo'}],LINHAS:[{CODIGO_GRUPO:'@2',CODIGO_TIPO:'@2',NOME_LINHA:'F5B PORT Linha'}],ITENS:[{NOME:'F5B PORT Item 1',CODIGO_GRUPO:'@2',CODIGO_TIPO:'@2',CODIGO_LINHA:'@2',DESCRICAO:'São José 漢字',UNIDADE:'UN',OBSERVACOES:'Teste'},{NOME:'F5B PORT Item 2',CODIGO_GRUPO:'@2',CODIGO_TIPO:'@2',CODIGO_LINHA:'@2'}]},
  };
  const receipts={};
  for(const k of Object.keys(routes)){
   receipts[k]=(await commit(admin,k,valid[k],k+' valid hierarchy')).body.operationId;
   const before=await snapshot(),replay=await upload(admin,k,file(k,valid[k],true));
   ok(k+' resaved reordered headers replay',replay.body.replayed&&replay.body.operationId===receipts[k]);ok(k+' replay zero writes',await snapshot()===before);
  }
  ok('people email did not create identity',await db.authIdentity.count({where:{email:'f5b-person@example.invalid'}})===0);
  // Approved legacy-name safeguard: preview and confirmation, scoped to this tenant.
  const peopleBeforeRename=encode(await db.pessoa.findMany({orderBy:{id:'asc'}}));
  await reject(admin,'EMP',{CENTROS_CUSTO:[{...valid.EMP.CENTROS_CUSTO[0],DESCRICAO_CC:'F5B EMP forbidden rename'}]},'EMP linked rename');
  ok('EMP linked rename preserves people',encode(await db.pessoa.findMany({orderBy:{id:'asc'}}))===peopleBeforeRename);
  const center=(codigo,nome)=>({CENTROS_CUSTO:[{CODIGO_CC:codigo,DESCRICAO_CC:nome,CODIGO_AREA:'F5B-001'}]});
  await commit(admin,'EMP',center('F5B-FREE','F5B EMP Free'),'EMP unlinked setup');
  await commit(admin,'EMP',center('F5B-FREE','F5B EMP Free renamed'),'EMP unlinked rename');
  ok('EMP unlinked name persisted',(await db.centroCusto.findFirstOrThrow({where:{tenantId:a,codigo:'F5B-FREE'}})).nome==='F5B EMP Free renamed');
  await commit(admin,'EMP',center('F5B-LATE','F5B EMP Late'),'EMP late link setup');
  const lateBytes=file('EMP',center('F5B-LATE','F5B EMP Late renamed')),latePreview=await upload(admin,'EMP',lateBytes);
  ok('EMP preview before person is ready',latePreview.body.state==='READY');
  await commit(admin,'PES',{PESSOAS:[{CODIGO_PESSOA:'F5B-LATE',NOME:'F5B PES Late',CODIGO_CC:'F5B-LATE'}]},'PES linked after preview');
  const beforeLate=await snapshot(),lateConfirm=await upload(admin,'EMP',lateBytes,'confirm',latePreview.body.previewToken);
  ok('EMP confirmation revalidates linked rename',lateConfirm.status===422&&lateConfirm.body.preview?.errors.some(e=>e.campo==='DESCRICAO_CC'));
  ok('EMP stale preview no writes or receipt',await snapshot()===beforeLate);
  const foreignSame={CENTROS_CUSTO:[{...foreign.EMP.CENTROS_CUSTO[0],DESCRICAO_CC:valid.EMP.CENTROS_CUSTO[0].DESCRICAO_CC}]};
  await commit(owner,'EMP',foreignSame,'EMP foreign same name setup');
  foreignSame.CENTROS_CUSTO[0].DESCRICAO_CC='F5B EMP Foreign renamed';
  await commit(owner,'EMP',foreignSame,'EMP other tenant people do not block');
  const duplicateDoc=await upload(admin,'CAD',file('CAD',{CLIENTES:[{NOME:'F5B CAD documento repetido',DOCUMENTO:'00000000000000'}]}));
  ok('CPF CNPJ existing normalization and warning policy',duplicateDoc.body.state==='READY'&&duplicateDoc.body.preview.warnings.length>0);
  const invalids={FIN:[{CONTAS_N2:[{CODIGO_CONTA:'82.01',DESCRICAO_CONTA:'F5B FIN invalid',CODIGO_CATEGORIA:'82',TIPO_CONTA:'RECEITA'}]},{CONTAS_N2:[{CODIGO_CONTA:'89.02',DESCRICAO_CONTA:'F5B FIN foreign',CODIGO_CATEGORIA:'89',TIPO_CONTA:'RECEITA'}]}],EMP:[{CENTROS_CUSTO:[{CODIGO_CC:'F5B-BAD',DESCRICAO_CC:'F5B EMP invalid',CODIGO_AREA:'missing'}]},{CENTROS_CUSTO:[{CODIGO_CC:'F5B-BAD',DESCRICAO_CC:'F5B EMP foreign',CODIGO_AREA:'F5B-X'}]}],PES:[{PESSOAS:[{CODIGO_PESSOA:'F5B-BAD',NOME:'F5B PES invalid',CODIGO_CC:'missing'}]},{PESSOAS:[{CODIGO_PESSOA:'F5B-BAD',NOME:'F5B PES foreign',CODIGO_CC:'F5B-X-CC'}]}],CAD:[{CLIENTES:[{NOME:'F5B CAD mismatch',CODIGO_CATEGORIA:'89',CODIGO_CONTA:'81.01'}]},{FORNECEDORES:[{NOME:'F5B CAD foreign',CODIGO_CATEGORIA:'89',CODIGO_CONTA:'89.01'}]}],PORT:[{...valid.PORT,GRUPOS:[{NOME_GRUPO:'F5B PORT rollback'}],ITENS:[valid.PORT.ITENS[0],{...valid.PORT.ITENS[1],CODIGO_TIPO:'MISSING'}]}]};
  for(const[k,cases]of Object.entries(invalids))for(let i=0;i<cases.length;i++)await reject(admin,k,cases[i],k+' invalid/cross '+i);
  // Foreign portfolio codes must differ from own codes to test absence rather than legitimate local identifiers.
  const fg=await db.produtoGrupo.findFirstOrThrow({where:{tenantId:b,nome:'F5B PORT FOREIGN ONLY'}});
  const ft=await db.produtoTipo.findFirstOrThrow({where:{tenantId:b,grupoId:fg.id}}),fl=await db.produtoLinha.findFirstOrThrow({where:{tenantId:b,tipoId:ft.id}});
  await reject(admin,'PORT',{ITENS:[{NOME:'F5B PORT foreign parent',CODIGO_GRUPO:fg.codigo,CODIGO_TIPO:ft.codigo,CODIGO_LINHA:fl.codigo}]},'PORT actual foreign hierarchy');
  const updateSets={};
  for(const[k,path]of Object.entries(routes)){
   const exported=await request(admin,`/api/${path}/exportar`);ok(k+' export after create',exported.status===200);
   const book=XLSX.read(exported.body),sections=Object.fromEntries(Object.keys(headers[k]).map(n=>[n,XLSX.utils.sheet_to_json(book.Sheets[n],{defval:''}).filter(r=>Object.values(r).some(v=>String(v).startsWith('F5B')))]));
   const beforeRows=Object.values(sections).reduce((n,r)=>n+r.length,0);ok(k+' exported fixtures',beforeRows>0);
   for(const[n,rows]of Object.entries(sections))for(const r of rows){if(k==='EMP'&&n==='CENTROS_CUSTO')continue;const field=headers[k][n].find(h=>/^(NOME|DESCRICAO)/.test(h));r[field]+=' atualizado';}
   updateSets[k]=sections;
   await commit(admin,k,sections,k+' update');
   const again=await request(admin,`/api/${path}/exportar`),actual=XLSX.read(again.body);
   for(const[n,expected]of Object.entries(sections)){
    const got=XLSX.utils.sheet_to_json(actual.Sheets[n],{defval:''});
    ok(k+' roundtrip '+n,expected.every(r=>got.some(g=>headers[k][n].every(h=>String(g[h]??'')===String(r[h]??'')))));
   }
   const n=Object.keys(sections).find(n=>sections[n].length),dups=structuredClone(sections);dups[n].push({...dups[n][0]});await reject(admin,k,dups,k+' duplicate code');
  }
  // Each domain: concurrent duplicate confirmation protected by same transaction receipt.
  for(const k of Object.keys(routes)){
   const sections=structuredClone(updateSets[k]);for(const[n,rows]of Object.entries(sections))for(const r of rows){if(k==='EMP'&&n==='CENTROS_CUSTO')continue;const field=headers[k][n].find(h=>/^(NOME|DESCRICAO)/.test(h));r[field]+=' concorrência';}
   const bytes=file(k,sections),p=await upload(admin,k,bytes),pair=await Promise.all([upload(admin,k,bytes,'confirm',p.body.previewToken),upload(admin,k,bytes,'confirm',p.body.previewToken)]);
   ok(k+' concurrent receipt',pair.some(r=>r.body.state==='COMPLETED'));
   const r=await upload(admin,k,bytes,'status');ok(k+' concurrent recovered',r.body.state==='COMPLETED');
  }
  for(const[k,section,nameField]of [['CAD','CLIENTES','NOME'],['PORT','GRUPOS','NOME_GRUPO']]){
   const batches=[1,2].map(n=>({[section]:[{[nameField]:`F5B ${k} concurrent new ${n}`}]}));
   const previews=await Promise.all(batches.map(s=>upload(admin,k,file(k,s))));
   const results=await Promise.all(batches.map((s,i)=>upload(admin,k,file(k,s),'confirm',previews[i].body.previewToken)));
   for(let i=0;i<2;i++)if(results[i].body.state!=='COMPLETED')await commit(admin,k,batches[i],k+' retry after concurrent allocation');
   const model=k==='CAD'?'cliente':'produtoGrupo';const created=await db[model].findMany({where:{tenantId:a,nome:{startsWith:`F5B ${k} concurrent new`}}});
   ok(k+' concurrent distinct batches unique codes',created.length===2&&new Set(created.map(r=>r.codigo)).size===2);
  }
  if(!homo){
   for(const[k,model,where]of [['FIN','categoria',{codigo:'81'}],['EMP','areaNegocio',{codigo:'F5B-001'}],['PES','pessoa',{codigo:'F5B-001'}],['CAD','cliente',{nome:{startsWith:'F5B CAD Cliente'}}],['PORT','produtoGrupo',{nome:{startsWith:'F5B PORT Grupo'}}]]){
    const old=await db[model].findFirstOrThrow({where:{tenantId:a,...where}});assert.equal(old.ativo,true);
    await db[model].update({where:{id:old.id},data:{ativo:false}});
    try{const s=structuredClone(updateSets[k]);const n=Object.keys(s).find(n=>s[n].length),field=headers[k][n].find(h=>/^(NOME|DESCRICAO)/.test(h));s[n][0][field]+=' inactive attempt';await reject(admin,k,s,k+' inactive not reactivated');}
    finally{await db[model].update({where:{id:old.id},data:{ativo:true}});}
   }
  }
  ok('I1 legacy remains 410',(await request(admin,'/api/lancamentos/importar','POST',{})).status===410);
  if(!homo){
   for(const[k,lockKey]of [['FIN','financial-codes:'+a],['EMP','management-import:'+a],['PES','people-import:'+a],['CAD','registration-code:'+a+':cliente'],['PORT','product-catalog:'+a]]){
    const sections=structuredClone(updateSets[k]);for(const[n,rows]of Object.entries(sections))for(const r of rows){if(k==='EMP'&&n==='CENTROS_CUSTO')continue;const field=headers[k][n].find(h=>/^(NOME|DESCRICAO)/.test(h));r[field]+=' lost response';}
    const bytes=file(k,sections),p=await upload(admin,k,bytes);ok(k+' timeout ready',p.body.state==='READY');
    const conn=new Client({connectionString:url.href});await conn.connect();await conn.query('SELECT pg_advisory_lock(hashtextextended($1,0))',[lockKey]);
    try{
     const controller=new AbortController(),pending=upload(admin,k,bytes,'confirm',p.body.previewToken,controller.signal).catch(()=>null);
     await new Promise(r=>setTimeout(r,600));controller.abort();await pending;
     ok(k+' timeout not presumed rollback',(await upload(admin,k,bytes,'status')).body.state==='UNCONFIRMED');
    }finally{await conn.query('SELECT pg_advisory_unlock(hashtextextended($1,0))',[lockKey]);await conn.end();}
    let recovered;for(let i=0;i<30;i++){recovered=await upload(admin,k,bytes,'status');if(recovered.body.state==='COMPLETED')break;await new Promise(r=>setTimeout(r,100));}
    ok(k+' lost response receipt recovered',recovered.body.state==='COMPLETED');const before=await snapshot();
    ok(k+' lost response replay',(await upload(admin,k,bytes,'confirm',p.body.previewToken)).body.operationId===recovered.body.operationId);ok(k+' lost response no repeated writes',await snapshot()===before);
   }
   // Laboratory only: fail the final write after earlier statements have succeeded.
   for(const[k,table]of [['FIN','plano_contas'],['EMP','centros_custo'],['PES','pessoas'],['CAD','fornecedores'],['PORT','produtos']]){
    const sections=structuredClone(updateSets[k]);for(const[n,rows]of Object.entries(sections))for(const r of rows){if(k==='EMP'&&n==='CENTROS_CUSTO')continue;const field=headers[k][n].find(h=>/^(NOME|DESCRICAO)/.test(h));r[field]+=' ROLLBACK';}
    const bytes=file(k,sections),p=await upload(admin,k,bytes);ok(k+' forced rollback ready',p.body.state==='READY');
    await db.$executeRawUnsafe("CREATE FUNCTION phase5b_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic rollback'; END $$");
    await db.$executeRawUnsafe(`CREATE TRIGGER phase5b_fail BEFORE UPDATE ON ${table} FOR EACH ROW EXECUTE FUNCTION phase5b_fail()`);
    try{const before=await snapshot(),r=await upload(admin,k,bytes,'confirm',p.body.previewToken);ok(k+' forced final failure',r.body.state==='UNCONFIRMED');ok(k+' all writes and receipt rolled back',await snapshot()===before);}
    finally{await db.$executeRawUnsafe(`DROP TRIGGER phase5b_fail ON ${table}`);await db.$executeRawUnsafe('DROP FUNCTION phase5b_fail()');}
   }
  }
  ok('existing ledger entirely preserved',encode(await db.lancamento.findMany({orderBy:{id:'asc'}}))===originalLedger);
  ok('tenancy and grants preserved',encode(await Promise.all(['tenant','tenantMembership','platformAdmin','accessProfile','legacyUserAccessMap','usuario'].map(m=>db[m].findMany({orderBy:{id:'asc'}}))))===protectedAccess);
  ok('real identities preserved',encode(await db.authIdentity.findMany({where:{NOT:{email:{endsWith:'@example.invalid'}}},orderBy:{id:'asc'}}))===realIdentities);
  console.log(encode({state:homo?'HOMO_5B_VERIFIED':'LAB_5B_VERIFIED',checks,counts:Object.fromEntries(await Promise.all(models.map(async m=>[m,await db[m].count()])))}));
 }finally{for(const s of saved)await db.authIdentity.update({where:{id:s.id},data:{senhaHash:s.senhaHash}});await db.$disconnect()}
}
main().catch(e=>{console.error(encode({state:'FAILED',last,code:e.code||e.name,message:e.name==='AssertionError'?e.message:undefined}));process.exitCode=1});
