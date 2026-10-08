-- GO-LIVE-2B: convite aditivo; nenhuma identidade ou vínculo existente é reescrito.
CREATE TYPE "AccessInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

CREATE TABLE "access_invites" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "role" "MembershipRole" NOT NULL,
  "profile_id" TEXT NOT NULL,
  "status" "AccessInviteStatus" NOT NULL DEFAULT 'PENDING',
  "token_hash" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "invited_by_identity_id" TEXT NOT NULL,
  "accepted_by_identity_id" TEXT,
  "revoked_by_identity_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "accepted_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  CONSTRAINT "access_invites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "access_invites_token_hash_key" ON "access_invites"("token_hash");
CREATE UNIQUE INDEX "access_invites_one_pending_email_tenant" ON "access_invites"("tenant_id", "email") WHERE "status" = 'PENDING';
CREATE INDEX "access_invites_tenant_id_status_created_at_idx" ON "access_invites"("tenant_id", "status", "created_at" DESC);
CREATE INDEX "access_invites_tenant_id_email_status_idx" ON "access_invites"("tenant_id", "email", "status");
ALTER TABLE "access_invites" ADD CONSTRAINT "access_invites_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "access_invites" ADD CONSTRAINT "access_invites_profile_id_tenant_id_fkey" FOREIGN KEY ("profile_id", "tenant_id") REFERENCES "access_profiles"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "access_invites" ADD CONSTRAINT "access_invites_invited_by_identity_id_fkey" FOREIGN KEY ("invited_by_identity_id") REFERENCES "auth_identities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "access_invites" ADD CONSTRAINT "access_invites_accepted_by_identity_id_fkey" FOREIGN KEY ("accepted_by_identity_id") REFERENCES "auth_identities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "access_invites" ADD CONSTRAINT "access_invites_revoked_by_identity_id_fkey" FOREIGN KEY ("revoked_by_identity_id") REFERENCES "auth_identities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
