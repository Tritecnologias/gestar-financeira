-- Operational ACL, not a migration. psql variables runtime and migrator required.
-- Only new LOCAL/HOMOLOG PG18 databases or explicitly named disposable labs.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SELECT set_config('dez.runtime', :'runtime', true);
SELECT set_config('dez.migrator', :'migrator', true);
DO $$
DECLARE r record; rt text := current_setting('dez.runtime'); mg text := current_setting('dez.migrator');
BEGIN
  IF current_setting('server_version_num')::int NOT BETWEEN 180000 AND 189999
     OR (current_database() NOT IN ('gestar_local_pg18','gestar_homolog_pg18','gestar_vf_dev')
         AND current_database() !~ '^phase10b_[a-z]+$')
     OR rt = mg OR rt !~ '^[a-z][a-z0-9_]+$' OR mg !~ '^[a-z][a-z0-9_]+$' THEN
    RAISE EXCEPTION 'PG18_ACL_ENVIRONMENT_GUARD';
  END IF;
  IF (SELECT count(*) FROM pg_roles WHERE rolname IN(rt,mg) AND NOT
      (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)) <> 2 THEN
    RAISE EXCEPTION 'PG18_ACL_REQUIRES_SEPARATE_RESTRICTED_ROLES';
  END IF;
  IF (SELECT count(*) FROM _prisma_migrations WHERE migration_name='20261027_pg18_baseline'
      AND checksum='54c5769aaf48114f52f597d4d79ef8c0057ff02b0a47ec78f466830638ed5ff8'
      AND finished_at IS NOT NULL AND rolled_back_at IS NULL) <> 1
      OR (SELECT count(*) FROM _prisma_migrations) <> 1 THEN
    RAISE EXCEPTION 'PG18_ACL_LEDGER_GUARD';
  END IF;
  FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
           WHERE n.nspname='public' AND c.relkind IN('r','p') LOOP
    EXECUTE format('ALTER TABLE public.%I OWNER TO %I',r.relname,mg);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I',r.relname,rt);
    IF r.relname='_prisma_migrations' THEN
      EXECUTE format('GRANT SELECT ON public.%I TO %I',r.relname,rt);
    ELSIF r.relname IN('audit_events','access_owner_events','support_grant_events','term_acceptances') THEN
      EXECUTE format('GRANT SELECT,INSERT ON public.%I TO %I',r.relname,rt);
    ELSE
      EXECUTE format('GRANT SELECT,INSERT,UPDATE ON public.%I TO %I',r.relname,rt);
    END IF;
  END LOOP;
  FOR r IN SELECT unnest(ARRAY['areas_negocio','centros_custo','categorias','plano_contas','fornecedores',
     'clientes','dre','dados_bancarios','empresas','pessoas','produto_grupos','produto_tipos','produto_linhas',
     'produtos','produto_sequencias','tarefa_status','tarefas','status_manual_tipos','layouts_colunas',
     'lancamentos','import_operations']) relname LOOP
    EXECUTE format('GRANT DELETE ON public.%I TO %I',r.relname,rt);
  END LOOP;
  FOR r IN SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
           WHERE n.nspname='public' AND t.typtype IN('e','d') LOOP
    EXECUTE format('ALTER TYPE public.%I OWNER TO %I',r.typname,mg);
  END LOOP;
  FOR r IN SELECT p.oid::regprocedure proc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
           WHERE n.nspname='public' AND p.prokind='f' LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO %I',r.proc,mg);
  END LOOP;
  EXECUTE format('ALTER SCHEMA public OWNER TO %I',mg);
  REVOKE CREATE ON SCHEMA public FROM PUBLIC;
  EXECUTE format('GRANT USAGE ON SCHEMA public TO %I',rt);
  EXECUTE format('REVOKE CONNECT,TEMPORARY ON DATABASE %I FROM PUBLIC',current_database());
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO %I,%I',current_database(),rt,mg);
  EXECUTE format('GRANT TEMPORARY ON DATABASE %I TO %I',current_database(),mg);
  EXECUTE format('GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO %I',rt);
  REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
  EXECUTE format('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO %I',rt);
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC',mg);
END $$;
COMMIT;
