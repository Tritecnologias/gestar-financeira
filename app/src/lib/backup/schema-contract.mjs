import { fail } from './format.mjs';

export const VALUE_MIGRATION = {
  name: '20261025_lancamento_valor_nonnegative',
  sha256: '4a1b93478e9afcb4e4c4fd97656122e3e7a98d94473cc2366a02af47907c121f',
};
export const BACKUP_MIGRATIONS = [
  '0_legacy_baseline',
  '20261004_legacy_schema_reconciliation',
  '20261005_access_identity_membership',
  '20261005_access_profiles',
  '20261005_access_profiles_config_compat',
  '20261005_access_profiles_member_compat',
  '20261005_access4b_owner_events',
  '20261005_access4b_permissions',
  '20261005_access5a_versioned_terms',
  '20261005_access5a_z_integrity',
  '20261005_access5b_support_grants',
  '20261005_access5c_audit_events',
  '20261007_access_invitations',
  '20261024_import_operation',
  '20261024_lancamento_optional_fields',
  '20261024_lancamento_revision',
  '20261024_z_tenant_restore_lock',
  VALUE_MIGRATION.name,
];

/** A count alone cannot prove the required migrations or the new SQL's checksum. */
export function assertBackupMigrations(migrations, pending) {
  const names = new Set(migrations.map(m => m.migration_name));
  if (pending || migrations.length !== BACKUP_MIGRATIONS.length ||
      names.size !== BACKUP_MIGRATIONS.length || BACKUP_MIGRATIONS.some(name => !names.has(name)) ||
      migrations.some(m => !/^[0-9a-f]{64}$/.test(m.checksum)) ||
      migrations.find(m => m.migration_name === VALUE_MIGRATION.name)?.checksum !== VALUE_MIGRATION.sha256) {
    fail('MIGRATIONS', 'Schema fora do contrato de backup (18 migrations). Atualize o mecanismo antes de prosseguir.', 409);
  }
}
