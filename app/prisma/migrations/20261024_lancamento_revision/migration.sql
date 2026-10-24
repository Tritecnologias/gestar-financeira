-- Additive: preserve every historical timestamp and financial value.
-- Database-owned counter covers Prisma, raw SQL and future writers alike.
ALTER TABLE public.lancamentos ADD COLUMN revisao bigint NOT NULL DEFAULT 0;
ALTER TABLE public.lancamentos ADD CONSTRAINT lancamentos_revisao_nonnegative CHECK (revisao >= 0);

CREATE FUNCTION public.bump_lancamento_revision() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.revisao := OLD.revisao + 1;
  RETURN NEW;
END;
$$;

CREATE TRIGGER lancamento_revision_before_update
BEFORE UPDATE ON public.lancamentos
FOR EACH ROW EXECUTE FUNCTION public.bump_lancamento_revision();
