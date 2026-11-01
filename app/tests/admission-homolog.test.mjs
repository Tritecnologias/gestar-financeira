import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,mkdirSync,existsSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {admissionOrigin} from '../src/lib/admission-policy.ts';
import {HOMOLOG_MIGRATIONS,HOMOLOG_ADMISSION_MIGRATION,REQUIRED_MIGRATIONS,PRODUCTION_MIGRATIONS,PRE_ADMISSION_HOMOLOG_MIGRATIONS,assertBackupMigrations,compatibleBackupMigrations} from '../src/lib/backup/schema-contract.mjs';
import {prepareProfile} from '../scripts/secure-build/prepare-profile.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex'), rows=a=>a.map(m=>({migration_name:m.name,checksum:m.sha256}));
const config={DEPLOYMENT_PROFILE:'homolog',ADMISSION_HOMOLOG_ENABLED:'true',ACCESS_AUTH_MODE:'identity',EMAIL_PROVIDER:'mock',
  APP_PUBLIC_URL:'https://homolog.dezsolucoes.com.br',NEXTAUTH_URL:'https://homolog.dezsolucoes.com.br',
  DATABASE_URL:'postgresql://pg18_homolog_runtime:synthetic@0f5rvkjqjdt9fez1ajiascyk:5432/gestar_homolog_pg18?schema=public',
  ADMISSION_SESSION_KEY:'a'.repeat(64),ADMISSION_LAB_MAIL_KEY:'b'.repeat(64),ADMISSION_LAB_MAIL_DIR:'/var/lib/10s/backups/admission-mail'};
test('HOMOLOG explicit configuration requires full tuple and synthetic transport; PROD stays denied',()=>{
  assert.equal(admissionOrigin(config),config.APP_PUBLIC_URL);
  for(const [key,value] of Object.entries({DEPLOYMENT_PROFILE:'production',ADMISSION_HOMOLOG_ENABLED:'false',ADMISSION_LAB_ENABLED:'true',ACCESS_AUTH_MODE:'legacy',EMAIL_PROVIDER:'smtp',
    APP_PUBLIC_URL:'https://app.dezsolucoes.com.br',NEXTAUTH_URL:'http://localhost:3020',ADMISSION_SESSION_KEY:'',ADMISSION_LAB_MAIL_KEY:config.ADMISSION_SESSION_KEY,ADMISSION_LAB_MAIL_DIR:'/tmp/a2-mail'}))
    assert.equal(admissionOrigin({...config,[key]:value}),null,key);
  for(const url of [config.DATABASE_URL.replace('homolog_runtime','prod_runtime'),config.DATABASE_URL.replace('gestar_homolog','gestar_prod'),
    config.DATABASE_URL.replace('0f5rvkjqjdt9fez1ajiascyk','localhost'),config.DATABASE_URL.replace('schema=public','schema=private'),
    config.DATABASE_URL+'&options=-csession_authorization=postgres',config.DATABASE_URL+'#ignored',config.DATABASE_URL.replace(':synthetic',''),config.DATABASE_URL.replace('postgresql:','https:')])
    assert.equal(admissionOrigin({...config,DATABASE_URL:url}),null);
});
test('HOMOLOG adds no structure beyond the approved DDL and preserves historical local bytes',()=>{
  const original=readFileSync('prisma/migrations/20261101_admission_foundation/migration.sql');
  const homolog=readFileSync('prisma/homolog-migrations/20261101_admission_foundation/migration.sql');
  assert.equal(hash(original),REQUIRED_MIGRATIONS.at(-1).sha256);assert.equal(hash(homolog),HOMOLOG_ADMISSION_MIGRATION.sha256);
  assert(!homolog.includes(13));assert(!homolog.subarray(0,3).equals(Buffer.from([239,187,191])));
  assert.equal(homolog.toString().split('CREATE TYPE')[1],original.toString().split('CREATE TYPE')[1]);
  assert.equal(homolog.toString().slice(homolog.indexOf('CREATE TYPE')),original.toString().slice(original.indexOf('CREATE TYPE')));
});
test('exact HOMOLOG H8 backup restores only itself; older and LOCAL/PROD ledgers are not re-signed or converted',()=>{
  assertBackupMigrations(rows(HOMOLOG_MIGRATIONS),0);assert(compatibleBackupMigrations(rows(HOMOLOG_MIGRATIONS),rows(HOMOLOG_MIGRATIONS)));
  for(const other of [REQUIRED_MIGRATIONS,PRODUCTION_MIGRATIONS,PRE_ADMISSION_HOMOLOG_MIGRATIONS]){
    assert(!compatibleBackupMigrations(rows(other),rows(HOMOLOG_MIGRATIONS)));assert(!compatibleBackupMigrations(rows(HOMOLOG_MIGRATIONS),rows(other)));
  }
  assert.throws(()=>assertBackupMigrations(rows(HOMOLOG_MIGRATIONS),1));
  assert.throws(()=>assertBackupMigrations([...rows(HOMOLOG_MIGRATIONS),rows(HOMOLOG_MIGRATIONS)[0]],0));
});
test('existing artifact preparer selects exact H8 HOMOLOG, excludes alternate SQL, and leaves PROD local-only',()=>{
  for(const profile of ['homolog','production']){
    const dir=mkdtempSync(join(tmpdir(),'dez-a26-artifact-'));
    try {
      writeFileSync(join(dir,'server.js'),'');writeFileSync(join(dir,'build-metadata.json'),'{}');mkdirSync(join(dir,'prisma'));
      const result=prepareProfile(dir,profile);
      assert.deepEqual(result.migrations,profile==='homolog'?HOMOLOG_MIGRATIONS:PRODUCTION_MIGRATIONS);
      for(const m of result.migrations)assert.equal(hash(readFileSync(join(dir,'prisma/migrations',m.name,'migration.sql'))),m.sha256);
      for(const alternate of ['production-migrations','homolog-migrations'])assert(!existsSync(join(dir,'prisma',alternate)));
    } finally {rmSync(dir,{recursive:true,force:true});}
  }
});
