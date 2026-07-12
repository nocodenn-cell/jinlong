-- Auditoria de fechamento de caixa:
-- guarda diferença apurada no fechamento e justificativa operacional.

ALTER TABLE public.caixas
  ADD COLUMN IF NOT EXISTS fechamento_diferenca numeric(10,2),
  ADD COLUMN IF NOT EXISTS fechamento_observacao text;

COMMENT ON COLUMN public.caixas.fechamento_diferenca IS
  'Diferença entre valor contado e valor sistema (dinheiro) no momento do fechamento.';

COMMENT ON COLUMN public.caixas.fechamento_observacao IS
  'Justificativa de fechamento quando há divergência relevante.';
