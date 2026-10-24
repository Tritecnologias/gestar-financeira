import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
assert.equal(process.argv[2],'--local-docker-lab');
const output=process.argv[3], image=process.argv[4] ?? '10s-phase1a:14d6d79';
assert.ok(output && path.isAbsolute(output));
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
function docker(args) { const r=spawnSync('docker',args,{encoding:'utf8',maxBuffer:4e6}); if(r.status)throw Error('LOCAL_HTTP_LAB_DOCKER_FAILED'); return r.stdout.trim(); }
const context=JSON.parse(docker(['context','inspect']))[0]; assert.match(context.Endpoints.docker.Host,/^npipe:\/\//);
assert.equal(JSON.parse(docker(['network','inspect','10s-phase2a-lab']))[0].Internal,true);
for(const name of ['10s-phase2a-pg','10s-phase2a-node']) {
  const c=JSON.parse(docker(['inspect',name]))[0];
  assert.equal(c.Config.Labels.purpose,'phase2a-isolated-lab');
  assert.deepEqual(Object.keys(c.NetworkSettings.Networks),['10s-phase2a-lab']);
  assert.equal(Object.keys(c.HostConfig.PortBindings ?? {}).length,0);
}
const source=JSON.parse(docker(['image','inspect',image]))[0];
const report=JSON.parse(readFileSync(path.join(output,'report.json'),'utf8'));
assert.equal(report.localOnly,true);
const db=report.databases[0]; assert.match(db,/^phase2a_\d+_legacy$/);
const url=`postgresql://postgres@10s-phase2a-pg:5432/${db}`;
let created=false;
try {
  docker(['run','-d','--name','10s-phase2a-app','--network','10s-phase2a-lab','--label','purpose=phase2a-isolated-lab',
    '-e',`DATABASE_URL=${url}`,'-e','ACCESS_AUTH_MODE=identity','-e','NEXTAUTH_URL=http://10s-phase2a-app:3000',
    '-e','APP_PUBLIC_URL=http://10s-phase2a-app:3000','-e','AUTH_TRUST_HOST=true',
    '-e',`NEXTAUTH_SECRET=${randomBytes(32).toString('hex')}`,image]);
  created=true;
  docker(['cp',path.join(app,'scripts/schema-reconciliation/lab-http.cjs'),'10s-phase2a-node:/app/scripts/schema-reconciliation/']);
  const result=JSON.parse(docker(['exec','-e',`DATABASE_URL=${url}`,'10s-phase2a-node','node','scripts/schema-reconciliation/lab-http.cjs']));
  writeFileSync(path.join(output,'http-report.json'),JSON.stringify({...result,imageId:source.Id,sourceCommit:source.Config.Labels?.['org.opencontainers.image.revision']},null,2));
  console.log(JSON.stringify(result,null,2));
} finally {
  // Only remove the container created successfully by THIS invocation; preserve DB evidence.
  if(created)docker(['rm','-f','10s-phase2a-app']);
}
