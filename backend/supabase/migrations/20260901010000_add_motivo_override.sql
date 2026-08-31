-- ID 50: Auditoria — capturar motivo quando operador faz override de preço

BEGIN;

-- Adicionar coluna motivo_override (nullable, para compatibilidade com linhas antigas)
ALTER TABLE public.itens_venda
ADD COLUMN IF NOT EXISTS motivo_override TEXT DEFAULT NULL;

-- Índice para auditoria rápida
CREATE INDEX IF NOT EXISTS idx_itens_venda_motivo_override
ON public.itens_venda(motivo_override)
WHERE motivo_override IS NOT NULL;

-- Comentário
COMMENT ON COLUMN public.itens_venda.motivo_override IS
  'ID 50: Razão registrada quando operador faz override manual de preço (tipoPreco=MANUAL)';

COMMIT;
