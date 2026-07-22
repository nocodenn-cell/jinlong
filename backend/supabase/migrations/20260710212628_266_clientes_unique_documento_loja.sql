CREATE UNIQUE INDEX IF NOT EXISTS clientes_loja_documento_unique
  ON public.clientes (loja_id, documento)
  WHERE documento IS NOT NULL;
