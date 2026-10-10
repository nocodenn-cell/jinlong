DO $pre$
BEGIN
  IF to_regprocedure('auth.uid()') IS NULL THEN RAISE EXCEPTION 'PRECHECK auth.uid'; END IF;
  IF to_regprocedure('auth.role()') IS NULL THEN RAISE EXCEPTION 'PRECHECK auth.role'; END IF;
  IF to_regclass('public.documentos_fiscais_pendentes') IS NULL THEN RAISE EXCEPTION 'PRECHECK fila'; END IF;
  IF to_regclass('public.documentos_fiscais_eventos') IS NULL THEN RAISE EXCEPTION 'PRECHECK eventos'; END IF;
  IF to_regclass('public.documentos_fiscais_dlq') IS NULL THEN RAISE EXCEPTION 'PRECHECK dlq'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'usuarios' AND column_name = 'ativo'
  ) THEN RAISE EXCEPTION 'PRECHECK usuarios.ativo'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'caixas' AND column_name = 'loja_id'
  ) THEN RAISE EXCEPTION 'PRECHECK caixas.loja_id'; END IF;
END
$pre$;
