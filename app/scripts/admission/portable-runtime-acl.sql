-- One immutable Admission evolution; independent connection intent and catalog proof per environment.
BEGIN;
DO $$ BEGIN
  IF current_schema() IS DISTINCT FROM 'public' THEN RAISE EXCEPTION 'ADMISSION_REQUIRES_PUBLIC'; END IF;
END $$;
SET LOCAL search_path = public;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
DO $$ DECLARE target_db text; mg text; rt text; owners text[]; expected jsonb; expected_count integer;
  history jsonb; completed integer; unique_names integer;
BEGIN
  CASE current_setting('application_name')
    WHEN 'dez-a2-local-h7-h8' THEN target_db:='special_invite_lab'; mg:='a2_migrator'; rt:='a2_runtime';
      owners:=ARRAY['a2_migrator']; expected:='{"20261027_pg18_baseline":"54c5769aaf48114f52f597d4d79ef8c0057ff02b0a47ec78f466830638ed5ff8","20261027_z_advisory_access":"29581fdb114416878cd5799485a16f6fd846ef34f1754a0321f6de91c29e45b2","20261028_contractual_onboarding":"c214179b8c41fb447266d75831e9602bced487e2c32ba589f7a679e26b021c60","20261029_experiment_invitations":"a1718fa659a22a9a73dbae14deed0073e5d5958d5f485a0dd387268550082d06","20261029_z_experiment_link_recovery":"c7d2a402dad95beaa5c77d1a8303c10a088819941af4566b364547106d8ae284","20261030_tenant_modality":"570f9d7d3e5df8b155ed6931fbf75658730ff5e030e1faf932f3b5ccf9c04934","20261031_contractual_choice_return":"bf1553ef0a2cdaeb4a38f0fb9e1bb8a695dd37d47b306e9c85014e0fcf5e1f28","20261101_admission_foundation":"881bef4742e49e758cf4df33b6533181c9b42da167d3c37c5b82ef8a57fb2993"}'::jsonb; expected_count:=8;
    WHEN 'dez-a2-homolog-h7-h8' THEN target_db:='gestar_homolog_pg18'; mg:='pg18_homolog_migrator'; rt:='pg18_homolog_runtime';
      owners:=ARRAY['pg18_homolog_admin','pg18_homolog_migrator']; expected:='{"20261027_pg18_baseline":"54c5769aaf48114f52f597d4d79ef8c0057ff02b0a47ec78f466830638ed5ff8","20261027_z_advisory_access":"29581fdb114416878cd5799485a16f6fd846ef34f1754a0321f6de91c29e45b2","20261028_contractual_onboarding":"c214179b8c41fb447266d75831e9602bced487e2c32ba589f7a679e26b021c60","20261029_experiment_invitations":"a1718fa659a22a9a73dbae14deed0073e5d5958d5f485a0dd387268550082d06","20261029_z_experiment_link_recovery":"c7d2a402dad95beaa5c77d1a8303c10a088819941af4566b364547106d8ae284","20261030_tenant_modality":"570f9d7d3e5df8b155ed6931fbf75658730ff5e030e1faf932f3b5ccf9c04934","20261031_contractual_choice_return":"bf1553ef0a2cdaeb4a38f0fb9e1bb8a695dd37d47b306e9c85014e0fcf5e1f28","20261101_admission_foundation":"881bef4742e49e758cf4df33b6533181c9b42da167d3c37c5b82ef8a57fb2993"}'::jsonb; expected_count:=8;
    WHEN 'dez-a2-production-p6-p7' THEN target_db:='gestar_prod_pg18'; mg:='pg18_prod_migrator'; rt:='pg18_prod_runtime';
      owners:=ARRAY['postgres','pg18_prod_migrator']; expected:='{"20261027_pg18_baseline":"54c5769aaf48114f52f597d4d79ef8c0057ff02b0a47ec78f466830638ed5ff8","20261027_z_advisory_access":"29581fdb114416878cd5799485a16f6fd846ef34f1754a0321f6de91c29e45b2","20261028_contractual_onboarding":"c214179b8c41fb447266d75831e9602bced487e2c32ba589f7a679e26b021c60","20261030_prod_experiment_invitations":"4c3f8a863f74e2c311cf42d6982be4880aa8f08d4c3812614260e69356a6af6e","20261030_tenant_modality":"570f9d7d3e5df8b155ed6931fbf75658730ff5e030e1faf932f3b5ccf9c04934","20261031_contractual_choice_return":"bf1553ef0a2cdaeb4a38f0fb9e1bb8a695dd37d47b306e9c85014e0fcf5e1f28","20261101_admission_foundation":"881bef4742e49e758cf4df33b6533181c9b42da167d3c37c5b82ef8a57fb2993"}'::jsonb; expected_count:=7;
    ELSE RAISE EXCEPTION 'ADMISSION_EXPLICIT_DEPLOYMENT_AUTHORIZATION_REQUIRED';
  END CASE;
  SELECT jsonb_object_agg(migration_name,checksum),count(*),count(DISTINCT migration_name)
    INTO history,completed,unique_names FROM public._prisma_migrations
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;
  IF current_database() <> target_db OR current_user <> mg OR session_user <> current_user
    OR current_schema() IS DISTINCT FROM 'public' OR current_schemas(false) <> ARRAY['public']::name[]
    OR current_setting('server_version_num')::int NOT BETWEEN 180000 AND 189999
    OR (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()) <> ALL(owners)
    OR (SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname='public') NOT IN ('pg_database_owner',mg)
    OR (SELECT count(*) FROM pg_roles WHERE rolname IN (rt,mg)
      AND rolcanlogin AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) <> 2
    OR EXISTS(SELECT 1 FROM pg_auth_members WHERE member IN (SELECT oid FROM pg_roles WHERE rolname IN(rt,mg)))
    OR has_database_privilege(rt,current_database(),'CREATE') OR has_schema_privilege(rt,'public','CREATE')
    OR EXISTS(SELECT 1 FROM unnest(ARRAY['_prisma_migrations','audit_events','term_acceptances','access_owner_events']) t
      WHERE has_table_privilege(rt,'public.'||t,'UPDATE,DELETE,TRUNCATE,TRIGGER') OR has_any_column_privilege(rt,'public.'||t,'UPDATE'))
    OR has_table_privilege(rt,'public._prisma_migrations','INSERT')
    OR EXISTS(SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN('r','p') AND pg_get_userbyid(relowner)<>mg)
    OR EXISTS(SELECT 1 FROM public._prisma_migrations WHERE rolled_back_at IS NOT NULL
      OR (finished_at IS NULL))
    OR (SELECT count(*) FROM public._prisma_migrations WHERE finished_at IS NULL)>0
    OR completed<>expected_count OR completed<>unique_names OR history IS DISTINCT FROM expected
    OR (SELECT count(*) FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN('r','p'))<>44
    OR (SELECT count(*) FROM pg_class WHERE oid IN(to_regclass('public.admissions'),to_regclass('public.admission_challenges')) AND pg_get_userbyid(relowner)=mg)<>2 THEN
    RAISE EXCEPTION 'ADMISSION_AUTHORIZED_RUNTIME_ACL_GUARD';
  END IF;
  EXECUTE format('REVOKE ALL ON public.admissions,public.admission_challenges FROM PUBLIC,%I',rt);
  EXECUTE format('GRANT SELECT,INSERT ON public.admissions,public.admission_challenges TO %I',rt);
  EXECUTE format('GRANT UPDATE(status,verified_challenge_id,email_verified_at,identity_id,tenant_id,membership_id,provisioned_at,cancelled_at,cancelled_by_admin_id,cancelled_by_identity_id,cancellation_reason) ON public.admissions TO %I',rt);
  EXECUTE format('GRANT UPDATE(status,consumed_at,revoked_at,attempt_count,last_attempt_at,delivery_status) ON public.admission_challenges TO %I',rt);
END $$;
COMMIT;
