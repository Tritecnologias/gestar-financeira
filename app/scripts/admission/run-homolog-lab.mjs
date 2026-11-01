/** LOCAL operational rehearsal, not a publisher. No SSH, DNS, remote context, exposed port or SMTP.
 * node scripts/admission/run-homolog-lab.mjs <new absolute evidence dir> [immutable candidate image id]
 * Reuses Prisma deploy, the existing profile assembler and PostgreSQL backup/restore commands.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,existsSync,copyFileSync} from 'node:fs';
import {resolve,join,isAbsolute,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,randomBytes,createHash,createCipheriv,createDecipheriv} from 'node:crypto';
import {PRE_ADMISSION_HOMOLOG_MIGRATIONS as h7,HOMOLOG_MIGRATIONS as h8,HOMOLOG_ADMISSION_MIGRATION as migration} from '../../src/lib/backup/schema-contract.mjs';
import {HOMOLOG_DATABASE_GUARD_SQL as attestation} from '../../src/lib/admission-database-contract.mjs';
import {rehearseCandidate,recoverCandidate} from './homolog-runtime-lab.mjs';
const app=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),out=resolve(process.argv[2]||'.');
assert(process.argv[2]&&isAbsolute(process.argv[2])&&!existsSync(out),'NEW_ABSOLUTE_OUTPUT_REQUIRED');
const candidate=process.argv[3];assert(!candidate||/^sha256:[a-f0-9]{64}$/.test(candidate),'IMMUTABLE_IMAGE_REQUIRED');
mkdirSync(out,{recursive:true});
const pgImage='sha256:10a5c69a83035ab5239f5620d708520e8b28f5aa1f2b20143e6024532edadfb5',nodeImage=candidate||'sha256:271e76a186736f3a533931712920c03644bd69684b11d04b1c468d0870ba0d13';
const suffix=randomUUID().slice(0,8),pg='dez-a26-homolog-'+suffix,recovery='dez-a26-recovery-'+suffix,created=[];
const db='gestar_homolog_pg18',mg='pg18_homolog_migrator',rt='pg18_homolog_runtime',intent='dez-a2-homolog-h7-h8';
const sha=b=>createHash('sha256').update(b).digest('hex');
const report={phase:'A.2.6 LOCAL',startedAt:new Date().toISOString(),syntheticOnly:true,remoteOperations:0,network:'none',publishedPorts:[],realEmail:false,candidateImage:candidate||null,checks:[],commands:[]};
const pass=name=>{report.checks.push(name);console.log('PASS '+name);};
function run(args,input,ok=true){return new Promise((accept,reject)=>{
  const child=spawn('docker',args,{windowsHide:true,stdio:['pipe','pipe','pipe']}),stdout=[],stderr=[];
  const timer=setTimeout(()=>child.kill(),240000);child.stdout.on('data',b=>stdout.push(b));child.stderr.on('data',b=>stderr.push(b));
  child.on('error',e=>{clearTimeout(timer);reject(e)});child.on('close',code=>{clearTimeout(timer);
    const result={code,bytes:Buffer.concat(stdout),stdout:Buffer.concat(stdout).toString(),stderr:Buffer.concat(stderr).toString()};
    report.commands.push({operation:args[0],code});
    if(ok&&code!==0)reject(Error('LOCAL_DOCKER_STEP_FAILED '+args[0]+' '+result.stderr.slice(-500)));else accept(result);
  });child.stdin.on('error',()=>{});child.stdin.end(input);
});}
async function sql(query,{database=db,role=mg,container=pg,ok=true,authorized=true}={}){
  assert([pg,recovery].includes(container));assert(/^[a-z0-9_]+$/.test(database));
  return run(['exec','-i','-e','PGAPPNAME='+(authorized?intent:'unapproved'),container,'psql','-XqAt','-v','ON_ERROR_STOP=1','-U',role,'-d',database],query,ok);
}
async function value(query,options){return (await sql(query,options)).stdout.trim();}
async function fails(name,query,marker,options={}){const r=await sql(query,{...options,ok:false});assert.notEqual(r.code,0,name);assert(r.stderr.includes(marker),r.stderr.slice(-800));pass(name);}
async function start(name){
  await run(['run','-d','--pull=never','--name',name,'--network','none','--add-host','0f5rvkjqjdt9fez1ajiascyk:127.0.0.1','--restart','no','--label','purpose=dez-a26-local-rehearsal','--memory','768m',
    '--mount','type=tmpfs,destination=/var/lib/postgresql','-e','POSTGRES_HOST_AUTH_METHOD=trust',pgImage]);created.push(name);
  let ready=false;for(let n=0;n<80;n++){if((await run(['exec',name,'pg_isready','-h','127.0.0.1','-U','postgres'],undefined,false)).code===0){ready=true;break;}await new Promise(r=>setTimeout(r,250));}assert(ready);
  const state=JSON.parse((await run(['inspect',name])).stdout)[0];assert.equal(state.HostConfig.NetworkMode,'none');assert.deepEqual(state.HostConfig.PortBindings,{});
}
function stage(lane,list,alter){
  mkdirSync(join(out,lane,'migrations'),{recursive:true});
  writeFileSync(join(out,lane,'config.cjs'),"module.exports={schema:'/source/schema.prisma',migrations:{path:'/lab/"+lane+"/migrations'},datasource:{url:process.env.DATABASE_URL}};\n");
  writeFileSync(join(out,lane,'migrations/migration_lock.toml'),'provider = "postgresql"\n');
  for(const m of list){const folder=m.name===migration.name?'homolog-migrations':'migrations';const bytes=readFileSync(join(app,'prisma',folder,m.name,'migration.sql'));assert.equal(sha(bytes),m.sha256);
    mkdirSync(join(out,lane,'migrations',m.name),{recursive:true});writeFileSync(join(out,lane,'migrations',m.name,'migration.sql'),alter&&m.name===migration.name?alter(bytes.toString()):bytes);
  }
}
async function migrate(lane,verb='deploy',ok=true){
  const r=await run(['run','--rm','--pull=never','--network','container:'+pg,'--memory','768m','--entrypoint','node',
    '--mount','type=bind,source='+out+',target=/lab,readonly','--mount','type=bind,source='+join(app,'prisma/schema.prisma')+',target=/source/schema.prisma,readonly',
    '-e','DATABASE_URL=postgresql://'+mg+'@127.0.0.1:5432/'+db+'?schema=public&application_name='+intent,nodeImage,
    'node_modules/prisma/build/index.js','migrate',verb,'--config','/lab/'+lane+'/config.cjs'],undefined,false);
  writeFileSync(join(out,lane+'-'+verb+'-'+report.checks.length+'.log'),r.stdout+r.stderr);
  if(ok)assert.equal(r.code,0,r.stdout+r.stderr);return r;
}
async function fingerprint(container=pg,includeLedger=true){
  const tables=(await value("SELECT tablename FROM pg_tables WHERE schemaname='public'"+(includeLedger?'':" AND tablename<>'_prisma_migrations' AND tablename NOT IN ('admissions','admission_challenges')")+' ORDER BY tablename',{container})).split('\n');
  const selects=tables.map(t=>{assert(/^[a-z_]+$/.test(t));return "SELECT '"+t+"' name,count(*) rows,md5(coalesce(string_agg(to_jsonb(t)::text,chr(10) ORDER BY to_jsonb(t)::text),'')) digest FROM public.\""+t+'" t';});
  return JSON.parse(await value('SELECT json_agg(x ORDER BY name) FROM ('+selects.join(' UNION ALL ')+') x',{container}));
}
const roleQuery="SELECT json_agg(x ORDER BY rolname) FROM(SELECT rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls,rolconnlimit,rolconfig FROM pg_roles)x";
const aclQuery="SELECT json_agg(x ORDER BY relname) FROM(SELECT relname,pg_get_userbyid(relowner) owner,relacl::text acl FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN('r','p') AND relname NOT IN ('admissions','admission_challenges'))x";
const sqlText=readFileSync(join(app,'prisma/homolog-migrations',migration.name,'migration.sql'),'utf8'),acl=readFileSync(join(app,'scripts/admission/homolog-runtime-acl.sql'),'utf8');
const key=randomBytes(32),header=Buffer.from('DEZ-HOMOLOG-DR/1\n');
function encrypt(plain){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);c.setAAD(header);return Buffer.concat([header,iv,c.update(plain),c.final(),c.getAuthTag()]);}
function decrypt(bytes){assert(bytes.subarray(0,header.length).equals(header));const d=createDecipheriv('aes-256-gcm',key,bytes.subarray(header.length,header.length+12));d.setAAD(header);d.setAuthTag(bytes.subarray(-16));return Buffer.concat([d.update(bytes.subarray(header.length+12,-16)),d.final()]);}
try {
  assert(JSON.parse((await run(['context','inspect'])).stdout)[0].Endpoints.docker.Host.startsWith('npipe://'),'LOCAL_WINDOWS_DOCKER_ONLY');
  for(const image of [pgImage,nodeImage])assert.equal((await run(['image','inspect',image,'--format','{{.Id}}'])).stdout.trim(),image);
  if(candidate){
    const metadata=JSON.parse((await run(['run','--rm','--pull=never','--network','none','--entrypoint','cat',candidate,'/app/build-metadata.json'])).stdout);
    assert.equal(metadata.deploymentProfile,'homolog');assert.deepEqual(metadata.migrations,h8);report.sourceCommit=metadata.sourceCommit;report.metadata=metadata;
    for(const m of h8){const bytes=(await run(['run','--rm','--pull=never','--network','none','--entrypoint','cat',candidate,'/app/prisma/migrations/'+m.name+'/migration.sql'])).bytes;assert.equal(sha(bytes),m.sha256);}
    pass('immutable candidate image present; provenance and all eight packaged migration hashes verified');
  }
  await start(pg);
  await sql('CREATE ROLE pg18_homolog_admin LOGIN SUPERUSER; CREATE ROLE '+mg+' LOGIN; CREATE ROLE '+rt+' LOGIN; CREATE DATABASE '+db+' OWNER '+mg,{database:'postgres',role:'postgres'});
  stage('h7',h7);await migrate('h7');
  await sql('REVOKE ALL ON DATABASE '+db+' FROM PUBLIC; GRANT CONNECT ON DATABASE '+db+' TO '+rt+'; REVOKE ALL ON SCHEMA public FROM PUBLIC; GRANT USAGE ON SCHEMA public TO '+rt+'; GRANT SELECT ON ALL TABLES IN SCHEMA public TO '+rt+';'+
    'GRANT INSERT ON audit_events,access_owner_events,term_acceptances TO '+rt+'; GRANT INSERT,UPDATE ON tenants,auth_identities,tenant_memberships,access_profiles,usuarios,legacy_user_access_maps,platform_admins,experiment_invitations TO '+rt+';');
  await sql(readFileSync(join(app,'scripts/admission/fixtures.sql'),'utf8'));
  const initial=await fingerprint(),priorRows=await fingerprint(pg,false),priorAcl=await value(aclQuery);assert.equal(initial.length,42);
  report.roles=JSON.parse(await value(roleQuery));report.memberships=JSON.parse(await value("SELECT coalesce(json_agg(x),'[]') FROM (SELECT pg_get_userbyid(roleid) role,pg_get_userbyid(member) member,admin_option FROM pg_auth_members)x"));
  pass('genuine H7 with 42 tables, full PostgreSQL role and membership inventory, synthetic contracts and data');
  const h7Dump=(await run(['exec',pg,'pg_dump','-U','postgres','-d',db,'-Fc'])).bytes;
  // H7 recovery point is authenticated before any H8 change; plaintext stays in RAM.
  await run(['exec',pg,'mkdir','-p','/var/lib/postgresql/a26-h7']);
  await run(['exec','-i',pg,'sh','-c','cat > /var/lib/postgresql/a26-h7/database.dump'],h7Dump);
  await run(['exec',pg,'pg_dumpall','-U','postgres','--roles-only','-f','/var/lib/postgresql/a26-h7/roles.sql']);
  await run(['exec','-i',pg,'sh','-c','cat > /var/lib/postgresql/a26-h7/configuration.private.json'],JSON.stringify({database:db,owner:mg,roles:report.roles,databaseAcl:await value("SELECT datacl::text FROM pg_database WHERE datname=current_database()"),ledger:h7}));
  const h7Tar=(await run(['exec',pg,'tar','-C','/var/lib/postgresql/a26-h7','-cf','-','.'])).bytes;
  const h7Cipher=encrypt(h7Tar);writeFileSync(join(out,'synthetic-h7.aesgcm'),h7Cipher);
  assert.deepEqual(decrypt(readFileSync(join(out,'synthetic-h7.aesgcm'))),h7Tar);
  report.h7Backup={format:'DEZ-HOMOLOG-DR/1 AES-256-GCM authenticated tar',sha256:sha(h7Cipher),plaintextSHA256:sha(h7Tar),dumpSHA256:sha(h7Dump)};
  await fails('no release intent denied before DDL',sqlText,'ADMISSION_REQUIRES_AUTHORIZED_HOMOLOG_EXACT_H7',{authorized:false});
  await fails('runtime cannot execute migration',sqlText,'ADMISSION_REQUIRES_AUTHORIZED_HOMOLOG_EXACT_H7',{role:rt});
  await fails('SET ROLE does not substitute session identity','SET ROLE '+mg+';'+sqlText,'ADMISSION_REQUIRES_AUTHORIZED_HOMOLOG_EXACT_H7',{role:'postgres'});
  await fails('altered H7 ledger denied','BEGIN; UPDATE _prisma_migrations SET checksum=repeat(\'0\',64) WHERE migration_name=\''+h7[0].name+'\';'+sqlText,'ADMISSION_REQUIRES_AUTHORIZED_HOMOLOG_EXACT_H7');
  await fails('extra schema in initial search path denied','SET search_path=pg_catalog;'+sqlText,'ADMISSION_REQUIRES_PUBLIC');
  await sql('GRANT '+mg+' TO '+rt,{database:'postgres',role:'postgres'});
  await fails('elevated runtime membership denied',sqlText,'ADMISSION_REQUIRES_AUTHORIZED_HOMOLOG_EXACT_H7');
  await sql('REVOKE '+mg+' FROM '+rt,{database:'postgres',role:'postgres'});
  for(const name of ['gestar_prod_pg18','unapproved_database']){
    await sql('ALTER DATABASE '+db+' RENAME TO '+name,{database:'postgres',role:'postgres'});
    await fails(name+' cannot be authorized by role and intent alone',sqlText,'ADMISSION_REQUIRES_AUTHORIZED_HOMOLOG_EXACT_H7',{database:name});
    await sql('ALTER DATABASE '+name+' RENAME TO '+db,{database:'postgres',role:'postgres'});
  }
  await fails('failure after DDL rolls back both tables and all enums',sqlText.replace('COMMIT;',"DO $$ BEGIN RAISE EXCEPTION 'INDUCED_LATE_FAILURE'; END $$; COMMIT;"),'INDUCED_LATE_FAILURE');
  assert.equal(await value("SELECT to_regclass('admissions') IS NULL AND NOT EXISTS(SELECT 1 FROM pg_type WHERE typname='AdmissionSource')"),'t');assert.deepEqual(await fingerprint(),initial);
  // A real Prisma failure leaves its failed ledger entry; never fabricate a successful resolution.
  stage('failed',h8,s=>s.replace('COMMIT;',"DO $$ BEGIN RAISE EXCEPTION 'INDUCED_PRISMA_FAILURE'; END $$; COMMIT;"));
  assert.notEqual((await migrate('failed','deploy',false)).code,0);
  assert.equal(await value("SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NULL"),'1');
  assert.equal(await value("SELECT to_regclass('admissions') IS NULL"),'t');
  stage('h8',h8);assert.notEqual((await migrate('h8','deploy',false)).code,0);pass('Prisma partial failure retains failed ledger, rolls back DDL, and blocks automatic retry');
  await sql('ALTER DATABASE '+db+' RENAME TO a26_failed_preserved; CREATE DATABASE '+db+' OWNER '+mg,{database:'postgres',role:'postgres'});
  await run(['exec',pg,'mkdir','-p','/var/lib/postgresql/a26-h7-recovered']);
  await run(['exec','-i',pg,'tar','-C','/var/lib/postgresql/a26-h7-recovered','-xf','-'],decrypt(readFileSync(join(out,'synthetic-h7.aesgcm'))));
  await run(['exec',pg,'pg_restore','-U','postgres','-d',db,'--exit-on-error','/var/lib/postgresql/a26-h7-recovered/database.dump']);
  await sql('REVOKE ALL ON DATABASE '+db+' FROM PUBLIC; GRANT CONNECT ON DATABASE '+db+' TO '+rt+';');
  assert.deepEqual(await fingerprint(),initial);pass('failed rehearsal recovers exact H7 backup without editing history');
  await migrate('h8');assert.equal((await fingerprint()).length,44);assert.deepEqual(await fingerprint(pg,false),priorRows);assert.equal(await value(aclQuery),priorAcl);
  pass('H7 to H8: exactly 42 to 44 tables, prior rows/contracts/ACLs unchanged');
  assert.equal(await value(attestation,{role:rt}),'f');pass('application database proof denies missing A2 ACLs');
  await sql(acl);await sql(acl);assert.equal(await value(attestation,{role:rt}),'t');
  assert.equal(await value(aclQuery),priorAcl);pass('minimal A2 ACLs replay safely; complete runtime database attestation passes');
  const after=await fingerprint();await migrate('h8');await migrate('h8','status');assert.deepEqual(await fingerprint(),after);pass('Prisma deploy replay is a no-op and ledger/status are exact H8');
  const constraints=JSON.parse(await value("SELECT json_agg(x ORDER BY conname) FROM(SELECT conname,contype,convalidated,pg_get_constraintdef(oid) definition FROM pg_constraint WHERE conrelid IN('admissions'::regclass,'admission_challenges'::regclass))x"));
  assert.equal(constraints.filter(x=>x.contype==='f').length,8);assert(constraints.every(x=>x.convalidated));report.constraints=constraints;
  for(const [name,q] of [['ledger writes',"UPDATE _prisma_migrations SET checksum=checksum"],['audit changes','UPDATE audit_events SET action=action'],['accepted contracts','DELETE FROM term_acceptances'],['admission deletion','DELETE FROM admissions'],['challenge deletion','DELETE FROM admission_challenges'],['immutable token','UPDATE admission_challenges SET token_hash=token_hash'],['immutable email','UPDATE admissions SET authorized_email=authorized_email'],['DDL','CREATE TABLE public.forbidden(id int)']])await fails(name+' denied to runtime',q,'permission denied',{role:rt});
  const insert="INSERT INTO admissions(id,source,source_reference,experiment_invitation_id,authorized_email,authorized_by_admin_id,authorized_by_identity_id,expires_at) VALUES ('proof','AUTHORIZED_INVITE','special-1','special-1','owner@example.invalid','admin-a','admin-i',now()+interval '1 hour');";
  await sql(insert,{role:rt});await fails('unique authorization source enforced',insert.replace("('proof'","('proof-duplicate'"),'duplicate key',{role:rt});
  await fails('wrong issuer identity rejected by FK',insert.replaceAll('special-1','special-2').replace("('proof'","('proof-bad' ").replace("'admin-a','admin-i'","'admin-a','other-i'"),'foreign key',{role:rt});
  await sql('GRANT DELETE ON admissions TO '+rt);assert.equal(await value(attestation,{role:rt}),'f');await sql('REVOKE DELETE ON admissions FROM '+rt);pass('unexpected privilege expansion disables runtime authorization');
  await sql('GRANT SELECT ON admissions TO PUBLIC');assert.equal(await value(attestation,{role:rt}),'f');await sql('REVOKE SELECT ON admissions FROM PUBLIC');pass('PUBLIC exposure disables runtime authorization');
  for(const [name,change,undo] of [
    ['table owner','ALTER TABLE admissions OWNER TO pg18_homolog_admin','ALTER TABLE admissions OWNER TO '+mg],
    ['database owner','ALTER DATABASE '+db+' OWNER TO postgres','ALTER DATABASE '+db+' OWNER TO '+mg],
    ['schema owner','ALTER SCHEMA public OWNER TO postgres','ALTER SCHEMA public OWNER TO pg_database_owner'],
    ['superuser runtime','ALTER ROLE '+rt+' SUPERUSER','ALTER ROLE '+rt+' NOSUPERUSER'],
    ['column grant option','GRANT UPDATE(status) ON admissions TO '+rt+' WITH GRANT OPTION','REVOKE GRANT OPTION FOR UPDATE(status) ON admissions FROM '+rt]
  ]){
    await sql(change,{role:'postgres'});assert.equal(await value(attestation,{role:rt}),'f',name);await sql(undo,{role:'postgres'});assert.equal(await value(attestation,{role:rt}),'t',name+' restored');pass(name+' drift denied without relying on environment flags');
  }
  assert.equal(await value(attestation,{role:rt}),'t');
  const application=candidate?await rehearseCandidate({run,image:candidate,pg,created,out,app,pass}):null;
  if(application)report.http=application.checks;
  // Operational DR/1 envelope: authenticated tar with dump, roles, database ownership/ACL metadata.
  // Only ciphertext is persisted on the host. Plain files exist in isolated container tmpfs.
  const finalRows=await fingerprint();
  await run(['exec',pg,'mkdir','-p','/var/lib/postgresql/a26-backup']);
  await run(['exec',pg,'pg_dump','-U','postgres','-d',db,'-Fc','-f','/var/lib/postgresql/a26-backup/database.dump']);
  await run(['exec',pg,'pg_dumpall','-U','postgres','--roles-only','-f','/var/lib/postgresql/a26-backup/roles.sql']);
  await run(['exec','-i',pg,'sh','-c','cat > /var/lib/postgresql/a26-backup/configuration.private.json'],JSON.stringify({database:db,owner:mg,roles:report.roles,databaseAcl:await value("SELECT datacl::text FROM pg_database WHERE datname=current_database()"),sourceCommit:report.sourceCommit||'local-source-rehearsal',...(application?{env:application.env,client:application.client,files:application.files}:{})}));
  if(application)await run(['exec','-i',pg,'sh','-c','cat > /var/lib/postgresql/a26-backup/volumes.tar'],application.volumes);
  const tar=(await run(['exec',pg,'tar','-C','/var/lib/postgresql/a26-backup','-cf','-','.'])).bytes;
  const cipher=encrypt(tar);writeFileSync(join(out,'synthetic-h8.aesgcm'),cipher);assert.deepEqual(decrypt(readFileSync(join(out,'synthetic-h8.aesgcm'))),tar);
  const corrupt=Buffer.from(cipher);corrupt[corrupt.length-20]^=1;assert.throws(()=>decrypt(corrupt));pass('DR/1 AES-256-GCM backup authenticates encrypted capture and rejects tampering');
  await start(recovery);await run(['exec',recovery,'mkdir','-p','/var/lib/postgresql/a26-restore']);
  await run(['exec','-i',recovery,'tar','-C','/var/lib/postgresql/a26-restore','-xf','-'],decrypt(cipher));
  const roles=(await run(['exec',recovery,'cat','/var/lib/postgresql/a26-restore/roles.sql'])).stdout;
  // The bootstrap role is already present in a fresh PostgreSQL image; retain its ALTER statements.
  await sql(roles.replace(/^CREATE ROLE postgres;\r?\n/m,''),{container:recovery,database:'postgres',role:'postgres'});
  await sql('CREATE DATABASE '+db+' OWNER '+mg,{container:recovery,database:'postgres',role:'postgres'});
  await run(['exec',recovery,'pg_restore','-U','postgres','-d',db,'--exit-on-error','/var/lib/postgresql/a26-restore/database.dump']);
  await sql('REVOKE ALL ON DATABASE '+db+' FROM PUBLIC; GRANT CONNECT ON DATABASE '+db+' TO '+rt+';',{container:recovery});
  assert.deepEqual(await fingerprint(recovery),finalRows);assert.equal(await value(roleQuery,{container:recovery}),await value(roleQuery));assert.equal(await value(aclQuery,{container:recovery}),priorAcl);
  assert.equal(await value(attestation,{container:recovery,role:rt}),'t');
  if(application){
    const restored=JSON.parse((await run(['exec',recovery,'cat','/var/lib/postgresql/a26-restore/configuration.private.json'])).stdout);
    const volumes=(await run(['exec',recovery,'cat','/var/lib/postgresql/a26-restore/volumes.tar'])).bytes;
    await recoverCandidate({run,image:candidate,pg:recovery,created,context:{...restored,volumes},pass,out});
    report.contingency={sameH8Image:true,originalStopped:true,restoredSessionResumed:true,oldBinaryNeverUsed:true};
  }
  report.recovery={state:'PASSED',tables:44,roles:report.roles.length,encryptedSHA256:sha(cipher),plaintextSHA256:sha(tar),separateNetworkNamespace:true,allRowsAndLedgerEqual:true};
  pass('independent PostgreSQL restore preserves all 44 tables, ledger, full roles, ACLs and runtime proof');
  report.ledger=h8;report.state='PASSED';
} catch(error){report.state='FAILED';report.failure=String(error.message).slice(0,1600);console.error(report.failure);process.exitCode=1;}
finally {
  key.fill(0);report.finishedAt=new Date().toISOString();
  for(const name of created.reverse())await run(['rm','-f',name],undefined,false);
  report.containersRemoved=created;
  writeFileSync(join(out,'RESULT.json'),JSON.stringify(report,null,2)+'\n');console.log('RESULT '+report.state);
}
