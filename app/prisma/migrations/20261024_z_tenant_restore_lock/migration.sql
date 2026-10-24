-- A shared transaction lock participates in every tenant-scoped INSERT/UPDATE/DELETE.
-- Restore holds its exclusive counterpart. No bypass flag and no table/global lock.
CREATE FUNCTION public.guard_tenant_restore_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE old_t text; new_t text; v text;
BEGIN
  IF TG_OP <> 'INSERT' THEN old_t := to_jsonb(OLD)->>TG_ARGV[0]; END IF;
  IF TG_OP <> 'DELETE' THEN new_t := to_jsonb(NEW)->>TG_ARGV[0]; END IF;
  FOR v IN SELECT DISTINCT x FROM unnest(ARRAY[old_t,new_t]) x WHERE x IS NOT NULL ORDER BY x LOOP
    IF NOT pg_try_advisory_xact_lock_shared(hashtextextended('10s:tenant-restore:' || v,0)) THEN
      RAISE EXCEPTION USING ERRCODE='55P03', MESSAGE='TENANT_RESTORE_IN_PROGRESS';
    END IF;
  END LOOP;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.access_invites
FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');
CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.access_owner_events
FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');
CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.access_profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');
CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.areas_negocio
FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');
CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.audit_events
FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');
CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.categorias
FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');
CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.centros_custo
FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');
CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.clientes
FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');
CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.dados_bancarios
FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');
CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.dre
FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');
CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.empresas
FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');
CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.fornecedores
FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');
CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.import_operations
FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');
CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.lancamentos
FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');
CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.layouts_colunas
FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');
CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.legacy_user_access_maps
FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');
CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.pessoas
FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');
CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.plano_contas
FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');
CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.produto_grupos
FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');
CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.produto_linhas
FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');
CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.produto_sequencias
FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');
CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.produto_tipos
FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');
CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.produtos
FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');
CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.status_manual_tipos
FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');
CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.support_grant_events
FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');
CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.support_grants
FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');
CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.tarefa_status
FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');
CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.tarefas
FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');
CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.tenant_contractual_responsibles
FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');
CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.tenant_memberships
FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');
CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.term_acceptances
FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');
CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.usuarios
FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('tenant_id');
CREATE TRIGGER tenant_restore_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.guard_tenant_restore_write('id');
