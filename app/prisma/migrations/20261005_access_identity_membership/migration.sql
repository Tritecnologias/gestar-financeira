-- ACCESS-2 applies only to a database with the legacy schema already present.
-- Prisma records this migration; a rerun through migrate deploy is a no-op.
BEGIN;

-- CreateEnum
CREATE TYPE "AccessStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateTable
CREATE TABLE "auth_identities" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "senha_hash" TEXT NOT NULL,
    "status" "AccessStatus" NOT NULL DEFAULT 'ACTIVE',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_memberships" (
    "id" TEXT NOT NULL,
    "identity_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "status" "AccessStatus" NOT NULL DEFAULT 'ACTIVE',
    "role" "MembershipRole" NOT NULL DEFAULT 'MEMBER',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_admins" (
    "id" TEXT NOT NULL,
    "identity_id" TEXT NOT NULL,
    "status" "AccessStatus" NOT NULL DEFAULT 'ACTIVE',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_admins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "legacy_user_access_maps" (
    "id" TEXT NOT NULL,
    "legacy_usuario_id" TEXT NOT NULL,
    "identity_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "membership_id" TEXT,
    "platform_admin_id" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legacy_user_access_maps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auth_identities_email_key" ON "auth_identities"("email");

-- Normalized email is a database invariant, not only an application convention.
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_email_normalized_check"
  CHECK ("email" <> '' AND "email" = lower(btrim("email")));

-- CreateIndex
CREATE INDEX "tenant_memberships_tenant_id_status_idx" ON "tenant_memberships"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_memberships_identity_id_tenant_id_key" ON "tenant_memberships"("identity_id", "tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_memberships_id_identity_id_tenant_id_key" ON "tenant_memberships"("id", "identity_id", "tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "platform_admins_identity_id_key" ON "platform_admins"("identity_id");

-- CreateIndex
CREATE UNIQUE INDEX "platform_admins_id_identity_id_key" ON "platform_admins"("id", "identity_id");

-- CreateIndex
CREATE UNIQUE INDEX "legacy_user_access_maps_legacy_usuario_id_key" ON "legacy_user_access_maps"("legacy_usuario_id");

-- CreateIndex
CREATE INDEX "legacy_user_access_maps_identity_id_idx" ON "legacy_user_access_maps"("identity_id");

-- CreateIndex
CREATE INDEX "legacy_user_access_maps_tenant_id_idx" ON "legacy_user_access_maps"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "legacy_user_access_maps_legacy_usuario_id_tenant_id_key" ON "legacy_user_access_maps"("legacy_usuario_id", "tenant_id");

-- Each legacy user maps either to a business membership or a separate
-- platform administrator, never to both (and never to neither).
ALTER TABLE "legacy_user_access_maps" ADD CONSTRAINT "legacy_user_access_maps_target_check"
  CHECK (("membership_id" IS NOT NULL) <> ("platform_admin_id" IS NOT NULL));

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_id_tenant_id_key" ON "usuarios"("id", "tenant_id");

-- AddForeignKey
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "auth_identities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_admins" ADD CONSTRAINT "platform_admins_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "auth_identities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legacy_user_access_maps" ADD CONSTRAINT "legacy_user_access_maps_legacy_usuario_id_tenant_id_fkey" FOREIGN KEY ("legacy_usuario_id", "tenant_id") REFERENCES "usuarios"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legacy_user_access_maps" ADD CONSTRAINT "legacy_user_access_maps_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "auth_identities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legacy_user_access_maps" ADD CONSTRAINT "legacy_user_access_maps_membership_id_identity_id_tenant_i_fkey" FOREIGN KEY ("membership_id", "identity_id", "tenant_id") REFERENCES "tenant_memberships"("id", "identity_id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "legacy_user_access_maps" ADD CONSTRAINT "legacy_user_access_maps_platform_admin_id_identity_id_fkey" FOREIGN KEY ("platform_admin_id", "identity_id") REFERENCES "platform_admins"("id", "identity_id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
