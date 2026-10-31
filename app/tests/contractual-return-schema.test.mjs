import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {CONTRACTUAL_RETURN_MIGRATION as m,PRE_RETURN_HOMOLOG_MIGRATIONS as h6,PRE_RETURN_PRODUCTION_MIGRATIONS as p5,REQUIRED_MIGRATIONS as h7,PRODUCTION_MIGRATIONS as p6,assertBackupMigrations,compatibleBackupMigrations} from '../src/lib/backup/schema-contract.mjs';
const rows=list=>list.map(m=>({migration_name:m.name,checksum:m.sha256}));
test('contractual return is a single additive nullable column, preserving historical CHECKs and ACLs',()=>{
 for(const lane of ['migrations','production-migrations']){
  const b=readFileSync(`prisma/${lane}/${m.name}/migration.sql`),sql=b.toString();
  assert.equal(createHash('sha256').update(b).digest('hex'),m.sha256);assert(!b.includes(13));
  assert(sql.includes('ADD COLUMN provisional_cancelled_at timestamp(3)'));
  assert(sql.includes("lock_timeout = '5s'")&&sql.includes("statement_timeout = '60s'"));
  assert(sql.includes("AND migration_name <> '20261031_contractual_choice_return'"));
  assert(!/\b(?:GRANT|REVOKE|CREATE FUNCTION|DROP CONSTRAINT|UPDATE public|DELETE FROM|INSERT INTO)\b/.test(sql));
 }
 assert.equal(h7.length,7);assert.equal(p6.length,6);assert.deepEqual(h7.slice(0,-1),h6);assert.deepEqual(p6.slice(0,-1),p5);
});
test('new backup ledgers restore only their own profile and never invent cancellation for old backups',()=>{
 for(const ledger of [h7,p6]){
  assertBackupMigrations(rows(ledger),0);assert(compatibleBackupMigrations(rows(ledger),rows(ledger)));
  assert.throws(()=>assertBackupMigrations(rows(ledger),1));assert.throws(()=>assertBackupMigrations(rows(ledger).map((m,i)=>i===ledger.length-1?{...m,checksum:'0'.repeat(64)}:m),0));
 }
 for(const [a,b] of [[h6,h7],[p5,p6],[h7,h6],[p6,p5],[h7,p6],[p6,h7]])assert(!compatibleBackupMigrations(rows(a),rows(b)));
});
