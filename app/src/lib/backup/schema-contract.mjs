import { fail } from './format.mjs';

export const SCHEMA_EPOCH = 'PG18 BASELINE V1';
export const BASELINE_MIGRATION = Object.freeze({
  name: '20261027_pg18_baseline',
  sha256: '54c5769aaf48114f52f597d4d79ef8c0057ff02b0a47ec78f466830638ed5ff8',
});
export const ADVISORY_MIGRATION = Object.freeze({ name: '20261027_z_advisory_access', sha256: '29581fdb114416878cd5799485a16f6fd846ef34f1754a0321f6de91c29e45b2' });
export const REQUIRED_MIGRATIONS = Object.freeze([BASELINE_MIGRATION, ADVISORY_MIGRATION]);
export const BACKUP_MIGRATIONS = Object.freeze(REQUIRED_MIGRATIONS.map(m => m.name));

/** A count alone cannot prove the required migrations or the new SQL's checksum. */
export function assertBackupMigrations(migrations, pending) {
  if (pending || !Array.isArray(migrations) || migrations.length !== REQUIRED_MIGRATIONS.length ||
      REQUIRED_MIGRATIONS.some(m => migrations.filter(row => row.migration_name === m.name && row.checksum === m.sha256).length !== 1)) {
    fail('MIGRATIONS', 'Schema fora do contrato PG18 BASELINE V1 + Assessoria. Não restaure backups de outra instalação ou geração.', 409);
  }
}
