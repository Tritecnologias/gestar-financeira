BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = public, pg_catalog;
DO $$
DECLARE n integer;
BEGIN
  IF current_setting('server_version_num')::int NOT BETWEEN 180000 AND 189999 THEN
    RAISE EXCEPTION 'TENANT_MODALITY_REQUIRES_PG18';
  END IF;
  SELECT count(*) INTO n FROM public._prisma_migrations WHERE migration_name<>'20261030_tenant_modality';
  IF EXISTS(SELECT 1 FROM public._prisma_migrations WHERE migration_name<>'20261030_tenant_modality' AND (finished_at IS NULL OR rolled_back_at IS NOT NULL))
    OR EXISTS(SELECT 1 FROM public._prisma_migrations WHERE migration_name<>'20261030_tenant_modality' AND (migration_name,checksum) NOT IN (
      ('20261027_pg18_baseline','54c5769aaf48114f52f597d4d79ef8c0057ff02b0a47ec78f466830638ed5ff8'),
      ('20261027_z_advisory_access','29581fdb114416878cd5799485a16f6fd846ef34f1754a0321f6de91c29e45b2'),
      ('20261028_contractual_onboarding','c214179b8c41fb447266d75831e9602bced487e2c32ba589f7a679e26b021c60'),
      ('20261029_experiment_invitations','a1718fa659a22a9a73dbae14deed0073e5d5958d5f485a0dd387268550082d06'),
      ('20261029_z_experiment_link_recovery','c7d2a402dad95beaa5c77d1a8303c10a088819941af4566b364547106d8ae284'),
      ('20261030_prod_experiment_invitations','4c3f8a863f74e2c311cf42d6982be4880aa8f08d4c3812614260e69356a6af6e')))
    OR (SELECT count(DISTINCT migration_name) FROM public._prisma_migrations WHERE migration_name<>'20261030_tenant_modality')<>n
    OR (SELECT count(*) FROM public._prisma_migrations WHERE migration_name IN('20261027_pg18_baseline','20261027_z_advisory_access','20261028_contractual_onboarding'))<>3
    OR NOT ((n=5 AND NOT EXISTS(SELECT 1 FROM public._prisma_migrations WHERE migration_name='20261030_prod_experiment_invitations'))
      OR (n=4 AND EXISTS(SELECT 1 FROM public._prisma_migrations WHERE migration_name='20261030_prod_experiment_invitations'))) THEN
    RAISE EXCEPTION 'TENANT_MODALITY_REQUIRES_EXACT_HOMOLOG5_OR_PRODUCTION4';
  END IF;
  IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='tenants'
    AND column_name IN('modalidade','escolha_modalidade_pendente')) THEN
    RAISE EXCEPTION 'TENANT_MODALITY_COLUMNS_ALREADY_EXIST';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
    WHERE i.indrelid='public.tenants'::regclass AND c.oid=to_regclass('public.tenants_email_key')
    AND i.indisunique AND i.indisvalid AND i.indnkeyatts=1 AND i.indnatts=1
    AND i.indexprs IS NULL AND i.indpred IS NULL AND pg_get_indexdef(i.indexrelid,1,true)='email')
    OR EXISTS(SELECT 1 FROM pg_constraint WHERE conindid=to_regclass('public.tenants_email_key'))
    OR EXISTS(SELECT 1 FROM pg_constraint WHERE contype='f' AND confrelid='public.tenants'::regclass
      AND (SELECT attnum FROM pg_attribute WHERE attrelid='public.tenants'::regclass AND attname='email')=ANY(confkey)) THEN
    RAISE EXCEPTION 'UNEXPECTED_TENANT_EMAIL_IDENTIFIER_DEPENDENCY';
  END IF;
END $$;
ALTER TABLE public.tenants
  ADD COLUMN modalidade varchar(2),
  ADD COLUMN escolha_modalidade_pendente boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT tenants_modalidade_check CHECK (modalidade IS NULL OR modalidade IN('PF','PJ')),
  ADD CONSTRAINT tenants_modalidade_pending_check CHECK (NOT escolha_modalidade_pendente OR modalidade IS NULL);
-- Existing tuples retain the initial constant false. Only future inserts default true.
ALTER TABLE public.tenants ALTER COLUMN escolha_modalidade_pendente SET DEFAULT true;
DROP INDEX public.tenants_email_key;
-- No UPDATE/backfill: old tenants remain unclassified and do not enter this gate.
-- AuthIdentity.email, Tenant.id/slug and all membership/FK authorization keys stay intact.
COMMIT;
