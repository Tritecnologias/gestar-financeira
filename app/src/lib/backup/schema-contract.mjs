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
export const EXPERIMENT_LEDGER4 = Object.freeze([...PRE_EXPERIMENT_MIGRATIONS, EXPERIMENT_MIGRATION]);
export const EXPERIMENT_LINK_MIGRATION = Object.freeze({ name: '20261029_z_experiment_link_recovery', sha256: 'c7d2a402dad95beaa5c77d1a8303c10a088819941af4566b364547106d8ae284' });
export const PRE_MODALITY_HOMOLOG_MIGRATIONS = Object.freeze([...EXPERIMENT_LEDGER4, EXPERIMENT_LINK_MIGRATION]);
export const PRODUCTION_EXPERIMENT_MIGRATION = Object.freeze({ name: '20261030_prod_experiment_invitations', sha256: '4c3f8a863f74e2c311cf42d6982be4880aa8f08d4c3812614260e69356a6af6e' });
export const PRE_MODALITY_PRODUCTION_MIGRATIONS = Object.freeze([...PRE_EXPERIMENT_MIGRATIONS, PRODUCTION_EXPERIMENT_MIGRATION]);
export const TENANT_MODALITY_MIGRATION = Object.freeze({ name: '20261030_tenant_modality', sha256: '570f9d7d3e5df8b155ed6931fbf75658730ff5e030e1faf932f3b5ccf9c04934' });
export const PRE_RETURN_HOMOLOG_MIGRATIONS = Object.freeze([...PRE_MODALITY_HOMOLOG_MIGRATIONS, TENANT_MODALITY_MIGRATION]);
export const PRE_RETURN_PRODUCTION_MIGRATIONS = Object.freeze([...PRE_MODALITY_PRODUCTION_MIGRATIONS, TENANT_MODALITY_MIGRATION]);
export const CONTRACTUAL_RETURN_MIGRATION = Object.freeze({ name: '20261031_contractual_choice_return', sha256: 'bf1553ef0a2cdaeb4a38f0fb9e1bb8a695dd37d47b306e9c85014e0fcf5e1f28' });
export const REQUIRED_MIGRATIONS = Object.freeze([...PRE_RETURN_HOMOLOG_MIGRATIONS, CONTRACTUAL_RETURN_MIGRATION]);
export const PRODUCTION_MIGRATIONS = Object.freeze([...PRE_RETURN_PRODUCTION_MIGRATIONS, CONTRACTUAL_RETURN_MIGRATION]);
const APPROVED_LEDGERS = [PRE_EXPERIMENT_MIGRATIONS, EXPERIMENT_LEDGER4, PRE_MODALITY_HOMOLOG_MIGRATIONS, PRE_MODALITY_PRODUCTION_MIGRATIONS, PRE_RETURN_HOMOLOG_MIGRATIONS, PRE_RETURN_PRODUCTION_MIGRATIONS, REQUIRED_MIGRATIONS, PRODUCTION_MIGRATIONS];
export const BACKUP_MIGRATIONS = Object.freeze(REQUIRED_MIGRATIONS.map(m => m.name));

/** A count alone cannot prove the required migrations or the new SQL's checksum. */
function matches(migrations, expected) {
  return Array.isArray(migrations) && migrations.length === expected.length && expected.every(m =>
    migrations.filter(row => row.migration_name === m.name && row.checksum === m.sha256).length === 1);
}
export function assertBackupMigrations(migrations, pending) {
  if (pending || !APPROVED_LEDGERS.some(expected => matches(migrations, expected))) {
    fail('MIGRATIONS', 'Schema fora do contrato PG18 BASELINE V1 + Assessoria + Onboarding Contratual. Não restaure backups de outra instalação ou geração.', 409);
  }
}
// Only the exact, approved additive global pilot changes, excluded from tenant restore.
// Authenticated business backups may move forward within their profile. Restore
// never writes modality/pending state, pilot invitations, access or global keys.
// Reverse restore and all unknown/altered ledgers fail closed. The contractual
// cancellation column changes reference semantics: H7/P6 restore only themselves,
// never convert or re-sign an older backup to invent that state.
export function compatibleBackupMigrations(backup, current) {
  const from = APPROVED_LEDGERS.findIndex(expected => matches(backup, expected));
  const to = APPROVED_LEDGERS.findIndex(expected => matches(current, expected));
  if (from < 0 || to < 0) return false;
  // A real production history is distinct from the pilot. Never cross or reverse profiles.
  return from === to || (from === 0 && [1, 2, 3, 4, 5].includes(to)) ||
    (from === 1 && [2, 4].includes(to)) || (from === 2 && to === 4) || (from === 3 && to === 5);
}
