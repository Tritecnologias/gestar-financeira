-- Run inside BEGIN READ ONLY, REPEATABLE READ. Never select senha_hash.
-- Output is input to the in-memory planner; persist only its pseudonymous plan.
SELECT u.id::text AS id,u.email,u.tenant_id::text AS "tenantId",u.papel AS role,
  u.ativo AS active,t.ativo AS "tenantActive",
  (SELECT count(*)::integer FROM lancamentos l WHERE l.criado_por=u.id) AS authorship,
  (SELECT count(*)::integer FROM lancamentos l WHERE l.criado_por=u.id AND l.tenant_id<>u.tenant_id) AS "crossTenantAuthorship"
FROM usuarios u JOIN tenants t ON t.id=u.tenant_id ORDER BY u.id;
