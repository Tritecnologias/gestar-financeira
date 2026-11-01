import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {ADMISSION_MIGRATION as migration,PRE_ADMISSION_HOMOLOG_MIGRATIONS as h7,PRE_ADMISSION_PRODUCTION_MIGRATIONS as p6,REQUIRED_MIGRATIONS as h8,PRODUCTION_MIGRATIONS as p7,assertBackupMigrations,compatibleBackupMigrations} from '../src/lib/backup/schema-contract.mjs';
import {TABLES,REFERENCE_TABLES} from '../src/lib/backup/catalog.mjs';
const rows=list=>list.map(m=>({migration_name:m.name,checksum:m.sha256}));
test('A.2 has one identical additive local-only migration in both lanes; exact bytes match ledger',()=>{
  for(const lane of ['migrations','production-migrations']){
    const bytes=readFileSync('prisma/'+lane+'/'+migration.name+'/migration.sql'),sql=bytes.toString();
    assert(!bytes.includes(13));assert.equal(createHash('sha256').update(bytes).digest('hex'),migration.sha256);
    assert(sql.includes("current_database() !~ '^a2_[a-z0-9_]+$'"));assert(sql.includes("current_user <> 'a2_migrator'"));
    assert(sql.includes("migration_name <> '20261101_admission_foundation'"));
    assert(!/\b(?:INSERT INTO|DELETE FROM|UPDATE public|SECURITY DEFINER|DROP TABLE)\b/i.test(sql));
  }
});
test('new H8/P7 backup policy is exact and same-profile only, retaining historical H7/P6 rules',()=>{
  assert.equal(h8.length,8);assert.equal(p7.length,7);assert.deepEqual(h8.slice(0,-1),h7);assert.deepEqual(p7.slice(0,-1),p6);
  for(const current of [h8,p7]){
    assertBackupMigrations(rows(current),0);assert(compatibleBackupMigrations(rows(current),rows(current)));
    for(const other of [h7,p6,current===h8?p7:h8]){
      assert(!compatibleBackupMigrations(rows(other),rows(current)));assert(!compatibleBackupMigrations(rows(current),rows(other)));
    }
    for(const changed of [[...rows(current),rows(current)[0]],rows(current).slice(1),rows(current).map((r,i)=>i===current.length-1?{...r,checksum:'0'.repeat(64)}:r)])
      assert.throws(()=>assertBackupMigrations(changed,0));
    assert.throws(()=>assertBackupMigrations(rows(current),1));
  }
  for(const old of [h7,p6]){assertBackupMigrations(rows(old),0);assert(compatibleBackupMigrations(rows(old),rows(old)));}
});
test('tenant restore cannot import authorizations or verification secrets',()=>{
  for(const table of ['admissions','admission_challenges']){
    assert(!TABLES.includes(table));assert(!REFERENCE_TABLES.includes(table));
  }
  const acl=readFileSync('scripts/admission/runtime-acl.sql','utf8');
  assert(!/GRANT\s+(?:ALL|DELETE|TRUNCATE|CREATE|TRIGGER)/i.test(acl));
  assert(!/GRANT UPDATE\s+ON/i.test(acl),'updates must enumerate mutable columns');
  for(const forbidden of ['authorized_email','authorized_by_identity_id','expires_at','token_hash','recipient_email','generation'])
    assert(![...acl.matchAll(/GRANT UPDATE\(([^)]+)\)/g)].some(m=>m[1].split(',').map(s=>s.trim()).includes(forbidden)));
});
