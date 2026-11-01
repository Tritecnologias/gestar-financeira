-- Disposable A.2.3 HTTP lab only. The A.2.1 dump deliberately omitted these
-- pre-existing operational capabilities. Reuse the policy in pg18/runtime-acl.sql;
-- never change Admission grants, evidence immutability or any remote role.
BEGIN;
DO $$ BEGIN
  IF current_database()<>'special_invite_lab' OR current_user<>'postgres'
    OR current_setting('server_version_num')::int NOT BETWEEN 180000 AND 189999
    OR NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='a2_runtime' AND NOT
      (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls OR rolinherit))
    OR pg_has_role('a2_runtime','a2_migrator','MEMBER')
    OR (SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL)<>8
    OR NOT EXISTS(SELECT 1 FROM _prisma_migrations WHERE migration_name='20261101_admission_foundation'
      AND checksum='46d7bd07acb5fc075e824cf064de3fdc655ea8e85fc33f202f95c6ded965874b')
    THEN RAISE EXCEPTION 'A23_DISPOSABLE_LAB_ACL_GUARD'; END IF;
END $$;
GRANT INSERT,UPDATE ON access_invites,tenant_contractual_responsibles,tenant_contractual_onboarding TO a2_runtime;
-- Existing tenant-backup writes, limited to business data; no DELETE on governance.
GRANT INSERT,UPDATE,DELETE ON areas_negocio,centros_custo,categorias,plano_contas,fornecedores,
  clientes,dre,dados_bancarios,empresas,pessoas,produto_grupos,produto_tipos,produto_linhas,
  produtos,produto_sequencias,tarefa_status,tarefas,status_manual_tipos,layouts_colunas,
  lancamentos,import_operations TO a2_runtime;
COMMIT;
