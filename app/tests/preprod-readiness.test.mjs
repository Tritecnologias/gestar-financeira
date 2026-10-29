import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync,mkdtempSync,mkdirSync,writeFileSync,existsSync,readdirSync,rmSync,cpSync}from'node:fs';import{resolve,join}from'node:path';import{tmpdir}from'node:os';import{createHash}from'node:crypto';
import{PRODUCTION_MIGRATIONS,REQUIRED_MIGRATIONS,PRE_EXPERIMENT_MIGRATIONS,EXPERIMENT_LEDGER4,assertBackupMigrations,compatibleBackupMigrations}from'../src/lib/backup/schema-contract.mjs';
import{experimentOrigin}from'../src/lib/experiment-policy.ts';import{homologIdentity}from'../src/lib/environment-identity.ts';import{prepareProfile}from'../scripts/secure-build/prepare-profile.mjs';
const rows=list=>list.map(m=>({migration_name:m.name,checksum:m.sha256}));
test('production has distinct exact history; originals and their checksums stay unchanged',()=>{
 for(const m of REQUIRED_MIGRATIONS)assert.equal(createHash('sha256').update(readFileSync('prisma/migrations/'+m.name+'/migration.sql')).digest('hex'),m.sha256);
 const m=PRODUCTION_MIGRATIONS.at(-1),sql=readFileSync('prisma/production-migrations/'+m.name+'/migration.sql');assert.equal(createHash('sha256').update(sql).digest('hex'),m.sha256);assert(sql.includes("current_database() <> 'gestar_prod_pg18'"));assert(sql.includes("current_user <> 'pg18_prod_migrator'"));assert(sql.includes('GRANT SELECT, INSERT, UPDATE'));assert(!/\b(?:INSERT INTO|UPDATE public|DELETE FROM)\b/.test(sql.toString()));
});
test('backup accepts exact productive ledger, forward from baseline only, never crosses pilot or rolls back',()=>{
 const prod=rows(PRODUCTION_MIGRATIONS),base=rows(PRE_EXPERIMENT_MIGRATIONS),pilot=rows(REQUIRED_MIGRATIONS);
 assert.doesNotThrow(()=>assertBackupMigrations(prod,0));assert(compatibleBackupMigrations(base,prod));assert(compatibleBackupMigrations(prod,prod));
 for(const target of [base,rows(EXPERIMENT_LEDGER4),pilot])assert(!compatibleBackupMigrations(prod,target));assert(!compatibleBackupMigrations(pilot,prod));assert(!compatibleBackupMigrations(rows(EXPERIMENT_LEDGER4),prod));
 assert.throws(()=>assertBackupMigrations(prod,1));assert.throws(()=>assertBackupMigrations(prod.map((m,i)=>i===3?{...m,checksum:'0'.repeat(64)}:m),0));
});
test('production feature fails closed without every server approval, origin/database tuple and key',()=>{
 const env={SPECIAL_INVITATIONS_ENABLED:'true',SPECIAL_INVITATIONS_PRODUCTION_APPROVED:'true',DEPLOYMENT_PROFILE:'production',APP_PUBLIC_URL:'https://app.dezsolucoes.com.br',NEXTAUTH_URL:'https://app.dezsolucoes.com.br',DATABASE_URL:'postgresql://pg18_prod_runtime:synthetic@ik7d1n0035vis9y5rprjpgmn/gestar_prod_pg18',SPECIAL_INVITATION_LINK_KEY_ID:'synthetic',SPECIAL_INVITATION_LINK_KEYS:JSON.stringify({synthetic:'a'.repeat(64)})};
 assert.equal(experimentOrigin(env),env.APP_PUBLIC_URL);assert(!homologIdentity(env));
 for(const change of [{SPECIAL_INVITATIONS_ENABLED:'false'},{SPECIAL_INVITATIONS_PRODUCTION_APPROVED:'false'},{DEPLOYMENT_PROFILE:'homolog'},{NEXTAUTH_URL:'https://homolog.dezsolucoes.com.br'},{DATABASE_URL:env.DATABASE_URL.replace('gestar_prod_pg18','gestar_homolog_pg18')},{DATABASE_URL:env.DATABASE_URL.replace('ik7d1n0035vis9y5rprjpgmn','other')},{SPECIAL_INVITATION_LINK_KEYS:''},{SPECIAL_INVITATION_LINK_KEYS:'{}'},{SPECIAL_INVITATION_LINK_KEY_ID:'unknown'}])assert.equal(experimentOrigin({...env,...change}),null);
 assert(!homologIdentity({...env,APP_PUBLIC_URL:'https://homolog.dezsolucoes.com.br',NEXTAUTH_URL:'https://homolog.dezsolucoes.com.br',DATABASE_URL:'postgresql://x@0f5rvkjqjdt9fez1ajiascyk/gestar_homolog_pg18'}));
});
test('production artifact excludes yellow assets and pilot SQL; homolog retains its original lane',()=>{
 const temp=mkdtempSync(join(tmpdir(),'dez-preprod-artifact-'));
 try{for(const profile of ['production','homolog']){
  const root=join(temp,profile);mkdirSync(root,{recursive:true});writeFileSync(join(root,'server.js'),'');writeFileSync(join(root,'build-metadata.json'),'{}');mkdirSync(join(root,'public'),{recursive:true});cpSync('public/brand',join(root,'public/brand'),{recursive:true});
  const metadata=prepareProfile(root,profile,process.cwd());assert.equal(metadata.deploymentProfile,profile);assert.deepEqual(readdirSync(join(root,'prisma/migrations')).filter(x=>x!=='migration_lock.toml').sort(),(profile==='production'?PRODUCTION_MIGRATIONS:REQUIRED_MIGRATIONS).map(x=>x.name).sort());
  assert.equal(existsSync(join(root,'public/brand/homolog-yellow.svg')),profile==='homolog');assert(!readdirSync(join(root,'public/brand')).some(x=>profile==='production'&&x.startsWith('homolog-')));assert(readFileSync(join(root,'public/brand/dez-blue.svg')).equals(readFileSync('public/brand/dez-blue.svg')));
 }}finally{if(!resolve(temp).startsWith(resolve(tmpdir())+requireSeparator()))throw Error('TEMP_SCOPE');rmSync(temp,{recursive:true});}
});
function requireSeparator(){return process.platform==='win32'?'\\':'/';}
test('no old logo fallback and invitation referrer policy is explicit',()=>{
 const identity=readFileSync('src/components/identity/EnvironmentIdentity.tsx','utf8');assert(!identity.includes('💼'));assert(!identity.includes('fallback'));assert(identity.includes('/favicon.svg?v=dez-blue-1'));
 const config=readFileSync('next.config.ts','utf8');for(const path of ['/experimentacao','/api/experimentacao','/api/platform/experiment-invitations/:path*'])assert(config.includes(`source: "${path}", headers: [{ key: "Referrer-Policy", value: "no-referrer" }]`));
});
