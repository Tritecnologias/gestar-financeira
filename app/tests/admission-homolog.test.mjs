import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,mkdirSync,existsSync,rmSync,readdirSync,cpSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {admissionOrigin,admissionEmail} from '../src/lib/admission-policy.ts';
import {admissionDatabaseGuardSql} from '../src/lib/admission-database-contract.mjs';
import {PORTABLE_ADMISSION_MIGRATION as migration,PRIVATE_HOMOLOG_MIGRATIONS as h8,PRIVATE_PRODUCTION_MIGRATIONS as p7,HOMOLOG_MIGRATIONS,REQUIRED_MIGRATIONS,PRODUCTION_MIGRATIONS,PRE_ADMISSION_HOMOLOG_MIGRATIONS,assertBackupMigrations,compatibleBackupMigrations} from '../src/lib/backup/schema-contract.mjs';
import {prepareProfile} from '../scripts/secure-build/prepare-profile.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex'), rows=a=>a.map(m=>({migration_name:m.name,checksum:m.sha256}));
const config={DEPLOYMENT_PROFILE:'homolog',ADMISSION_HOMOLOG_ENABLED:'true',ACCESS_AUTH_MODE:'identity',EMAIL_PROVIDER:'mock',
  APP_PUBLIC_URL:'https://homolog.dezsolucoes.com.br',NEXTAUTH_URL:'https://homolog.dezsolucoes.com.br',
  DATABASE_URL:'postgresql://pg18_homolog_runtime:synthetic@0f5rvkjqjdt9fez1ajiascyk:5432/gestar_homolog_pg18?schema=public',
  ADMISSION_SESSION_KEY:'a'.repeat(64),ADMISSION_LAB_MAIL_KEY:'b'.repeat(64),ADMISSION_LAB_MAIL_DIR:'/var/lib/10s/backups/admission-mail'};
const production={...config,DEPLOYMENT_PROFILE:'production',ADMISSION_HOMOLOG_ENABLED:'false',ADMISSION_PRODUCTION_ENABLED:'true',
  APP_PUBLIC_URL:'https://app.dezsolucoes.com.br',NEXTAUTH_URL:'https://app.dezsolucoes.com.br',DATABASE_URL:'postgresql://pg18_prod_runtime:synthetic@ik7d1n0035vis9y5rprjpgmn:5432/gestar_prod_pg18?schema=public'};

test('same application selects an independently authorized deployment; flags or database name alone are insufficient',()=>{
  for(const env of [config,production]){
    assert.equal(admissionOrigin(env),env.APP_PUBLIC_URL);
    const flag=env===config?'ADMISSION_HOMOLOG_ENABLED':'ADMISSION_PRODUCTION_ENABLED',other=env===config?'ADMISSION_PRODUCTION_ENABLED':'ADMISSION_HOMOLOG_ENABLED';
    for(const [key,value]of Object.entries({[flag]:'false',[other]:'true',ADMISSION_LAB_ENABLED:'true',ACCESS_AUTH_MODE:'legacy',EMAIL_PROVIDER:'unknown',
      NEXTAUTH_URL:'http://localhost:3020',ADMISSION_SESSION_KEY:'',ADMISSION_LAB_MAIL_KEY:env.ADMISSION_SESSION_KEY,ADMISSION_LAB_MAIL_DIR:'/tmp/a2-mail'}))
      assert.equal(admissionOrigin({...env,[key]:value}),null,key);
    for(const db of [env.DATABASE_URL.replace('runtime','migrator'),env.DATABASE_URL.replace('schema=public','schema=private'),env.DATABASE_URL+'&options=-csession_authorization=postgres',env.DATABASE_URL+'#ignored',env.DATABASE_URL.replace(':synthetic',''),env.DATABASE_URL.replace('postgresql:','https:')])
      assert.equal(admissionOrigin({...env,DATABASE_URL:db}),null);
    assert.equal(admissionOrigin({...env,DATABASE_URL:(env===config?production:config).DATABASE_URL}),null);
  }
  for(const profile of [undefined,'unknown','__proto__',"production';DROP TABLE admissions;--"]){
    assert.equal(admissionOrigin({...production,DEPLOYMENT_PROFILE:profile}),null);
    assert.equal(admissionDatabaseGuardSql(profile),'SELECT false AS allowed');
  }
});

test('mock remains synthetic for PROD; existing SMTP adapter is configured separately without changing the version',()=>{
  for(const env of [config,production]){
    assert.equal(admissionEmail(' QA@EXAMPLE.INVALID ',env),'qa@example.invalid');
    assert.throws(()=>admissionEmail('qa@example.com',env));
  }
  assert.equal(admissionOrigin({...config,EMAIL_PROVIDER:'smtp'}),null);
  const smtp={...production,EMAIL_PROVIDER:'smtp',ADMISSION_LAB_MAIL_KEY:undefined,ADMISSION_LAB_MAIL_DIR:undefined};
  assert.equal(admissionOrigin(smtp),smtp.APP_PUBLIC_URL);
  assert.equal(admissionEmail(' QA@Example.COM ',smtp),'qa@example.com');
  for(const address of ['a@x.com\r\nBcc:b@x.com','a@x.com,b@x.com','a@-x.com',null,{}])assert.throws(()=>admissionEmail(address,smtp));
  assert.throws(()=>admissionEmail('qa@example.com',{...smtp,ADMISSION_PRODUCTION_ENABLED:'false'}));
});

test('one Admission DDL serves H7/P6; historical artifacts stay immutable',()=>{
  const original=readFileSync('prisma/migrations/'+migration.name+'/migration.sql');
  const portable=readFileSync('prisma/portable-migrations/'+migration.name+'/migration.sql');
  assert.equal(hash(original),REQUIRED_MIGRATIONS.at(-1).sha256);
  assert.equal(hash(readFileSync('prisma/production-migrations/'+migration.name+'/migration.sql')),PRODUCTION_MIGRATIONS.at(-1).sha256);
  assert.equal(hash(readFileSync('prisma/homolog-migrations/'+migration.name+'/migration.sql')),HOMOLOG_MIGRATIONS.at(-1).sha256);
  assert.equal(hash(portable),migration.sha256);assert(!portable.includes(13));
  assert.equal(portable.toString().slice(portable.indexOf('CREATE TYPE')),original.toString().slice(original.indexOf('CREATE TYPE')));
  const acl=readFileSync('scripts/admission/portable-runtime-acl.sql','utf8');
  assert(!/GRANT\s+(ALL|DELETE|TRUNCATE|CREATE|TRIGGER)/i.test(acl));assert(!/GRANT UPDATE\s+ON/i.test(acl));
});

test('new backup ledgers accept exact hashes and reject cross-history, legacy conversion and failed migrations',()=>{
  for(const current of [h8,p7]){
    assertBackupMigrations(rows(current),0);assert(compatibleBackupMigrations(rows(current),rows(current)));
    for(const other of [current===h8?p7:h8,HOMOLOG_MIGRATIONS,REQUIRED_MIGRATIONS,PRODUCTION_MIGRATIONS,PRE_ADMISSION_HOMOLOG_MIGRATIONS]){
      assert(!compatibleBackupMigrations(rows(other),rows(current)));assert(!compatibleBackupMigrations(rows(current),rows(other)));
    }
    assert.throws(()=>assertBackupMigrations(rows(current),1));assert.throws(()=>assertBackupMigrations([...rows(current),rows(current)[0]],0));
  }
});

test('one artifact keeps all exact lineages and runtime Prisma selection fails closed without rewriting files',()=>{
  const dir=mkdtempSync(join(tmpdir(),'dez-a26-portable-'));
  try{
    writeFileSync(join(dir,'server.js'),'');writeFileSync(join(dir,'build-metadata.json'),'{}');mkdirSync(join(dir,'prisma'));mkdirSync(join(dir,'public'));
    cpSync('public/brand',join(dir,'public/brand'),{recursive:true});
    const metadata=prepareProfile(dir);assert.equal(metadata.deploymentProfile,'portable');
    assert.deepEqual(metadata.migrationProfiles,{local:h8,homolog:h8,production:p7});
    for(const [profile,list]of Object.entries(metadata.migrationProfiles)){
      assert.deepEqual(readdirSync(join(dir,'prisma/migrations',profile)).filter(x=>x!=='migration_lock.toml').sort(),list.map(x=>x.name).sort());
      for(const m of list)assert.equal(hash(readFileSync(join(dir,'prisma/migrations',profile,m.name,'migration.sql'))),m.sha256);
      const path=execFileSync(process.execPath,['-e','console.log(require('+JSON.stringify(join(dir,'prisma.config.cjs'))+').migrations.path)'],{env:{...process.env,DEPLOYMENT_PROFILE:profile},encoding:'utf8'}).trim();
      assert.equal(path,join(dir,'prisma/migrations',profile));
    }
    assert.throws(()=>execFileSync(process.execPath,['-e','require('+JSON.stringify(join(dir,'prisma.config.cjs'))+')'],{env:{...process.env,DEPLOYMENT_PROFILE:'unknown'},stdio:'pipe'}));
    assert(existsSync(join(dir,'public/brand/homolog-yellow.svg')));assert(readFileSync(join(dir,'public/brand/dez-blue.svg')).equals(readFileSync('public/brand/dez-blue.svg')));
    assert.throws(()=>prepareProfile(dir,'production'));
    const docker=readFileSync('Dockerfile','utf8');assert(!/ARG DEPLOYMENT_PROFILE|ENV DEPLOYMENT_PROFILE|NEXT_PUBLIC_/.test(docker));
    assert(readFileSync('src/app/layout.tsx','utf8').includes('force-dynamic'));
    assert(readFileSync('src/app/adesao/page.tsx','utf8').includes('force-dynamic'));
  }finally{assert(dir.startsWith(join(tmpdir(),'dez-a26-portable-')));rmSync(dir,{recursive:true,force:true});}
});
