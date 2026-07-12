-- Substitui a constraint UNIQUE global em codigo_barras por uma constraint
-- por-loja: UNIQUE(codigo_barras, loja_id).
--
-- Passos:
--   1. Adiciona loja_id a produtos (FK para lojas, default Matriz).
--   2. Backfill de linhas existentes.
--   3. Torna a coluna NOT NULL.
--   4. Remove o índice/constraint global anterior.
--   5. Cria índice único composto (apenas onde codigo_barras IS NOT NULL).

-- 1. Adicionar coluna (nullable para permitir backfill)
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS loja_id uuid REFERENCES public.lojas(id)
  DEFAULT 'a0000001-0000-4000-8000-000000000001'::uuid;

-- 2. Backfill de produtos existentes sem loja_id
UPDATE public.produtos
  SET loja_id = 'a0000001-0000-4000-8000-000000000001'::uuid
  WHERE loja_id IS NULL;

-- 3. NOT NULL após backfill
ALTER TABLE public.produtos
  ALTER COLUMN loja_id SET NOT NULL;

-- 4. Remover constraint global antiga
ALTER TABLE public.produtos
  DROP CONSTRAINT IF EXISTS produtos_codigo_barras_key;

-- 5. Criar índice único por loja (NULL permitido — produto sem barcode)
CREATE UNIQUE INDEX IF NOT EXISTS produtos_codigo_barras_loja_unique
  ON public.produtos (loja_id, codigo_barras)
  WHERE codigo_barras IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_produtos_loja_id
  ON public.produtos (loja_id);
