-- FASE 2A ordering barrier: must run BEFORE the immutable 20261005 ACCESS lineage.
-- The 20261004 prefix is dependency order, not the creation date (2026-10-23).
-- No row backfill, identity creation or access grant. See docs/FASE2A-SCHEMA-RECONCILIATION.md.
BEGIN;
SET LOCAL search_path=public,pg_catalog;
SET LOCAL timezone='UTC';
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='5min';
CREATE FUNCTION pg_temp.phase2a_catalog() RETURNS jsonb LANGUAGE sql STABLE AS $catalog$
-- Structural inventory only. No rows, credentials or sequence current values.
-- Use a READ ONLY transaction and search_path=public,pg_catalog when auditing.
SELECT jsonb_build_object(
  'columns', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY tab COLLATE "C", col COLLATE "C"),'[]') FROM (
    SELECT c.relname tab,a.attname col,format_type(a.atttypid,a.atttypmod) type,
      a.attnotnull AS required,pg_get_expr(d.adbin,d.adrelid) AS default_expr,
      a.attidentity AS identity,a.attgenerated AS generated
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
    WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname<>'_prisma_migrations' AND a.attnum>0 AND NOT a.attisdropped
  ) x),
  'constraints', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY tab COLLATE "C", name COLLATE "C"),'[]') FROM (
    SELECT c.relname tab,con.conname name,con.contype type,pg_get_constraintdef(con.oid) definition,con.convalidated validated
    FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname<>'_prisma_migrations'
  ) x),
  'indexes', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY tablename COLLATE "C", indexname COLLATE "C"),'[]') FROM (
    SELECT tablename,indexname,indexdef FROM pg_indexes WHERE schemaname='public' AND tablename<>'_prisma_migrations'
  ) x),
  'triggers', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY tab COLLATE "C", name COLLATE "C"),'[]') FROM (
    SELECT c.relname tab,t.tgname name,t.tgenabled enabled,pg_get_triggerdef(t.oid) definition
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND NOT t.tgisinternal
  ) x),
  'functions', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY name COLLATE "C", args COLLATE "C"),'[]') FROM (
    SELECT p.proname name,pg_get_function_identity_arguments(p.oid) args,pg_get_functiondef(p.oid) definition
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f'
      AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e')
  ) x),
  'enums', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY name COLLATE "C", position),'[]') FROM (
    SELECT t.typname name,e.enumlabel label,e.enumsortorder position FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid
    JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public'
  ) x),
  'policies', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY tablename COLLATE "C", policyname COLLATE "C"),'[]') FROM (SELECT * FROM pg_policies WHERE schemaname='public') x),
  'relations', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY name COLLATE "C"),'[]') FROM (
    SELECT c.relname name,c.relkind kind,c.relrowsecurity rls,c.relforcerowsecurity force_rls
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
      AND c.relkind IN ('r','p','v','m','f') AND c.relname<>'_prisma_migrations'
  ) x),
  'views', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY name COLLATE "C"),'[]') FROM (
    SELECT c.relname name,pg_get_viewdef(c.oid) definition,c.reloptions options
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('v','m')
  ) x),
  'sequences', (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY name COLLATE "C"),'[]') FROM (
    SELECT c.relname name,format_type(s.seqtypid,NULL) type,s.seqstart,s.seqincrement,s.seqmax,s.seqmin,s.seqcache,s.seqcycle
    FROM pg_sequence s JOIN pg_class c ON c.oid=s.seqrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
  ) x)
);

$catalog$;
DO $reconcile$
DECLARE
  signature text; r record; after_count bigint; after_digest text; view_owner text;
  view_acl jsonb; restored_acl jsonb; reader_had_select boolean;
BEGIN
  IF current_schema() <> 'public' THEN RAISE EXCEPTION 'PHASE2A_SCHEMA_GUARD'; END IF;
  -- Ignore only the current engine-owned in-progress entry; never resolve/falsify its ledger.
  IF EXISTS (SELECT 1 FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL
      AND migration_name <> '20261004_legacy_schema_reconciliation') THEN
    RAISE EXCEPTION 'PHASE2A_UNRESOLVED_MIGRATION';
  END IF;
  IF EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name <> '20261004_legacy_schema_reconciliation'
    AND NOT (
      (migration_name='0_legacy_baseline' AND checksum='ab4c8a4084dc6c6a15ced50fca5e98593a4207c634831a6871277e89fb2197c4') OR
      (migration_name='20261005_access4b_owner_events' AND checksum='489810946c6c29ea6193f66458d643269d7ab90c8a952ecd6b76a8665cb12d2c') OR
      (migration_name='20261005_access4b_permissions' AND checksum='4bca54cfc0c4005eafb5a5ac1c07df9c87efcd7c94baa73f7a1fa32da3744132') OR
      (migration_name='20261005_access5a_versioned_terms' AND checksum='2f3c0adf3bc36b768a7a6a0da1e30c4f872f65ff4347f057dcf77ede3a25aaa7') OR
      (migration_name='20261005_access5a_z_integrity' AND checksum='57d4ab16fbfd6d6105a572ad054750ffd70948c0377cf6c88e8dd2cd68ab9b25') OR
      (migration_name='20261005_access5b_support_grants' AND checksum='8c4c4decb6bf2ceef501f22eb427e5459e32f4c3f92265481ac0211477e4525a') OR
      (migration_name='20261005_access5c_audit_events' AND checksum='82eca9c6a03cce6668b1fc5c3d550d8d5f22b8e309fc6a3e5f5ffe652db08abe') OR
      (migration_name='20261005_access_identity_membership' AND checksum='5f6f45904b43a3fe9986136cf01540537063c038c5fb76129096112ca87902d5') OR
      (migration_name='20261005_access_profiles' AND checksum='46ad7fec6f44573effe0f656ee716e05247bdef2a548a4def128c44bfa1ea0f7') OR
      (migration_name='20261005_access_profiles_config_compat' AND checksum='a8a5387549c0895ca3e692bf4dc2b3053acccf583f7612f78c9b32a9bf79427f') OR
      (migration_name='20261005_access_profiles_member_compat' AND checksum='48353336eacca5d3e3597c1167245d08e445adc61ee7ab1e961bb6632506bd46') OR
      (migration_name='20261007_access_invitations' AND checksum='5d66dcc1a8f6e8024befa768d2c0de4b52eae52808a7880094316f463487bcb7')
    )) THEN RAISE EXCEPTION 'PHASE2A_UNKNOWN_MIGRATION_OR_CHECKSUM'; END IF;
  IF NOT EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name='0_legacy_baseline' AND finished_at IS NOT NULL AND rolled_back_at IS NULL) THEN
    RAISE EXCEPTION 'PHASE2A_BASELINE_LEDGER_REQUIRED';
  END IF;
  -- Prevent concurrent application writes and catalog drift through the entire transaction.
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'_prisma_migrations' ORDER BY tablename COLLATE "C" LOOP
    EXECUTE format('LOCK TABLE public.%I IN ACCESS EXCLUSIVE MODE',r.tablename);
  END LOOP;
  signature := md5(pg_temp.phase2a_catalog()::text);
  -- Exact known fresh baseline or fully migrated HOMO: validated no-op, preserving existing ACCESS.
  IF signature IN ('5adf61f6f41e6028cff1305e3baa7a42','bc5eaf3cf5026cbf00f2dbfab8ef833d','1eef3f2d2ddb08d2a6a5cacb4c067944','473c918a3f059a4a410c6702c564fa56') THEN
    RETURN;
  END IF;
  IF signature <> '0369b3ae642f17e376aee28b8c291277' THEN
    RAISE EXCEPTION 'PHASE2A_UNRECOGNIZED_CATALOG: audit again, do not bypass guard';
  END IF;
  CREATE TEMP TABLE phase2a_preservation(tab text, projection text, row_count bigint, digest text) ON COMMIT DROP;
  INSERT INTO phase2a_preservation SELECT 'areas_negocio','"ativo","codigo","criado_em","id","nome","tenant_id"',count(*),md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' ORDER BY x.id::text COLLATE "C"),'')) FROM (SELECT "ativo","codigo","criado_em","id","nome","tenant_id" FROM "areas_negocio") x;
  INSERT INTO phase2a_preservation SELECT 'categorias','"ativo","codigo","criado_em","id","nome","tenant_id","tipo"',count(*),md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' ORDER BY x.id::text COLLATE "C"),'')) FROM (SELECT "ativo","codigo","criado_em","id","nome","tenant_id","tipo" FROM "categorias") x;
  INSERT INTO phase2a_preservation SELECT 'centros_custo','"area_id","ativo","codigo","criado_em","id","nome","tenant_id"',count(*),md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' ORDER BY x.id::text COLLATE "C"),'')) FROM (SELECT "area_id","ativo","codigo","criado_em","id","nome","tenant_id" FROM "centros_custo") x;
  INSERT INTO phase2a_preservation SELECT 'clientes','"ativo","codigo","criado_em","documento","email","endereco","id","nome","telefone","tenant_id"',count(*),md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' ORDER BY x.id::text COLLATE "C"),'')) FROM (SELECT "ativo","codigo","criado_em","documento","email","endereco","id","nome","telefone","tenant_id" FROM "clientes") x;
  INSERT INTO phase2a_preservation SELECT 'dados_bancarios','"agencia","ativo","banco","conta","criado_em","id","tenant_id","tipo","titular"',count(*),md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' ORDER BY x.id::text COLLATE "C"),'')) FROM (SELECT "agencia","ativo","banco","conta","criado_em","id","tenant_id","tipo","titular" FROM "dados_bancarios") x;
  INSERT INTO phase2a_preservation SELECT 'dre','"ativo","codigo","criado_em","id","nome","ordem","tenant_id"',count(*),md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' ORDER BY x.id::text COLLATE "C"),'')) FROM (SELECT "ativo","codigo","criado_em","id","nome","ordem","tenant_id" FROM "dre") x;
  INSERT INTO phase2a_preservation SELECT 'empresas','"cep","cidade","cnpj","criado_em","data_fundacao","email","endereco","estado","id","insc_estadual","nome_fantasia","porte","razao_social","segmento","telefone","tenant_id"',count(*),md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' ORDER BY x.id::text COLLATE "C"),'')) FROM (SELECT "cep","cidade","cnpj","criado_em","data_fundacao","email","endereco","estado","id","insc_estadual","nome_fantasia","porte","razao_social","segmento","telefone","tenant_id" FROM "empresas") x;
  INSERT INTO phase2a_preservation SELECT 'fornecedores','"ativo","codigo","criado_em","id","nome","tenant_id"',count(*),md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' ORDER BY x.id::text COLLATE "C"),'')) FROM (SELECT "ativo","codigo","criado_em","id","nome","tenant_id" FROM "fornecedores") x;
  INSERT INTO phase2a_preservation SELECT 'importacoes','"criado_em","erros","id","linhas_erro","linhas_ok","nome_arquivo","tenant_id","total_linhas","usuario_id"',count(*),md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' ORDER BY x.id::text COLLATE "C"),'')) FROM (SELECT "criado_em","erros","id","linhas_erro","linhas_ok","nome_arquivo","tenant_id","total_linhas","usuario_id" FROM "importacoes") x;
  INSERT INTO phase2a_preservation SELECT 'lancamentos','"anotacao","atualizado_em","banco","categoria","centro_custo","cont","conta_id","criado_em","criado_por","data_emissao","data_evento","data_lanc","data_pagamento","data_venc_original","data_venc_plano","descricao","dre","fantasia_padrao","fornecedor","fornecedor_id","id","importado","importado_em","metadados","referencia","seq","status","status_extrato","status_manual","tenant_id","tipo","valor","valor_previsto"',count(*),md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' ORDER BY x.id::text COLLATE "C"),'')) FROM (SELECT "anotacao","atualizado_em","banco","categoria","centro_custo","cont","conta_id","criado_em","criado_por","data_emissao","data_evento","data_lanc","data_pagamento","data_venc_original","data_venc_plano","descricao","dre","fantasia_padrao","fornecedor","fornecedor_id","id","importado","importado_em","metadados","referencia","seq","status","status_extrato","status_manual","tenant_id","tipo","valor","valor_previsto" FROM "lancamentos") x;
  INSERT INTO phase2a_preservation SELECT 'layouts_colunas','"atualizado_em","colunas","criado_em","id","is_default","nome","tenant_id","usuario_id"',count(*),md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' ORDER BY x.id::text COLLATE "C"),'')) FROM (SELECT "atualizado_em","colunas","criado_em","id","is_default","nome","tenant_id","usuario_id" FROM "layouts_colunas") x;
  INSERT INTO phase2a_preservation SELECT 'pessoas','"ativo","cargo","codigo","criado_em","data_admissao","departamento","documento","email","id","nome","salario","telefone","tenant_id"',count(*),md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' ORDER BY x.id::text COLLATE "C"),'')) FROM (SELECT "ativo","cargo","codigo","criado_em","data_admissao","departamento","documento","email","id","nome","salario","telefone","tenant_id" FROM "pessoas") x;
  INSERT INTO phase2a_preservation SELECT 'plano_contas','"ativo","codigo","criado_em","descricao","id","pai_id","tenant_id","tipo"',count(*),md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' ORDER BY x.id::text COLLATE "C"),'')) FROM (SELECT "ativo","codigo","criado_em","descricao","id","pai_id","tenant_id","tipo" FROM "plano_contas") x;
  INSERT INTO phase2a_preservation SELECT 'produtos','"ativo","categoria","codigo","criado_em","id","nome","preco_custo","preco_venda","tenant_id","tipo","unidade"',count(*),md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' ORDER BY x.id::text COLLATE "C"),'')) FROM (SELECT "ativo","categoria","codigo","criado_em","id","nome","preco_custo","preco_venda","tenant_id","tipo","unidade" FROM "produtos") x;
  INSERT INTO phase2a_preservation SELECT 'status_manual_tipos','"ativo","codigo","cor","id","nome","ordem","tenant_id"',count(*),md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' ORDER BY x.id::text COLLATE "C"),'')) FROM (SELECT "ativo","codigo","cor","id","nome","ordem","tenant_id" FROM "status_manual_tipos") x;
  INSERT INTO phase2a_preservation SELECT 'tarefa_status','"cor","id","nome","ordem","tenant_id"',count(*),md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' ORDER BY x.id::text COLLATE "C"),'')) FROM (SELECT "cor","id","nome","ordem","tenant_id" FROM "tarefa_status") x;
  INSERT INTO phase2a_preservation SELECT 'tarefas','"atualizado_em","colunas","criado_em","id","linhas","nome","seq","status","status_cor","tenant_id"',count(*),md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' ORDER BY x.id::text COLLATE "C"),'')) FROM (SELECT "atualizado_em","colunas","criado_em","id","linhas","nome","seq","status","status_cor","tenant_id" FROM "tarefas") x;
  INSERT INTO phase2a_preservation SELECT 'tenants','"ativo","atualizado_em","criado_em","email","id","logo_url","nome","plano","slug","titulo_tabela_status"',count(*),md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' ORDER BY x.id::text COLLATE "C"),'')) FROM (SELECT "ativo","atualizado_em","criado_em","email","id","logo_url","nome","plano","slug","titulo_tabela_status" FROM "tenants") x;
  INSERT INTO phase2a_preservation SELECT 'usuarios','"ativo","criado_em","email","id","nome","papel","senha_hash","tenant_id"',count(*),md5(coalesce(string_agg(md5(to_jsonb(x)::text),'' ORDER BY x.id::text COLLATE "C"),'')) FROM (SELECT "ativo","criado_em","email","id","nome","papel","senha_hash","tenant_id" FROM "usuarios") x;

  -- Preserve the known view without cascading into any unknown dependent object.
  IF EXISTS (SELECT 1 FROM pg_class c,
       LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
       WHERE c.oid='vw_powerbi_lancamentos'::regclass AND
       (a.grantor<>c.relowner OR (a.grantee<>c.relowner AND
         (pg_get_userbyid(a.grantee)<>'powerbi_reader' OR a.privilege_type<>'SELECT' OR a.is_grantable))))
     OR EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='vw_powerbi_lancamentos'::regclass AND attacl IS NOT NULL)
     OR obj_description('vw_powerbi_lancamentos'::regclass) IS NOT NULL
     OR EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='vw_powerbi_lancamentos'::regclass AND col_description(attrelid,attnum) IS NOT NULL) THEN
    RAISE EXCEPTION 'PHASE2A_VIEW_PRIVILEGES_OR_COMMENTS_REQUIRE_REVIEW';
  END IF;
  SELECT pg_get_userbyid(relowner) INTO view_owner FROM pg_class WHERE oid='vw_powerbi_lancamentos'::regclass;
  IF view_owner<>current_user THEN RAISE EXCEPTION 'PHASE2A_VIEW_OWNER_REQUIRES_REVIEW'; END IF;
  SELECT jsonb_agg(to_jsonb(a) ORDER BY a.grantor,a.grantee,a.privilege_type,a.is_grantable),
    bool_or(pg_get_userbyid(a.grantee)='powerbi_reader' AND a.privilege_type='SELECT')
    INTO view_acl,reader_had_select
    FROM pg_class c,LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
    WHERE c.oid='vw_powerbi_lancamentos'::regclass;
  DROP VIEW vw_powerbi_lancamentos;

  -- Preserve every historical FK action; detach only for the explicit physical cast.
  ALTER TABLE "areas_negocio" DROP CONSTRAINT "areas_negocio_tenant_id_fkey";
  ALTER TABLE "categorias" DROP CONSTRAINT "categorias_tenant_id_fkey";
  ALTER TABLE "centros_custo" DROP CONSTRAINT "centros_custo_area_id_fkey";
  ALTER TABLE "centros_custo" DROP CONSTRAINT "centros_custo_tenant_id_fkey";
  ALTER TABLE "clientes" DROP CONSTRAINT "clientes_tenant_id_fkey";
  ALTER TABLE "dados_bancarios" DROP CONSTRAINT "dados_bancarios_tenant_id_fkey";
  ALTER TABLE "dre" DROP CONSTRAINT "dre_tenant_id_fkey";
  ALTER TABLE "empresas" DROP CONSTRAINT "empresas_tenant_id_fkey";
  ALTER TABLE "fornecedores" DROP CONSTRAINT "fornecedores_tenant_id_fkey";
  ALTER TABLE "importacoes" DROP CONSTRAINT "importacoes_tenant_id_fkey";
  ALTER TABLE "importacoes" DROP CONSTRAINT "importacoes_usuario_id_fkey";
  ALTER TABLE "lancamentos" DROP CONSTRAINT "lancamentos_conta_id_fkey";
  ALTER TABLE "lancamentos" DROP CONSTRAINT "lancamentos_criado_por_fkey";
  ALTER TABLE "lancamentos" DROP CONSTRAINT "lancamentos_fornecedor_id_fkey";
  ALTER TABLE "lancamentos" DROP CONSTRAINT "lancamentos_tenant_id_fkey";
  ALTER TABLE "layouts_colunas" DROP CONSTRAINT "layouts_colunas_tenant_id_fkey";
  ALTER TABLE "layouts_colunas" DROP CONSTRAINT "layouts_colunas_usuario_id_fkey";
  ALTER TABLE "pessoas" DROP CONSTRAINT "pessoas_tenant_id_fkey";
  ALTER TABLE "plano_contas" DROP CONSTRAINT "plano_contas_pai_id_fkey";
  ALTER TABLE "plano_contas" DROP CONSTRAINT "plano_contas_tenant_id_fkey";
  ALTER TABLE "produtos" DROP CONSTRAINT "produtos_tenant_id_fkey";
  ALTER TABLE "status_manual_tipos" DROP CONSTRAINT "status_manual_tipos_tenant_id_fkey";
  ALTER TABLE "tarefa_status" DROP CONSTRAINT "tarefa_status_tenant_id_fkey";
  ALTER TABLE "tarefas" DROP CONSTRAINT "tarefas_tenant_id_fkey";
  ALTER TABLE "usuarios" DROP CONSTRAINT "usuarios_tenant_id_fkey";
  ALTER TABLE "areas_negocio" ALTER COLUMN "id" DROP DEFAULT;
  ALTER TABLE "areas_negocio" ALTER COLUMN "id" TYPE TEXT USING "id"::text;
  ALTER TABLE "areas_negocio" ALTER COLUMN "id" SET DEFAULT (uuid_generate_v4())::text;
  ALTER TABLE "areas_negocio" ADD CONSTRAINT "p2a_areas_negocio_id_uuid" CHECK ("id" IS NULL OR "id"::uuid::text = "id") NOT VALID;
  ALTER TABLE "areas_negocio" VALIDATE CONSTRAINT "p2a_areas_negocio_id_uuid";
  ALTER TABLE "areas_negocio" ALTER COLUMN "tenant_id" TYPE TEXT USING "tenant_id"::text;
  ALTER TABLE "areas_negocio" ADD CONSTRAINT "p2a_areas_negocio_tenant_id_uuid" CHECK ("tenant_id" IS NULL OR "tenant_id"::uuid::text = "tenant_id") NOT VALID;
  ALTER TABLE "areas_negocio" VALIDATE CONSTRAINT "p2a_areas_negocio_tenant_id_uuid";
  ALTER TABLE "categorias" ALTER COLUMN "id" DROP DEFAULT;
  ALTER TABLE "categorias" ALTER COLUMN "id" TYPE TEXT USING "id"::text;
  ALTER TABLE "categorias" ALTER COLUMN "id" SET DEFAULT (uuid_generate_v4())::text;
  ALTER TABLE "categorias" ADD CONSTRAINT "p2a_categorias_id_uuid" CHECK ("id" IS NULL OR "id"::uuid::text = "id") NOT VALID;
  ALTER TABLE "categorias" VALIDATE CONSTRAINT "p2a_categorias_id_uuid";
  ALTER TABLE "categorias" ALTER COLUMN "tenant_id" TYPE TEXT USING "tenant_id"::text;
  ALTER TABLE "categorias" ADD CONSTRAINT "p2a_categorias_tenant_id_uuid" CHECK ("tenant_id" IS NULL OR "tenant_id"::uuid::text = "tenant_id") NOT VALID;
  ALTER TABLE "categorias" VALIDATE CONSTRAINT "p2a_categorias_tenant_id_uuid";
  ALTER TABLE "centros_custo" ALTER COLUMN "area_id" TYPE TEXT USING "area_id"::text;
  ALTER TABLE "centros_custo" ADD CONSTRAINT "p2a_centros_custo_area_id_uuid" CHECK ("area_id" IS NULL OR "area_id"::uuid::text = "area_id") NOT VALID;
  ALTER TABLE "centros_custo" VALIDATE CONSTRAINT "p2a_centros_custo_area_id_uuid";
  ALTER TABLE "centros_custo" ALTER COLUMN "id" DROP DEFAULT;
  ALTER TABLE "centros_custo" ALTER COLUMN "id" TYPE TEXT USING "id"::text;
  ALTER TABLE "centros_custo" ALTER COLUMN "id" SET DEFAULT (uuid_generate_v4())::text;
  ALTER TABLE "centros_custo" ADD CONSTRAINT "p2a_centros_custo_id_uuid" CHECK ("id" IS NULL OR "id"::uuid::text = "id") NOT VALID;
  ALTER TABLE "centros_custo" VALIDATE CONSTRAINT "p2a_centros_custo_id_uuid";
  ALTER TABLE "centros_custo" ALTER COLUMN "tenant_id" TYPE TEXT USING "tenant_id"::text;
  ALTER TABLE "centros_custo" ADD CONSTRAINT "p2a_centros_custo_tenant_id_uuid" CHECK ("tenant_id" IS NULL OR "tenant_id"::uuid::text = "tenant_id") NOT VALID;
  ALTER TABLE "centros_custo" VALIDATE CONSTRAINT "p2a_centros_custo_tenant_id_uuid";
  ALTER TABLE "clientes" ALTER COLUMN "id" DROP DEFAULT;
  ALTER TABLE "clientes" ALTER COLUMN "id" TYPE TEXT USING "id"::text;
  ALTER TABLE "clientes" ALTER COLUMN "id" SET DEFAULT (uuid_generate_v4())::text;
  ALTER TABLE "clientes" ADD CONSTRAINT "p2a_clientes_id_uuid" CHECK ("id" IS NULL OR "id"::uuid::text = "id") NOT VALID;
  ALTER TABLE "clientes" VALIDATE CONSTRAINT "p2a_clientes_id_uuid";
  ALTER TABLE "clientes" ALTER COLUMN "tenant_id" TYPE TEXT USING "tenant_id"::text;
  ALTER TABLE "clientes" ADD CONSTRAINT "p2a_clientes_tenant_id_uuid" CHECK ("tenant_id" IS NULL OR "tenant_id"::uuid::text = "tenant_id") NOT VALID;
  ALTER TABLE "clientes" VALIDATE CONSTRAINT "p2a_clientes_tenant_id_uuid";
  ALTER TABLE "dados_bancarios" ALTER COLUMN "id" DROP DEFAULT;
  ALTER TABLE "dados_bancarios" ALTER COLUMN "id" TYPE TEXT USING "id"::text;
  ALTER TABLE "dados_bancarios" ALTER COLUMN "id" SET DEFAULT (uuid_generate_v4())::text;
  ALTER TABLE "dados_bancarios" ADD CONSTRAINT "p2a_dados_bancarios_id_uuid" CHECK ("id" IS NULL OR "id"::uuid::text = "id") NOT VALID;
  ALTER TABLE "dados_bancarios" VALIDATE CONSTRAINT "p2a_dados_bancarios_id_uuid";
  ALTER TABLE "dados_bancarios" ALTER COLUMN "tenant_id" TYPE TEXT USING "tenant_id"::text;
  ALTER TABLE "dados_bancarios" ADD CONSTRAINT "p2a_dados_bancarios_tenant_id_uuid" CHECK ("tenant_id" IS NULL OR "tenant_id"::uuid::text = "tenant_id") NOT VALID;
  ALTER TABLE "dados_bancarios" VALIDATE CONSTRAINT "p2a_dados_bancarios_tenant_id_uuid";
  ALTER TABLE "dre" ALTER COLUMN "id" DROP DEFAULT;
  ALTER TABLE "dre" ALTER COLUMN "id" TYPE TEXT USING "id"::text;
  ALTER TABLE "dre" ALTER COLUMN "id" SET DEFAULT (uuid_generate_v4())::text;
  ALTER TABLE "dre" ADD CONSTRAINT "p2a_dre_id_uuid" CHECK ("id" IS NULL OR "id"::uuid::text = "id") NOT VALID;
  ALTER TABLE "dre" VALIDATE CONSTRAINT "p2a_dre_id_uuid";
  ALTER TABLE "dre" ALTER COLUMN "tenant_id" TYPE TEXT USING "tenant_id"::text;
  ALTER TABLE "dre" ADD CONSTRAINT "p2a_dre_tenant_id_uuid" CHECK ("tenant_id" IS NULL OR "tenant_id"::uuid::text = "tenant_id") NOT VALID;
  ALTER TABLE "dre" VALIDATE CONSTRAINT "p2a_dre_tenant_id_uuid";
  ALTER TABLE "empresas" ALTER COLUMN "id" DROP DEFAULT;
  ALTER TABLE "empresas" ALTER COLUMN "id" TYPE TEXT USING "id"::text;
  ALTER TABLE "empresas" ALTER COLUMN "id" SET DEFAULT (uuid_generate_v4())::text;
  ALTER TABLE "empresas" ADD CONSTRAINT "p2a_empresas_id_uuid" CHECK ("id" IS NULL OR "id"::uuid::text = "id") NOT VALID;
  ALTER TABLE "empresas" VALIDATE CONSTRAINT "p2a_empresas_id_uuid";
  ALTER TABLE "empresas" ALTER COLUMN "tenant_id" TYPE TEXT USING "tenant_id"::text;
  ALTER TABLE "empresas" ADD CONSTRAINT "p2a_empresas_tenant_id_uuid" CHECK ("tenant_id" IS NULL OR "tenant_id"::uuid::text = "tenant_id") NOT VALID;
  ALTER TABLE "empresas" VALIDATE CONSTRAINT "p2a_empresas_tenant_id_uuid";
  ALTER TABLE "fornecedores" ALTER COLUMN "id" DROP DEFAULT;
  ALTER TABLE "fornecedores" ALTER COLUMN "id" TYPE TEXT USING "id"::text;
  ALTER TABLE "fornecedores" ALTER COLUMN "id" SET DEFAULT (uuid_generate_v4())::text;
  ALTER TABLE "fornecedores" ADD CONSTRAINT "p2a_fornecedores_id_uuid" CHECK ("id" IS NULL OR "id"::uuid::text = "id") NOT VALID;
  ALTER TABLE "fornecedores" VALIDATE CONSTRAINT "p2a_fornecedores_id_uuid";
  ALTER TABLE "fornecedores" ALTER COLUMN "tenant_id" TYPE TEXT USING "tenant_id"::text;
  ALTER TABLE "fornecedores" ADD CONSTRAINT "p2a_fornecedores_tenant_id_uuid" CHECK ("tenant_id" IS NULL OR "tenant_id"::uuid::text = "tenant_id") NOT VALID;
  ALTER TABLE "fornecedores" VALIDATE CONSTRAINT "p2a_fornecedores_tenant_id_uuid";
  ALTER TABLE "importacoes" ALTER COLUMN "id" DROP DEFAULT;
  ALTER TABLE "importacoes" ALTER COLUMN "id" TYPE TEXT USING "id"::text;
  ALTER TABLE "importacoes" ALTER COLUMN "id" SET DEFAULT (uuid_generate_v4())::text;
  ALTER TABLE "importacoes" ADD CONSTRAINT "p2a_importacoes_id_uuid" CHECK ("id" IS NULL OR "id"::uuid::text = "id") NOT VALID;
  ALTER TABLE "importacoes" VALIDATE CONSTRAINT "p2a_importacoes_id_uuid";
  ALTER TABLE "importacoes" ALTER COLUMN "tenant_id" TYPE TEXT USING "tenant_id"::text;
  ALTER TABLE "importacoes" ADD CONSTRAINT "p2a_importacoes_tenant_id_uuid" CHECK ("tenant_id" IS NULL OR "tenant_id"::uuid::text = "tenant_id") NOT VALID;
  ALTER TABLE "importacoes" VALIDATE CONSTRAINT "p2a_importacoes_tenant_id_uuid";
  ALTER TABLE "importacoes" ALTER COLUMN "usuario_id" TYPE TEXT USING "usuario_id"::text;
  ALTER TABLE "importacoes" ADD CONSTRAINT "p2a_importacoes_usuario_id_uuid" CHECK ("usuario_id" IS NULL OR "usuario_id"::uuid::text = "usuario_id") NOT VALID;
  ALTER TABLE "importacoes" VALIDATE CONSTRAINT "p2a_importacoes_usuario_id_uuid";
  ALTER TABLE "lancamentos" ALTER COLUMN "conta_id" TYPE TEXT USING "conta_id"::text;
  ALTER TABLE "lancamentos" ADD CONSTRAINT "p2a_lancamentos_conta_id_uuid" CHECK ("conta_id" IS NULL OR "conta_id"::uuid::text = "conta_id") NOT VALID;
  ALTER TABLE "lancamentos" VALIDATE CONSTRAINT "p2a_lancamentos_conta_id_uuid";
  ALTER TABLE "lancamentos" ALTER COLUMN "criado_por" TYPE TEXT USING "criado_por"::text;
  ALTER TABLE "lancamentos" ADD CONSTRAINT "p2a_lancamentos_criado_por_uuid" CHECK ("criado_por" IS NULL OR "criado_por"::uuid::text = "criado_por") NOT VALID;
  ALTER TABLE "lancamentos" VALIDATE CONSTRAINT "p2a_lancamentos_criado_por_uuid";
  ALTER TABLE "lancamentos" ALTER COLUMN "fornecedor_id" TYPE TEXT USING "fornecedor_id"::text;
  ALTER TABLE "lancamentos" ADD CONSTRAINT "p2a_lancamentos_fornecedor_id_uuid" CHECK ("fornecedor_id" IS NULL OR "fornecedor_id"::uuid::text = "fornecedor_id") NOT VALID;
  ALTER TABLE "lancamentos" VALIDATE CONSTRAINT "p2a_lancamentos_fornecedor_id_uuid";
  ALTER TABLE "lancamentos" ALTER COLUMN "id" DROP DEFAULT;
  ALTER TABLE "lancamentos" ALTER COLUMN "id" TYPE TEXT USING "id"::text;
  ALTER TABLE "lancamentos" ALTER COLUMN "id" SET DEFAULT (uuid_generate_v4())::text;
  ALTER TABLE "lancamentos" ADD CONSTRAINT "p2a_lancamentos_id_uuid" CHECK ("id" IS NULL OR "id"::uuid::text = "id") NOT VALID;
  ALTER TABLE "lancamentos" VALIDATE CONSTRAINT "p2a_lancamentos_id_uuid";
  ALTER TABLE "lancamentos" ALTER COLUMN "tenant_id" TYPE TEXT USING "tenant_id"::text;
  ALTER TABLE "lancamentos" ADD CONSTRAINT "p2a_lancamentos_tenant_id_uuid" CHECK ("tenant_id" IS NULL OR "tenant_id"::uuid::text = "tenant_id") NOT VALID;
  ALTER TABLE "lancamentos" VALIDATE CONSTRAINT "p2a_lancamentos_tenant_id_uuid";
  ALTER TABLE "layouts_colunas" ALTER COLUMN "id" DROP DEFAULT;
  ALTER TABLE "layouts_colunas" ALTER COLUMN "id" TYPE TEXT USING "id"::text;
  ALTER TABLE "layouts_colunas" ALTER COLUMN "id" SET DEFAULT (uuid_generate_v4())::text;
  ALTER TABLE "layouts_colunas" ADD CONSTRAINT "p2a_layouts_colunas_id_uuid" CHECK ("id" IS NULL OR "id"::uuid::text = "id") NOT VALID;
  ALTER TABLE "layouts_colunas" VALIDATE CONSTRAINT "p2a_layouts_colunas_id_uuid";
  ALTER TABLE "layouts_colunas" ALTER COLUMN "tenant_id" TYPE TEXT USING "tenant_id"::text;
  ALTER TABLE "layouts_colunas" ADD CONSTRAINT "p2a_layouts_colunas_tenant_id_uuid" CHECK ("tenant_id" IS NULL OR "tenant_id"::uuid::text = "tenant_id") NOT VALID;
  ALTER TABLE "layouts_colunas" VALIDATE CONSTRAINT "p2a_layouts_colunas_tenant_id_uuid";
  ALTER TABLE "layouts_colunas" ALTER COLUMN "usuario_id" TYPE TEXT USING "usuario_id"::text;
  ALTER TABLE "layouts_colunas" ADD CONSTRAINT "p2a_layouts_colunas_usuario_id_uuid" CHECK ("usuario_id" IS NULL OR "usuario_id"::uuid::text = "usuario_id") NOT VALID;
  ALTER TABLE "layouts_colunas" VALIDATE CONSTRAINT "p2a_layouts_colunas_usuario_id_uuid";
  ALTER TABLE "pessoas" ALTER COLUMN "id" DROP DEFAULT;
  ALTER TABLE "pessoas" ALTER COLUMN "id" TYPE TEXT USING "id"::text;
  ALTER TABLE "pessoas" ALTER COLUMN "id" SET DEFAULT (uuid_generate_v4())::text;
  ALTER TABLE "pessoas" ADD CONSTRAINT "p2a_pessoas_id_uuid" CHECK ("id" IS NULL OR "id"::uuid::text = "id") NOT VALID;
  ALTER TABLE "pessoas" VALIDATE CONSTRAINT "p2a_pessoas_id_uuid";
  ALTER TABLE "pessoas" ALTER COLUMN "tenant_id" TYPE TEXT USING "tenant_id"::text;
  ALTER TABLE "pessoas" ADD CONSTRAINT "p2a_pessoas_tenant_id_uuid" CHECK ("tenant_id" IS NULL OR "tenant_id"::uuid::text = "tenant_id") NOT VALID;
  ALTER TABLE "pessoas" VALIDATE CONSTRAINT "p2a_pessoas_tenant_id_uuid";
  ALTER TABLE "plano_contas" ALTER COLUMN "id" DROP DEFAULT;
  ALTER TABLE "plano_contas" ALTER COLUMN "id" TYPE TEXT USING "id"::text;
  ALTER TABLE "plano_contas" ALTER COLUMN "id" SET DEFAULT (uuid_generate_v4())::text;
  ALTER TABLE "plano_contas" ADD CONSTRAINT "p2a_plano_contas_id_uuid" CHECK ("id" IS NULL OR "id"::uuid::text = "id") NOT VALID;
  ALTER TABLE "plano_contas" VALIDATE CONSTRAINT "p2a_plano_contas_id_uuid";
  ALTER TABLE "plano_contas" ALTER COLUMN "pai_id" TYPE TEXT USING "pai_id"::text;
  ALTER TABLE "plano_contas" ADD CONSTRAINT "p2a_plano_contas_pai_id_uuid" CHECK ("pai_id" IS NULL OR "pai_id"::uuid::text = "pai_id") NOT VALID;
  ALTER TABLE "plano_contas" VALIDATE CONSTRAINT "p2a_plano_contas_pai_id_uuid";
  ALTER TABLE "plano_contas" ALTER COLUMN "tenant_id" TYPE TEXT USING "tenant_id"::text;
  ALTER TABLE "plano_contas" ADD CONSTRAINT "p2a_plano_contas_tenant_id_uuid" CHECK ("tenant_id" IS NULL OR "tenant_id"::uuid::text = "tenant_id") NOT VALID;
  ALTER TABLE "plano_contas" VALIDATE CONSTRAINT "p2a_plano_contas_tenant_id_uuid";
  ALTER TABLE "produtos" ALTER COLUMN "id" DROP DEFAULT;
  ALTER TABLE "produtos" ALTER COLUMN "id" TYPE TEXT USING "id"::text;
  ALTER TABLE "produtos" ALTER COLUMN "id" SET DEFAULT (uuid_generate_v4())::text;
  ALTER TABLE "produtos" ADD CONSTRAINT "p2a_produtos_id_uuid" CHECK ("id" IS NULL OR "id"::uuid::text = "id") NOT VALID;
  ALTER TABLE "produtos" VALIDATE CONSTRAINT "p2a_produtos_id_uuid";
  ALTER TABLE "produtos" ALTER COLUMN "tenant_id" TYPE TEXT USING "tenant_id"::text;
  ALTER TABLE "produtos" ADD CONSTRAINT "p2a_produtos_tenant_id_uuid" CHECK ("tenant_id" IS NULL OR "tenant_id"::uuid::text = "tenant_id") NOT VALID;
  ALTER TABLE "produtos" VALIDATE CONSTRAINT "p2a_produtos_tenant_id_uuid";
  ALTER TABLE "status_manual_tipos" ALTER COLUMN "id" DROP DEFAULT;
  ALTER TABLE "status_manual_tipos" ALTER COLUMN "id" TYPE TEXT USING "id"::text;
  ALTER TABLE "status_manual_tipos" ALTER COLUMN "id" SET DEFAULT (uuid_generate_v4())::text;
  ALTER TABLE "status_manual_tipos" ADD CONSTRAINT "p2a_status_manual_tipos_id_uuid" CHECK ("id" IS NULL OR "id"::uuid::text = "id") NOT VALID;
  ALTER TABLE "status_manual_tipos" VALIDATE CONSTRAINT "p2a_status_manual_tipos_id_uuid";
  ALTER TABLE "status_manual_tipos" ALTER COLUMN "tenant_id" TYPE TEXT USING "tenant_id"::text;
  ALTER TABLE "status_manual_tipos" ADD CONSTRAINT "p2a_status_manual_tipos_tenant_id_uuid" CHECK ("tenant_id" IS NULL OR "tenant_id"::uuid::text = "tenant_id") NOT VALID;
  ALTER TABLE "status_manual_tipos" VALIDATE CONSTRAINT "p2a_status_manual_tipos_tenant_id_uuid";
  ALTER TABLE "tarefa_status" ALTER COLUMN "id" DROP DEFAULT;
  ALTER TABLE "tarefa_status" ALTER COLUMN "id" TYPE TEXT USING "id"::text;
  ALTER TABLE "tarefa_status" ALTER COLUMN "id" SET DEFAULT (uuid_generate_v4())::text;
  ALTER TABLE "tarefa_status" ADD CONSTRAINT "p2a_tarefa_status_id_uuid" CHECK ("id" IS NULL OR "id"::uuid::text = "id") NOT VALID;
  ALTER TABLE "tarefa_status" VALIDATE CONSTRAINT "p2a_tarefa_status_id_uuid";
  ALTER TABLE "tarefa_status" ALTER COLUMN "tenant_id" TYPE TEXT USING "tenant_id"::text;
  ALTER TABLE "tarefa_status" ADD CONSTRAINT "p2a_tarefa_status_tenant_id_uuid" CHECK ("tenant_id" IS NULL OR "tenant_id"::uuid::text = "tenant_id") NOT VALID;
  ALTER TABLE "tarefa_status" VALIDATE CONSTRAINT "p2a_tarefa_status_tenant_id_uuid";
  ALTER TABLE "tarefas" ALTER COLUMN "id" DROP DEFAULT;
  ALTER TABLE "tarefas" ALTER COLUMN "id" TYPE TEXT USING "id"::text;
  ALTER TABLE "tarefas" ALTER COLUMN "id" SET DEFAULT (uuid_generate_v4())::text;
  ALTER TABLE "tarefas" ADD CONSTRAINT "p2a_tarefas_id_uuid" CHECK ("id" IS NULL OR "id"::uuid::text = "id") NOT VALID;
  ALTER TABLE "tarefas" VALIDATE CONSTRAINT "p2a_tarefas_id_uuid";
  ALTER TABLE "tarefas" ALTER COLUMN "tenant_id" TYPE TEXT USING "tenant_id"::text;
  ALTER TABLE "tarefas" ADD CONSTRAINT "p2a_tarefas_tenant_id_uuid" CHECK ("tenant_id" IS NULL OR "tenant_id"::uuid::text = "tenant_id") NOT VALID;
  ALTER TABLE "tarefas" VALIDATE CONSTRAINT "p2a_tarefas_tenant_id_uuid";
  ALTER TABLE "tenants" ALTER COLUMN "id" DROP DEFAULT;
  ALTER TABLE "tenants" ALTER COLUMN "id" TYPE TEXT USING "id"::text;
  ALTER TABLE "tenants" ALTER COLUMN "id" SET DEFAULT (uuid_generate_v4())::text;
  ALTER TABLE "tenants" ADD CONSTRAINT "p2a_tenants_id_uuid" CHECK ("id" IS NULL OR "id"::uuid::text = "id") NOT VALID;
  ALTER TABLE "tenants" VALIDATE CONSTRAINT "p2a_tenants_id_uuid";
  ALTER TABLE "usuarios" ALTER COLUMN "id" DROP DEFAULT;
  ALTER TABLE "usuarios" ALTER COLUMN "id" TYPE TEXT USING "id"::text;
  ALTER TABLE "usuarios" ALTER COLUMN "id" SET DEFAULT (uuid_generate_v4())::text;
  ALTER TABLE "usuarios" ADD CONSTRAINT "p2a_usuarios_id_uuid" CHECK ("id" IS NULL OR "id"::uuid::text = "id") NOT VALID;
  ALTER TABLE "usuarios" VALIDATE CONSTRAINT "p2a_usuarios_id_uuid";
  ALTER TABLE "usuarios" ALTER COLUMN "tenant_id" TYPE TEXT USING "tenant_id"::text;
  ALTER TABLE "usuarios" ADD CONSTRAINT "p2a_usuarios_tenant_id_uuid" CHECK ("tenant_id" IS NULL OR "tenant_id"::uuid::text = "tenant_id") NOT VALID;
  ALTER TABLE "usuarios" VALIDATE CONSTRAINT "p2a_usuarios_tenant_id_uuid";
  CREATE VIEW public.vw_powerbi_lancamentos AS
 SELECT l.id::uuid AS id,
    t.nome AS tenant_nome,
    t.slug AS tenant_slug,
    l.data_lanc,
    EXTRACT(year FROM l.data_lanc) AS ano,
    EXTRACT(month FROM l.data_lanc) AS mes,
    to_char((l.data_lanc)::timestamp with time zone, 'YYYY-MM'::text) AS ano_mes,
    l.descricao,
    l.tipo,
    l.status,
    l.valor,
        CASE
            WHEN (l.tipo = 'ENTRADA'::text) THEN l.valor
            ELSE (0)::numeric
        END AS entrada,
        CASE
            WHEN (l.tipo = 'SAIDA'::text) THEN l.valor
            ELSE (0)::numeric
        END AS saida,
    pc.codigo AS conta_codigo,
    pc.descricao AS conta_descricao,
    pc.tipo AS conta_tipo,
    l.fornecedor,
    l.centro_custo,
    l.referencia,
    l.metadados,
    l.importado,
    l.criado_em
   FROM ((public.lancamentos l
     JOIN public.tenants t ON ((t.id = l.tenant_id)))
     LEFT JOIN public.plano_contas pc ON ((pc.id = l.conta_id)))
  WHERE (l.status <> 'cancelado'::text);
  EXECUTE format('ALTER VIEW vw_powerbi_lancamentos OWNER TO %I', view_owner);
  -- Restore only an existing grant; never create a role or infer a new authorization.
  IF reader_had_select THEN GRANT SELECT ON vw_powerbi_lancamentos TO powerbi_reader; END IF;
  SELECT jsonb_agg(to_jsonb(a) ORDER BY a.grantor,a.grantee,a.privilege_type,a.is_grantable) INTO restored_acl
    FROM pg_class c,LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
    WHERE c.oid='vw_powerbi_lancamentos'::regclass;
  IF restored_acl IS DISTINCT FROM view_acl THEN RAISE EXCEPTION 'PHASE2A_VIEW_ACL_PRESERVATION_FAILED'; END IF;

  -- timestamptz(6), dates, defaults, legacy checks/triggers/sequences and importacoes remain intact.
  ALTER TABLE "areas_negocio" ADD CONSTRAINT "areas_negocio_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE NOT VALID;
  ALTER TABLE "areas_negocio" VALIDATE CONSTRAINT "areas_negocio_tenant_id_fkey";
  ALTER TABLE "categorias" ADD CONSTRAINT "categorias_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE NOT VALID;
  ALTER TABLE "categorias" VALIDATE CONSTRAINT "categorias_tenant_id_fkey";
  ALTER TABLE "centros_custo" ADD CONSTRAINT "centros_custo_area_id_fkey" FOREIGN KEY (area_id) REFERENCES areas_negocio(id) NOT VALID;
  ALTER TABLE "centros_custo" VALIDATE CONSTRAINT "centros_custo_area_id_fkey";
  ALTER TABLE "centros_custo" ADD CONSTRAINT "centros_custo_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE NOT VALID;
  ALTER TABLE "centros_custo" VALIDATE CONSTRAINT "centros_custo_tenant_id_fkey";
  ALTER TABLE "clientes" ADD CONSTRAINT "clientes_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE NOT VALID;
  ALTER TABLE "clientes" VALIDATE CONSTRAINT "clientes_tenant_id_fkey";
  ALTER TABLE "dados_bancarios" ADD CONSTRAINT "dados_bancarios_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE NOT VALID;
  ALTER TABLE "dados_bancarios" VALIDATE CONSTRAINT "dados_bancarios_tenant_id_fkey";
  ALTER TABLE "dre" ADD CONSTRAINT "dre_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE NOT VALID;
  ALTER TABLE "dre" VALIDATE CONSTRAINT "dre_tenant_id_fkey";
  ALTER TABLE "empresas" ADD CONSTRAINT "empresas_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE NOT VALID;
  ALTER TABLE "empresas" VALIDATE CONSTRAINT "empresas_tenant_id_fkey";
  ALTER TABLE "fornecedores" ADD CONSTRAINT "fornecedores_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE NOT VALID;
  ALTER TABLE "fornecedores" VALIDATE CONSTRAINT "fornecedores_tenant_id_fkey";
  ALTER TABLE "importacoes" ADD CONSTRAINT "importacoes_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) NOT VALID;
  ALTER TABLE "importacoes" VALIDATE CONSTRAINT "importacoes_tenant_id_fkey";
  ALTER TABLE "importacoes" ADD CONSTRAINT "importacoes_usuario_id_fkey" FOREIGN KEY (usuario_id) REFERENCES usuarios(id) NOT VALID;
  ALTER TABLE "importacoes" VALIDATE CONSTRAINT "importacoes_usuario_id_fkey";
  ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_conta_id_fkey" FOREIGN KEY (conta_id) REFERENCES plano_contas(id) NOT VALID;
  ALTER TABLE "lancamentos" VALIDATE CONSTRAINT "lancamentos_conta_id_fkey";
  ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_criado_por_fkey" FOREIGN KEY (criado_por) REFERENCES usuarios(id) NOT VALID;
  ALTER TABLE "lancamentos" VALIDATE CONSTRAINT "lancamentos_criado_por_fkey";
  ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_fornecedor_id_fkey" FOREIGN KEY (fornecedor_id) REFERENCES fornecedores(id) NOT VALID;
  ALTER TABLE "lancamentos" VALIDATE CONSTRAINT "lancamentos_fornecedor_id_fkey";
  ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE NOT VALID;
  ALTER TABLE "lancamentos" VALIDATE CONSTRAINT "lancamentos_tenant_id_fkey";
  ALTER TABLE "layouts_colunas" ADD CONSTRAINT "layouts_colunas_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE NOT VALID;
  ALTER TABLE "layouts_colunas" VALIDATE CONSTRAINT "layouts_colunas_tenant_id_fkey";
  ALTER TABLE "layouts_colunas" ADD CONSTRAINT "layouts_colunas_usuario_id_fkey" FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE NOT VALID;
  ALTER TABLE "layouts_colunas" VALIDATE CONSTRAINT "layouts_colunas_usuario_id_fkey";
  ALTER TABLE "pessoas" ADD CONSTRAINT "pessoas_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE NOT VALID;
  ALTER TABLE "pessoas" VALIDATE CONSTRAINT "pessoas_tenant_id_fkey";
  ALTER TABLE "plano_contas" ADD CONSTRAINT "plano_contas_pai_id_fkey" FOREIGN KEY (pai_id) REFERENCES plano_contas(id) NOT VALID;
  ALTER TABLE "plano_contas" VALIDATE CONSTRAINT "plano_contas_pai_id_fkey";
  ALTER TABLE "plano_contas" ADD CONSTRAINT "plano_contas_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE NOT VALID;
  ALTER TABLE "plano_contas" VALIDATE CONSTRAINT "plano_contas_tenant_id_fkey";
  ALTER TABLE "produtos" ADD CONSTRAINT "produtos_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE NOT VALID;
  ALTER TABLE "produtos" VALIDATE CONSTRAINT "produtos_tenant_id_fkey";
  ALTER TABLE "status_manual_tipos" ADD CONSTRAINT "status_manual_tipos_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE NOT VALID;
  ALTER TABLE "status_manual_tipos" VALIDATE CONSTRAINT "status_manual_tipos_tenant_id_fkey";
  ALTER TABLE "tarefa_status" ADD CONSTRAINT "tarefa_status_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE NOT VALID;
  ALTER TABLE "tarefa_status" VALIDATE CONSTRAINT "tarefa_status_tenant_id_fkey";
  ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE NOT VALID;
  ALTER TABLE "tarefas" VALIDATE CONSTRAINT "tarefas_tenant_id_fkey";
  ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE NOT VALID;
  ALTER TABLE "usuarios" VALIDATE CONSTRAINT "usuarios_tenant_id_fkey";
  CREATE TABLE "produto_grupos" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "codigo" VARCHAR(30) NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "produto_grupos_pkey" PRIMARY KEY ("id")
);
  CREATE TABLE "produto_linhas" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "tipo_id" TEXT NOT NULL,
    "codigo" VARCHAR(30) NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "produto_linhas_pkey" PRIMARY KEY ("id")
);
  CREATE TABLE "produto_sequencias" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "escopo" VARCHAR(100) NOT NULL,
    "ultimo_numero" BIGINT NOT NULL,

    CONSTRAINT "produto_sequencias_pkey" PRIMARY KEY ("id")
);
  CREATE TABLE "produto_tipos" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "grupo" TEXT,
    "grupo_id" TEXT,
    "codigo" VARCHAR(30) NOT NULL,
    "nome" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "produto_tipos_pkey" PRIMARY KEY ("id")
);
  ALTER TABLE "clientes" ADD COLUMN "conta_padrao_id" text;
  ALTER TABLE "clientes" ADD COLUMN "nome_fantasia" text;
  ALTER TABLE "clientes" ADD COLUMN "tipo_pessoa" character varying(2);
  ALTER TABLE "fornecedores" ADD COLUMN "conta_padrao_id" text;
  ALTER TABLE "fornecedores" ADD COLUMN "documento" text;
  ALTER TABLE "fornecedores" ADD COLUMN "email" text;
  ALTER TABLE "fornecedores" ADD COLUMN "endereco" text;
  ALTER TABLE "fornecedores" ADD COLUMN "nome_fantasia" text;
  ALTER TABLE "fornecedores" ADD COLUMN "telefone" text;
  ALTER TABLE "fornecedores" ADD COLUMN "tipo_pessoa" character varying(2);
  ALTER TABLE "lancamentos" ADD COLUMN "cliente_id" text;
  ALTER TABLE "plano_contas" ADD COLUMN "categoria_id" text;
  ALTER TABLE "produtos" ADD COLUMN "descricao" text;
  ALTER TABLE "produtos" ADD COLUMN "grupo_id" text;
  ALTER TABLE "produtos" ADD COLUMN "linha_id" text;
  ALTER TABLE "produtos" ADD COLUMN "observacoes" text;
  ALTER TABLE "produtos" ADD COLUMN "tipo_id" text;
  CREATE UNIQUE INDEX clientes_tenant_id_id_key ON public.clientes USING btree (tenant_id, id);
  CREATE INDEX idx_clientes_conta_padrao ON public.clientes USING btree (tenant_id, conta_padrao_id);
  CREATE INDEX idx_fornecedores_conta_padrao ON public.fornecedores USING btree (tenant_id, conta_padrao_id);
  CREATE INDEX idx_lancamentos_tenant_cliente ON public.lancamentos USING btree (tenant_id, cliente_id);
  CREATE INDEX idx_plano_contas_tenant_categoria ON public.plano_contas USING btree (tenant_id, categoria_id);
  CREATE INDEX idx_plano_contas_tenant_codigo ON public.plano_contas USING btree (tenant_id, codigo);
  CREATE UNIQUE INDEX plano_contas_tenant_id_id_key ON public.plano_contas USING btree (tenant_id, id);
  CREATE INDEX idx_produto_grupos_tenant ON public.produto_grupos USING btree (tenant_id);
  CREATE UNIQUE INDEX produto_grupos_tenant_id_codigo_key ON public.produto_grupos USING btree (tenant_id, codigo);
  CREATE UNIQUE INDEX produto_grupos_tenant_id_id_key ON public.produto_grupos USING btree (tenant_id, id);
  CREATE INDEX idx_produto_linhas_tipo ON public.produto_linhas USING btree (tenant_id, tipo_id);
  CREATE UNIQUE INDEX produto_linhas_tenant_id_id_key ON public.produto_linhas USING btree (tenant_id, id);
  CREATE UNIQUE INDEX produto_linhas_tenant_id_tipo_id_codigo_key ON public.produto_linhas USING btree (tenant_id, tipo_id, codigo);
  CREATE UNIQUE INDEX produto_sequencias_tenant_id_escopo_key ON public.produto_sequencias USING btree (tenant_id, escopo);
  CREATE INDEX idx_produto_tipos_tenant ON public.produto_tipos USING btree (tenant_id);
  CREATE UNIQUE INDEX produto_tipos_tenant_id_grupo_codigo_key ON public.produto_tipos USING btree (tenant_id, grupo, codigo);
  CREATE UNIQUE INDEX produto_tipos_tenant_id_grupo_id_codigo_key ON public.produto_tipos USING btree (tenant_id, grupo_id, codigo);
  CREATE UNIQUE INDEX produto_tipos_tenant_id_id_key ON public.produto_tipos USING btree (tenant_id, id);
  CREATE INDEX idx_produtos_grupo ON public.produtos USING btree (tenant_id, grupo_id);
  CREATE INDEX idx_produtos_linha ON public.produtos USING btree (tenant_id, linha_id);
  CREATE INDEX idx_produtos_tipo ON public.produtos USING btree (tenant_id, tipo_id);
  ALTER TABLE "clientes" ADD CONSTRAINT "clientes_tenant_id_conta_padrao_id_fkey" FOREIGN KEY (tenant_id, conta_padrao_id) REFERENCES plano_contas(tenant_id, id) NOT VALID;
  ALTER TABLE "clientes" VALIDATE CONSTRAINT "clientes_tenant_id_conta_padrao_id_fkey";
  ALTER TABLE "fornecedores" ADD CONSTRAINT "fornecedores_tenant_id_conta_padrao_id_fkey" FOREIGN KEY (tenant_id, conta_padrao_id) REFERENCES plano_contas(tenant_id, id) NOT VALID;
  ALTER TABLE "fornecedores" VALIDATE CONSTRAINT "fornecedores_tenant_id_conta_padrao_id_fkey";
  ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_tenant_id_cliente_id_fkey" FOREIGN KEY (tenant_id, cliente_id) REFERENCES clientes(tenant_id, id) NOT VALID;
  ALTER TABLE "lancamentos" VALIDATE CONSTRAINT "lancamentos_tenant_id_cliente_id_fkey";
  ALTER TABLE "plano_contas" ADD CONSTRAINT "plano_contas_categoria_id_fkey" FOREIGN KEY (categoria_id) REFERENCES categorias(id) ON UPDATE CASCADE ON DELETE SET NULL NOT VALID;
  ALTER TABLE "plano_contas" VALIDATE CONSTRAINT "plano_contas_categoria_id_fkey";
  ALTER TABLE "produto_grupos" ADD CONSTRAINT "produto_grupos_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
  ALTER TABLE "produto_grupos" VALIDATE CONSTRAINT "produto_grupos_tenant_id_fkey";
  ALTER TABLE "produto_linhas" ADD CONSTRAINT "produto_linhas_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
  ALTER TABLE "produto_linhas" VALIDATE CONSTRAINT "produto_linhas_tenant_id_fkey";
  ALTER TABLE "produto_linhas" ADD CONSTRAINT "produto_linhas_tenant_id_tipo_id_fkey" FOREIGN KEY (tenant_id, tipo_id) REFERENCES produto_tipos(tenant_id, id) ON DELETE RESTRICT NOT VALID;
  ALTER TABLE "produto_linhas" VALIDATE CONSTRAINT "produto_linhas_tenant_id_tipo_id_fkey";
  ALTER TABLE "produto_sequencias" ADD CONSTRAINT "produto_sequencias_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
  ALTER TABLE "produto_sequencias" VALIDATE CONSTRAINT "produto_sequencias_tenant_id_fkey";
  ALTER TABLE "produto_tipos" ADD CONSTRAINT "produto_tipos_tenant_id_fkey" FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON UPDATE CASCADE ON DELETE CASCADE NOT VALID;
  ALTER TABLE "produto_tipos" VALIDATE CONSTRAINT "produto_tipos_tenant_id_fkey";
  ALTER TABLE "produto_tipos" ADD CONSTRAINT "produto_tipos_tenant_id_grupo_id_fkey" FOREIGN KEY (tenant_id, grupo_id) REFERENCES produto_grupos(tenant_id, id) ON DELETE RESTRICT NOT VALID;
  ALTER TABLE "produto_tipos" VALIDATE CONSTRAINT "produto_tipos_tenant_id_grupo_id_fkey";
  ALTER TABLE "produtos" ADD CONSTRAINT "produtos_tenant_id_grupo_id_fkey" FOREIGN KEY (tenant_id, grupo_id) REFERENCES produto_grupos(tenant_id, id) ON DELETE RESTRICT NOT VALID;
  ALTER TABLE "produtos" VALIDATE CONSTRAINT "produtos_tenant_id_grupo_id_fkey";
  ALTER TABLE "produtos" ADD CONSTRAINT "produtos_tenant_id_linha_id_fkey" FOREIGN KEY (tenant_id, linha_id) REFERENCES produto_linhas(tenant_id, id) NOT VALID;
  ALTER TABLE "produtos" VALIDATE CONSTRAINT "produtos_tenant_id_linha_id_fkey";
  ALTER TABLE "produtos" ADD CONSTRAINT "produtos_tenant_id_tipo_id_fkey" FOREIGN KEY (tenant_id, tipo_id) REFERENCES produto_tipos(tenant_id, id) NOT VALID;
  ALTER TABLE "produtos" VALIDATE CONSTRAINT "produtos_tenant_id_tipo_id_fkey";

  -- Check all original columns, not merely IDs/counts: no data or authorship may change.
  FOR r IN SELECT * FROM phase2a_preservation LOOP
    EXECUTE format('SELECT count(*),md5(coalesce(string_agg(md5(to_jsonb(x)::text),%L ORDER BY x.id::text COLLATE "C"),%L)) FROM (SELECT %s FROM public.%I) x','','',r.projection,r.tab) INTO after_count,after_digest;
    IF after_count<>r.row_count OR after_digest<>r.digest THEN RAISE EXCEPTION 'PHASE2A_DATA_PRESERVATION_FAILED: %',r.tab; END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND NOT c.convalidated) THEN
    RAISE EXCEPTION 'PHASE2A_UNVALIDATED_CONSTRAINT';
  END IF;
  IF md5(pg_temp.phase2a_catalog()::text) <> '1eef3f2d2ddb08d2a6a5cacb4c067944' THEN RAISE EXCEPTION 'PHASE2A_POST_CATALOG_MISMATCH'; END IF;
END
$reconcile$;
COMMIT;
