-- Migration 275: Correção de drift — colunas de observabilidade faltantes em itens_venda
-- Data: 2026-07-25
--
-- Achado durante validação em staging da migration 274 (BL-2): este ambiente tem
-- itens_venda.custo_unitario_snap (migration 235 parcialmente aplicada), mas NÃO tem
-- tipo_preco_fonte nem regra_aplicada_id — drift em relação ao repositório local, onde
-- a migration 235 adiciona as 3 colunas juntas. A migration 274 (BL-2) assumiu que as 3
-- existiam (pré-requisito documentado da correção de regressão do BL-1), e o INSERT INTO
-- itens_venda falhava para TODA venda (não só promocionais) por referenciar coluna
-- inexistente.
--
-- Correção: adicionar as 2 colunas faltantes, restaurando exatamente o schema pretendido
-- pela migration 235 original. Aditivo, nullable, sem migração de dados.
--
-- Aplicada em regime de urgência diretamente ao ambiente de validação BL-2
-- (ver docs/BL2_RELATORIO_STAGING.md) durante a validação da migration 274, antes de ser
-- commitada neste arquivo — ver docs/BL2_RELATORIO_STAGING.md para o relato completo.

BEGIN;

ALTER TABLE public.itens_venda
  ADD COLUMN IF NOT EXISTS tipo_preco_fonte text,
  ADD COLUMN IF NOT EXISTS regra_aplicada_id uuid;

COMMENT ON COLUMN public.itens_venda.tipo_preco_fonte IS
  'Cópia descritiva do tipo de preço aplicado (mesma origem de tipo_preco), para exibição (PriceTooltip). Restaurado na migration 275 (drift de migration 235).';
COMMENT ON COLUMN public.itens_venda.regra_aplicada_id IS
  'Id da regra/faixa de preço usada como referência visual (regras_preco ou precos_atacado). Sem FK formal: a origem varia por tipo_preco_fonte. Restaurado na migration 275 (drift de migration 235).';

NOTIFY pgrst, 'reload schema';

COMMIT;
