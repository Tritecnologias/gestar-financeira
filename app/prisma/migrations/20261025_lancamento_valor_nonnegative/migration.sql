-- F9-02: explicit zero is valid storage, not proof of financial realization.
-- No row rewrite/backfill; preserve defaults, historical checksums and triggers.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
LOCK TABLE public.lancamentos IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE definition text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO definition
  FROM pg_constraint
  WHERE conrelid = 'public.lancamentos'::regclass
    AND conname = 'lancamentos_valor_check';

  -- The Prisma baseline has no such check; reconciled legacy databases have >0.
  -- Any other definition requires investigation, never a silent replacement.
  IF definition IS NOT NULL
     AND definition <> 'CHECK ((valor > (0)::numeric))' THEN
    RAISE EXCEPTION 'F9_02_UNEXPECTED_VALOR_CONSTRAINT';
  END IF;
END;
$$;

ALTER TABLE public.lancamentos
  DROP CONSTRAINT IF EXISTS lancamentos_valor_check;
ALTER TABLE public.lancamentos
  ADD CONSTRAINT lancamentos_valor_check
  CHECK (valor IS NULL OR valor >= 0);
COMMIT;
