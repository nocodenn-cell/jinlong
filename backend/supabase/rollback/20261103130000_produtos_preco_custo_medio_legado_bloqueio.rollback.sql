-- Rollback de 20261103130000 (ADR-008 Emenda 1 · T2): remove o bloqueio e o comentário de depreciação.
-- Não altera dados: a coluna preco_custo_medio permanece como estava.
BEGIN;

DROP TRIGGER IF EXISTS trg_produtos_custo_medio_legado_bloqueio ON public.produtos;
DROP FUNCTION IF EXISTS public.trg_produtos_custo_medio_legado_bloqueio();
COMMENT ON COLUMN public.produtos.preco_custo_medio IS NULL;

COMMIT;
