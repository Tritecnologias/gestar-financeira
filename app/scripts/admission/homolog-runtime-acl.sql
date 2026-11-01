-- A.2.6: only the two new tables. No existing ACL or data is changed.
BEGIN;
DO $$ BEGIN
  IF current_schema() IS DISTINCT FROM 'public' THEN RAISE EXCEPTION 'ADMISSION_REQUIRES_PUBLIC'; END IF;
END $$;
SET LOCAL search_path = public;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $$ BEGIN
  IF current_database() <> 'gestar_homolog_pg18' OR current_user <> 'pg18_homolog_migrator'
    OR session_user <> current_user OR current_setting('application_name') <> 'dez-a2-homolog-h7-h8'
    OR current_schema() IS DISTINCT FROM 'public' OR current_schemas(false) <> ARRAY['public']::name[]
    OR current_setting('server_version_num')::int NOT BETWEEN 180000 AND 189999
    OR (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()) NOT IN ('pg18_homolog_admin','pg18_homolog_migrator')
    OR (SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname='public') NOT IN ('pg_database_owner','pg18_homolog_migrator')
    OR (SELECT count(*) FROM pg_roles WHERE rolname IN ('pg18_homolog_runtime','pg18_homolog_migrator')
      AND rolcanlogin AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) <> 2
    OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member IN (SELECT oid FROM pg_roles WHERE rolname IN ('pg18_homolog_runtime','pg18_homolog_migrator')))
    OR has_database_privilege('pg18_homolog_runtime',current_database(),'CREATE')
    OR has_schema_privilege('pg18_homolog_runtime','public','CREATE')
    OR EXISTS(SELECT 1 FROM unnest(ARRAY['_prisma_migrations','audit_events','term_acceptances','access_owner_events']) t
      WHERE has_table_privilege('pg18_homolog_runtime','public.'||t,'UPDATE,DELETE,TRUNCATE,TRIGGER')
        OR has_any_column_privilege('pg18_homolog_runtime','public.'||t,'UPDATE'))
    OR has_table_privilege('pg18_homolog_runtime','public._prisma_migrations','INSERT')
    OR EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN ('r','p') AND pg_get_userbyid(relowner)<>'pg18_homolog_migrator')
    OR EXISTS(SELECT 1 FROM public._prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL)
    OR (SELECT count(*)<>8 OR count(DISTINCT migration_name)<>8 OR jsonb_object_agg(migration_name,checksum) IS DISTINCT FROM '{"20261027_pg18_baseline":"54c5769aaf48114f52f597d4d79ef8c0057ff02b0a47ec78f466830638ed5ff8","20261027_z_advisory_access":"29581fdb114416878cd5799485a16f6fd846ef34f1754a0321f6de91c29e45b2","20261028_contractual_onboarding":"c214179b8c41fb447266d75831e9602bced487e2c32ba589f7a679e26b021c60","20261029_experiment_invitations":"a1718fa659a22a9a73dbae14deed0073e5d5958d5f485a0dd387268550082d06","20261029_z_experiment_link_recovery":"c7d2a402dad95beaa5c77d1a8303c10a088819941af4566b364547106d8ae284","20261030_tenant_modality":"570f9d7d3e5df8b155ed6931fbf75658730ff5e030e1faf932f3b5ccf9c04934","20261031_contractual_choice_return":"bf1553ef0a2cdaeb4a38f0fb9e1bb8a695dd37d47b306e9c85014e0fcf5e1f28","20261101_admission_foundation":"7a825594c7abe3f0b7b87f07588b4e2b29d47d2c3ad02aeedc3a382f5a0d3551"}'::jsonb FROM public._prisma_migrations)
    OR (SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN ('r','p'))<>44
    OR (SELECT count(*) FROM pg_class WHERE oid IN(to_regclass('public.admissions'),to_regclass('public.admission_challenges')) AND pg_get_userbyid(relowner)='pg18_homolog_migrator')<>2 THEN
    RAISE EXCEPTION 'ADMISSION_HOMOLOG_RUNTIME_ACL_GUARD';
  END IF;
END $$;
REVOKE ALL ON public.admissions, public.admission_challenges FROM PUBLIC, pg18_homolog_runtime;
GRANT SELECT, INSERT ON public.admissions, public.admission_challenges TO pg18_homolog_runtime;
-- Source, target email, issuer, expiry and token material cannot be rewritten by runtime.
GRANT UPDATE(status,verified_challenge_id,email_verified_at,identity_id,tenant_id,membership_id,
  provisioned_at,cancelled_at,cancelled_by_admin_id,cancelled_by_identity_id,cancellation_reason)
  ON public.admissions TO pg18_homolog_runtime;
GRANT UPDATE(status,consumed_at,revoked_at,attempt_count,last_attempt_at,delivery_status)
  ON public.admission_challenges TO pg18_homolog_runtime;
COMMIT;
