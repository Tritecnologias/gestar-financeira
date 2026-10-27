import { fail } from './format.mjs';

export const SCHEMA_EPOCH = 'PG18 BASELINE V1';
export const BASELINE_MIGRATION = Object.freeze({
  name: '20261027_pg18_baseline',
  sha256: '54c5769aaf48114f52f597d4d79ef8c0057ff02b0a47ec78f466830638ed5ff8',
});
export const BACKUP_MIGRATIONS = Object.freeze([BASELINE_MIGRATION.name]);

/** A count alone cannot prove the required migrations or the new SQL's checksum. */
export function assertBackupMigrations(migrations, pending) {
  if (pending || !Array.isArray(migrations) || migrations.length !== 1 ||
      migrations[0]?.migration_name !== BASELINE_MIGRATION.name ||
      migrations[0]?.checksum !== BASELINE_MIGRATION.sha256) {
    fail('MIGRATIONS', 'Schema fora do contrato PG18 BASELINE V1. Não restaure backups de outra instalação ou geração.', 409);
  }
}
