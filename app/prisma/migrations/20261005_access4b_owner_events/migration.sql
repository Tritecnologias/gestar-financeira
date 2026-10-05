-- Record explicit PlatformAdmin designations without modifying historical memberships.
BEGIN;
CREATE TABLE "access_owner_events" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "actor_identity_id" TEXT,
  "actor_legacy_user_id" TEXT,
  "target_identity_id" TEXT NOT NULL,
  "target_membership_id" TEXT NOT NULL,
  "previous_role" TEXT,
  "previous_status" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "access_owner_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "access_owner_events_tenant_id_created_at_idx" ON "access_owner_events"("tenant_id", "created_at");
ALTER TABLE "access_owner_events" ADD CONSTRAINT "access_owner_events_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
COMMIT;
