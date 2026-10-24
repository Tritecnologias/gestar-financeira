-- Preserve Status Base and all existing records.
ALTER TABLE public.lancamentos
  ALTER COLUMN data_lanc DROP NOT NULL,
  ALTER COLUMN descricao DROP NOT NULL,
  ALTER COLUMN valor DROP NOT NULL,
  ALTER COLUMN tipo DROP NOT NULL;
