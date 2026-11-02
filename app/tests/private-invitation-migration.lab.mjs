// Test fixture extension of run-http-lab, not a deployment executor.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {PRIVATE_INVITATION_MIGRATION as migration,PORTABLE_HOMOLOG_MIGRATIONS,PORTABLE_PRODUCTION_MIGRATIONS,assertBackupMigrations,compatibleBackupMigrations} from '../src/lib/backup/schema-contract.mjs';
import {admissionDatabaseGuardSql} from '../src/lib/admission-database-contract.mjs';

export async function privateInvitationMigrationLab({run,pg,app,out}) {
  const checks=[],pass=n=>checks.push(n),sql=readFileSync(join(app,'prisma/portable-migrations',migration.name,'migration.sql'),'utf8');
  assert.equal(createHash('sha256').update(sql).digest('hex'),migration.sha256);
  const query=(db,text,user='postgres',intent='',ok=true)=>run(['exec','-i','-e','PGAPPNAME='+intent,pg,'psql','-XqAt','-v','ON_ERROR_STOP=1','-U',user,'-d',db],text,ok);
  const plain=(await run(['exec',pg,'pg_dump','-U','postgres','-d','special_invite_lab','-Fp'])).stdout;
  await query('postgres','CREATE ROLE pg18_homolog_migrator LOGIN; CREATE ROLE pg18_homolog_runtime LOGIN NOINHERIT;');
  const lanes=[
    {profile:'homolog',db:'gestar_homolog_pg18',mg:'pg18_homolog_migrator',rt:'pg18_homolog_runtime',intent:'dez-a2-homolog-h8-h9',before:PORTABLE_HOMOLOG_MIGRATIONS},
    {profile:'production',db:'gestar_prod_pg18',mg:'pg18_prod_migrator',rt:'pg18_prod_runtime',intent:'dez-a2-production-p7-p8',before:PORTABLE_PRODUCTION_MIGRATIONS},
    {profile:'local',db:'special_invite_lab',mg:'a2_migrator',rt:'a2_runtime',intent:'dez-a2-local-h8-h9'},
  ];
  const tableNames=(await query('special_invite_lab',"SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")).stdout.trim().split(/\r?\n/);
  assert.equal(tableNames.length,44);assert(tableNames.every(t=>/^[a-z_]+$/.test(t)));
  const digest=(withoutNew=false)=>tableNames.filter(t=>t!=='_prisma_migrations').map(t=>`SELECT '${t}',count(*),md5(coalesce(string_agg((to_jsonb(t)${withoutNew?"-'invitation_redeemed_at'":""})::text,chr(10) ORDER BY (to_jsonb(t)${withoutNew?"-'invitation_redeemed_at'":""})::text),'')) FROM ${t} t;`).join('\n');
  for(const lane of lanes){
    const {profile,db,mg,rt,intent}=lane;
    if(lane.before){
      await query('postgres',`CREATE DATABASE ${db} OWNER ${mg}; REVOKE CREATE ON DATABASE ${db} FROM PUBLIC;`);
      await query(db,plain.replace(/\ba2_migrator\b/g,mg).replace(/\ba2_runtime\b/g,rt));
      // Known synthetic fixture only. Reproduce each deployed immutable lineage;
      // no real dump, remote connection or migration history is rewritten.
      await query(db,'TRUNCATE _prisma_migrations;\n'+lane.before.map(m=>`INSERT INTO _prisma_migrations(id,checksum,migration_name,started_at,finished_at,applied_steps_count) VALUES('${randomUUID()}','${m.sha256}','${m.name}',now(),now(),1);`).join('\n'));
    }
    const original=(await query(db,digest())).stdout, ledgerBefore=(await query(db,'SELECT row_to_json(t) FROM _prisma_migrations t ORDER BY id')).stdout;
    for(const [role,authorization] of [[mg,''],[rt,intent],[mg,profile==='production'?'dez-a2-homolog-h8-h9':'dez-a2-production-p7-p8']]){
      assert.notEqual((await query(db,sql,role,authorization,false)).code,0);
      assert.equal((await query(db,"SELECT count(*) FROM information_schema.columns WHERE table_name='admissions' AND column_name='invitation_redeemed_at'")).stdout.trim(),'0');
    }
    pass(profile+': unauthorized intent, wrong environment and runtime role rejected without changes');
    const broken=sql.replace('COMMIT;',"DO $$ BEGIN RAISE EXCEPTION 'INDUCED_LOCAL_TEST_FAILURE'; END $$;\nCOMMIT;");
    assert.notEqual((await query(db,broken,mg,intent,false)).code,0);
    assert.equal((await query(db,"SELECT count(*) FROM pg_enum WHERE enumtypid='\"AdmissionChallengePurpose\"'::regtype AND enumlabel='INVITATION_CREDENTIAL'")).stdout.trim(),'0');
    assert.equal((await query(db,'SELECT row_to_json(t) FROM _prisma_migrations t ORDER BY id')).stdout,ledgerBefore);
    pass(profile+': induced partial failure rolls back column, enum, constraints and leaves ledger intact');
    await query(db,sql,mg,intent);
    await query(db,`INSERT INTO _prisma_migrations(id,checksum,migration_name,started_at,finished_at,applied_steps_count) VALUES('${randomUUID()}','${migration.sha256}','${migration.name}',now(),now(),1);`,mg);
    await query(db,readFileSync(join(app,'scripts/admission/portable-runtime-acl.sql'),'utf8'),mg,intent);
    assert.equal((await query(db,admissionDatabaseGuardSql(profile),rt)).stdout.trim(),'t');
    assert.equal((await query(db,digest(true))).stdout,original);
    assert.equal((await query(db,"SELECT has_column_privilege(current_user,'admissions','invitation_redeemed_at','UPDATE'),has_table_privilege(current_user,'admissions','DELETE'),has_column_privilege(current_user,'admissions','authorized_email','UPDATE')",rt)).stdout.trim(),'t|f|f');
    assert.notEqual((await query(db,sql,mg,intent,false)).code,0);
    const ledger=JSON.parse((await query(db,'SELECT json_agg(json_build_object(\'migration_name\',migration_name,\'checksum\',checksum) ORDER BY migration_name) FROM _prisma_migrations')).stdout);
    assertBackupMigrations(ledger,0);assert(compatibleBackupMigrations(ledger,ledger));
    if(lane.before)assert(!compatibleBackupMigrations(lane.before.map(m=>({migration_name:m.name,checksum:m.sha256})),ledger));
    pass(profile+': exact ledger, 44 tables, minimal column ACL, unchanged historical rows, repetition rejected');
    const backup=(await run(['exec',pg,'pg_dump','-U','postgres','-d',db,'-Fc'])).bytes, restored='private_recovery_'+profile;
    await query('postgres',`CREATE DATABASE ${restored} OWNER ${mg};`);
    await run(['exec','-i',pg,'pg_restore','-U','postgres','-d',restored,'--exit-on-error'],backup);
    assert.equal((await query(restored,digest())).stdout,(await query(db,digest())).stdout);
    assert.equal((await query(restored,'SELECT row_to_json(t) FROM _prisma_migrations t ORDER BY id')).stdout,(await query(db,'SELECT row_to_json(t) FROM _prisma_migrations t ORDER BY id')).stdout);
    pass(profile+': real isolated dump/restore preserves all tables and exact ledger');
    writeFileSync(join(out,'migration-'+profile+'.json'),JSON.stringify({state:'PASSED',database:db,ledger:ledger.length,tables:44,migration,backupSHA256:createHash('sha256').update(backup).digest('hex'),dataPreserved:true,remoteOperations:0},null,2));
  }
  return {state:'PASSED',checks,migration,tables:44,remoteOperations:0};
}

export async function privateInvitationOciLab({run,pg,worker,out,image,created,label,suffix}) {
  assert(/^sha256:[a-f0-9]{64}$/.test(image),'EXACT_LOCAL_IMAGE_ID_REQUIRED');
  const spec=JSON.parse((await run(['image','inspect',image])).stdout)[0];assert.equal(spec.Id,image);
  assert.equal(spec.Config.Labels['com.dezsolucoes.deployment.profile'],'portable');
  const sha=spec.Config.Labels['org.opencontainers.image.revision'];assert(/^[a-f0-9]{40}$/.test(sha));
  const results=[];
  for(const [profile,port,host,database,role] of [
    ['local',3020,'127.0.0.1','special_invite_lab','a2_runtime'],
    ['homolog',3033,'0f5rvkjqjdt9fez1ajiascyk','gestar_homolog_pg18','pg18_homolog_runtime'],
    ['production',3034,'ik7d1n0035vis9y5rprjpgmn','gestar_prod_pg18','pg18_prod_runtime'],
  ]){
    const name='dez-private-'+profile+'-'+suffix,origin=profile==='local'?'http://localhost:3020':'https://'+(profile==='homolog'?'homolog':'app')+'.dezsolucoes.com.br';
    const {randomBytes}=await import('node:crypto'),key=()=>randomBytes(32).toString('hex'),secret=key();
    const env={DATABASE_URL:`postgresql://${role}:synthetic@${host}:5432/${database}`,APP_PUBLIC_URL:origin,NEXTAUTH_URL:origin,
      DEPLOYMENT_PROFILE:profile,ACCESS_AUTH_MODE:'identity',AUTH_SECRET:secret,NEXTAUTH_SECRET:secret,AUTH_TRUST_HOST:'true',
      ADMISSION_LAB_ENABLED:profile==='local'?'true':'false',ADMISSION_HOMOLOG_ENABLED:profile==='homolog'?'true':'false',
      ADMISSION_PRODUCTION_ENABLED:profile==='production'?'true':'false',ADMISSION_SESSION_KEY:key(),EMAIL_PROVIDER:'disabled',
      SPECIAL_INVITATIONS_ENABLED:'true',SPECIAL_INVITATIONS_PRODUCTION_APPROVED:profile==='production'?'true':'false',
      SPECIAL_INVITATION_LINK_KEY_ID:'lab',SPECIAL_INVITATION_LINK_KEYS:JSON.stringify({lab:key()}),
      PASSWORD_RESET_ENABLED:'true',PORT:String(port),HOSTNAME:'127.0.0.1'};
    // Only the HOMOLOG reset allowlist needs the specific synthetic identity; the
    // test chooses a deterministic reserved address, never an actual recipient.
    env.PASSWORD_RESET_TEST_RECIPIENTS='oci-recipient-'+profile+'@example.invalid';
    await run(['run','-d','--pull=never','--name',name,'--network','container:'+pg,'--restart','no','--label','purpose='+label,'--memory','768m',
      ...Object.entries(env).flatMap(([k,v])=>['-e',k+'='+v]),'--entrypoint','sh',image,'-c',"while [ ! -f /tmp/private-lab-ready ]; do sleep 0.1; done; exec node server.js"]);created.push(name);
    // Purely disposable /etc/hosts, before app startup. Container network remains
    // 'none' through the PG namespace; real infrastructure cannot be reached.
    await run(['exec','-i','-u','0',name,'sh'],`printf '\\n127.0.0.1 ${host}\\n' >> /etc/hosts\ntouch /tmp/private-lab-ready\n`);
    let ready=false;for(let n=0;n<100;n++){
      if((await run(['exec',worker,'node','-e',`fetch('http://127.0.0.1:${port}/login').then(r=>process.exit(r.status===200?0:1)).catch(()=>process.exit(1))`],undefined,false)).code===0){ready=true;break;}
      await new Promise(r=>setTimeout(r,200));
    }assert(ready,profile+': OCI_APP_READY');
    const check=await run(['exec','-i','-w','/work',worker,'node','tests/private-invitation-portability.http.cjs'],JSON.stringify({profile,base:'http://127.0.0.1:'+port,origin,database}),false);
    writeFileSync(join(out,'oci-'+profile+'.log'),check.stdout+check.stderr);assert.equal(check.code,0,profile+': OCI_HTTP; see log');
    const metadata=JSON.parse((await run(['exec',name,'node','-e',"console.log(JSON.stringify({metadata:require('./build-metadata.json'),buildId:require('node:fs').readFileSync('.next/BUILD_ID','utf8').trim()}))"])).stdout);
    assert.equal(metadata.metadata.sourceCommit,sha);assert.equal(metadata.metadata.migrationProfiles.homolog.length,9);assert.equal(metadata.metadata.migrationProfiles.production.length,8);
    assert.equal((await run(['inspect',name,'--format','{{.Image}}'])).stdout.trim(),image);
    const log=await run(['logs',name],undefined,false);writeFileSync(join(out,'oci-'+profile+'-app.log'),log.stdout+log.stderr);
    assert(!/D9![A-Za-z0-9_-]{32}a|Synthetic-private-(OCI|final)-2026!/.test(log.stdout+log.stderr));
    results.push({...JSON.parse(check.stdout.trim()),image,sourceCommit:sha,buildId:metadata.buildId,mail:'disabled',isolated:true});
  }
  assert.equal(new Set(results.map(r=>r.buildId)).size,1);
  const result={state:'PASSED',image,sourceCommit:sha,profiles:results};writeFileSync(join(out,'OCI-PORTABILITY.json'),JSON.stringify(result,null,2));return result;
}
