// Candidate/recovery smoke within the caller's verified network-none PostgreSQL namespace.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';
const random=()=>randomBytes(32).toString('hex');
export async function startCandidate({run,image,pg,name,created,env}){
  await run(['run','-d','--pull=never','--name',name,'--network','container:'+pg,'--restart','no','--label','purpose=dez-a26-local-rehearsal','--memory','1g',
    '--tmpfs','/var/lib/10s/backups:uid=1001,gid=1001,mode=0700','--tmpfs','/var/lib/10s/terms:uid=1001,gid=1001,mode=0700',
    ...Object.entries(env).flatMap(([k,v])=>['-e',k+'='+v]),image]);created.push(name);
  const state=JSON.parse((await run(['inspect',name])).stdout)[0];assert.equal(state.Image,image);assert.deepEqual(state.HostConfig.PortBindings,{});assert.equal(state.Config.User,'nextjs');
  let ready=false;for(let n=0;n<80;n++){if((await run(['exec',name,'node','-e',"fetch('http://127.0.0.1:3000/adesao').then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"],undefined,false)).code===0){ready=true;break;}await new Promise(r=>setTimeout(r,250));}assert(ready,'HOMOLOG_CANDIDATE_READY');
}
export async function rehearseCandidate({run,image,pg,created,out,app,pass}){
  const name=pg+'-app',auth=random(),env={DATABASE_URL:'postgresql://pg18_homolog_runtime:'+random()+'@0f5rvkjqjdt9fez1ajiascyk:5432/gestar_homolog_pg18?schema=public',
    APP_PUBLIC_URL:'https://homolog.dezsolucoes.com.br',NEXTAUTH_URL:'https://homolog.dezsolucoes.com.br',DEPLOYMENT_PROFILE:'homolog',ACCESS_AUTH_MODE:'identity',
    ADMISSION_HOMOLOG_ENABLED:'true',EMAIL_PROVIDER:'mock',AUTH_SECRET:auth,NEXTAUTH_SECRET:auth,AUTH_TRUST_HOST:'true',
    ADMISSION_SESSION_KEY:random(),ADMISSION_LAB_MAIL_KEY:random(),ADMISSION_LAB_MAIL_DIR:'/var/lib/10s/backups/admission-mail',
    TERM_STORAGE_DIR:'/var/lib/10s/terms',TENANT_BACKUP_DIR:'/var/lib/10s/backups',TENANT_BACKUP_INSTANCE_ID:'a26-synthetic',TENANT_BACKUP_SIGNING_KEY_ID:'a26',TENANT_BACKUP_SIGNING_KEYS:JSON.stringify({a26:random()}),
    SPECIAL_INVITATIONS_ENABLED:'true',SPECIAL_INVITATION_LINK_KEY_ID:'a26',SPECIAL_INVITATION_LINK_KEYS:JSON.stringify({a26:random()}),HOSTNAME:'127.0.0.1',PORT:'3000'};
  await startCandidate({run,image,pg,name,created,env});
  const suite=await run(['exec','-i','-w','/app',name,'node'],readFileSync(join(app,'tests/admission-homolog.http.cjs')),false);
  const log=await run(['logs',name]);
  writeFileSync(join(out,'candidate-http.log'),suite.stdout+suite.stderr);writeFileSync(join(out,'candidate-app.log'),log.stdout+log.stderr);
  assert.equal(suite.code,0,'HOMOLOG_HTTP_SMOKE_FAILED: '+suite.stderr.slice(-400));
  const checks=JSON.parse(suite.stdout.trim().split('\n').at(-1));assert.equal(checks.state,'PASSED');pass('immutable runtime candidate passes new/existing identity, concurrency, secure cookie and operational gate smoke');
  const secrets=JSON.parse((await run(['exec',name,'cat','/tmp/a26-secrets.json'])).stdout);
  const client=JSON.parse((await run(['exec',name,'cat','/tmp/a26-client.json'])).stdout);
  const logs=log.stdout+log.stderr+suite.stdout+suite.stderr;
  for(const value of [...secrets,env.AUTH_SECRET,env.ADMISSION_SESSION_KEY,env.ADMISSION_LAB_MAIL_KEY,...client.cookies.map(([,v])=>v.value)])assert(!value||!logs.includes(value),'SENSITIVE_VALUE_IN_LOG');
  pass('candidate logs contain no synthetic passwords, tokens, cookies or environment keys');
  // Freeze application before capturing both DB and private volumes.
  // Freeze the Node process while exec/tar remains available for private tmpfs mounts.
  // No other ingress exists in this network-none namespace.
  await run(['exec','-u','0',name,'kill','-STOP','1']);
  const volumes=(await run(['exec',name,'tar','-C','/var/lib/10s','-cf','-','terms','backups'])).bytes;
  await run(['exec','-u','0',name,'kill','-CONT','1']);
  await run(['stop','-t','10',name]);
  return {env,client,volumes,checks,originalApplicationStopped:true};
}
export async function recoverCandidate({run,image,pg,created,context,pass,out}){
  const name=pg+'-app';await startCandidate({run,image,pg,name,created,env:context.env});
  await run(['exec','-i','-u','0',name,'tar','-C','/var/lib/10s','-xf','-'],context.volumes);
  // Keys and signed session are preserved in memory/private encrypted backup, never output.
  const code=`const assert=require('assert/strict'); const c=${JSON.stringify(context.client)};
    (async()=>{const headers={Cookie:c.cookies.map(([k,v])=>k+'='+v.value).join('; ')};
      let r=await fetch('http://127.0.0.1:3000/api/admissions/'+c.id,{headers,redirect:'manual'});
      assert.equal(r.status,200);assert.equal((await r.json()).state,'PROVISIONED');
      r=await fetch('http://127.0.0.1:3000/api/lancamentos',{headers,redirect:'manual'});assert.equal(r.status,409);
      console.log('RECOVERED_IDENTITY_ADMISSION_CONTRACTUAL_GATE_PASS');
    })().catch(()=>{console.error('RECOVERED_APPLICATION_FAILED');process.exitCode=1});`;
  const r=await run(['exec','-i','-w','/app',name,'node'],code);
  writeFileSync(join(out,'recovered-app.log'),r.stdout);pass('same H8-compatible image starts on independent recovery and resumes the signed session; documents still block access');
}
