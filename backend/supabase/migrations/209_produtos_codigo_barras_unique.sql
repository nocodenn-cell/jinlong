-- codigo_barras já é UNIQUE globalmente desde migration 001
-- (definido como `codigo_barras text unique`, gera constraint produtos_codigo_barras_key).
-- Esta migration apenas renomeia a constraint para o nome canônico do projeto.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.produtos'::regclass
       AND conname  = 'produtos_codigo_barras_key'
  ) THEN
    ALTER TABLE public.produtos
      RENAME CONSTRAINT produtos_codigo_barras_key TO produtos_codigo_barras_uq;
  END IF;
END;
$$;
