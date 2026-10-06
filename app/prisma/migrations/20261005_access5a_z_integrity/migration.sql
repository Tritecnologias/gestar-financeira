-- Strengthen evidence links and prohibit deleting published history.
ALTER TABLE "term_acceptances" DROP CONSTRAINT "term_acceptances_membership_id_fkey";
ALTER TABLE "term_acceptances" ADD CONSTRAINT "term_acceptances_membership_id_identity_id_tenant_id_fkey"
  FOREIGN KEY ("membership_id", "identity_id", "tenant_id") REFERENCES "tenant_memberships"("id", "identity_id", "tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE OR REPLACE FUNCTION access5a_protect_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'DRAFT' THEN RAISE EXCEPTION 'Published term versions cannot be deleted'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status IN ('PUBLISHED', 'RETIRED') THEN
    IF NEW.status <> 'RETIRED' OR
       (to_jsonb(NEW) - 'status') IS DISTINCT FROM (to_jsonb(OLD) - 'status') THEN
      RAISE EXCEPTION 'Published term versions are immutable';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER access5a_version_immutable ON "term_versions";
CREATE TRIGGER access5a_version_immutable BEFORE UPDATE OR DELETE ON "term_versions"
  FOR EACH ROW EXECUTE FUNCTION access5a_protect_version();
