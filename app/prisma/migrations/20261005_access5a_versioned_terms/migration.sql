-- ACCESS-5A: additive legal-document catalog, explicit contractual owner and immutable evidence.
CREATE TYPE "TermAudience" AS ENUM ('CONTRATANTE', 'USUARIO');
CREATE TYPE "TermVersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');

CREATE UNIQUE INDEX "tenant_memberships_id_tenant_id_key" ON "tenant_memberships"("id", "tenant_id");

CREATE TABLE "tenant_contractual_responsibles" (
  "tenant_id" TEXT NOT NULL PRIMARY KEY,
  "membership_id" TEXT NOT NULL UNIQUE,
  "assigned_by_identity_id" TEXT NOT NULL,
  "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tenant_contractual_responsibles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "tenant_contractual_responsibles_membership_id_tenant_id_fkey" FOREIGN KEY ("membership_id", "tenant_id") REFERENCES "tenant_memberships"("id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "tenant_contractual_responsibles_assigned_by_identity_id_fkey" FOREIGN KEY ("assigned_by_identity_id") REFERENCES "auth_identities"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "tenant_contractual_responsibles_membership_id_tenant_id_key" ON "tenant_contractual_responsibles"("membership_id", "tenant_id");

CREATE TABLE "term_documents" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "code" TEXT NOT NULL UNIQUE,
  "audience" "TermAudience" NOT NULL,
  "required" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "term_versions" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "document_id" TEXT NOT NULL,
  "version" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "storage_key" TEXT NOT NULL UNIQUE,
  "mime_type" TEXT NOT NULL,
  "byte_size" INTEGER NOT NULL,
  "sha256" TEXT NOT NULL,
  "status" "TermVersionStatus" NOT NULL DEFAULT 'DRAFT',
  "requires_reaccept" BOOLEAN NOT NULL DEFAULT true,
  "published_at" TIMESTAMP(3),
  "published_by_identity_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "term_versions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "term_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "term_versions_published_by_identity_id_fkey" FOREIGN KEY ("published_by_identity_id") REFERENCES "auth_identities"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "term_versions_byte_size_check" CHECK ("byte_size" > 0),
  CONSTRAINT "term_versions_sha256_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "term_versions_publication_check" CHECK (("status" = 'DRAFT' AND "published_at" IS NULL AND "published_by_identity_id" IS NULL) OR ("status" <> 'DRAFT' AND "published_at" IS NOT NULL AND "published_by_identity_id" IS NOT NULL))
);
CREATE UNIQUE INDEX "term_versions_document_id_version_key" ON "term_versions"("document_id", "version");
CREATE INDEX "term_versions_document_id_status_idx" ON "term_versions"("document_id", "status");
CREATE UNIQUE INDEX "term_versions_one_published_per_document" ON "term_versions"("document_id") WHERE "status" = 'PUBLISHED';

CREATE TABLE "term_acceptances" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "identity_id" TEXT NOT NULL,
  "term_version_id" TEXT NOT NULL,
  "tenant_id" TEXT,
  "membership_id" TEXT,
  "scope_key" TEXT NOT NULL,
  "role_at_acceptance" TEXT,
  "accepted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ip_address" TEXT,
  "user_agent" TEXT,
  "document_hash" TEXT NOT NULL,
  CONSTRAINT "term_acceptances_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "auth_identities"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "term_acceptances_term_version_id_fkey" FOREIGN KEY ("term_version_id") REFERENCES "term_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "term_acceptances_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "term_acceptances_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "tenant_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "term_acceptances_scope_check" CHECK (("tenant_id" IS NULL AND "membership_id" IS NULL AND "scope_key" = 'GLOBAL' AND "role_at_acceptance" IS NULL) OR ("tenant_id" IS NOT NULL AND "membership_id" IS NOT NULL AND "scope_key" = "tenant_id" AND "role_at_acceptance" = 'OWNER')),
  CONSTRAINT "term_acceptances_hash_check" CHECK ("document_hash" ~ '^[0-9a-f]{64}$')
);
CREATE UNIQUE INDEX "term_acceptances_identity_id_term_version_id_scope_key_key" ON "term_acceptances"("identity_id", "term_version_id", "scope_key");
CREATE INDEX "term_acceptances_tenant_id_accepted_at_idx" ON "term_acceptances"("tenant_id", "accepted_at");
CREATE INDEX "term_acceptances_term_version_id_accepted_at_idx" ON "term_acceptances"("term_version_id", "accepted_at");

-- Published content/metadata cannot be replaced; only PUBLISHED -> RETIRED is allowed.
CREATE FUNCTION access5a_protect_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status IN ('PUBLISHED', 'RETIRED') THEN
    IF NEW.status <> 'RETIRED' OR
       (to_jsonb(NEW) - 'status') IS DISTINCT FROM (to_jsonb(OLD) - 'status') THEN
      RAISE EXCEPTION 'Published term versions are immutable';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER access5a_version_immutable BEFORE UPDATE ON "term_versions"
  FOR EACH ROW EXECUTE FUNCTION access5a_protect_version();
CREATE FUNCTION access5a_prevent_evidence_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Term acceptances are append-only';
END $$;
CREATE TRIGGER access5a_acceptance_append_only BEFORE UPDATE OR DELETE ON "term_acceptances"
  FOR EACH ROW EXECUTE FUNCTION access5a_prevent_evidence_change();
