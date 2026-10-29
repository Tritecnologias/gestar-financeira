import { fail } from './format.mjs';

export const SCHEMA_EPOCH = 'PG18 BASELINE V1';
export const BASELINE_MIGRATION = Object.freeze({
  name: '20261027_pg18_baseline',
  sha256: '54c5769aaf48114f52f597d4d79ef8c0057ff02b0a47ec78f466830638ed5ff8',
});
export const ADVISORY_MIGRATION = Object.freeze({ name: '20261027_z_advisory_access', sha256: '29581fdb114416878cd5799485a16f6fd846ef34f1754a0321f6de91c29e45b2' });
export const CONTRACTUAL_ONBOARDING_MIGRATION = Object.freeze({ name: '20261028_contractual_onboarding', sha256: 'c214179b8c41fb447266d75831e9602bced487e2c32ba589f7a679e26b021c60' });
export const EXPERIMENT_MIGRATION = Object.freeze({ name: '20261029_experiment_invitations', sha256: 'a1718fa659a22a9a73dbae14deed0073e5d5958d5f485a0dd387268550082d06' });
export const PRE_EXPERIMENT_MIGRATIONS = Object.freeze([BASELINE_MIGRATION, ADVISORY_MIGRATION, CONTRACTUAL_ONBOARDING_MIGRATION]);
export const REQUIRED_MIGRATIONS = Object.freeze([...PRE_EXPERIMENT_MIGRATIONS, EXPERIMENT_MIGRATION]);
export const BACKUP_MIGRATIONS = Object.freeze(REQUIRED_MIGRATIONS.map(m => m.name));

/** A count alone cannot prove the required migrations or the new SQL's checksum. */
function matches(migrations, expected) {
  return Array.isArray(migrations) && migrations.length === expected.length && expected.every(m =>
    migrations.filter(row => row.migration_name === m.name && row.checksum === m.sha256).length === 1);
}
export function assertBackupMigrations(migrations, pending) {
  if (pending || !matches(migrations, REQUIRED_MIGRATIONS) && !matches(migrations, PRE_EXPERIMENT_MIGRATIONS)) {
    fail('MIGRATIONS', 'Schema fora do contrato PG18 BASELINE V1 + Assessoria + Onboarding Contratual. Não restaure backups de outra instalação ou geração.', 409);
  }
}
// Exactly one additive global table, excluded from tenant restore. No generic prefix/version bypass.
// Forward restore of an authentic ledger3 tenant backup into ledger4 preserves pilot state.
// Reverse restore and all unknown/altered ledgers fail closed.
export function compatibleBackupMigrations(backup, current) {
  return matches(current, REQUIRED_MIGRATIONS) && (matches(backup, REQUIRED_MIGRATIONS) || matches(backup, PRE_EXPERIMENT_MIGRATIONS)) ||
    matches(current, PRE_EXPERIMENT_MIGRATIONS) && matches(backup, PRE_EXPERIMENT_MIGRATIONS);
}
