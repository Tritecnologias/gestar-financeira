import {PORTABLE_HOMOLOG_MIGRATIONS, PORTABLE_PRODUCTION_MIGRATIONS, REQUIRED_MIGRATIONS} from './backup/schema-contract.mjs';
const targets=Object.freeze({
  local:{database:'special_invite_lab',migrator:'a2_migrator',runtime:'a2_runtime',owners:['a2_migrator'],ledgers:[PORTABLE_HOMOLOG_MIGRATIONS,REQUIRED_MIGRATIONS]},
  homolog:{database:'gestar_homolog_pg18',migrator:'pg18_homolog_migrator',runtime:'pg18_homolog_runtime',owners:['pg18_homolog_admin','pg18_homolog_migrator'],ledgers:[PORTABLE_HOMOLOG_MIGRATIONS]},
  production:{database:'gestar_prod_pg18',migrator:'pg18_prod_migrator',runtime:'pg18_prod_runtime',owners:['postgres','pg18_prod_migrator'],ledgers:[PORTABLE_PRODUCTION_MIGRATIONS]},
});

// No caller-controlled SQL. pg_catalog proof is independent of flags, URL and database name.
// Read again inside each Admission transaction; never cache authority across requests.
export function admissionDatabaseGuardSql(profile) {
  const target = Object.hasOwn(targets, profile ?? '') ? targets[profile] : null;
  if (!target) return 'SELECT false AS allowed';
  const {database,migrator,runtime,owners,ledgers}=target;
  return `SELECT (
  current_database()='${database}' AND current_user='${runtime}'
  AND session_user=current_user AND current_schema()='public'
  AND current_schemas(false)=ARRAY['public']::name[]
  AND current_setting('server_version_num')::int BETWEEN 180000 AND 189999
  AND (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database())
    IN (${owners.map(name => "'"+name+"'").join(',')})
  AND (SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname='public')
    IN ('pg_database_owner','${migrator}')
  AND (SELECT count(*)=2 AND bool_and(rolcanlogin AND NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls))
    FROM pg_roles WHERE rolname IN ('${runtime}','${migrator}'))
  AND NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE member IN
    (SELECT oid FROM pg_roles WHERE rolname IN ('${runtime}','${migrator}')))
  AND NOT has_database_privilege(current_user,current_database(),'CREATE')
  AND NOT has_schema_privilege(current_user,'public','CREATE')
  AND (SELECT count(*)=44 AND bool_and(pg_get_userbyid(relowner)='${migrator}')
    FROM pg_class WHERE relnamespace='public'::regnamespace AND relkind IN ('r','p'))
  AND NOT EXISTS(SELECT 1 FROM public._prisma_migrations WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL)
  AND (SELECT count(*)=${ledgers[0].length} AND count(DISTINCT migration_name)=${ledgers[0].length} AND jsonb_object_agg(migration_name,checksum) IN (
    ${ledgers.map(list=>"'"+JSON.stringify(Object.fromEntries(list.map(m=>[m.name,m.sha256])))+"'::jsonb").join(',')}) FROM public._prisma_migrations)
  AND NOT EXISTS(SELECT 1 FROM unnest(ARRAY['_prisma_migrations','audit_events','term_acceptances','access_owner_events']) t
    WHERE has_table_privilege(current_user,'public.'||t,'UPDATE,DELETE,TRUNCATE,TRIGGER')
      OR has_any_column_privilege(current_user,'public.'||t,'UPDATE'))
  AND NOT has_table_privilege(current_user,'public._prisma_migrations','INSERT')
  AND NOT EXISTS(SELECT 1 FROM unnest(ARRAY['admissions','admission_challenges']) t
    WHERE NOT has_table_privilege(current_user,'public.'||t,'SELECT')
      OR NOT has_table_privilege(current_user,'public.'||t,'INSERT')
      OR has_table_privilege(current_user,'public.'||t,'UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES'))
  AND NOT EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
    WHERE c.relnamespace='public'::regnamespace AND c.relname IN ('admissions','admission_challenges')
      AND (a.grantee NOT IN (SELECT oid FROM pg_roles WHERE rolname IN ('${runtime}','${migrator}'))
        OR (a.grantee=(SELECT oid FROM pg_roles WHERE rolname='${runtime}') AND a.is_grantable)))
  AND NOT EXISTS(SELECT 1 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
    WHERE c.relnamespace='public'::regnamespace AND c.relname IN ('admissions','admission_challenges') AND a.attnum>0 AND NOT a.attisdropped
      AND has_column_privilege(current_user,c.oid,a.attnum,'UPDATE') IS DISTINCT FROM
        (CASE c.relname WHEN 'admissions' THEN a.attname=ANY(ARRAY['status','verified_challenge_id','email_verified_at','identity_id','tenant_id','membership_id','provisioned_at','cancelled_at','cancelled_by_admin_id','cancelled_by_identity_id','cancellation_reason'])
          ELSE a.attname=ANY(ARRAY['status','consumed_at','revoked_at','attempt_count','last_attempt_at','delivery_status']) END))
  AND NOT EXISTS(SELECT 1 FROM pg_attribute col JOIN pg_class c ON c.oid=col.attrelid CROSS JOIN LATERAL aclexplode(col.attacl) a
    WHERE c.relnamespace='public'::regnamespace AND c.relname IN ('admissions','admission_challenges')
      AND (a.grantee NOT IN (SELECT oid FROM pg_roles WHERE rolname IN ('${runtime}','${migrator}'))
        OR (a.grantee=(SELECT oid FROM pg_roles WHERE rolname='${runtime}') AND a.is_grantable)))
  AND NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid IN ('public.admissions'::regclass,'public.admission_challenges'::regclass) AND NOT convalidated)
) IS TRUE AS allowed`;

}
// Compatibility name for operational callers; uses the new portable H8 proof.
export const HOMOLOG_DATABASE_GUARD_SQL = admissionDatabaseGuardSql('homolog');
