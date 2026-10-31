BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = public, pg_catalog;
DO $$ DECLARE history jsonb; completed integer; unique_names integer;
BEGIN
  SELECT jsonb_object_agg(migration_name,checksum),count(*),count(DISTINCT migration_name)
    INTO history,completed,unique_names FROM public._prisma_migrations
    WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL;
  IF current_setting('server_version_num')::int NOT BETWEEN 180000 AND 189999
    OR EXISTS (SELECT 1 FROM public._prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL)
    OR completed <> unique_names
    OR history IS NULL
    OR NOT ((completed=5 AND history='{"20261027_pg18_baseline":"54c5769aaf48114f52f597d4d79ef8c0057ff02b0a47ec78f466830638ed5ff8","20261027_z_advisory_access":"29581fdb114416878cd5799485a16f6fd846ef34f1754a0321f6de91c29e45b2","20261028_contractual_onboarding":"c214179b8c41fb447266d75831e9602bced487e2c32ba589f7a679e26b021c60","20261030_prod_experiment_invitations":"4c3f8a863f74e2c311cf42d6982be4880aa8f08d4c3812614260e69356a6af6e","20261030_tenant_modality":"570f9d7d3e5df8b155ed6931fbf75658730ff5e030e1faf932f3b5ccf9c04934"}'::jsonb)
         OR (completed=6 AND history='{"20261027_pg18_baseline":"54c5769aaf48114f52f597d4d79ef8c0057ff02b0a47ec78f466830638ed5ff8","20261027_z_advisory_access":"29581fdb114416878cd5799485a16f6fd846ef34f1754a0321f6de91c29e45b2","20261028_contractual_onboarding":"c214179b8c41fb447266d75831e9602bced487e2c32ba589f7a679e26b021c60","20261029_experiment_invitations":"a1718fa659a22a9a73dbae14deed0073e5d5958d5f485a0dd387268550082d06","20261029_z_experiment_link_recovery":"c7d2a402dad95beaa5c77d1a8303c10a088819941af4566b364547106d8ae284","20261030_tenant_modality":"570f9d7d3e5df8b155ed6931fbf75658730ff5e030e1faf932f3b5ccf9c04934"}'::jsonb))
    OR to_regclass('public.tenant_contractual_responsibles') IS NULL
    OR EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public'
      AND table_name='tenant_contractual_responsibles' AND column_name='provisional_cancelled_at') THEN
    RAISE EXCEPTION 'CONTRACTUAL_RETURN_REQUIRES_EXACT_PG18_P5_OR_H6';
  END IF;
END $$;
-- Additive state only. No backfill, DELETE, privileged routine or ACL change.
-- Keep every existing onboarding CHECK and historical acceptance intact.
ALTER TABLE public.tenant_contractual_responsibles
  ADD COLUMN provisional_cancelled_at timestamp(3);
COMMIT;
