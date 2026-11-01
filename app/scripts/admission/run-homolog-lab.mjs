/** A.2.6 single LOCAL integration using the existing lab and recovery procedure.
 * node scripts/admission/run-homolog-lab.mjs <new absolute evidence dir> <immutable image id> <approved Pacote A ops directory>
 * The same OCI image runs in LOCAL/HOMOLOG/PROD configurations. No publication or remote access.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,existsSync,copyFileSync} from 'node:fs';
import {resolve,join,isAbsolute,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {PRE_ADMISSION_HOMOLOG_MIGRATIONS as h7,PRE_ADMISSION_PRODUCTION_MIGRATIONS as p6,PORTABLE_HOMOLOG_MIGRATIONS as h8,PORTABLE_PRODUCTION_MIGRATIONS as p7,PORTABLE_ADMISSION_MIGRATION as admission} from '../../src/lib/backup/schema-contract.mjs';
import {admissionDatabaseGuardSql} from '../../src/lib/admission-database-contract.mjs';
import {startCandidate,rehearseCandidate,recoverCandidate} from './homolog-runtime-lab.mjs';
const app=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),out=process.argv[2],image=process.argv[3],ops=process.argv[4];
assert(out&&isAbsolute(out)&&!existsSync(out)&&/^sha256:[a-f0-9]{64}$/.test(image)&&ops&&isAbsolute(ops),'EXPLICIT_LOCAL_REHEARSAL_INPUTS');
mkdirSync(out,{recursive:true});
const sha=b=>createHash('sha256').update(b).digest('hex'),secret=()=>randomBytes(32).toString('hex');
const dependencies={
  'ops-common.py':'8d51f090b3a5c119580bf246252e7584281610886d66abea37b3dcaa7353c7fa',
  'roles.py':'fd821c55be867282f5c9d00cdfbb3caa30142bff66550250578b58f6fce1b7cb',
};
for(const [file,hash]of Object.entries(dependencies)){assert.equal(sha(readFileSync(join(ops,file))),hash);copyFileSync(join(ops,file),join(out,file));}
const pgImage='sha256:4ac55a220620fa161678918a1dbd68878ad82837caefa8fa2410f244f23fff64'; // Previously rehearsed PG18.6 + Python/OpenSSL lab dependency, never an application substitute.
const report={phase:'A.2.6 portable final LOCAL integration',startedAt:new Date().toISOString(),candidateImage:image,syntheticOnly:true,remoteOperations:0,publishedPorts:[],checks:[],profiles:{},commands:[],operationsModules:dependencies};
const created=[],privateValues=[];let context='';
const pass=name=>{report.checks.push(name);console.log('PASS '+name)};
const safe=text=>privateValues.reduce((s,v)=>v?s.replaceAll(v,'[REDACTED]'):s,String(text)).replace(/postgres(?:ql)?:\/\/[^\s]+/g,'[DATABASE_URL]');
function run(args,input,ok=true){return new Promise((yes,no)=>{
  const child=spawn('docker',context?['--context',context,...args]:args,{windowsHide:true,stdio:['pipe','pipe','pipe']}),stdout=[],stderr=[];
  const timer=setTimeout(()=>child.kill(),240000);child.stdout.on('data',b=>stdout.push(b));child.stderr.on('data',b=>stderr.push(b));
  child.on('error',e=>{clearTimeout(timer);no(e)});child.on('close',code=>{clearTimeout(timer);const r={code,bytes:Buffer.concat(stdout),stdout:Buffer.concat(stdout).toString(),stderr:Buffer.concat(stderr).toString()};report.commands.push({operation:args[0],code});
    if(ok&&code!==0)no(Error('LOCAL_STEP_'+args[0]+'_'+code+' '+safe(r.stderr).slice(-600)));else yes(r);});child.stdin.on('error',()=>{});child.stdin.end(input);
});}
const profiles={
 homolog:{db:'gestar_homolog_pg18',admin:'pg18_homolog_admin',mg:'pg18_homolog_migrator',rt:'pg18_homolog_runtime',owner:'pg18_homolog_admin',host:'0f5rvkjqjdt9fez1ajiascyk',origin:'https://homolog.dezsolucoes.com.br',flag:'ADMISSION_HOMOLOG_ENABLED',intent:'dez-a2-homolog-h7-h8',before:h7,after:h8,roles:['pg18_homolog_admin','pg18_homolog_migrator','pg18_homolog_runtime']},
 production:{db:'gestar_prod_pg18',admin:'postgres',mg:'pg18_prod_migrator',rt:'pg18_prod_runtime',owner:'pg18_prod_migrator',host:'ik7d1n0035vis9y5rprjpgmn',origin:'https://app.dezsolucoes.com.br',flag:'ADMISSION_PRODUCTION_ENABLED',intent:'dez-a2-production-p6-p7',before:p6,after:p7,roles:['postgres','pg18_prod_migrator','pg18_prod_runtime','gestar_admin','gestar_prod_runtime','gestar_prod_migrator','powerbi_reader']},
 local:{db:'special_invite_lab',admin:'postgres',mg:'a2_migrator',rt:'a2_runtime',owner:'a2_migrator',host:'127.0.0.1',origin:'http://localhost:3020',flag:'ADMISSION_LAB_ENABLED',intent:'dez-a2-local-h7-h8',before:h7,after:h8,roles:['postgres','a2_migrator','a2_runtime']},
};
const snapshot=JSON.parse(readFileSync(resolve(ops,'../a2-6-operational-final/HOMOLOG-READONLY.json'))).catalog;
const helper=String.raw`import ast,pathlib,json,sys,subprocess,os,hashlib,tarfile,tempfile,re,shutil
P=json.load(sys.stdin);T=P['target'];DB=T['db'];ADMIN=T['admin'];APPROVED_ROLE_NAMES=frozenset(T['roles']);ROOT=pathlib.Path('/var/lib/postgresql/a26-ops-'+P['tag']);ROOT.mkdir(mode=0o700,exist_ok=True)
def require(v,m):
 if not v:raise RuntimeError(m)
def run(argv,body=None,timeout=120):
 require(argv[0]in ['psql','pg_dump','pg_dumpall','pg_restore','openssl'],'COMMAND_SCOPE')
 p=subprocess.run(argv,input=body,capture_output=True,timeout=timeout);require(p.returncode==0,'COMMAND_FAILED_'+argv[0]);return p.stdout
def sql(q,database=DB,readonly=True):
 require(database in [DB,'postgres'],'DATABASE_SCOPE')
 text=('BEGIN READ ONLY;SET LOCAL TIME ZONE \'UTC\';SET LOCAL search_path=public,pg_catalog;'+q+';ROLLBACK;')if readonly else q
 return run(['psql','-XqAt','-v','ON_ERROR_STOP=1','-U',ADMIN,'-d',database],text.encode()).decode().strip()
# Execute only the reviewed pure operational functions, never module-level publishing code.
for file,names in [('ops-common.py',['fp','filemeta','dbmeta','cms_encrypt','cms_decrypt','extract_volumes','restore_db_acl']),('roles.py',['role_inventory'])]:
 tree=ast.parse(pathlib.Path('/lab/'+file).read_text());selected=[n for n in tree.body if isinstance(n,ast.FunctionDef)and n.name in names];require(len(selected)==len(names),'APPROVED_FUNCTIONS');exec(compile(ast.Module(body=selected,type_ignores=[]),file,'exec'))
databases=[DB]+(['postgres']if P['profile']=='production'else[])
def inventory():
 out={}
 for db in databases:
  inv=role_inventory(database=db);require({r['rolname']for r in inv['roles']}==APPROVED_ROLE_NAMES,'EXACT_ROLE_INVENTORY')
  for r in inv['roles']:
   if r['rolname']in [T['mg'],T['rt']]:require(r['rolcanlogin']and not any(r[k]for k in ['rolsuper','rolcreatedb','rolcreaterole','rolreplication','rolbypassrls']),'RESTRICTED_ACTIVE_ROLE')
  out[db]={'roles':inv,'rows':fp(database=db),'database':dbmeta(database=db)}
 return out
try:
 if P['action']=='inventory':result={'inventory':inventory(),'allRoleCount':int(sql('SELECT count(*)FROM pg_roles'))}
 elif P['action']=='capture':
  import base64
  expected=inventory();(ROOT/'metadata.json').write_text(json.dumps(expected));(ROOT/'configuration.private.json').write_text(json.dumps(P['configuration']));(ROOT/'volumes.tar').write_bytes(base64.b64decode(P['volumes']))
  (ROOT/'roles.sql').write_bytes(run(['pg_dumpall','-U',ADMIN,'--roles-only']))
  for db in databases:(ROOT/(db+'.dump')).write_bytes(run(['pg_dump','-U',ADMIN,'-d',db,'-Fc']))
  CERT=ROOT/'certificate.pem';key=ROOT/'private.pem';PRIVATE={'passphrase':P['passphrase']}
  run(['openssl','req','-new','-x509','-newkey','rsa:2048','-keyout',str(key),'-out',str(CERT),'-days','1','-subj','/CN=DEZ-PORTABLE-SYNTHETIC','-passout','stdin'],(PRIVATE['passphrase']+'\n').encode())
  PRIVATE['encryptedPrivateKeyPem']=key.read_text();entries=['metadata.json','configuration.private.json','volumes.tar','roles.sql']+[db+'.dump'for db in databases]
  receipt=cms_encrypt(ROOT/'capture.cms',[(n,ROOT/n)for n in entries]);result={'receipt':receipt,'privateKey':PRIVATE['encryptedPrivateKeyPem'],'cipher':base64.b64encode((ROOT/'capture.cms').read_bytes()).decode(),'inventory':expected}
 elif P['action']=='recover':
  import base64
  cipher=ROOT/'input.cms';cipher.write_bytes(base64.b64decode(P['cipher']));receipt=dict(P['receipt'],path=str(cipher));PRIVATE={'passphrase':P['passphrase'],'encryptedPrivateKeyPem':P['privateKey']};into=ROOT/'restored';into.mkdir(mode=0o700,exist_ok=True);cms_decrypt(receipt,into)
  roles=(into/'roles.sql').read_bytes();names=re.findall(rb'^CREATE ROLE (?:"([A-Za-z_][A-Za-z0-9_]*)"|([A-Za-z_][A-Za-z0-9_]*));\s*$',roles,re.M)
  require({(a or b).decode()for a,b in names}==APPROVED_ROLE_NAMES and len(names)==len(APPROVED_ROLE_NAMES),'EXACT_RESTORE_ROLES')
  roles=b'\n'.join(line for line in roles.splitlines()if line not in [('CREATE ROLE '+ADMIN+';').encode(),('CREATE ROLE "'+ADMIN+'";').encode()])+b'\n';run(['psql','-XqAt','-v','ON_ERROR_STOP=1','-U',ADMIN,'-d','postgres'],roles)
  expected=json.loads((into/'metadata.json').read_bytes());sql('CREATE DATABASE '+DB+' OWNER '+T['owner'],database='postgres',readonly=False)
  for db in databases:
   run(['pg_restore','-U',ADMIN,'-d',db,'--exit-on-error'],(into/(db+'.dump')).read_bytes());meta=expected[db]['database'];restore_db_acl(lambda q,ro=True,db=db:sql(q,database=db,readonly=ro),db,meta['owner'],meta['acl'])
  actual=inventory()
  for db in databases:
   require(actual[db]['roles']==expected[db]['roles']and actual[db]['rows']==expected[db]['rows'],'RECOVERY_ROWS_ROLES_ACL_LEDGER_DRIFT')
   # role_inventory compares normalized database ACLs; pg_dump's NULL/default ACL
   # can legitimately become an explicit equivalent array after GRANT replay.
   require({k:v for k,v in actual[db]['database'].items()if k!='acl'}=={k:v for k,v in expected[db]['database'].items()if k!='acl'},'RECOVERY_DATABASE_DRIFT')
  result={'proof':'EXACT_RECOVERY_PASS','configuration':json.loads((into/'configuration.private.json').read_bytes()),'volumes':base64.b64encode((into/'volumes.tar').read_bytes()).decode()}
 else:raise RuntimeError('ACTION_SCOPE')
 print(json.dumps(result))
except BaseException as e:
 print(json.dumps({'state':'REJECTED','code':str(e)if isinstance(e,RuntimeError)else type(e).__name__}));sys.exit(2)
`;
writeFileSync(join(out,'recovery-helper.py'),helper);
async function startPg(name,t,credentials){
 await run(['run','-d','--pull=never','--name',name,'--entrypoint','docker-entrypoint.sh','--network','none','--add-host',t.host+':127.0.0.1','--restart','no','--label','purpose=dez-a26-portable-lab','--memory','768m',
 '--mount','type=tmpfs,destination=/var/lib/postgresql','--mount','type=bind,source='+out+',target=/lab,readonly','-e','POSTGRES_USER='+t.admin,'-e','POSTGRES_DB=postgres','-e','POSTGRES_PASSWORD='+credentials[t.admin],pgImage,'postgres']);created.push(name);
 let ready=false;for(let n=0;n<80;n++){if((await run(['exec',name,'pg_isready','-h','127.0.0.1','-U',t.admin],undefined,false)).code===0){ready=true;break;}await new Promise(r=>setTimeout(r,250));}assert(ready,'LOCAL_PG_READY');
 const state=JSON.parse((await run(['inspect',name])).stdout)[0];assert.equal(state.HostConfig.NetworkMode,'none');assert.deepEqual(state.HostConfig.PortBindings,{});
}
async function sql(pg,t,q,{role=t.mg,db=t.db,ok=true,intent=t.intent}={}){assert(created.includes(pg));return run(['exec','-i','-e','PGAPPNAME='+intent,pg,'psql','-XqAt','-v','ON_ERROR_STOP=1','-U',role,'-d',db],q,ok);}
async function value(pg,t,q,o){return (await sql(pg,t,q,o)).stdout.trim();}
async function inv(pg,t,profile,tag='inventory'){return JSON.parse((await run(['exec','-i',pg,'python3','/lab/recovery-helper.py'],JSON.stringify({action:'inventory',profile,target:t,tag}))).stdout);}
async function migrate(pg,t,profile,credentials,before=false,ok=true,authorized=true){
 const config=before?'/lab/'+profile+'/before/config.cjs':'/app/prisma.config.cjs';
 const r=await run(['run','--rm','--pull=never','--network','container:'+pg,'--memory','768m','--entrypoint','node','--mount','type=bind,source='+out+',target=/lab,readonly',
 '-e','DEPLOYMENT_PROFILE='+profile,'-e','DATABASE_URL=postgresql://'+t.mg+':'+credentials[t.mg]+'@127.0.0.1:5432/'+t.db+'?schema=public&application_name='+(authorized?t.intent:'unapproved'),image,'node_modules/prisma/build/index.js','migrate','deploy','--config',config],undefined,false);
 writeFileSync(join(out,profile,(before?'before':'after')+'-deploy-'+report.checks.length+'.log'),safe(r.stdout+r.stderr));if(ok)assert.equal(r.code,0,'PRISMA_DEPLOY_FAILED '+safe(r.stderr).slice(-400));return r;
}
async function capture(pg,t,profile,tag,configuration,volumes){
 const passphrase=secret();privateValues.push(passphrase);
 const r=JSON.parse((await run(['exec','-i',pg,'python3','/lab/recovery-helper.py'],JSON.stringify({action:'capture',profile,target:t,tag,configuration,volumes:volumes.toString('base64'),passphrase}))).stdout);
 const cipher=Buffer.from(r.cipher,'base64');assert.equal(sha(cipher),r.receipt.sha256);writeFileSync(join(out,profile,tag+'.cms'),cipher);
 return {...r,passphrase};
}
async function recover(pg,t,profile,tag,capture,ok=true){
 const r=await run(['exec','-i',pg,'python3','/lab/recovery-helper.py'],JSON.stringify({action:'recover',profile,target:t,tag,...capture}),false);
 if(ok)assert.equal(r.code,0,'RESTORE_FAILED '+safe(r.stdout).slice(-200));return r;
}
try{
 const local=JSON.parse((await run(['context','inspect'])).stdout)[0];assert(local.Endpoints.docker.Host.startsWith('npipe://'),'LOCAL_DOCKER_DESKTOP_REQUIRED');context=local.Name;
 for(const pin of [image,pgImage])assert.equal((await run(['image','inspect',pin,'--format','{{.Id}}'])).stdout.trim(),pin);
 const bundle=JSON.parse((await run(['run','--rm','--pull=never','--network','none','--entrypoint','node',image,'-e',`const fs=require('fs'),m=require('/app/build-metadata.json'),files={};for(const [p,list]of Object.entries(m.migrationProfiles))for(const x of list){const key=p+'/'+x.name;files[key]=fs.readFileSync('/app/prisma/migrations/'+key+'/migration.sql','base64')}console.log(JSON.stringify({metadata:m,buildId:fs.readFileSync('/app/.next/BUILD_ID','utf8'),files,acl:fs.readFileSync('/app/prisma/migrations/manual_admission_runtime_acl.sql','base64')}));`])).stdout);
 assert.equal(bundle.metadata.deploymentProfile,'portable');assert.deepEqual(bundle.metadata.migrationProfiles,{local:h8,homolog:h8,production:p7});report.sourceCommit=bundle.metadata.sourceCommit;report.buildId=bundle.buildId;report.metadata=bundle.metadata;
 for(const [profile,t]of Object.entries(profiles))for(const m of t.after)assert.equal(sha(Buffer.from(bundle.files[profile+'/'+m.name],'base64')),m.sha256);
 const migrationSql=Buffer.from(bundle.files['homolog/'+admission.name],'base64').toString(),acl=Buffer.from(bundle.acl,'base64');assert.equal(sha(acl),bundle.metadata.admissionAclSha256);
 pass('one immutable image contains every exact lineage and the same Admission migration/ACL');
 for(const [profile,t]of Object.entries(profiles)){
  const lane=join(out,profile);mkdirSync(join(lane,'before/migrations'),{recursive:true});writeFileSync(join(lane,'before/config.cjs'),"module.exports={schema:'/app/prisma/schema.prisma',migrations:{path:'/lab/"+profile+"/before/migrations'},datasource:{url:process.env.DATABASE_URL}};\n");writeFileSync(join(lane,'before/migrations/migration_lock.toml'),'provider = "postgresql"\n');
  for(const m of t.before){mkdirSync(join(lane,'before/migrations',m.name));writeFileSync(join(lane,'before/migrations',m.name,'migration.sql'),Buffer.from(bundle.files[profile+'/'+m.name],'base64'));}
  const prefix='dez-a26-portable-'+profile+'-'+randomUUID().slice(0,8),credentials=Object.fromEntries(t.roles.map(role=>[role,secret()]));privateValues.push(...Object.values(credentials));
  let pg=prefix+'-source';await startPg(pg,t,credentials);
  await sql(pg,t,t.roles.filter(role=>role!==t.admin).map(role=>'CREATE ROLE '+role+(role===t.mg||role===t.rt?' LOGIN':' NOLOGIN')+' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS'+(profile==='local'&&role===t.rt?' NOINHERIT':' INHERIT')+" PASSWORD '"+credentials[role]+"';").join('\n')+'\nCREATE DATABASE '+t.db+' OWNER '+t.owner+';',{role:t.admin,db:'postgres'});
  await sql(pg,t,'ALTER SCHEMA public OWNER TO '+t.mg+';GRANT CONNECT ON DATABASE '+t.db+' TO '+t.mg+','+t.rt,{role:t.admin});
  await migrate(pg,t,profile,credentials,true);
  await sql(pg,t,'GRANT USAGE ON SCHEMA public TO '+t.rt+';ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;');
  for(const row of snapshot.relations){
   if(!row.acl)continue;const aclText=row.acl.replaceAll('pg18_homolog_migrator',t.mg).replaceAll('pg18_homolog_runtime',t.rt);
   const grants=JSON.parse(await value(pg,t,"SELECT coalesce(json_agg(x),'[]') FROM(SELECT privilege_type FROM aclexplode('"+aclText.replaceAll("'","''")+"'::aclitem[])WHERE grantee='"+t.rt+"'::regrole)x"));
   for(const g of grants){assert(['SELECT','INSERT','UPDATE','DELETE','USAGE'].includes(g.privilege_type));assert(/^[a-z_]+$/.test(row.relname));await sql(pg,t,'GRANT '+g.privilege_type+' ON '+(row.relkind==='S'?'SEQUENCE':'TABLE')+' '+row.relname+' TO '+t.rt);}
  }
  const pdf=createRequire(import.meta.url)(join(app,'tests/synthetic-pdf.cjs'))();
  const fixtures=readFileSync(join(app,'scripts/admission/fixtures.sql'),'utf8')
    .replaceAll("'application/pdf',1,","'application/pdf',"+pdf.length+",")
    .replaceAll("repeat('1',64)","'"+sha(pdf)+"'").replaceAll("repeat('2',64)","'"+sha(pdf)+"'");
  await sql(pg,t,fixtures); // Correct bytes at INSERT; published documents remain immutable.
  if(profile==='production')await sql(pg,t,"CREATE TABLE public.synthetic_legacy_proof(id integer PRIMARY KEY,note text);INSERT INTO public.synthetic_legacy_proof VALUES(1,'SYNTHETIC ONLY');ALTER TABLE public.synthetic_legacy_proof OWNER TO gestar_prod_migrator;GRANT SELECT ON public.synthetic_legacy_proof TO powerbi_reader;GRANT gestar_admin TO gestar_prod_migrator;",{role:t.admin,db:'postgres'});
  const auth=secret(),env={DATABASE_URL:'postgresql://'+t.rt+':'+credentials[t.rt]+'@'+t.host+':5432/'+t.db+(profile==='local'?'':'?schema=public'),DEPLOYMENT_PROFILE:profile,ACCESS_AUTH_MODE:'identity',APP_PUBLIC_URL:t.origin,NEXTAUTH_URL:t.origin,[t.flag]:'true',EMAIL_PROVIDER:'mock',AUTH_SECRET:auth,NEXTAUTH_SECRET:auth,AUTH_TRUST_HOST:'true',ADMISSION_SESSION_KEY:secret(),ADMISSION_LAB_MAIL_KEY:secret(),ADMISSION_LAB_MAIL_DIR:profile==='local'?'/tmp/a2-mail':'/var/lib/10s/backups/admission-mail',TERM_STORAGE_DIR:'/var/lib/10s/terms',TENANT_BACKUP_DIR:'/var/lib/10s/backups',TENANT_BACKUP_INSTANCE_ID:'portable-'+profile,TENANT_BACKUP_SIGNING_KEY_ID:'a26',TENANT_BACKUP_SIGNING_KEYS:JSON.stringify({a26:secret()}),SPECIAL_INVITATIONS_ENABLED:'true',SPECIAL_INVITATIONS_PRODUCTION_APPROVED:profile==='production'?'true':'false',SPECIAL_INVITATION_LINK_KEY_ID:'a26',SPECIAL_INVITATION_LINK_KEYS:JSON.stringify({a26:secret()}),HOSTNAME:'127.0.0.1',PORT:'3000'};
  privateValues.push(auth,env.ADMISSION_SESSION_KEY,env.ADMISSION_LAB_MAIL_KEY);
  const volumeScript="import pathlib,os,sys,tarfile;p=pathlib.Path('/var/lib/postgresql/a26-private');(p/'terms/synthetic').mkdir(parents=True);(p/'backups').mkdir();b=sys.stdin.buffer.read();[(p/n).write_bytes(b)for n in ['terms/synthetic/user.pdf','terms/synthetic/contract.pdf']];[(os.chown(x,1001,1001),os.chmod(x,0o750 if x.is_dir()else 0o600))for x in p.rglob('*')];t=tarfile.open(fileobj=sys.stdout.buffer,mode='w|');t.add(p/'terms',arcname='terms');t.add(p/'backups',arcname='backups');t.close()";
  const initialVolumes=(await run(['exec','-i',pg,'python3','-c',volumeScript],pdf)).bytes;
  const initial=await inv(pg,t,profile);assert.equal(initial.inventory[t.db].rows.length,42);assert.equal(await value(pg,t,'SELECT count(*) FROM _prisma_migrations'),String(t.before.length));
  report.profiles[profile]={beforeTables:42,beforeLedger:t.before,roles:initial.allRoleCount,imageId:image,buildId:bundle.buildId,checks:[]};
  const mark=n=>{report.profiles[profile].checks.push(n);pass(profile+': '+n)};
  const before=await capture(pg,t,profile,'before',{env},initialVolumes),restored=prefix+'-before-restored';await startPg(restored,t,credentials);
  if(profile==='homolog'){
   const bad=Buffer.from(before.cipher,'base64');bad[Math.floor(bad.length/2)]^=1;assert.notEqual((await recover(restored,t,profile,'tampered',{...before,cipher:bad.toString('base64')},false)).code,0);mark('altered encrypted backup rejected before restoring roles or data');
  }
  assert.equal(JSON.parse((await recover(restored,t,profile,'restored-before',before)).stdout).proof,'EXACT_RECOVERY_PASS');mark('pre-migration encrypted backup restored with full roles, ACLs, rows and ledger');
  assert.notEqual((await sql(pg,t,migrationSql,{ok:false,intent:'unapproved'})).code,0);
  const wrong=profile==='homolog'?'dez-a2-production-p6-p7':'dez-a2-homolog-h7-h8';assert.notEqual((await sql(pg,t,migrationSql,{ok:false,intent:wrong})).code,0);
  assert.notEqual((await sql(pg,t,migrationSql,{ok:false,role:t.rt})).code,0);
  assert.notEqual((await sql(pg,t,'SET ROLE '+t.mg+';'+migrationSql,{ok:false,role:t.admin})).code,0);mark('missing/cross-environment intent, runtime DDL and SET ROLE impersonation rejected');
  assert.deepEqual((await inv(pg,t,profile)).inventory,initial.inventory);
  if(profile==='homolog'){
   await run(['exec','-d',pg,'psql','-XqAt','-v','ON_ERROR_STOP=1','-U',t.mg,'-d',t.db,'-c',"BEGIN;LOCK TABLE experiment_invitations IN ACCESS EXCLUSIVE MODE;SELECT pg_sleep(60);COMMIT;"]);
   for(let n=0;n<40;n++){if(await value(pg,t,"SELECT EXISTS(SELECT 1 FROM pg_locks WHERE relation='experiment_invitations'::regclass AND mode='AccessExclusiveLock'AND granted)")==='t')break;await new Promise(r=>setTimeout(r,100));}
   assert.notEqual((await migrate(pg,t,profile,credentials,false,false)).code,0);
   await sql(pg,t,"SELECT pg_terminate_backend(pid)FROM pg_stat_activity WHERE query LIKE '%pg_sleep(60)%'AND pid<>pg_backend_pid()",{role:t.admin});
   assert.equal(await value(pg,t,"SELECT to_regclass('admissions')IS NULL AND NOT EXISTS(SELECT 1 FROM pg_type WHERE typname='AdmissionSource')"),'t');
   assert.equal(await value(pg,t,'SELECT count(*)FROM _prisma_migrations WHERE finished_at IS NULL'),'1');assert.notEqual((await migrate(pg,t,profile,credentials,false,false)).code,0);
   await run(['stop','-t','10',pg]);pg=restored;mark('real lock failure rolls back DDL, preserves failed ledger, blocks retry; recovered clean H7 is selected');
  }
  await migrate(pg,t,profile,credentials);await sql(pg,t,acl);await sql(pg,t,acl);
  assert.equal(await value(pg,t,admissionDatabaseGuardSql(profile),{role:t.rt}),'t');
  const after=await inv(pg,t,profile);assert.equal(after.inventory[t.db].rows.length,44);
  const historical=r=>r.filter(x=>!['_prisma_migrations','admissions','admission_challenges'].includes(x.table));assert.deepEqual(historical(after.inventory[t.db].rows),historical(initial.inventory[t.db].rows));
  await migrate(pg,t,profile,credentials);assert.deepEqual((await inv(pg,t,profile)).inventory,after.inventory);
  assert.equal(await value(pg,t,"SELECT count(*)FROM pg_constraint WHERE conrelid IN('admissions'::regclass,'admission_challenges'::regclass)AND contype='f'AND convalidated"),'8');
  for(const q of ['DELETE FROM admissions','UPDATE admission_challenges SET token_hash=token_hash','UPDATE _prisma_migrations SET checksum=checksum','DELETE FROM term_acceptances','CREATE TABLE public.forbidden(id int)'])assert.notEqual((await sql(pg,t,q,{role:t.rt,ok:false})).code,0);
  mark('42 to 44 tables; exact migration replay, eight FKs, live attestation and restricted ACLs');
  let application;
  if(profile!=='local')application=await rehearseCandidate({run,image,pg,created,out:lane,app,pass:mark,env,initialVolumes,testDatabaseUrl:'postgresql://'+t.admin+':'+credentials[t.admin]+'@127.0.0.1:5432/'+t.db});
  else{
   const name=pg+'-app';await startCandidate({run,image,pg,name,created,env});
   await run(['exec',name,'node','-e',"fetch('http://127.0.0.1:3000/api/admissions/resume',{method:'POST',headers:{Origin:'http://localhost:3020','Content-Type':'application/json'},body:JSON.stringify({email:'unknown@example.invalid'})}).then(r=>{if(r.status!==200)throw Error('LOCAL_RUNTIME');console.log('LOCAL_RUNTIME_PASS')}).catch(()=>process.exit(1))"]);
   await run(['stop','-t','10',name]);mark('same OCI image runs LOCAL configuration with real database attestation');
  }
  const finalCapture=await capture(pg,t,profile,'after',application?{env:application.env,client:application.client,files:application.files}:{env},application?.volumes??initialVolumes);
  const recovered=prefix+'-after-restored';await startPg(recovered,t,credentials);
  const recovery=JSON.parse((await recover(recovered,t,profile,'restored-after',finalCapture)).stdout);
  assert.equal(recovery.proof,'EXACT_RECOVERY_PASS');
  if(application)await recoverCandidate({run,image,pg:recovered,created,context:{...recovery.configuration,volumes:Buffer.from(recovery.volumes,'base64')},pass:mark,out:lane});
  assert.equal(await value(recovered,t,admissionDatabaseGuardSql(profile),{role:t.rt}),'t');
  if(application)await run(['stop','-t','10',recovered+'-app']);
  const disabled=prefix+'-disabled';await startCandidate({run,image,pg:recovered,name:disabled,created,env:{...env,[t.flag]:'false'},enabled:false});
  await run(['exec',disabled,'node','-e',"fetch('http://127.0.0.1:3000/api/admissions/resume',{method:'POST',headers:{Origin:"+JSON.stringify(t.origin)+",'Content-Type':'application/json'},body:JSON.stringify({email:'unknown@example.invalid'})}).then(r=>{if(r.status!==404)throw Error('UNAUTHORIZED');console.log('UNAUTHORIZED_RUNTIME_PASS')}).catch(()=>process.exit(1))"]);
  await run(['stop','-t','10',disabled]);mark('same image denies disabled authorization; no default-on deployment');
  report.profiles[profile].afterTables=44;report.profiles[profile].afterLedger=t.after;report.profiles[profile].backup={before:{sha256:before.receipt.sha256,cipher:before.receipt.cipher},after:{sha256:finalCapture.receipt.sha256,cipher:finalCapture.receipt.cipher}};report.profiles[profile].http=application?.checks??null;report.profiles[profile].favicon=application?.favicon??null;report.profiles[profile].recovery='EXACT_RECOVERY_PASS';
  for(const name of created.filter(n=>n.startsWith(prefix)).reverse())await run(['rm','-f',name]);
 }
 assert.equal(new Set(Object.values(report.profiles).map(p=>p.imageId)).size,1);assert.equal(new Set(Object.values(report.profiles).map(p=>p.buildId)).size,1);assert.notEqual(report.profiles.homolog.favicon.sha256,report.profiles.production.favicon.sha256);pass('environment branding changes at runtime while image and Next BUILD_ID stay identical');report.state='PASSED';
}catch(e){report.state='FAILED';report.failure=safe(e.message).slice(0,1400);console.error(report.failure);process.exitCode=1;}
finally{
 for(const name of created.reverse()){
  const state=await run(['inspect',name],undefined,false);if(state.code===0){assert.equal(JSON.parse(state.stdout)[0].Config.Labels.purpose,'dez-a26-portable-lab');await run(['rm','-f',name]);}
 }
 report.finishedAt=new Date().toISOString();report.containersRemoved=created;writeFileSync(join(out,'RESULT.json'),JSON.stringify(report,null,2)+'\n');console.log('RESULT '+report.state);
}
