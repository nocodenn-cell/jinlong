-- Migration 273: BL-2 — Schema base para promoções (modelo aprovado: regra aplicada)
-- Data: 2026-07-24
-- Referência: docs/BL2_MODELO_FINAL_APROVADO.md
--
-- Decisão registrada (aprovada): promoção é uma REGRA aplicada sobre um preço base
-- já calculado pelo SSOT (calcular_preco_produto). NÃO é um novo tipo_preco.
-- tipo_preco permanece 'VAREJO' | 'ATACADO' | 'MANUAL' — sem alteração de CHECK constraint.
--
-- Decisões de negócio aprovadas nesta rodada:
--   - max_desconto_total_percentual = 60% (teto agregado da venda)
--   - Promoção cadastrada é pré-autorizada (GERENTE/DONO/ADMIN via RLS de regras_preco),
--     análoga a ATACADO — não passa pelo teto de desconto manual por item.
--   - regras_preco.nome: obrigatório na UI de cadastro; nullable no schema (compatibilidade
--     com regras já existentes antes do BL-2).
--   - Cliente/VIP: fora de escopo desta rodada (regras_preco não ganha cliente_id aqui).
--
-- Todas as mudanças são aditivas (ADD COLUMN nullable / DEFAULT), sem migração de dados,
-- sem impacto em vendas históricas (ficam com as novas colunas em NULL).

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PARTE A: regras_preco ganha identificação humana (nome) — para snapshot de auditoria
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'regras_preco' AND column_name = 'nome'
  ) THEN
    ALTER TABLE public.regras_preco ADD COLUMN nome text;
  END IF;
END $$;

COMMENT ON COLUMN public.regras_preco.nome IS
  'Nome legível da promoção/regra (ex.: "Black Friday 2026"). Obrigatório na UI de cadastro '
  '(GERENTE/DONO/ADMIN); nullable no schema para não quebrar regras já cadastradas antes do BL-2.';

-- ═══════════════════════════════════════════════════════════════════════════════
-- PARTE B: itens_venda ganha auditoria DEDICADA de promoção (FK real, não polimórfica)
--
-- Nota de desenho: itens_venda já tem `regra_aplicada_id` desde a migration 235, mas
-- essa coluna é polimórfica e SEM FK formal (pode apontar para regras_preco OU
-- precos_atacado, dependendo de tipo_preco_fonte). Não é seguro reaproveitá-la para
-- autoridade de promoção — por isso as colunas abaixo são novas e dedicadas.
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'itens_venda' AND column_name = 'promocao_regra_id'
  ) THEN
    ALTER TABLE public.itens_venda
      ADD COLUMN promocao_regra_id uuid REFERENCES public.regras_preco(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'itens_venda' AND column_name = 'promocao_desconto_percentual'
  ) THEN
    ALTER TABLE public.itens_venda ADD COLUMN promocao_desconto_percentual numeric(10,4);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'itens_venda' AND column_name = 'promocao_nome_snapshot'
  ) THEN
    ALTER TABLE public.itens_venda ADD COLUMN promocao_nome_snapshot text;
  END IF;
END $$;

COMMENT ON COLUMN public.itens_venda.promocao_regra_id IS
  'FK real e dedicada para public.regras_preco(id) quando uma promoção foi aplicada neste '
  'item. Distinto de regra_aplicada_id (migration 235), que é polimórfico/visual. '
  'ON DELETE SET NULL preserva o histórico da venda se a regra for excluída depois '
  '(o nome fica preservado em promocao_nome_snapshot).';
COMMENT ON COLUMN public.itens_venda.promocao_desconto_percentual IS
  'Percentual de desconto de promoção efetivamente aplicado neste item, normalizado mesmo '
  'quando regras_preco.tipo_desconto = VALOR_FIXO. Calculado e gravado por '
  'finalizar_venda_transacional_canonica_v4 (migration 274).';
COMMENT ON COLUMN public.itens_venda.promocao_nome_snapshot IS
  'Cópia congelada de regras_preco.nome no momento da venda. Sobrevive a delete/edição '
  'futura da regra — garante que relatórios históricos continuem identificando a promoção.';

-- Índice para relatórios de auditoria ("quantas vendas tiveram a promoção X")
CREATE INDEX IF NOT EXISTS idx_itens_venda_promocao_regra
  ON public.itens_venda(promocao_regra_id)
  WHERE promocao_regra_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PARTE C: pdv_config ganha teto agregado de desconto total por venda (risco P0-03)
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.pdv_config
  ADD COLUMN IF NOT EXISTS max_desconto_total_percentual numeric(5,2) NOT NULL DEFAULT 60.00;

COMMENT ON COLUMN public.pdv_config.max_desconto_total_percentual IS
  'Teto agregado de desconto (promoção + manual + desconto de gerente) sobre o '
  'total_bruto da venda. Validado em finalizar_venda_transacional_canonica_v4 '
  '(migration 274). Padrão aprovado: 60%.';

NOTIFY pgrst, 'reload schema';

COMMIT;
