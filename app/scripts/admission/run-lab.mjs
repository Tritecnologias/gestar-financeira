/**
 * A.2.1 PostgreSQL/Prisma foundation proof, not an admission implementation.
 * No env files, real data, published ports, SMTP or external network.
 * Usage: node scripts/admission/run-lab.mjs <absolute-new-evidence-directory>
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,existsSync,copyFileSync} from 'node:fs';
import {resolve,join,isAbsolute,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {PRE_ADMISSION_HOMOLOG_MIGRATIONS as h7,PRE_ADMISSION_PRODUCTION_MIGRATIONS as p6,ADMISSION_MIGRATION as migration} from '../../src/lib/backup/schema-contract.mjs';

const app=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
assert(process.argv[2] && isAbsolute(process.argv[2]),'ABSOLUTE_NEW_OUTPUT_REQUIRED');
const out=resolve(process.argv[2]);
assert(!existsSync(out),'NEW_EVIDENCE_DIRECTORY_REQUIRED');
mkdirSync(out,{recursive:true});
const pg='dez-a2-foundation-'+randomUUID().slice(0,8);
const pgImage='sha256:10a5c69a83035ab5239f5620d708520e8b28f5aa1f2b20143e6024532edadfb5';
const nodeImage='sha256:271e76a186736f3a533931712920c03644bd69684b11d04b1c468d0870ba0d13';
const report={phase:'A.2.1',syntheticOnly:true,network:'none',publishedPorts:[],realEmail:false,checks:[],migrations:{},startedAt:new Date().toISOString()};
let created=false;
function run(args,input,ok=true){
  return new Promise((accept,reject)=>{
    const child=spawn('docker',args,{windowsHide:true,stdio:['pipe','pipe','pipe']});
    const stdout=[],stderr=[];const timer=setTimeout(()=>child.kill(),180000);
    child.stdout.on('data',b=>stdout.push(b));child.stderr.on('data',b=>stderr.push(b));
    child.on('error',e=>{clearTimeout(timer);reject(e)});
    child.on('close',code=>{clearTimeout(timer);const result={code,bytes:Buffer.concat(stdout),stdout:Buffer.concat(stdout).toString(),stderr:Buffer.concat(stderr).toString()};
      if(ok&&code!==0)reject(new Error('DOCKER_STEP_FAILED '+args.slice(0,2).join(' ')+' '+result.stderr.slice(-1800)));else accept(result);});
    child.stdin.on('error',()=>{});child.stdin.end(input);
  });
}
async function sql(query,db='a2_h',role='a2_runtime',ok=true){
  assert(['postgres','a2_h','a2_p','a2_restore','a2_bad','blocked_environment','special_invite_lab','gestar_prod_pg18'].includes(db));
  assert(['postgres','a2_migrator','a2_runtime','pg18_prod_migrator','a2_observer'].includes(role));
  return run(['exec','-i',pg,'psql','-XqAt','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-U',role,'-d',db],query,ok);
}
async function value(query,db='a2_h',role='a2_migrator'){
  return (await sql(query,db,role)).stdout.trim();
}
const pass=(name)=>{report.checks.push(name);console.log('PASS '+name)};
async function fails(name,query,code,db='a2_h',role='a2_runtime'){
  const r=await sql(query,db,role,false);assert.notEqual(r.code,0,name);assert(r.stderr.includes(code),name+': '+r.stderr.slice(-500));pass(name);
}
function stage(lane,list){
  const root=join(out,lane);mkdirSync(join(root,'migrations'),{recursive:true});
  writeFileSync(join(root,'prisma.config.cjs'),"module.exports={schema:'/source/schema.prisma',migrations:{path:'/lab/"+lane+"/migrations'},datasource:{url:process.env.DATABASE_URL}};\n");
  writeFileSync(join(root,'migrations','migration_lock.toml'),'provider = "postgresql"\n');
  for(const m of list){
    const dir=lane==='p'&&existsSync(join(app,'prisma/production-migrations',m.name,'migration.sql'))?'production-migrations':'migrations';
    const source=join(app,'prisma',dir,m.name,'migration.sql');
    assert.equal(createHash('sha256').update(readFileSync(source)).digest('hex'),m.sha256);
    mkdirSync(join(root,'migrations',m.name),{recursive:true});copyFileSync(source,join(root,'migrations',m.name,'migration.sql'));
  }
}
async function migrate(lane,db,role,verb='deploy',ok=true){
  const r=await run(['run','--rm','--pull=never','--network','container:'+pg,'--memory','768m','--entrypoint','node',
    '--mount','type=bind,source='+out+',target=/lab,readonly',
    '--mount','type=bind,source='+join(app,'prisma/schema.prisma')+',target=/source/schema.prisma,readonly',
    '-e','DATABASE_URL=postgresql://'+role+'@127.0.0.1:5432/'+db,nodeImage,
    'node_modules/prisma/build/index.js','migrate',verb,'--config','/lab/'+lane+'/prisma.config.cjs'],undefined,false);
  writeFileSync(join(out,lane+'-'+db+'-'+verb+'-'+report.checks.length+'.log'),r.stdout+r.stderr);
  if(ok)assert.equal(r.code,0,r.stdout+r.stderr);
  return r;
}
async function fingerprints(db,includeNew=false){
  const names=(await value("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'_prisma_migrations'"+
    (includeNew?'':" AND tablename NOT IN('admissions','admission_challenges')")+" ORDER BY tablename",db)).split('\n').filter(Boolean);
  for(const t of names)assert(/^[a-z_]+$/.test(t));
  const parts=names.map(t=>'SELECT \''+t+'\' name,md5(COALESCE(string_agg(to_jsonb(t)::text,chr(10) ORDER BY to_jsonb(t)::text),\'\')) fingerprint FROM public."'+t+'" t');
  return JSON.parse(await value('SELECT json_object_agg(name,fingerprint ORDER BY name)::text FROM ('+parts.join(' UNION ALL ')+') x',db));
}
async function acls(db){return value("SELECT json_agg(x ORDER BY name)::text FROM(SELECT c.relname name,c.relacl::text acl,pg_get_userbyid(c.relowner) owner FROM pg_class c WHERE c.relnamespace='public'::regnamespace AND c.relkind IN('r','S') AND c.relname NOT IN('admissions','admission_challenges'))x",db)}
function authorization(id,n,actor='admin-i',admin='admin-a'){
  // SQL reference protocol only. Future HTTP must derive actor from authenticated session.
  return "BEGIN ISOLATION LEVEL SERIALIZABLE; WITH authority AS ("+
    "SELECT a.id,a.identity_id FROM platform_admins a JOIN auth_identities i ON i.id=a.identity_id "+
    "WHERE a.id='"+admin+"' AND a.identity_id='"+actor+"' AND a.status='ACTIVE' AND i.status='ACTIVE' FOR SHARE OF a,i),"+
    "interest AS (SELECT id,expires_at FROM experiment_invitations WHERE id='special-"+n+"' AND interest_at IS NOT NULL "+
    "AND revoked_at IS NULL AND expires_at>clock_timestamp() FOR UPDATE),"+
    "written AS (INSERT INTO admissions(id,source,source_reference,experiment_invitation_id,authorized_email,authorized_by_admin_id,authorized_by_identity_id,expires_at) "+
    "SELECT '"+id+"','AUTHORIZED_INVITE',e.id,e.id,'owner@example.invalid',a.id,a.identity_id,LEAST(e.expires_at,clock_timestamp()+interval '1 hour') FROM authority a CROSS JOIN interest e RETURNING id) "+
    "SELECT count(*) FROM written; COMMIT;";
}
function challenge(id,admission,gen=1,purpose='EMAIL_VERIFICATION'){
  return "INSERT INTO admission_challenges(id,admission_id,recipient_email,purpose,generation,token_hash,expires_at,delivery_status) VALUES ('"+
    id+"','"+admission+"','owner@example.invalid','"+purpose+"',"+gen+",'"+createHash('sha256').update(id).digest('hex')+"',now()+interval '10 minutes','SIMULATED');";
}
async function proof(admission,id){
  await sql(challenge(id,admission));
  await sql("BEGIN; WITH moment AS MATERIALIZED (SELECT date_trunc('milliseconds',clock_timestamp()) t) UPDATE admission_challenges SET status='CONSUMED',attempt_count=1,last_attempt_at=moment.t,consumed_at=moment.t FROM moment WHERE id='"+id+"';"+
    "UPDATE admissions SET verified_challenge_id='"+id+"',email_verified_at=(SELECT consumed_at FROM admission_challenges WHERE id='"+id+"') WHERE id='"+admission+"'; COMMIT;");
}
const aclSql=readFileSync(join(app,'scripts/admission/runtime-acl.sql'),'utf8');
const newSql=readFileSync(join(app,'prisma/migrations',migration.name,'migration.sql'),'utf8');
try {
  const context=JSON.parse((await run(['context','inspect'])).stdout)[0];
  assert(context.Endpoints.docker.Host.startsWith('npipe://'),'LOCAL_WINDOWS_DOCKER_ONLY');
  for(const image of [pgImage,nodeImage])await run(['image','inspect',image,'--format','{{.Id}}']);
  await run(['run','-d','--pull=never','--name',pg,'--network','none','--restart','no','--label','purpose=dez-a2-foundation',
    '--memory','768m','--mount','type=tmpfs,destination=/var/lib/postgresql','-e','POSTGRES_HOST_AUTH_METHOD=trust',pgImage]);
  created=true;
  let ready=false;
  for(let i=0;i<80;i++){if((await run(['exec',pg,'pg_isready','-U','postgres'],undefined,false)).code===0){ready=true;break}await new Promise(r=>setTimeout(r,250))}
  assert(ready,'POSTGRES_READY');
  const state=JSON.parse((await run(['inspect',pg])).stdout)[0];
  assert.equal(state.HostConfig.NetworkMode,'none');assert.deepEqual(state.HostConfig.PortBindings,{});assert.equal(state.HostConfig.RestartPolicy.Name,'no');
  assert.equal(await value('SHOW server_version','postgres','postgres'),'18.6');
  pass('fresh PG18.6 tmpfs container, no network, no ports, no restart or real data');
  await sql("CREATE ROLE a2_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;"+
    "CREATE ROLE a2_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;"+
    "CREATE ROLE a2_observer LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT;"+
    "CREATE ROLE pg18_prod_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;"+
    "CREATE ROLE pg18_prod_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;"+
    "CREATE DATABASE special_invite_lab OWNER a2_migrator; CREATE DATABASE gestar_prod_pg18 OWNER pg18_prod_migrator;"+
    "CREATE DATABASE a2_bad OWNER a2_migrator; CREATE DATABASE blocked_environment OWNER a2_migrator;"+
    "CREATE DATABASE a2_restore OWNER a2_migrator;","postgres","postgres");
  stage('h',h7);stage('p',p6);
  await migrate('h','special_invite_lab','a2_migrator');
  await sql("ALTER DATABASE special_invite_lab RENAME TO a2_h","postgres","postgres");
  const h7Dump=(await run(['exec',pg,'pg_dump','-U','postgres','-d','a2_h','-Fc'])).bytes;
  pass('genuine Prisma deploy builds exact H7 from unchanged historical SQL');
  // This database is synthetic inside THIS network-none container, not the remote PROD database.
  await migrate('p','gestar_prod_pg18','pg18_prod_migrator');pass('genuine Prisma deploy builds exact P6 in disposable local fixture');
  await sql("REASSIGN OWNED BY pg18_prod_migrator TO a2_migrator","gestar_prod_pg18","postgres");
  await sql("ALTER DATABASE gestar_prod_pg18 RENAME TO a2_p","postgres","postgres");
  for(const db of ['a2_h','a2_p']){
    await sql("REVOKE ALL ON DATABASE "+db+" FROM PUBLIC; GRANT CONNECT ON DATABASE "+db+" TO a2_runtime,a2_observer;"+
      "REVOKE ALL ON SCHEMA public FROM PUBLIC; GRANT USAGE ON SCHEMA public TO a2_runtime;"+
      "GRANT SELECT ON ALL TABLES IN SCHEMA public TO a2_runtime;"+
      "GRANT INSERT ON audit_events,access_owner_events,term_acceptances TO a2_runtime;"+
      "GRANT INSERT,UPDATE ON tenants,auth_identities,tenant_memberships,access_profiles,usuarios,legacy_user_access_maps,platform_admins,experiment_invitations TO a2_runtime;",db,'a2_migrator');
    await sql(readFileSync(join(app,'scripts/admission/fixtures.sql'),'utf8'),db,'a2_migrator');
    const before=await fingerprints(db),aclBefore=await acls(db);
    assert.equal(Object.keys(before).length,41); // 42 tables including the ledger.
    const lane=db==='a2_h'?'h':'p';stage(lane,[migration]);await migrate(lane,db,'a2_migrator');
    assert.deepEqual(await fingerprints(db),before);assert.equal(await acls(db),aclBefore);
    const count=await value("SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL",db);
    assert.equal(count,db==='a2_h'?'8':'7');
    assert.equal(await value("SELECT count(*) FROM admissions UNION ALL SELECT count(*) FROM admission_challenges",db),'0\n0');
    report.migrations[db]={ledger:count,existingTables:Object.keys(before).length,unchanged:true};
    pass(db+': migration keeps all 41 prior application tables, contracts, receipts and ACLs intact; exact ledger advances');
    await sql(aclSql,db,'a2_migrator');
    const after=await fingerprints(db,true);await migrate(lane,db,'a2_migrator');await migrate(lane,db,'a2_migrator','status');
    assert.deepEqual(await fingerprints(db,true),after);pass(db+': migrate replay is no-op and Prisma status current');
  }

  // Guard tests use full synthetic dumps, never forged ledger entries.
  await run(['exec','-i',pg,'pg_restore','-U','postgres','-d','a2_bad','--exit-on-error'],h7Dump);
  await sql("GRANT SELECT ON ALL TABLES IN SCHEMA public TO a2_runtime","a2_bad","a2_migrator");
  await fails('migration rejects runtime actor before any DDL',newSql,'ADMISSION_REQUIRES_LOCAL_MIGRATOR_EXACT_H7_OR_P6','a2_bad');
  await sql("UPDATE _prisma_migrations SET checksum=repeat('0',64) WHERE migration_name='20261031_contractual_choice_return'","a2_bad",'a2_migrator');
  await fails('migration rejects altered historical checksum',newSql,'ADMISSION_REQUIRES_LOCAL_MIGRATOR_EXACT_H7_OR_P6','a2_bad','a2_migrator');
  await sql("UPDATE _prisma_migrations SET checksum='"+h7.at(-1).sha256+"' WHERE migration_name='20261031_contractual_choice_return'","a2_bad",'a2_migrator');
  await fails('late migration failure rolls back both tables and enums',newSql.replace('COMMIT;',"DO $$ BEGIN RAISE EXCEPTION 'SYNTHETIC_LATE_FAILURE'; END $$; COMMIT;"),'SYNTHETIC_LATE_FAILURE','a2_bad','a2_migrator');
  assert.equal(await value("SELECT to_regclass('admissions') IS NULL AND NOT EXISTS(SELECT 1 FROM pg_type WHERE typname='AdmissionSource')",'a2_bad'),'t');
  await run(['exec','-i',pg,'pg_restore','-U','postgres','-d','blocked_environment','--exit-on-error'],h7Dump);
  await fails('migration refuses database outside local A.2 allowlist',newSql,'ADMISSION_REQUIRES_LOCAL_MIGRATOR_EXACT_H7_OR_P6','blocked_environment','a2_migrator');

  for(const [id,n,actor,admin] of [['no-interest',19,'admin-i','admin-a'],['revoked',20,'admin-i','admin-a'],['expired',21,'admin-i','admin-a'],['not-admin',22,'owner-i','admin-a'],['disabled-admin',23,'disabled-i','disabled-a']]){
    assert.equal((await sql(authorization(id,n,actor,admin))).stdout.trim(),'0');pass('authorization protocol denies '+id);
  }
  for(const n of [1,2,3,4,5,6,7,8,9,10])assert.equal((await sql(authorization('admission-'+n,n))).stdout.trim(),'1');
  await fails('same Special Invitation cannot authorize twice',authorization('duplicate',1),'23505');
  const approvals=await Promise.all([sql(authorization('race-approval-a',25),'a2_h','a2_runtime',false),sql(authorization('race-approval-b',25),'a2_h','a2_runtime',false)]);
  assert.equal(approvals.filter(r=>r.code===0&&r.stdout.trim()==='1').length,1);
  assert(approvals.filter(r=>r.code!==0).every(r=>/23505|40001/.test(r.stderr)));
  assert.equal(await value("SELECT count(*) FROM admissions WHERE experiment_invitation_id='special-25'"),'1');
  pass('concurrent administrative approvals produce one stable authorization');
  await fails('paid origin is structurally disabled',"INSERT INTO admissions(id,source,source_reference,authorized_email,expires_at) VALUES('paid','VALIDATED_PAYMENT','fake-payment','owner@example.invalid',now()+interval '1 hour')",'23514');
  await fails('runtime cannot rewrite authorized email',"UPDATE admissions SET authorized_email='other@example.invalid' WHERE id='admission-1'",'42501');
  await fails('runtime cannot prolong authorization',"UPDATE admissions SET expires_at=expires_at+interval '1 hour' WHERE id='admission-1'",'42501');
  await fails('runtime cannot rewrite approving identity',"UPDATE admissions SET authorized_by_identity_id='other-i' WHERE id='admission-1'",'42501');
  for(const table of ['admissions','admission_challenges']){
    for(const verb of ['DELETE FROM','TRUNCATE'])await fails('runtime denied '+verb+' '+table,verb+' '+table,'42501');
  }
  await fails('runtime cannot create schema objects','CREATE TABLE public.escape(id int)','42501');
  await fails('runtime cannot write migration ledger',"UPDATE _prisma_migrations SET checksum=checksum",'42501');
  for(const table of ['audit_events','term_acceptances','access_owner_events']){
    await fails(table+' UPDATE remains denied','UPDATE '+table+' SET id=id','42501');
    await fails(table+' DELETE remains denied','DELETE FROM '+table,'42501');
  }
  await fails('unprivileged role cannot read admission secrets','SELECT token_hash FROM public.admission_challenges','42501','a2_h','a2_observer');
  await fails('challenge recipient is bound to approved email',challenge('wrong-mail','admission-1').replace('owner@example.invalid','other@example.invalid'),'23503');
  await sql(challenge('challenge-1','admission-1'));
  await fails('one pending challenge per admission and purpose',challenge('duplicate-challenge','admission-1',2),'23505');
  await fails('runtime cannot replace token hash',"UPDATE admission_challenges SET token_hash=repeat('f',64) WHERE id='challenge-1'",'42501');
  await fails('attempt counter cannot exceed cap',"UPDATE admission_challenges SET attempt_count=6,last_attempt_at=now() WHERE id='challenge-1'",'23514');
  await fails('verification proof cannot reference another admission',"UPDATE admissions SET verified_challenge_id='challenge-1',email_verified_at=now() WHERE id='admission-2'",'23503');
  await fails('provisioned state requires complete verified output',"UPDATE admissions SET status='PROVISIONED' WHERE id='admission-1'",'23514');

  const consume="WITH moment AS MATERIALIZED (SELECT date_trunc('milliseconds',clock_timestamp()) t), changed AS (UPDATE admission_challenges SET status='CONSUMED',consumed_at=moment.t,"+
    "attempt_count=attempt_count+1,last_attempt_at=moment.t FROM moment WHERE id='challenge-1' AND status='PENDING' "+
    "AND expires_at>clock_timestamp() AND attempt_count<max_attempts RETURNING id) SELECT count(*) FROM changed;";
  const competing=await Promise.all([sql(consume),sql(consume)]);
  assert.deepEqual(competing.map(r=>r.stdout.trim()).sort(),['0','1']);pass('concurrent challenge consumption has one winner; replay returns zero');
  assert.equal((await sql(consume)).stdout.trim(),'0');
  await sql("UPDATE admissions SET verified_challenge_id='challenge-1',email_verified_at=(SELECT consumed_at FROM admission_challenges WHERE id='challenge-1') WHERE id='admission-1'");
  await fails('composite FK prevents cross-tenant membership',"UPDATE admissions SET status='PROVISIONED',identity_id='owner-i',tenant_id='tenant-a',membership_id='member-b',provisioned_at=now() WHERE id='admission-1'",'23503');
  await fails('failure mid-transaction leaves no orphan tenant',"BEGIN; INSERT INTO tenants(id,nome,slug,email) VALUES('orphan','SINTÉTICO','a2-orphan','orphan@example.invalid');"+
    "UPDATE admissions SET status='PROVISIONED',identity_id='owner-i',tenant_id='orphan',membership_id='member-a',provisioned_at=now() WHERE id='admission-1'; COMMIT;",'23503');
  assert.equal(await value("SELECT count(*) FROM tenants WHERE id='orphan'"),'0');
  const provision="WITH changed AS (UPDATE admissions SET status='PROVISIONED',identity_id='owner-i',tenant_id='tenant-a',membership_id='member-a',provisioned_at=clock_timestamp() WHERE id='admission-1' AND status='AUTHORIZED' AND expires_at>clock_timestamp() RETURNING id) SELECT count(*) FROM changed;";
  const results=await Promise.all([sql(provision),sql(provision)]);assert.deepEqual(results.map(r=>r.stdout.trim()).sort(),['0','1']);
  assert.equal(await value("SELECT tenant_id FROM admissions WHERE id='admission-1'"),'tenant-a');
  pass('conditional result commit has one winner and persists stable tenant for lost-response retry');
  await proof('admission-2','challenge-2');
  await fails('same result tenant cannot belong to two admissions',"UPDATE admissions SET status='PROVISIONED',identity_id='owner-i',tenant_id='tenant-a',membership_id='member-a',provisioned_at=now() WHERE id='admission-2'",'23505');
  await sql("UPDATE admissions SET status='PROVISIONED',identity_id='owner-i',tenant_id='tenant-b',membership_id='member-b',provisioned_at=now() WHERE id='admission-2'");
  assert.equal(await value("SELECT count(DISTINCT identity_id)||':'||count(DISTINCT tenant_id) FROM admissions WHERE status='PROVISIONED'"),'1:2');
  pass('one existing identity retains two independently authorized tenant results');

  await sql(challenge('cancel-pending','admission-3'));
  await sql("BEGIN; SELECT id FROM admissions WHERE id='admission-3' FOR UPDATE; "+
    "UPDATE admission_challenges SET status='REVOKED',revoked_at=clock_timestamp() WHERE admission_id='admission-3' AND status='PENDING';"+
    "UPDATE admissions SET status='CANCELLED',cancelled_at=clock_timestamp(),cancelled_by_admin_id='admin-a',cancelled_by_identity_id='admin-i',cancellation_reason='Cancelamento sintético' WHERE id='admission-3' AND status='AUTHORIZED'; COMMIT;");
  assert.equal(await value("SELECT status FROM admissions WHERE id='admission-3'"),'CANCELLED');
  assert.equal(await value("SELECT status FROM admission_challenges WHERE id='cancel-pending'"),'REVOKED');
  pass('cancellation protocol retains authorization and revokes pending challenge evidence');
  await sql(challenge('old-proof','admission-4'));
  await sql("BEGIN; SELECT id FROM admissions WHERE id='admission-4' FOR UPDATE; UPDATE admission_challenges SET status='REVOKED',revoked_at=clock_timestamp() WHERE id='old-proof';"+challenge('new-proof','admission-4',2)+"COMMIT;");
  assert.equal(await value("SELECT count(*) FROM admission_challenges WHERE admission_id='admission-4'"),'2');
  pass('reissue retains old hashed evidence and allows only the new pending generation');
  await fails('audit failure rolls back authorization creation',"BEGIN; "+authorization('audit-failure',24).replace('BEGIN ISOLATION LEVEL SERIALIZABLE;','').replace('COMMIT;','')+
    "INSERT INTO audit_events(id,actor_identity_id,access_mode,action,resource_type,result) VALUES('bad-audit','nonexistent','SYSTEM','SYNTHETIC','Admission','SUCCESS'); COMMIT;",'23503');
  assert.equal(await value("SELECT count(*) FROM admissions WHERE id='audit-failure'"),'0');

  await sql("UPDATE _prisma_migrations SET checksum=repeat('0',64) WHERE migration_name='20261031_contractual_choice_return'","a2_h","a2_migrator");
  await fails('ACL refuses altered predecessor even with valid admission migration',aclSql,'ADMISSION_LOCAL_RUNTIME_ACL_GUARD','a2_h','a2_migrator');
  await sql("UPDATE _prisma_migrations SET checksum='"+h7.at(-1).sha256+"' WHERE migration_name='20261031_contractual_choice_return'","a2_h","a2_migrator");
  const beforeDump=await fingerprints('a2_h',true),aclBeforeDump=await acls('a2_h');
  assert.equal(Object.keys(beforeDump).length,43);
  const ledgerQuery="SELECT md5(string_agg(to_jsonb(m)::text,chr(10) ORDER BY id)) FROM _prisma_migrations m";
  const ledgerBeforeDump=await value(ledgerQuery);
  const dump=(await run(['exec',pg,'pg_dump','-U','postgres','-d','a2_h','-Fc'])).bytes;
  writeFileSync(join(out,'synthetic-a2-h8.dump'),dump);
  await run(['exec','-i',pg,'pg_restore','-U','postgres','-d','a2_restore','--exit-on-error'],dump);
  assert.deepEqual(await fingerprints('a2_restore',true),beforeDump);assert.equal(await acls('a2_restore'),aclBeforeDump);
  assert.equal(await value(ledgerQuery,'a2_restore'),ledgerBeforeDump);
  const newAcl="SELECT json_agg(x ORDER BY relname,attname)::text FROM(SELECT c.relname,a.attname,a.attacl::text FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid WHERE c.oid IN('admissions'::regclass,'admission_challenges'::regclass) AND a.attnum>0)x";
  assert.equal(await value(newAcl,'a2_h'),await value(newAcl,'a2_restore'));
  await fails('restored runtime still cannot rewrite tokens',"UPDATE admission_challenges SET token_hash=repeat('a',64)",'42501','a2_restore');
  report.dumpSHA256=createHash('sha256').update(dump).digest('hex');
  pass('full synthetic dump restores all 44 tables, admission results, challenges, contracts and column ACLs');
  report.state='PASSED';
} catch(error) {
  report.state='FAILED';report.error=String(error.message).slice(0,2500);console.error(report.error);
} finally {
  if(created){
    const check=JSON.parse((await run(['inspect',pg])).stdout)[0];
    assert.equal(check.Config.Labels.purpose,'dez-a2-foundation');assert.equal(check.Name,'/'+pg);
    await run(['stop','-t','5',pg]);await run(['rm','-v',pg]);report.containerRemoved=true;
  }
  report.finishedAt=new Date().toISOString();writeFileSync(join(out,'RESULT.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({state:report.state,checks:report.checks.length,out}));
  if(report.state!=='PASSED')process.exitCode=1;
}
