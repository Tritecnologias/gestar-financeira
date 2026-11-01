// A.2.5 runner extensions. All services retain the approved exact LOCAL policy.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

export async function integratedSuite(run,worker,out,mode){
 const result=await run(['exec','-w','/work',worker,'node','tests/admission-integrated.http.cjs',mode],undefined,false);
 writeFileSync(join(out,'integrated-'+mode+'.log'),result.stdout+result.stderr);console.log(result.stdout);
 const data=await run(['exec',worker,'cat','/tmp/a25-'+mode+'-result.json'],undefined,false);
 if(data.code===0)writeFileSync(join(out,'INTEGRATED-'+mode.toUpperCase()+'.json'),data.stdout);
 assert.equal(result.code,0,'INTEGRATED_'+mode.toUpperCase()+'_FAILED; inspect integrated-'+mode+'.log');
 return JSON.parse(data.stdout);
}

export async function recoverApplication({run,worker,pgImage,nodeImage,staged,out,envArgs,full,snapshot,before,created,label,suffix,closeBridge}){
 const recoveredPg='dez-a25-recovery-pg-'+suffix,recoveredWorker='dez-a25-recovery-http-'+suffix;
 // Preserve build and private volumes outside Git. Secret environment keys remain in memory.
 // docker cp does not resolve this engine's tmpfs mounts. Archive through exec/stdin.
 const buildArchive=(await run(['exec',worker,'tar','--exclude=.next/cache','-C','/work','-cf','-','.next'])).bytes;
 writeFileSync(join(out,'synthetic-app-build.tar'),buildArchive);
 const context=(await run(['exec',worker,'cat','/tmp/a25-recovery-context.json'])).bytes;
 const volumeArchive=(await run(['exec',worker,'tar','-C','/tmp','-cf','-','a23-terms','a23-backups','a2-mail'])).bytes;
 writeFileSync(join(out,'synthetic-private-volumes.tar'),volumeArchive);
 const originalLog=await run(['exec',worker,'cat','/tmp/a2-app.log']);writeFileSync(join(out,'app.log'),originalLog.stdout);
 closeBridge?.();await run(['stop','-t','5',worker]);
 await run(['run','-d','--pull=never','--name',recoveredPg,'--network','none','--restart','no','--label','purpose='+label,'--memory','768m','--mount','type=tmpfs,destination=/var/lib/postgresql','-e','POSTGRES_HOST_AUTH_METHOD=trust',pgImage]);created.push(recoveredPg);
 let ready=false;for(let n=0;n<80;n++){if((await run(['exec',recoveredPg,'pg_isready','-h','127.0.0.1','-U','postgres'],undefined,false)).code===0){ready=true;break;}await new Promise(r=>setTimeout(r,250));}assert(ready);
 await run(['exec','-i',recoveredPg,'psql','-XqAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],"CREATE ROLE a2_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS; CREATE ROLE a2_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT; CREATE ROLE a2_observer LOGIN; CREATE ROLE pg18_prod_migrator LOGIN; CREATE ROLE pg18_prod_runtime LOGIN; CREATE DATABASE special_invite_lab OWNER a2_migrator;");
 await run(['exec','-i',recoveredPg,'pg_restore','-U','postgres','-d','special_invite_lab','--exit-on-error'],full);
 const restored=await run(['exec','-i',recoveredPg,'psql','-XqAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','special_invite_lab'],snapshot);assert.equal(restored.stdout,before.stdout);
 writeFileSync(join(out,'independent-recovery-tables.txt'),restored.stdout);
 await run(['run','-d','--pull=never','--name',recoveredWorker,'--network','container:'+recoveredPg,'--restart','no','--label','purpose='+label,'--memory','2g',
  '--mount','type=bind,source='+staged+',target=/source,readonly',
  '--mount','type=tmpfs,destination=/work','--mount','type=tmpfs,destination=/tmp',...envArgs,'--entrypoint','sh',nodeImage,'-c',
  'cp -a /source/. /work/ && ln -s /app/node_modules /work/node_modules && cd /work && while [ ! -f /tmp/a25-ready ]; do sleep 0.2; done && node node_modules/prisma/build/index.js generate --schema prisma/schema.prisma > /tmp/a2-app.log 2>&1 && node node_modules/next/dist/bin/next start -p 3020 -H 127.0.0.1 >> /tmp/a2-app.log 2>&1']);created.push(recoveredWorker);
 for(const name of [recoveredPg,recoveredWorker]){const inspected=JSON.parse((await run(['inspect',name])).stdout)[0];assert.deepEqual(inspected.HostConfig.PortBindings,{});assert.equal(inspected.Config.Labels.purpose,label);}
 await run(['exec','-i',recoveredWorker,'tar','-C','/tmp','-xf','-'],volumeArchive);
 await run(['exec','-i',recoveredWorker,'tar','-C','/work','-xf','-'],buildArchive);
 await run(['exec','-i',recoveredWorker,'node','-e',"const fs=require('fs'),b=[];process.stdin.on('data',x=>b.push(x));process.stdin.on('end',()=>fs.writeFileSync('/tmp/a25-recovery-context.json',Buffer.concat(b),{mode:0o600}))"],context);
 await run(['exec',recoveredWorker,'touch','/tmp/a25-ready']);
 ready=false;for(let n=0;n<60;n++){if((await run(['exec',recoveredWorker,'node','-e',"fetch('http://localhost:3020/adesao').then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))"],undefined,false)).code===0){ready=true;break;}await new Promise(r=>setTimeout(r,500));}assert(ready,'RECOVERED_APPLICATION_READY');
 let suite;try{suite=await integratedSuite(run,recoveredWorker,out,'recovered');}finally{const log=await run(['exec',recoveredWorker,'cat','/tmp/a2-app.log'],undefined,false);writeFileSync(join(out,'recovered-app.log'),log.stdout);}
 return {state:'PASSED',sourceApplicationStopped:true,separatePostgresNamespace:true,remoteConnections:false,tables:44,
  reusedEnvironmentKeysInMemory:true,privateVolumes:['synthetic PDFs','encrypted synthetic mail','tenant backup safety files'],privateVolumeArchiveSHA256:createHash('sha256').update(volumeArchive).digest('hex'),http:suite};
}
