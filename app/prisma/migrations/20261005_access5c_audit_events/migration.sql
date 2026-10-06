-- ACCESS-5C: additive, append-only audit trail. No existing business rows are rewritten.
CREATE TYPE "AuditAccessMode" AS ENUM ('MEMBERSHIP', 'PLATFORM_ADMIN', 'SUPPORT_GRANT', 'SYSTEM');
CREATE TYPE "AuditResult" AS ENUM ('SUCCESS', 'DENIED', 'FAILURE');

CREATE TABLE "audit_events" (
  "id" TEXT NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "actor_identity_id" TEXT,
  "actor_membership_id" TEXT,
  "platform_admin_id" TEXT,
  "tenant_id" TEXT,
  "access_mode" "AuditAccessMode" NOT NULL,
  "support_grant_id" TEXT,
  "action" TEXT NOT NULL,
  "resource_type" TEXT NOT NULL,
  "resource_id" TEXT,
  "result" "AuditResult" NOT NULL,
  "reason" TEXT,
  "metadata" JSONB,
  "changes" JSONB,
  "request_id" TEXT,
  CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "audit_events_membership_context_check" CHECK ("actor_membership_id" IS NULL OR "tenant_id" IS NOT NULL),
  CONSTRAINT "audit_events_support_context_check" CHECK ("support_grant_id" IS NULL OR "tenant_id" IS NOT NULL),
  CONSTRAINT "audit_events_action_check" CHECK (length("action") BETWEEN 3 AND 100),
  CONSTRAINT "audit_events_resource_check" CHECK (length("resource_type") BETWEEN 2 AND 100)
);
CREATE INDEX "audit_events_tenant_id_occurred_at_idx" ON "audit_events"("tenant_id", "occurred_at" DESC);
CREATE INDEX "audit_events_actor_identity_id_occurred_at_idx" ON "audit_events"("actor_identity_id", "occurred_at" DESC);
CREATE INDEX "audit_events_action_occurred_at_idx" ON "audit_events"("action", "occurred_at" DESC);
CREATE INDEX "audit_events_support_grant_id_occurred_at_idx" ON "audit_events"("support_grant_id", "occurred_at" DESC);
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_identity_id_fkey"
  FOREIGN KEY ("actor_identity_id") REFERENCES "auth_identities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actor_membership_id_tenant_id_fkey"
  FOREIGN KEY ("actor_membership_id", "tenant_id") REFERENCES "tenant_memberships"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_platform_admin_id_actor_identity_id_fkey"
  FOREIGN KEY ("platform_admin_id", "actor_identity_id") REFERENCES "platform_admins"("id", "identity_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_support_grant_id_tenant_id_fkey"
  FOREIGN KEY ("support_grant_id", "tenant_id") REFERENCES "support_grants"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION forbid_audit_event_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events are append-only';
END;
$$;
CREATE TRIGGER audit_events_immutable BEFORE UPDATE OR DELETE ON "audit_events"
  FOR EACH ROW EXECUTE FUNCTION forbid_audit_event_mutation();
