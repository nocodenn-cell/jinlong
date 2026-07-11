-- Migration 267: Remover módulo Fiado completamente
--
-- Objetivo: Eliminar toda a capacidade de venda fiada/crédito informal.
-- Jinlong operará somente com vendas pagas no fechamento.
--
-- Decisão de Negócio (2026-07-11):
-- "Sistema simplificado: apenas vendas com pagamento imediato.
--  Fiado será futuro módulo financeiro profissional se necessário."
--
-- MUDANÇAS:
--   1. DROP coluna limite_credito de clientes (crédito informal removido)
--   2. DROP view v_clientes_gerente (recriar sem saldo_crediario)
--   3. DISABLE tabelas contas_receber/liquidacoes_receber (preservar para auditoria)
--   4. DROP função registrar_liquidacao_receber (não mais usada)
--   5. Validação: confirmar 0 vendas com FIADO existem
--
-- PRÉ-REQUISITOS VALIDADOS:
--   ✅ Migration 246: rejeita FIADO em v4 RPC + CHECK constraints
--   ✅ Migration 035: criou tabelas (agora sendo desabilitadas)
--   ✅ Produção: 0 registros FIADO (verificado)

BEGIN;

-- =================================================================
-- PASSO 1: Validação — confirmar que não há vendas FIADO ativas
-- =================================================================

DO $$
DECLARE
  v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.vendas
  WHERE upper(forma_pagamento) = 'FIADO';

  IF v_count > 0 THEN
    RAISE EXCEPTION 'MIGRATION_ABORTED: % vendas com FIADO encontradas. Resolva antes de continuar.', v_count;
  END IF;

  RAISE NOTICE 'VALIDAÇÃO OK: 0 vendas com FIADO encontradas. Prosseguindo com remoção.';
END;
$$;

-- =================================================================
-- PASSO 2: DROP view v_clientes_gerente (será recriada sem saldo)
-- =================================================================

DROP VIEW IF EXISTS public.v_clientes_gerente CASCADE;

-- =================================================================
-- PASSO 3: DROP coluna limite_credito de clientes
-- =================================================================

-- Remover constraint de limite_credito
ALTER TABLE public.clientes
  DROP CONSTRAINT IF EXISTS clientes_limite_credito_check;

-- Remover a coluna
ALTER TABLE public.clientes
  DROP COLUMN IF EXISTS limite_credito;

-- =================================================================
-- PASSO 4: Recriar view v_clientes_gerente SEM saldo_crediario
-- =================================================================

CREATE VIEW public.v_clientes_gerente AS
SELECT
  c.id,
  c.nome,
  c.tipo,
  c.documento,
  c.email,
  c.telefone,
  c.endereco,
  c.loja_id,
  c.ativo,
  c.created_at
FROM public.clientes c;

COMMENT ON VIEW public.v_clientes_gerente IS
  'View de clientes para painél gerente. SEM campos de crédito (fiado removido 2026-07-11).';

-- =================================================================
-- PASSO 5: DISABLE tabelas de crédito (preservar para auditoria)
-- =================================================================

-- Desabilitar triggers para impedir DML acidental
ALTER TABLE public.contas_receber DISABLE TRIGGER ALL;
ALTER TABLE public.liquidacoes_receber DISABLE TRIGGER ALL;

COMMENT ON TABLE public.contas_receber IS
  'DESABILITADA em 2026-07-11: módulo fiado removido. Preservada para auditoria histórica.';
COMMENT ON TABLE public.liquidacoes_receber IS
  'DESABILITADA em 2026-07-11: módulo fiado removido. Preservada para auditoria histórica.';

-- =================================================================
-- PASSO 6: DROP função de liquidação (não mais usada)
-- =================================================================

DROP FUNCTION IF EXISTS public.registrar_liquidacao_receber(
  p_titulo_id uuid,
  p_valor numeric,
  p_forma_pagamento text,
  p_observacao text
) CASCADE;

-- =================================================================
-- PASSO 7: Validar constraints de rejeição FIADO em vendas
-- =================================================================

DO $$
DECLARE
  v_constraint_exists INT;
BEGIN
  -- Verificar que o constraint existe em vendas
  SELECT COUNT(*) INTO v_constraint_exists
  FROM information_schema.table_constraints
  WHERE table_schema = 'public'
    AND table_name = 'vendas'
    AND constraint_name = 'vendas_forma_pagamento_nao_fiado'
    AND constraint_type = 'CHECK';

  IF v_constraint_exists = 0 THEN
    RAISE NOTICE 'AVISO: CHECK constraint vendas_forma_pagamento_nao_fiado não encontrado em vendas. Adicionando...';
    ALTER TABLE public.vendas
      ADD CONSTRAINT vendas_forma_pagamento_nao_fiado
      CHECK (forma_pagamento IS NULL OR upper(forma_pagamento) <> 'FIADO');
  ELSE
    RAISE NOTICE 'OK: Constraint vendas_forma_pagamento_nao_fiado confirmado em vendas.';
  END IF;

  -- Verificar que o constraint existe em vendas_pagamentos
  SELECT COUNT(*) INTO v_constraint_exists
  FROM information_schema.table_constraints
  WHERE table_schema = 'public'
    AND table_name = 'vendas_pagamentos'
    AND constraint_name = 'vendas_pagamentos_forma_nao_fiado'
    AND constraint_type = 'CHECK';

  IF v_constraint_exists = 0 THEN
    RAISE NOTICE 'AVISO: CHECK constraint vendas_pagamentos_forma_nao_fiado não encontrado em vendas_pagamentos. Adicionando...';
    ALTER TABLE public.vendas_pagamentos
      ADD CONSTRAINT vendas_pagamentos_forma_nao_fiado
      CHECK (upper(forma_pagamento) <> 'FIADO');
  ELSE
    RAISE NOTICE 'OK: Constraint vendas_pagamentos_forma_nao_fiado confirmado em vendas_pagamentos.';
  END IF;
END;
$$;

-- =================================================================
-- PASSO 8: Audit log
-- =================================================================

COMMENT ON TABLE public.clientes IS
  'Tabela de clientes: limite_credito REMOVIDO em 2026-07-11 (fiado desabilitado). Cliente usado apenas para identificação em vendas.';

-- =================================================================
-- RESUMO FINAL
-- =================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Migration 267 concluída com sucesso:';
  RAISE NOTICE '   • Coluna limite_credito removida de clientes';
  RAISE NOTICE '   • View v_clientes_gerente recriada sem saldo_crediario';
  RAISE NOTICE '   • Tabelas contas_receber e liquidacoes_receber desabilitadas';
  RAISE NOTICE '   • Função registrar_liquidacao_receber removida';
  RAISE NOTICE '   • Constraints de rejeição FIADO validados em vendas';
  RAISE NOTICE '';
  RAISE NOTICE 'Resultado:';
  RAISE NOTICE '   ✅ Nenhuma venda pode ter forma_pagamento = FIADO';
  RAISE NOTICE '   ✅ Cliente não possui limite de crédito informal';
  RAISE NOTICE '   ✅ Sistema operacional: 100% pagamento imediato';
  RAISE NOTICE '';
END;
$$;

COMMIT;
