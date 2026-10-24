// Destructive test harness: isolated database name AND explicit lab switch required.
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),crypto=require('node:crypto');
const {Pool}=require('pg');
async function main(){
  if(process.env.PHASE7_LAB!=='1'||new URL(process.env.DATABASE_URL).pathname!=='/phase7_lab')throw Error('LAB_ONLY');
  const {createBackup,previewRestore,restoreBackup,restoreReceipt}=await import('/app/backup/engine.mjs');
  const {seal,digest}=await import('/app/backup/format.mjs');
  const pool=new Pool({connectionString:process.env.DATABASE_URL});
  const q=async(s,p=[])=>(await pool.query(s,p)).rows;
  if((await q('SELECT count(*)::int n FROM tenants'))[0].n)throw Error('FRESH_ONLY');
  const id=()=>crypto.randomUUID(); const tenant=id(),other=id(),identity=id(),member=id(),profile=id(),user=id();
  const ctx={tenantId:tenant,identityId:identity,membershipId:member};
  const cfg={sourceCommit:'laboratory',termDir:'/tmp/phase7-terms',backupDir:'/tmp/phase7-safety'};
  await fs.mkdir(cfg.termDir,{recursive:true});
  await q("INSERT INTO tenants(id,nome,slug,email) VALUES($1,'Laboratório A','lab-a','a@example.invalid'),($2,'Laboratório B','lab-b','b@example.invalid')",[tenant,other]);
  await q("INSERT INTO auth_identities(id,email,nome,senha_hash) VALUES($1,'owner@example.invalid','Fixture','non-login-test-hash')",[identity]);
  await q("INSERT INTO platform_admins(id,identity_id) VALUES($1,$2)",[id(),identity]);
  await q("INSERT INTO access_profiles(id,tenant_id,nome,permissoes) VALUES($1,$2,'Fixture',ARRAY[]::text[])",[profile,tenant]);
  await q("INSERT INTO tenant_memberships(id,identity_id,tenant_id,role,profile_id) VALUES($1,$2,$3,'OWNER',$4)",[member,identity,tenant,profile]);
  await q("INSERT INTO usuarios(id,tenant_id,nome,email,senha_hash) VALUES($1,$2,'Fixture','owner@example.invalid','non-login-legacy')",[user,tenant]);
  const category=id(),account=id(),supplier=id(),area=id(),cc=id();
  await q("INSERT INTO categorias(id,tenant_id,codigo,nome) VALUES($1,$2,'01','Categoria A')",[category,tenant]);
  await q("INSERT INTO plano_contas(id,tenant_id,codigo,descricao,tipo,categoria_id) VALUES($1,$2,'01.01','Conta A','DESPESA',$3)",[account,tenant,category]);
  await q("INSERT INTO fornecedores(id,tenant_id,codigo,nome,conta_padrao_id) VALUES($1,$2,'F0001','Fornecedor A',$3)",[supplier,tenant,account]);
  await q("INSERT INTO areas_negocio(id,tenant_id,codigo,nome) VALUES($1,$2,'01','Area A')",[area,tenant]);
  await q("INSERT INTO centros_custo(id,tenant_id,codigo,nome,area_id) VALUES($1,$2,'01','Centro A',$3)",[cc,tenant,area]);
  await q("INSERT INTO pessoas(id,tenant_id,codigo,nome) VALUES($1,$2,'P0001','Pessoa A')",[id(),tenant]);
  await q("INSERT INTO status_manual_tipos(id,tenant_id,codigo,nome) VALUES($1,$2,'PREV','Previsto A')",[id(),tenant]);
  const entry=id(),isolated=id();
  await q("INSERT INTO lancamentos(id,tenant_id,seq,data_lanc,descricao,valor,valor_previsto,tipo,cont,conta_id,fornecedor_id,criado_por) VALUES($1,$2,1,CURRENT_DATE,'ESTADO A',0,10,'ENTRADA','1',$3,$4,$5)",[entry,tenant,account,supplier,user]);
  await q("INSERT INTO lancamentos(id,tenant_id,seq,data_lanc,descricao,valor,valor_previsto,tipo) VALUES($1,$2,1,CURRENT_DATE,'ISOLADO',0,20,'ENTRADA')",[isolated,other]);
  await q("INSERT INTO import_operations(id,tenant_id,contract_type,contract_version,payload_digest,file_digest,actor_identity_id,created,updated,unchanged,warnings) VALUES($1,$2,'LAB',1,$3,$3,$4,1,0,0,0)",[id(),tenant,'a'.repeat(64),identity]);
  const doc=id(),version=id(),pdfKey=id()+'.pdf',pdf=Buffer.from('%PDF-LAB-IMMUTABLE');await fs.writeFile(cfg.termDir+'/'+pdfKey,pdf);
  await q("INSERT INTO term_documents(id,code,audience) VALUES($1,'LAB','USUARIO')",[doc]);
  await q("INSERT INTO term_versions(id,document_id,version,storage_key,title,mime_type,byte_size,sha256) VALUES($1,$2,'1',$3,'Laboratório','application/pdf',$4,$5)",[version,doc,pdfKey,pdf.length,crypto.createHash('sha256').update(pdf).digest('hex')]);
  await q("INSERT INTO term_acceptances(id,identity_id,term_version_id,scope_key,document_hash) VALUES($1,$2,$3,'GLOBAL',$4)",[id(),identity,version,crypto.createHash('sha256').update(pdf).digest('hex')]);
  const foreignDoc=id(),foreignVersion=id(),foreignKey=id()+'.pdf';await fs.writeFile(cfg.termDir+'/'+foreignKey,pdf);
  await q("INSERT INTO term_documents(id,code,audience) VALUES($1,'OTHER_CONTRACT','CONTRATANTE')",[foreignDoc]);
  await q("INSERT INTO term_versions(id,document_id,version,storage_key,title,mime_type,byte_size,sha256) VALUES($1,$2,'1',$3,'Outro contrato','application/pdf',$4,$5)",[foreignVersion,foreignDoc,foreignKey,pdf.length,crypto.createHash('sha256').update(pdf).digest('hex')]);
  const foreignMember=id();await q("INSERT INTO tenant_memberships(id,identity_id,tenant_id,role) VALUES($1,$2,$3,'OWNER')",[foreignMember,identity,other]);
  await q("INSERT INTO term_acceptances(id,identity_id,term_version_id,tenant_id,membership_id,scope_key,role_at_acceptance,document_hash) VALUES($1,$2,$3,$4,$5,$4,'OWNER',$6)",[id(),identity,foreignVersion,other,foreignMember,crypto.createHash('sha256').update(pdf).digest('hex')]);
  let checks=0; const ok=(v)=>{assert.ok(v);checks++};
  const scopedTables=(await q("SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='tenant_id' ORDER BY table_name")).map(r=>r.table_name);
  const preserved=async()=>{const result={global:await q("SELECT 'identity' t,to_jsonb(x) v FROM auth_identities x UNION ALL SELECT 'pa',to_jsonb(x) FROM platform_admins x ORDER BY t")};for(const t of scopedTables){assert.match(t,/^[a-z_]+$/);result[t]=await q(`SELECT to_jsonb(x) v FROM "${t}" x WHERE tenant_id=$1 ORDER BY to_jsonb(x)::text`,[other])}return result};
  const baseline=await preserved();const a=await createBackup(pool,ctx,cfg);ok(a.sections.lancamentos.count===1);ok(!JSON.stringify(a).includes('non-login'));ok(a.files.length===1);
  await q("UPDATE lancamentos SET descricao='ESTADO B',valor_previsto=99 WHERE id=$1",[entry]);
  await q("DELETE FROM pessoas WHERE tenant_id=$1",[tenant]);
  await q("INSERT INTO categorias(id,tenant_id,codigo,nome) VALUES($1,$2,'02','Extra B')",[id(),tenant]);
  let preview=await previewRestore(pool,ctx,a,cfg); const attempt=id();
  const receipt=await restoreBackup(pool,ctx,a,cfg,preview.currentDigest,attempt);ok(receipt.checksum===a.checksum);
  const after=await createBackup(pool,ctx,cfg);
  for(const t of Object.keys(a.sections)){const strip=x=>x.map(r=>{const v={...r};delete v.revisao;return v});assert.deepEqual(strip(after.sections[t].rows),strip(a.sections[t].rows));checks++}
  assert.deepEqual(await preserved(),baseline);checks++;
  ok(BigInt(after.sections.lancamentos.rows[0].revisao)>0n);ok(!!await restoreReceipt(pool,ctx,attempt));
  await restoreBackup(pool,ctx,a,cfg,preview.currentDigest,attempt);ok((await q("SELECT count(*)::int n FROM audit_events WHERE id=$1",[attempt]))[0].n===1);
  const resign=b=>{delete b.checksum;for(const s of Object.values(b.sections)){s.count=s.rows.length;s.checksum=digest(s.rows)}return seal(b)};
  const badcases=[];
  let bad=structuredClone(a);bad.checksum='0'.repeat(64);badcases.push(bad);
  bad=structuredClone(a);bad.format='future';badcases.push(resign(bad));
  bad=structuredClone(a);bad.tenant.id=other;badcases.push(resign(bad));
  bad=structuredClone(a);bad.sections.lancamentos.rows[0].conta_id=id();badcases.push(resign(bad));
  bad=structuredClone(a);bad.files[0].key='../elsewhere';badcases.push(resign(bad));
  for(const b of badcases){await assert.rejects(previewRestore(pool,ctx,b,cfg));checks++;}
  await fs.rename(cfg.termDir+'/'+pdfKey,cfg.termDir+'/hidden');await assert.rejects(previewRestore(pool,ctx,a,cfg));checks++;await fs.rename(cfg.termDir+'/hidden',cfg.termDir+'/'+pdfKey);
  await q("UPDATE access_profiles SET nome='Changed' WHERE id=$1",[profile]);await assert.rejects(previewRestore(pool,ctx,a,cfg),{code:'RECONCILIATION'});checks++;await q("UPDATE access_profiles SET nome='Fixture' WHERE id=$1",[profile]);
  // SQL updates do not touch updatedAt, deliberately restore exact reference values here.
  await q("UPDATE tenant_memberships SET role='MEMBER' WHERE id=$1",[member]);await assert.rejects(createBackup(pool,ctx,cfg),{code:'PERMISSION'});checks++;await q("UPDATE tenant_memberships SET role='OWNER' WHERE id=$1",[member]);
  // Failure after all deletes: FK/constraint failure must roll everything back.
  await q(`CREATE FUNCTION phase7_fail_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.descricao='LAB_FAIL' THEN RAISE EXCEPTION 'LAB_FAILURE'; END IF; RETURN NEW; END $$; CREATE TRIGGER phase7_failure BEFORE INSERT ON lancamentos FOR EACH ROW EXECUTE FUNCTION phase7_fail_fixture()`);
  const beforeFailure=await createBackup(pool,ctx,cfg);bad=structuredClone(a);bad.sections.lancamentos.rows[0].descricao="LAB_FAIL";bad=resign(bad);
  preview=await previewRestore(pool,ctx,bad,cfg);await assert.rejects(restoreBackup(pool,ctx,bad,cfg,preview.currentDigest,id()));checks++;
  const afterFailure=await createBackup(pool,ctx,cfg);assert.deepEqual(beforeFailure.sections,afterFailure.sections);checks++;
  // Stale preview rejects changed tenant, but unrelated tenant writes remain available.
  preview=await previewRestore(pool,ctx,a,cfg);await q("UPDATE lancamentos SET descricao='Concurrent' WHERE id=$1",[entry]);
  await assert.rejects(restoreBackup(pool,ctx,a,cfg,preview.currentDigest,id()),{code:'STALE_PREVIEW'});checks++;
  const held=await pool.connect();await held.query('BEGIN');await held.query("SELECT pg_advisory_xact_lock(hashtextextended('10s:tenant-restore:'||$1,0))",[tenant]);
  await assert.rejects(q("UPDATE lancamentos SET descricao='blocked' WHERE id=$1",[entry]),{code:'55P03'});checks++;
  await q("UPDATE lancamentos SET descricao=descricao WHERE id=$1",[isolated]);checks++;
  await held.query('ROLLBACK');held.release();
  const writer=await pool.connect();await writer.query('BEGIN');await writer.query("UPDATE categorias SET nome=nome WHERE id=$1",[category]);
  preview=await previewRestore(pool,ctx,a,cfg);await assert.rejects(restoreBackup(pool,ctx,a,cfg,preview.currentDigest,id()),{code:'BUSY'});checks++;
  await writer.query('ROLLBACK');writer.release();
  // Restore final A; restore never increments/deletes immutable evidences.
  preview=await previewRestore(pool,ctx,a,cfg);await restoreBackup(pool,ctx,a,cfg,preview.currentDigest,id());
  ok((await q('SELECT count(*)::int n FROM term_acceptances'))[0].n===2);
  console.log(JSON.stringify({state:'PASSED',checks,tenant,other,masterReady:true}));await pool.end();
}
main().catch(e=>{console.error('LAB_FAILED',e.code||e.name,e.message?.replace(/postgres(?:ql)?:\/\/\S+/g,'[REDACTED]'));process.exitCode=1});
