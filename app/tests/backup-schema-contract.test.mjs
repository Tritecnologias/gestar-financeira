import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { BACKUP_MIGRATIONS, VALUE_MIGRATION, SUPPORT_OPERATOR_MIGRATION, assertBackupMigrations } from '../src/lib/backup/schema-contract.mjs';

const root = new URL('../prisma/migrations/', import.meta.url);
const ledger = () => BACKUP_MIGRATIONS.map(migration_name => ({ migration_name,
  checksum: createHash('sha256').update(readFileSync(new URL(`${migration_name}/migration.sql`, root))).digest('hex') }));

test('ledger19 names match versioned migrations; new SQL checksums are real and LF-stable', () => {
  assert.deepEqual(BACKUP_MIGRATIONS.slice().sort(), readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).sort());
  for (const required of [VALUE_MIGRATION, SUPPORT_OPERATOR_MIGRATION]) {
    const bytes = readFileSync(new URL(`${required.name}/migration.sql`, root));
    assert(!bytes.includes(13));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), required.sha256);
  }
  assert.doesNotThrow(() => assertBackupMigrations(ledger(), 0));
});

test('ledger17/18, pending, duplicate, replaced, altered checksums and extra migration fail closed', () => {
  for (const rows of [ledger().slice(0,17), ledger().slice(0,18), [...ledger(), ledger()[0]],
    ledger().map((m,i) => i===0 ? ledger()[1] : m),
    ledger().map((m,i) => i===0 ? {...m,migration_name:'unexpected'} : m),
    ledger().map(m => m.migration_name===VALUE_MIGRATION.name ? {...m,checksum:'0'.repeat(64)} : m),
    ledger().map(m => m.migration_name===SUPPORT_OPERATOR_MIGRATION.name ? {...m,checksum:'0'.repeat(64)} : m),
    ledger().map((m,i) => i===0 ? {...m,checksum:'invalid'} : m)]) {
    assert.throws(() => assertBackupMigrations(rows, 0), {code:'MIGRATIONS',status:409});
  }
  assert.throws(() => assertBackupMigrations(ledger(), 1), {code:'MIGRATIONS'});
});
