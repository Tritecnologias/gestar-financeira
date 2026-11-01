-- A.2.1 LOCAL only. Run as the dedicated migrator, after the exact migration.
BEGIN;
SET LOCAL search_path = public, pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $$ DECLARE history jsonb; completed integer; unique_names integer;
BEGIN
  SELECT jsonb_object_agg(migration_name,checksum),count(*),count(DISTINCT migration_name)
    INTO history,completed,unique_names FROM public._prisma_migrations
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;
  IF current_database() !~ '^a2_[a-z0-9_]+$' OR current_user <> 'a2_migrator'
    OR current_setting('server_version_num')::int NOT BETWEEN 180000 AND 189999
    OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='a2_runtime' AND NOT
      (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls OR rolinherit))
    OR pg_has_role('a2_runtime','a2_migrator','MEMBER')
    OR has_database_privilege('a2_runtime',current_database(),'CREATE')
    OR has_schema_privilege('a2_runtime','public','CREATE')
    OR EXISTS(SELECT 1 FROM public._prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL)
    OR history IS NULL OR completed<>unique_names
    OR NOT ((completed=8 AND history='{"20261027_pg18_baseline":"54c5769aaf48114f52f597d4d79ef8c0057ff02b0a47ec78f466830638ed5ff8","20261027_z_advisory_access":"29581fdb114416878cd5799485a16f6fd846ef34f1754a0321f6de91c29e45b2","20261028_contractual_onboarding":"c214179b8c41fb447266d75831e9602bced487e2c32ba589f7a679e26b021c60","20261029_experiment_invitations":"a1718fa659a22a9a73dbae14deed0073e5d5958d5f485a0dd387268550082d06","20261029_z_experiment_link_recovery":"c7d2a402dad95beaa5c77d1a8303c10a088819941af4566b364547106d8ae284","20261030_tenant_modality":"570f9d7d3e5df8b155ed6931fbf75658730ff5e030e1faf932f3b5ccf9c04934","20261031_contractual_choice_return":"bf1553ef0a2cdaeb4a38f0fb9e1bb8a695dd37d47b306e9c85014e0fcf5e1f28","20261101_admission_foundation":"46d7bd07acb5fc075e824cf064de3fdc655ea8e85fc33f202f95c6ded965874b"}'::jsonb)
      OR (completed=7 AND history='{"20261027_pg18_baseline":"54c5769aaf48114f52f597d4d79ef8c0057ff02b0a47ec78f466830638ed5ff8","20261027_z_advisory_access":"29581fdb114416878cd5799485a16f6fd846ef34f1754a0321f6de91c29e45b2","20261028_contractual_onboarding":"c214179b8c41fb447266d75831e9602bced487e2c32ba589f7a679e26b021c60","20261030_prod_experiment_invitations":"4c3f8a863f74e2c311cf42d6982be4880aa8f08d4c3812614260e69356a6af6e","20261030_tenant_modality":"570f9d7d3e5df8b155ed6931fbf75658730ff5e030e1faf932f3b5ccf9c04934","20261031_contractual_choice_return":"bf1553ef0a2cdaeb4a38f0fb9e1bb8a695dd37d47b306e9c85014e0fcf5e1f28","20261101_admission_foundation":"46d7bd07acb5fc075e824cf064de3fdc655ea8e85fc33f202f95c6ded965874b"}'::jsonb))
    OR NOT EXISTS(SELECT 1 FROM public._prisma_migrations
      WHERE migration_name='20261101_admission_foundation'
        AND checksum='46d7bd07acb5fc075e824cf064de3fdc655ea8e85fc33f202f95c6ded965874b'
        AND finished_at IS NOT NULL AND rolled_back_at IS NULL)
    OR (SELECT count(*) FROM pg_class c WHERE c.oid IN('public.admissions'::regclass,'public.admission_challenges'::regclass)
      AND pg_get_userbyid(c.relowner)='a2_migrator') <> 2 THEN
    RAISE EXCEPTION 'ADMISSION_LOCAL_RUNTIME_ACL_GUARD';
  END IF;
END $$;
REVOKE ALL ON public.admissions, public.admission_challenges FROM PUBLIC, a2_runtime;
GRANT SELECT, INSERT ON public.admissions, public.admission_challenges TO a2_runtime;
-- Source, target email, issuer, expiry and token material cannot be rewritten by runtime.
GRANT UPDATE(status,verified_challenge_id,email_verified_at,identity_id,tenant_id,membership_id,
  provisioned_at,cancelled_at,cancelled_by_admin_id,cancelled_by_identity_id,cancellation_reason)
  ON public.admissions TO a2_runtime;
GRANT UPDATE(status,consumed_at,revoked_at,attempt_count,last_attempt_at,delivery_status)
  ON public.admission_challenges TO a2_runtime;
COMMIT;
