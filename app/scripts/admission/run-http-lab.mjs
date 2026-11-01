/** A.2.2 / A.2.3 real Next/HTTP proof. Reuses the verified synthetic full dump from A.2.1. */
import assert from 'node:assert/strict';
import {integratedSuite,recoverApplication} from './integrated-lab.mjs';
import {startJourneyBridge,testJourney} from './journey-lab.mjs';
import {spawn,spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,existsSync,cpSync} from 'node:fs';
import {resolve,join,isAbsolute,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,randomBytes,createHash} from 'node:crypto';

const app=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
assert(process.argv[2]&&isAbsolute(process.argv[2])&&process.argv[3]&&isAbsolute(process.argv[3]),'Usage: node run-http-lab.mjs <A2.1-evidence-directory> <new-evidence-directory>');
const source=resolve(process.argv[2]),out=resolve(process.argv[3]);assert(!existsSync(out),'NEW_EVIDENCE_DIRECTORY_REQUIRED');
assert(process.argv[4]===undefined||['--provision','--journey','--preview','--integrated','--password-reset'].includes(process.argv[4]),'UNKNOWN_PHASE');
const reset=process.argv[4]==='--password-reset';
const integrated=process.argv[4]==='--integrated';
const journey=integrated||['--journey','--preview'].includes(process.argv[4]);
const provision=journey||process.argv[4]==='--provision', phase=reset?'A.2.7':integrated?'A.2.5':journey?'A.2.4':provision?'A.2.3':'A.2.2', label=reset?'dez-a27-http':integrated?'dez-a25-http':journey?'dez-a24-http':provision?'dez-a23-http':'dez-a22-http';
const foundation=JSON.parse(readFileSync(join(source,'RESULT.json'),'utf8'));
assert.equal(foundation.state,'PASSED');assert.equal(foundation.phase,'A.2.1');assert.equal(foundation.syntheticOnly,true);assert.equal(foundation.network,'none');assert.equal(foundation.realEmail,false);
const dump=readFileSync(join(source,'synthetic-a2-h8.dump'));assert.equal(createHash('sha256').update(dump).digest('hex'),foundation.dumpSHA256);
mkdirSync(out,{recursive:true});const staged=join(out,'source');mkdirSync(staged);
for(const name of ['src','public','package.json','package-lock.json','tsconfig.json','next.config.ts','next-env.d.ts'])cpSync(join(app,name),join(staged,name),{recursive:true});
mkdirSync(join(staged,'prisma'));cpSync(join(app,'prisma/schema.prisma'),join(staged,'prisma/schema.prisma'));
mkdirSync(join(staged,'tests'));for(const name of ['admission.http.cjs','experiment.http.cjs',...(provision?['synthetic-pdf.cjs','admission-provisioning.http.cjs','admission-lab-helpers.cjs','invitations-multichannel.http.cjs','contractual-onboarding.http.cjs']:[]),...(integrated?['admission-integrated.http.cjs']:[]),...(journey?['admission-browser-relay.cjs','admission-browser-fixture.cjs']:[])])cpSync(join(app,'tests',name),join(staged,'tests',name));
const suffix=randomUUID().slice(0,8),pg=(integrated?'dez-a25-pg-':journey?'dez-a24-pg-':provision?'dez-a23-pg-':'dez-a22-pg-')+suffix,worker=label+'-'+suffix;
if(reset){
  for(const name of ['password-reset.http.cjs','admission-browser-relay.cjs'])cpSync(join(app,'tests',name),join(staged,'tests',name));
  mkdirSync(join(staged,'scripts'));cpSync(join(app,'scripts/phase6/smtp-lab.cjs'),join(staged,'scripts/smtp-lab.cjs'));
  mkdirSync(join(out,'tls'));
  assert(process.env.PYTHON_EXECUTABLE,'PYTHON_EXECUTABLE_REQUIRED_FOR_LOCAL_TLS_FIXTURE');
  const cert=spawnSync(process.env.PYTHON_EXECUTABLE,['-c',`from cryptography import x509
from cryptography.x509.oid import NameOID
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys, ipaddress
p=Path(sys.argv[1]); k=rsa.generate_private_key(public_exponent=65537,key_size=2048)
n=x509.Name([x509.NameAttribute(NameOID.COMMON_NAME,'localhost')]); now=datetime.now(timezone.utc)
c=x509.CertificateBuilder().subject_name(n).issuer_name(n).public_key(k.public_key()).serial_number(x509.random_serial_number()).not_valid_before(now-timedelta(minutes=1)).not_valid_after(now+timedelta(days=2)).add_extension(x509.BasicConstraints(ca=True,path_length=0),critical=True).add_extension(x509.SubjectAlternativeName([x509.DNSName('localhost'),x509.IPAddress(ipaddress.ip_address('127.0.0.1'))]),critical=False).sign(k,hashes.SHA256())
(p/'key.pem').write_bytes(k.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption()))
(p/'cert.pem').write_bytes(c.public_bytes(serialization.Encoding.PEM))`,join(out,'tls')],{windowsHide:true,encoding:'utf8'});
  assert.equal(cert.status,0,'LOCAL_TLS_FIXTURE_FAILED');
}
const pgImage='sha256:10a5c69a83035ab5239f5620d708520e8b28f5aa1f2b20143e6024532edadfb5',nodeImage='sha256:271e76a186736f3a533931712920c03644bd69684b11d04b1c468d0870ba0d13';
const report={phase,network:'none',publishedPorts:[],syntheticOnly:true,realEmail:false,foundationDumpSHA256:foundation.dumpSHA256,startedAt:new Date().toISOString()};
const created=[];let closeBridge;
function run(args,input,ok=true){return new Promise((accept,reject)=>{
  const child=spawn('docker',args,{windowsHide:true,stdio:['pipe','pipe','pipe']}),stdout=[],stderr=[];const timer=setTimeout(()=>child.kill(),600000);
  child.stdout.on('data',b=>stdout.push(b));child.stderr.on('data',b=>stderr.push(b));child.on('error',e=>{clearTimeout(timer);reject(e)});
  child.on('close',code=>{clearTimeout(timer);const result={code,bytes:Buffer.concat(stdout),stdout:Buffer.concat(stdout).toString(),stderr:Buffer.concat(stderr).toString()};
    if(ok&&code!==0)reject(new Error('LOCAL_DOCKER_STEP_FAILED '+args.slice(0,2).join(' ')+' '+result.stderr.slice(-500)));else accept(result);});child.stdin.on('error',()=>{});child.stdin.end(input);
});}
async function sql(text){return run(['exec','-i',pg,'psql','-XqAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],text);}
try {
  assert(JSON.parse((await run(['context','inspect'])).stdout)[0].Endpoints.docker.Host.startsWith('npipe://'),'LOCAL_WINDOWS_DOCKER_ONLY');
  for(const image of [pgImage,nodeImage])await run(['image','inspect',image,'--format','{{.Id}}']);
  await run(['run','-d','--pull=never','--name',pg,'--network','none','--restart','no','--label','purpose='+label,
    '--memory','768m','--mount','type=tmpfs,destination=/var/lib/postgresql','-e','POSTGRES_HOST_AUTH_METHOD=trust',pgImage]);created.push(pg);
  // TCP excludes the image entrypoint's temporary Unix-socket-only bootstrap server.
  let pgReady=false;for(let n=0;n<80;n++){if((await run(['exec',pg,'pg_isready','-h','127.0.0.1','-U','postgres'],undefined,false)).code===0){pgReady=true;break;}await new Promise(r=>setTimeout(r,250));}assert(pgReady);
  await sql("CREATE ROLE a2_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; CREATE ROLE a2_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT; CREATE ROLE a2_observer LOGIN; CREATE ROLE pg18_prod_migrator LOGIN; CREATE ROLE pg18_prod_runtime LOGIN; CREATE DATABASE special_invite_lab OWNER a2_migrator;");
  await run(['exec','-i',pg,'pg_restore','-U','postgres','-d','special_invite_lab','--exit-on-error'],dump);
  if(provision)await run(['exec','-i',pg,'psql','-XqAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','special_invite_lab'],readFileSync(join(app,'scripts/admission/operational-lab-acl.sql')));
  console.log('PASS isolated synthetic H8 restored, no migration or remote database accessed');
  const secret=randomBytes(32).toString('hex');
  const env={DATABASE_URL:'postgresql://a2_runtime@127.0.0.1:5432/special_invite_lab',APP_PUBLIC_URL:'http://localhost:3020',NEXTAUTH_URL:'http://localhost:3020',
    AUTH_SECRET:secret,NEXTAUTH_SECRET:secret,AUTH_TRUST_HOST:'true',DEPLOYMENT_PROFILE:'local',ADMISSION_LAB_ENABLED:'true',EMAIL_PROVIDER:'mock',
    ADMISSION_SESSION_KEY:randomBytes(32).toString('hex'),ADMISSION_LAB_MAIL_KEY:randomBytes(32).toString('hex'),ADMISSION_LAB_MAIL_DIR:'/tmp/a2-mail',
    SPECIAL_INVITATIONS_ENABLED:'true',SPECIAL_INVITATION_LINK_KEY_ID:'a22',SPECIAL_INVITATION_LINK_KEYS:JSON.stringify({a22:randomBytes(32).toString('hex')}),NEXT_TELEMETRY_DISABLED:'1'};
  if(provision)Object.assign(env,{TRUSTED_PROXY_TOKEN:randomBytes(32).toString('hex'),TERM_STORAGE_DIR:'/tmp/a23-terms',TENANT_BACKUP_DIR:'/tmp/a23-backups',
    TENANT_BACKUP_INSTANCE_ID:'a23-isolated',TENANT_BACKUP_SIGNING_KEY_ID:'a23',TENANT_BACKUP_SIGNING_KEYS:JSON.stringify({a23:randomBytes(32).toString('hex')})});
  if(reset){const capture=randomBytes(32).toString('hex');Object.assign(env,{ACCESS_AUTH_MODE:'identity',PASSWORD_RESET_ENABLED:'true',TRANSACTIONAL_EMAIL_READY:'true',TRANSACTIONAL_EMAIL_PROVIDER:'smtp',
    SMTP_HOST:'localhost',SMTP_PORT:'2465',SMTP_SECURE:'true',SMTP_USER:'fixture',SMTP_PASSWORD:capture,EMAIL_FROM_ADDRESS:'access@example.invalid',
    PHASE6_LAB:'1',PASSWORD_RESET_LAB:'1',CAPTURE_PASSWORD:capture,NODE_EXTRA_CA_CERTS:'/tls/cert.pem',TRUSTED_PROXY_TOKEN:randomBytes(32).toString('hex'),SUPPORT_WHATSAPP_ENABLED:'false'});}
  const envArgs=Object.entries(env).flatMap(([key,value])=>['-e',key+'='+value]);
  await run(['run','-d','--pull=never','--name',worker,'--network','container:'+pg,'--restart','no','--label','purpose='+label,'--memory','3g',
    '--mount','type=bind,source='+staged+',target=/source,readonly','--mount','type=tmpfs,destination=/work','--mount','type=tmpfs,destination=/tmp',
    ...(reset?['--mount','type=bind,source='+join(out,'tls')+',target=/tls,readonly']:[]),
    ...envArgs,'--entrypoint','sh',nodeImage,'-c','cp -a /source/. /work/ && ln -s /app/node_modules /work/node_modules && cd /work && '+(reset?'(node scripts/smtp-lab.cjs > /tmp/a27-smtp.log 2>&1 &) && ':'')+'node node_modules/prisma/build/index.js generate --schema prisma/schema.prisma > /tmp/a2-app.log 2>&1 && node node_modules/next/dist/bin/next build --webpack >> /tmp/a2-app.log 2>&1 && node node_modules/next/dist/bin/next start -p 3020 -H 127.0.0.1 >> /tmp/a2-app.log 2>&1']);created.push(worker);
  for(const name of created){const inspection=JSON.parse((await run(['inspect',name])).stdout)[0];assert.deepEqual(inspection.HostConfig.PortBindings,{});assert.equal(inspection.HostConfig.RestartPolicy.Name,'no');}
  let ready=false;
  for(let n=0;n<300;n++){
    const r=await run(['exec',worker,'node','-e',"fetch('http://localhost:3020/"+(reset?'login':'adesao')+"').then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"],undefined,false);
    if(r.code===0){ready=true;break;}if(n%10===0)console.log('Waiting for isolated Next application');await new Promise(r=>setTimeout(r,1000));
  }
  if(!ready){const log=await run(['exec',worker,'cat','/tmp/a2-app.log'],undefined,false);if(log.code===0)writeFileSync(join(out,'app.log'),log.stdout);throw new Error('LOCAL_APP_NOT_READY; inspect app.log');}
  report.build='PASSED';console.log('PASS Next build and real application ready inside isolated network namespace');
  if(reset){
    await run(['exec','-d','-w','/work','-e','PASSWORD_RESET_ENABLED=false','-e','TRANSACTIONAL_EMAIL_PROVIDER=mock',worker,'sh','-c','node node_modules/next/dist/bin/next start -p 3021 -H 127.0.0.1 > /tmp/a27-disabled.log 2>&1']);
    const test=await run(['exec','-w','/work',worker,'node','tests/password-reset.http.cjs'],undefined,false);
    writeFileSync(join(out,'reset-http.log'),test.stdout+test.stderr);assert.equal(test.code,0,'RESET_HTTP_FAILED; inspect reset-http.log');
    report.http=JSON.parse((await run(['exec',worker,'cat','/tmp/password-reset-result.json'])).stdout);
    writeFileSync(join(out,'HTTP-RESULT.json'),JSON.stringify(report.http,null,2));console.log('PASS reset SMTP/HTTP: '+report.http.checks.length+' checks');
    closeBridge=await startJourneyBridge(worker);
    const module=process.env.PLAYWRIGHT_MODULE||join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
    const code=await new Promise((resolve,reject)=>{const c=spawn(process.execPath,[join(app,'tests/password-reset.browser.cjs'),worker,out,module],{windowsHide:true,stdio:['ignore','pipe','pipe']});const parts=[];c.stdout.on('data',b=>parts.push(b));c.stderr.on('data',b=>parts.push(b));c.on('error',reject);c.on('close',code=>{writeFileSync(join(out,'reset-browser.log'),Buffer.concat(parts));resolve(code)});});
    assert.equal(code,0,'RESET_BROWSER_FAILED; inspect reset-browser.log');report.browser=JSON.parse(readFileSync(join(out,'BROWSER-RESULT.json'),'utf8'));
  } else {
  const test=await run(['exec','-w','/work',worker,'node','tests/admission.http.cjs'],undefined,false);writeFileSync(join(out,'http.log'),test.stdout+test.stderr);console.log(test.stdout);
  const result=await run(['exec',worker,'cat','/tmp/a2-http-result.json'],undefined,false);if(result.code===0){writeFileSync(join(out,'HTTP-RESULT.json'),result.stdout);report.http=JSON.parse(result.stdout);}
  assert.equal(test.code,0,'HTTP_SUITE_FAILED; inspect http.log');
  const regression=await run(['exec','-i','-w','/work',worker,'node','tests/experiment.http.cjs'],JSON.stringify({base:'http://localhost:3020',adminEmail:'a22-admin@example.invalid',memberEmail:'a22-observer@example.invalid',password:'Synthetic-only-A22-password!',fixtureRecoveryChecks:false}),false);
  writeFileSync(join(out,'special-invitations.log'),regression.stdout+regression.stderr);assert.equal(regression.code,0,'SPECIAL_INVITATION_REGRESSION_FAILED');report.experiment=JSON.parse(regression.stdout.trim().split('\n').at(-1));
  console.log('PASS existing Special Invitation HTTP regression');
  if(provision){
    const suite=await run(['exec','-w','/work',worker,'node','tests/admission-provisioning.http.cjs'],undefined,false);
    writeFileSync(join(out,'provisioning.log'),suite.stdout+suite.stderr);console.log(suite.stdout);
    const result=await run(['exec',worker,'cat','/tmp/a23-http-result.json'],undefined,false);
    if(result.code===0){writeFileSync(join(out,'PROVISIONING-RESULT.json'),result.stdout);report.provisioning=JSON.parse(result.stdout);}
    assert.equal(suite.code,0,'PROVISIONING_SUITE_FAILED; inspect provisioning.log');
    // Existing operational invitations deliberately allow DEV only on this exact legacy
    // loopback DSN. Exercise that unchanged policy in a second isolated application.
    const regressionDump=(await run(['exec',pg,'pg_dump','-U','postgres','-d','special_invite_lab','-Fc'])).bytes;
    await sql('CREATE DATABASE gestar_vf_dev OWNER a2_migrator;');
    await run(['exec','-i',pg,'pg_restore','-U','postgres','-d','gestar_vf_dev','--exit-on-error'],regressionDump);
    const regressionEnv={DATABASE_URL:'postgresql://a2_runtime@127.0.0.1:55432/gestar_vf_dev',APP_PUBLIC_URL:'http://localhost:3017',NEXTAUTH_URL:'http://localhost:3017',EMAIL_PROVIDER:'disabled',ADMISSION_LAB_ENABLED:'false'};
    const regressionArgs=Object.entries(regressionEnv).flatMap(([key,value])=>['-e',key+'='+value]);
    // Namespace-local TCP relay, no host binding/published port and no external interface.
    await run(['exec','-d',worker,'node','-e',"const net=require('node:net');net.createServer(c=>{const s=net.connect(5432,'127.0.0.1');c.on('error',()=>s.destroy());s.on('error',()=>c.destroy());c.pipe(s).pipe(c)}).listen(55432,'127.0.0.1')"]);
    await run(['exec','-d','-w','/work',...regressionArgs,worker,'sh','-c','node node_modules/next/dist/bin/next start -p 3017 -H 127.0.0.1 > /tmp/a23-regression-app.log 2>&1']);
    let regressionReady=false;for(let n=0;n<60;n++){
      const r=await run(['exec',worker,'node','-e',"fetch('http://localhost:3017/login').then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"],undefined,false);
      if(r.code===0){regressionReady=true;break;}await new Promise(r=>setTimeout(r,500));
    }assert(regressionReady,'ISOLATED_REGRESSION_APP_NOT_READY');
    const cfg=JSON.parse((await run(['exec',worker,'cat','/tmp/a23-regression-config.json'])).stdout);
    Object.assign(cfg,{environment:'ADMISSION_REGRESSION_LOCAL',base:'http://localhost:3017'});
    report.regressionEnvironment={network:'same isolated namespace',database:'gestar_vf_dev',applicationPort:3017,databaseRelayPort:55432,hostPublishedPorts:[],email:'disabled',admissionGate:'disabled'};
    for(const [file,key,state] of [['invitations-multichannel.http.cjs','operational','MULTICHANNEL_HTTP_PASSED'],['contractual-onboarding.http.cjs','contractual','CONTRACTUAL_HTTP_PASSED']]){
      const test=await run(['exec','-i','-w','/work',...regressionArgs,worker,'node','tests/'+file],JSON.stringify(cfg),false);
      writeFileSync(join(out,key+'.log'),test.stdout+test.stderr);
      assert.equal(test.code,0,key.toUpperCase()+'_REGRESSION_FAILED; inspect '+key+'.log');
      report[key]=test.stdout.trim().split('\n').map(line=>{try{return JSON.parse(line)}catch{return null}}).find(row=>row?.state===state);
      assert(report[key]);console.log('PASS '+key+' HTTP regression: '+report[key].checks.length+' checks');
    }
    writeFileSync(join(out,'regression-app.log'),(await run(['exec',worker,'cat','/tmp/a23-regression-app.log'])).stdout);
    if(journey){closeBridge=await startJourneyBridge(worker);await testJourney(app,worker,out,integrated);report.browser=JSON.parse(readFileSync(join(out,'BROWSER-RESULT.json'),'utf8'));report.loopbackBrowserPort=3020;console.log('PASS real browser journey: '+report.browser.checks.length+' checks');}
    if(integrated)report.integrated=await integratedSuite(run,worker,out,'prepare');
    const full=(await run(['exec',pg,'pg_dump','-U','postgres','-d','special_invite_lab','-Fc'])).bytes;
    writeFileSync(join(out,'synthetic-a23-h8.dump'),full);
    await sql('CREATE DATABASE a23_recovery OWNER a2_migrator;');
    await run(['exec','-i',pg,'pg_restore','-U','postgres','-d','a23_recovery','--exit-on-error'],full);
    const tables=(await run(['exec',pg,'psql','-XqAt','-U','postgres','-d','special_invite_lab','-c',"SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"])).stdout.trim().split(/\r?\n/);
    assert.equal(tables.length,44);
    const snapshot=tables.map(t=>{assert(/^[a-z_]+$/.test(t));return `SELECT '${t}',count(*),md5(coalesce(string_agg(to_jsonb(t)::text,chr(10) ORDER BY to_jsonb(t)::text),'')) FROM ${t} t;`}).join('\n');
    const before=await run(['exec','-i',pg,'psql','-XqAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','special_invite_lab'],snapshot);
    const restored=await run(['exec','-i',pg,'psql','-XqAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','a23_recovery'],snapshot);
    assert.equal(restored.stdout,before.stdout);writeFileSync(join(out,'recovery-tables.txt'),restored.stdout);
    report.recovery={state:'PASSED',tables:44,method:'pg_dump/pg_restore plus exact sorted row digests',dumpSHA256:createHash('sha256').update(full).digest('hex')};
    console.log('PASS full H8 dump and recovery: all 44 table digests match');
    if(integrated){report.applicationRecovery=await recoverApplication({run,worker,pgImage,nodeImage,staged,out,envArgs,full,snapshot,before,created,label,suffix,closeBridge});closeBridge=undefined;console.log('PASS independent application recovery and interrupted journeys');}
  }
  }
  if(!integrated){const log=await run(['exec',worker,'cat','/tmp/a2-app.log']);writeFileSync(join(out,'app.log'),log.stdout);}
  report.state='PASSED';
  if(process.argv[4]==='--preview'){writeFileSync(join(out,'PREVIEW-READY.json'),JSON.stringify(report,null,2));console.log('LOCAL preview ready: '+join(out,'PREVIEW.md')+'; create STOP-LOCAL in this directory to close it. Automatic cleanup after two hours.');const deadline=Date.now()+7200000;while(Date.now()<deadline&&!existsSync(join(out,'STOP-LOCAL')))await new Promise(r=>setTimeout(r,1000));}
} catch(error){report.state='FAILED';report.error=String(error.message).slice(0,400);console.error(report.error);
  if(created.includes(worker)){const log=await run(['exec',worker,'cat','/tmp/a2-app.log'],undefined,false);writeFileSync(join(out,'app.log'),log.stdout);
    if(provision){const regressionLog=await run(['exec',worker,'cat','/tmp/a23-regression-app.log'],undefined,false);if(regressionLog.code===0)writeFileSync(join(out,'regression-app.log'),regressionLog.stdout);}}
} finally {
  closeBridge?.();
  for(const name of created.reverse()){
    const check=JSON.parse((await run(['inspect',name])).stdout)[0];assert.equal(check.Name,'/'+name);assert.equal(check.Config.Labels.purpose,label);
    await run(['stop','-t','5',name]);await run(['rm','-v',name]);
  }
  report.containersRemoved=true;report.finishedAt=new Date().toISOString();writeFileSync(join(out,'RESULT.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({state:report.state,out}));if(report.state!=='PASSED')process.exitCode=1;
}
