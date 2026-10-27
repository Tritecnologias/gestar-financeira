import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { BACKUP_MIGRATIONS, BASELINE_MIGRATION, assertBackupMigrations } from '../src/lib/backup/schema-contract.mjs';

const root = new URL('../prisma/migrations/', import.meta.url);
const ledger = () => BACKUP_MIGRATIONS.map(migration_name => ({ migration_name,
  checksum: createHash('sha256').update(readFileSync(new URL(`${migration_name}/migration.sql`, root))).digest('hex') }));

test('baseline epoch names match the active migration; exact checksum and LF bytes', () => {
  assert.deepEqual(BACKUP_MIGRATIONS.slice().sort(), readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name).sort());
  for (const required of [BASELINE_MIGRATION]) {
    const bytes = readFileSync(new URL(`${required.name}/migration.sql`, root));
    assert(!bytes.includes(13));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), required.sha256);
  }
  assert.doesNotThrow(() => assertBackupMigrations(ledger(), 0));
});

test('old history, pending, duplicate, replaced, altered checksums and extra migration fail closed', () => {
  for (const rows of [[], null, [...ledger(), ledger()[0]],
    [{migration_name:'0_legacy_baseline',checksum:'a'.repeat(64)}],
    [...ledger(),{migration_name:'unexpected',checksum:'a'.repeat(64)}],
    ledger().map((m,i) => i===0 ? {...m,migration_name:'unexpected'} : m),
    ledger().map(m => ({...m,checksum:'0'.repeat(64)})),
    ledger().map((m,i) => i===0 ? {...m,checksum:'invalid'} : m)]) {
    assert.throws(() => assertBackupMigrations(rows, 0), {code:'MIGRATIONS',status:409});
  }
  assert.throws(() => assertBackupMigrations(ledger(), 1), {code:'MIGRATIONS'});
});
