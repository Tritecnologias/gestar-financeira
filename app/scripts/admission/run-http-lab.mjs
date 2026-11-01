/** A.2.2 real Next/HTTP proof. Reuses the verified synthetic full dump from A.2.1. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,existsSync,cpSync} from 'node:fs';
import {resolve,join,isAbsolute,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID,randomBytes,createHash} from 'node:crypto';

const app=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
assert(process.argv[2]&&isAbsolute(process.argv[2])&&process.argv[3]&&isAbsolute(process.argv[3]),'Usage: node run-http-lab.mjs <A2.1-evidence-directory> <new-evidence-directory>');
const source=resolve(process.argv[2]),out=resolve(process.argv[3]);assert(!existsSync(out),'NEW_EVIDENCE_DIRECTORY_REQUIRED');
const foundation=JSON.parse(readFileSync(join(source,'RESULT.json'),'utf8'));
assert.equal(foundation.state,'PASSED');assert.equal(foundation.phase,'A.2.1');assert.equal(foundation.syntheticOnly,true);assert.equal(foundation.network,'none');assert.equal(foundation.realEmail,false);
const dump=readFileSync(join(source,'synthetic-a2-h8.dump'));assert.equal(createHash('sha256').update(dump).digest('hex'),foundation.dumpSHA256);
mkdirSync(out,{recursive:true});const staged=join(out,'source');mkdirSync(staged);
for(const name of ['src','public','package.json','package-lock.json','tsconfig.json','next.config.ts','next-env.d.ts'])cpSync(join(app,name),join(staged,name),{recursive:true});
mkdirSync(join(staged,'prisma'));cpSync(join(app,'prisma/schema.prisma'),join(staged,'prisma/schema.prisma'));
mkdirSync(join(staged,'tests'));for(const name of ['admission.http.cjs','experiment.http.cjs'])cpSync(join(app,'tests',name),join(staged,'tests',name));
const suffix=randomUUID().slice(0,8),pg='dez-a22-pg-'+suffix,worker='dez-a22-http-'+suffix;
const pgImage='sha256:10a5c69a83035ab5239f5620d708520e8b28f5aa1f2b20143e6024532edadfb5',nodeImage='sha256:271e76a186736f3a533931712920c03644bd69684b11d04b1c468d0870ba0d13';
const report={phase:'A.2.2',network:'none',publishedPorts:[],syntheticOnly:true,realEmail:false,foundationDumpSHA256:foundation.dumpSHA256,startedAt:new Date().toISOString()};
const created=[];
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
  await run(['run','-d','--pull=never','--name',pg,'--network','none','--restart','no','--label','purpose=dez-a22-http',
    '--memory','768m','--mount','type=tmpfs,destination=/var/lib/postgresql','-e','POSTGRES_HOST_AUTH_METHOD=trust',pgImage]);created.push(pg);
  // TCP excludes the image entrypoint's temporary Unix-socket-only bootstrap server.
  let pgReady=false;for(let n=0;n<80;n++){if((await run(['exec',pg,'pg_isready','-h','127.0.0.1','-U','postgres'],undefined,false)).code===0){pgReady=true;break;}await new Promise(r=>setTimeout(r,250));}assert(pgReady);
  await sql("CREATE ROLE a2_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; CREATE ROLE a2_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT; CREATE ROLE a2_observer LOGIN; CREATE ROLE pg18_prod_migrator LOGIN; CREATE ROLE pg18_prod_runtime LOGIN; CREATE DATABASE special_invite_lab OWNER a2_migrator;");
  await run(['exec','-i',pg,'pg_restore','-U','postgres','-d','special_invite_lab','--exit-on-error'],dump);
  console.log('PASS isolated synthetic H8 restored, no migration or remote database accessed');
  const secret=randomBytes(32).toString('hex');
  const env={DATABASE_URL:'postgresql://a2_runtime@127.0.0.1:5432/special_invite_lab',APP_PUBLIC_URL:'http://localhost:3020',NEXTAUTH_URL:'http://localhost:3020',
    AUTH_SECRET:secret,NEXTAUTH_SECRET:secret,AUTH_TRUST_HOST:'true',DEPLOYMENT_PROFILE:'local',ADMISSION_LAB_ENABLED:'true',EMAIL_PROVIDER:'mock',
    ADMISSION_SESSION_KEY:randomBytes(32).toString('hex'),ADMISSION_LAB_MAIL_KEY:randomBytes(32).toString('hex'),ADMISSION_LAB_MAIL_DIR:'/tmp/a2-mail',
    SPECIAL_INVITATIONS_ENABLED:'true',SPECIAL_INVITATION_LINK_KEY_ID:'a22',SPECIAL_INVITATION_LINK_KEYS:JSON.stringify({a22:randomBytes(32).toString('hex')}),NEXT_TELEMETRY_DISABLED:'1'};
  const envArgs=Object.entries(env).flatMap(([key,value])=>['-e',key+'='+value]);
  await run(['run','-d','--pull=never','--name',worker,'--network','container:'+pg,'--restart','no','--label','purpose=dez-a22-http','--memory','3g',
    '--mount','type=bind,source='+staged+',target=/source,readonly','--mount','type=tmpfs,destination=/work','--mount','type=tmpfs,destination=/tmp',
    ...envArgs,'--entrypoint','sh',nodeImage,'-c','cp -a /source/. /work/ && ln -s /app/node_modules /work/node_modules && cd /work && node node_modules/prisma/build/index.js generate --schema prisma/schema.prisma > /tmp/a2-app.log 2>&1 && node node_modules/next/dist/bin/next build --webpack >> /tmp/a2-app.log 2>&1 && node node_modules/next/dist/bin/next start -p 3020 -H 127.0.0.1 >> /tmp/a2-app.log 2>&1']);created.push(worker);
  for(const name of created){const inspection=JSON.parse((await run(['inspect',name])).stdout)[0];assert.deepEqual(inspection.HostConfig.PortBindings,{});assert.equal(inspection.HostConfig.RestartPolicy.Name,'no');}
  let ready=false;
  for(let n=0;n<300;n++){
    const r=await run(['exec',worker,'node','-e',"fetch('http://localhost:3020/adesao').then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"],undefined,false);
    if(r.code===0){ready=true;break;}if(n%10===0)console.log('Waiting for isolated Next application');await new Promise(r=>setTimeout(r,1000));
  }
  if(!ready){const log=await run(['exec',worker,'cat','/tmp/a2-app.log'],undefined,false);writeFileSync(join(out,'app.log'),log.stdout);throw new Error('LOCAL_APP_NOT_READY; inspect app.log');}
  report.build='PASSED';console.log('PASS Next build and real application ready inside isolated network namespace');
  const test=await run(['exec','-w','/work',worker,'node','tests/admission.http.cjs'],undefined,false);writeFileSync(join(out,'http.log'),test.stdout+test.stderr);console.log(test.stdout);
  const result=await run(['exec',worker,'cat','/tmp/a2-http-result.json'],undefined,false);if(result.code===0){writeFileSync(join(out,'HTTP-RESULT.json'),result.stdout);report.http=JSON.parse(result.stdout);}
  assert.equal(test.code,0,'HTTP_SUITE_FAILED; inspect http.log');
  const regression=await run(['exec','-i','-w','/work',worker,'node','tests/experiment.http.cjs'],JSON.stringify({base:'http://localhost:3020',adminEmail:'a22-admin@example.invalid',memberEmail:'a22-observer@example.invalid',password:'Synthetic-only-A22-password!',fixtureRecoveryChecks:false}),false);
  writeFileSync(join(out,'special-invitations.log'),regression.stdout+regression.stderr);assert.equal(regression.code,0,'SPECIAL_INVITATION_REGRESSION_FAILED');report.experiment=JSON.parse(regression.stdout.trim().split('\n').at(-1));
  console.log('PASS existing Special Invitation HTTP regression');
  const log=await run(['exec',worker,'cat','/tmp/a2-app.log']);writeFileSync(join(out,'app.log'),log.stdout);
  report.state='PASSED';
} catch(error){report.state='FAILED';report.error=String(error.message).slice(0,400);console.error(report.error);
  if(created.includes(worker)){const log=await run(['exec',worker,'cat','/tmp/a2-app.log'],undefined,false);writeFileSync(join(out,'app.log'),log.stdout);}
} finally {
  for(const name of created.reverse()){
    const check=JSON.parse((await run(['inspect',name])).stdout)[0];assert.equal(check.Name,'/'+name);assert.equal(check.Config.Labels.purpose,'dez-a22-http');
    await run(['stop','-t','5',name]);await run(['rm','-v',name]);
  }
  report.containersRemoved=true;report.finishedAt=new Date().toISOString();writeFileSync(join(out,'RESULT.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({state:report.state,out}));if(report.state!=='PASSED')process.exitCode=1;
}
