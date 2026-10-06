-- ACCESS-5B is additive. Rollback: revoke/expire live grants, archive events, then
-- drop support_grant_events, support_grants and these four enums in reverse order.
CREATE TYPE "SupportGrantStatus" AS ENUM ('PENDING', 'ACTIVE', 'REJECTED', 'REVOKED', 'EXPIRED');
CREATE TYPE "SupportAccessLevel" AS ENUM ('READ_ONLY', 'OPERATIONAL');
CREATE TYPE "SupportModule" AS ENUM ('ESTRUTURA_EMPRESA', 'ESTRUTURA_FINANCEIRA');
CREATE TYPE "SupportGrantEventType" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'ACTIVATED', 'USED', 'REVOKED', 'EXPIRED');

CREATE TABLE "support_grants" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "platform_admin_identity_id" TEXT NOT NULL,
  "status" "SupportGrantStatus" NOT NULL DEFAULT 'PENDING',
  "reason" TEXT NOT NULL,
  "modules" "SupportModule"[] NOT NULL,
  "access_level" "SupportAccessLevel" NOT NULL DEFAULT 'READ_ONLY',
  "requested_minutes" INTEGER NOT NULL,
  "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approved_at" TIMESTAMP(3),
  "approved_by_membership_id" TEXT,
  "starts_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3),
  "rejected_at" TIMESTAMP(3),
  "rejection_reason" TEXT,
  "revoked_at" TIMESTAMP(3),
  "revoked_by_identity_id" TEXT,
  "revocation_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "support_grants_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "support_grants_minutes_check" CHECK ("requested_minutes" BETWEEN 15 AND 1440),
  CONSTRAINT "support_grants_reason_check" CHECK (length(btrim("reason")) >= 15),
  CONSTRAINT "support_grants_modules_check" CHECK (cardinality("modules") BETWEEN 1 AND 2),
  CONSTRAINT "support_grants_active_window_check" CHECK (
    "status" <> 'ACTIVE' OR
    ("approved_at" IS NOT NULL AND "approved_by_membership_id" IS NOT NULL AND
     "starts_at" IS NOT NULL AND "expires_at" IS NOT NULL AND "expires_at" > "starts_at")
  )
);
CREATE UNIQUE INDEX "support_grants_id_tenant_id_key" ON "support_grants"("id", "tenant_id");
CREATE INDEX "support_grants_tenant_id_status_expires_at_idx" ON "support_grants"("tenant_id", "status", "expires_at");
CREATE INDEX "support_grants_platform_admin_identity_id_status_expires_at_idx" ON "support_grants"("platform_admin_identity_id", "status", "expires_at");
ALTER TABLE "support_grants" ADD CONSTRAINT "support_grants_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "support_grants" ADD CONSTRAINT "support_grants_platform_admin_identity_id_fkey"
  FOREIGN KEY ("platform_admin_identity_id") REFERENCES "auth_identities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "support_grants" ADD CONSTRAINT "support_grants_approved_by_membership_id_tenant_id_fkey"
  FOREIGN KEY ("approved_by_membership_id", "tenant_id") REFERENCES "tenant_memberships"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "support_grants" ADD CONSTRAINT "support_grants_revoked_by_identity_id_fkey"
  FOREIGN KEY ("revoked_by_identity_id") REFERENCES "auth_identities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "support_grant_events" (
  "id" TEXT NOT NULL,
  "grant_id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "type" "SupportGrantEventType" NOT NULL,
  "actor_identity_id" TEXT,
  "detail" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "support_grant_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "support_grant_events_tenant_id_created_at_idx" ON "support_grant_events"("tenant_id", "created_at");
CREATE INDEX "support_grant_events_grant_id_created_at_idx" ON "support_grant_events"("grant_id", "created_at");
ALTER TABLE "support_grant_events" ADD CONSTRAINT "support_grant_events_grant_id_tenant_id_fkey"
  FOREIGN KEY ("grant_id", "tenant_id") REFERENCES "support_grants"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "support_grant_events" ADD CONSTRAINT "support_grant_events_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "support_grant_events" ADD CONSTRAINT "support_grant_events_actor_identity_id_fkey"
  FOREIGN KEY ("actor_identity_id") REFERENCES "auth_identities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
