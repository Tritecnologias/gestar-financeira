// Candidate/recovery smoke within the caller's verified network-none PostgreSQL namespace.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
const fileProof=`const f=require('fs'),p=require('path'),c=require('crypto'),a=[];function walk(d){for(const n of f.readdirSync(d).sort()){const v=p.join(d,n),s=f.statSync(v);if(s.isDirectory())walk(v);else a.push({path:v,sha256:c.createHash('sha256').update(f.readFileSync(v)).digest('hex'),mode:s.mode&511,uid:s.uid,gid:s.gid})}}walk('/var/lib/10s');console.log(JSON.stringify(a))`;
export async function startCandidate({run,image,pg,name,created,env,enabled=true}){
  await run(['run','-d','--pull=never','--name',name,'--network','container:'+pg,'--restart','no','--label','purpose=dez-a26-portable-lab','--memory','1g',
    '--tmpfs','/var/lib/10s/backups:uid=1001,gid=1001,mode=0700','--tmpfs','/var/lib/10s/terms:uid=1001,gid=1001,mode=0700',
    ...Object.entries(env).flatMap(([k,v])=>['-e',k+'='+v]),image]);created.push(name);
  const state=JSON.parse((await run(['inspect',name])).stdout)[0];assert.equal(state.Image,image);assert.deepEqual(state.HostConfig.PortBindings,{});assert.equal(state.Config.User,'nextjs');
  let ready=false;for(let n=0;n<80;n++){if((await run(['exec',name,'node','-e',"fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"],undefined,false)).code===0){ready=true;break;}await new Promise(r=>setTimeout(r,250));}assert(ready,'PORTABLE_CANDIDATE_READY');
  await run(['exec',name,'node','-e',"fetch('http://127.0.0.1:3000/adesao').then(r=>{if(r.status!=="+(enabled?200:404)+")throw Error('RUNTIME_PROFILE');console.log('RUNTIME_PROFILE_PASS')}).catch(()=>process.exit(1))"]);
}
export async function rehearseCandidate({run,image,pg,created,out,app,pass,env,testDatabaseUrl,initialVolumes}){
  const name=pg+'-app';
  await startCandidate({run,image,pg,name,created,env});
  await run(['exec','-i','-u','0',name,'tar','-C','/var/lib/10s','-xf','-'],initialVolumes);
  const favicon=JSON.parse((await run(['exec',name,'node','-e',"fetch('http://127.0.0.1:3000/favicon.svg').then(async r=>{if(r.status!==200)throw Error('FAVICON');const b=Buffer.from(await r.arrayBuffer());console.log(JSON.stringify({sha256:require('crypto').createHash('sha256').update(b).digest('hex')}))}).catch(()=>process.exit(1))"])).stdout);
  const pdfSource=readFileSync(join(app,'tests/synthetic-pdf.cjs'),'utf8');
  await run(['exec','-i','-w','/app',name,'node'],pdfSource+"\nrequire('fs').writeFileSync('/var/lib/10s/terms/recovery-synthetic.pdf',module.exports(),{mode:0o600});");
  const suite=await run(['exec','-i','-w','/app',name,'node'],Buffer.concat([Buffer.from('process.env.A26_TEST_DATABASE_URL='+JSON.stringify(testDatabaseUrl)+';\n'),readFileSync(join(app,'tests/admission-homolog.http.cjs'))]),false);
  const log=await run(['logs',name]);
  writeFileSync(join(out,'candidate-http.log'),suite.stdout+suite.stderr);writeFileSync(join(out,'candidate-app.log'),log.stdout+log.stderr);
  assert.equal(suite.code,0,'PORTABLE_HTTP_SMOKE_FAILED: '+suite.stderr.slice(-400));
  const checks=JSON.parse(suite.stdout.trim().split('\n').at(-1));assert.equal(checks.state,'PASSED');pass('immutable runtime candidate passes new/existing identity, concurrency, secure cookie and operational gate smoke');
  const secrets=JSON.parse((await run(['exec',name,'cat','/tmp/a26-secrets.json'])).stdout);
  const client=JSON.parse((await run(['exec',name,'cat','/tmp/a26-client.json'])).stdout);
  const logs=log.stdout+log.stderr+suite.stdout+suite.stderr;
  for(const value of [...secrets,env.AUTH_SECRET,env.ADMISSION_SESSION_KEY,env.ADMISSION_LAB_MAIL_KEY,...client.cookies.map(([,v])=>v.value)])assert(!value||!logs.includes(value),'SENSITIVE_VALUE_IN_LOG');
  pass('candidate logs contain no synthetic passwords, tokens, cookies or environment keys');
  const files=JSON.parse((await run(['exec',name,'node','-e',fileProof])).stdout);
  // Freeze application before capturing both DB and private volumes.
  // Freeze the Node process while exec/tar remains available for private tmpfs mounts.
  // No other ingress exists in this network-none namespace.
  await run(['exec','-u','0',name,'kill','-STOP','1']);
  const volumes=(await run(['exec',name,'tar','-C','/var/lib/10s','-cf','-','terms','backups'])).bytes;
  await run(['exec','-u','0',name,'kill','-CONT','1']);
  await run(['stop','-t','10',name]);
  return {env,client,volumes,files,checks,favicon,originalApplicationStopped:true};
}
export async function recoverCandidate({run,image,pg,created,context,pass,out}){
  const name=pg+'-app';await startCandidate({run,image,pg,name,created,env:context.env});
  await run(['exec','-i','-u','0',name,'tar','-C','/var/lib/10s','-xf','-'],context.volumes);
  assert.deepEqual(JSON.parse((await run(['exec',name,'node','-e',fileProof])).stdout),context.files);
  pass('private PDF and encrypted synthetic mailbox restored with exact hashes, UID/GID and modes');
  // Keys and signed session are preserved in memory/private encrypted backup, never output.
  const code=`const assert=require('assert/strict'); const c=${JSON.stringify(context.client)};
    (async()=>{const headers={Cookie:c.cookies.map(([k,v])=>k+'='+v.value).join('; ')};
      let r=await fetch('http://127.0.0.1:3000/api/admissions/'+c.id,{headers,redirect:'manual'});
      assert.equal(r.status,200);assert.equal((await r.json()).state,'PROVISIONED');
      r=await fetch('http://127.0.0.1:3000/api/lancamentos',{headers,redirect:'manual'});assert.equal(r.status,428);
      console.log('RECOVERED_IDENTITY_ADMISSION_CONTRACTUAL_GATE_PASS');
    })().catch(()=>{console.error('RECOVERED_APPLICATION_FAILED');process.exitCode=1});`;
  const r=await run(['exec','-i','-w','/app',name,'node'],code);
  writeFileSync(join(out,'recovered-app.log'),r.stdout);pass('same image starts on the restored ledger and resumes the signed session; documents still block access');
}
