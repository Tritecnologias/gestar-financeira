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
