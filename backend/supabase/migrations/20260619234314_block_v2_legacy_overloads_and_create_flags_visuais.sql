-- Capture: migration aplicada diretamente no DB em 2026-06-19.
-- Bloqueia TODOS os overloads de v2 e v3 substituindo por stubs LEGACY_DISABLED_USE_V4.
-- Contexto: v4 é o único fluxo canônico. v2/v3 são guards de transição, não deprecação permanente.
-- Idempotente: CREATE OR REPLACE.
--
-- GUARD (2026-07-03): o overload com p_venda_id (12 args) abaixo já é definido em
-- 118_fix_vendas_pagamentos_concurrency.sql com DEFAULT em quase todos os
-- parâmetros (só p_venda_id/p_caixa_id são obrigatórios). Postgres proíbe
-- CREATE OR REPLACE remover defaults de uma função existente com a mesma
-- assinatura (SQLSTATE 42P13 "cannot remove parameter defaults from existing
-- function") — este arquivo original omitia todos os DEFAULT, o que só não
-- quebrava no remoto porque lá a ordem cronológica real de aplicação era
-- outra (capture pós-fato, não replay sequencial). Restaurados os mesmos
-- DEFAULT de 118: o corpo é RAISE EXCEPTION incondicional — nunca lê os
-- parâmetros — então isso não muda nenhum comportamento, só corrige a
-- assinatura para o CREATE OR REPLACE ser estruturalmente válido.

-- Bloqueia v2 (overload com parâmetros de loja/caixa/operador)
CREATE OR REPLACE FUNCTION public.finalizar_venda_transacional_canonica_v2(
  p_loja_id uuid,
  p_caixa_id uuid,
  p_operador_id uuid,
  p_itens jsonb,
  p_pagamentos jsonb,
  p_total_bruto numeric,
  p_total_desconto numeric,
  p_total_liquido numeric,
  p_desconto_gerente_token text DEFAULT NULL,
  p_desconto_gerente_percentual numeric DEFAULT NULL,
  p_tipo_venda text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RAISE EXCEPTION 'LEGACY_DISABLED_USE_V4';
END;
$$;

-- Bloqueia v2 (overload com venda_id) — DEFAULTs preservados de 118 (ver GUARD acima)
CREATE OR REPLACE FUNCTION public.finalizar_venda_transacional_canonica_v2(
  p_venda_id uuid,
  p_caixa_id uuid,
  p_operador_id uuid DEFAULT NULL,
  p_forma_pagamento text DEFAULT 'DINHEIRO',
  p_total_bruto numeric DEFAULT NULL,
  p_total_desconto numeric DEFAULT NULL,
  p_total_liquido numeric DEFAULT NULL,
  p_pagamentos jsonb DEFAULT NULL,
  p_itens jsonb DEFAULT '[]'::jsonb,
  p_desconto_gerente_token text DEFAULT NULL,
  p_desconto_gerente_percentual numeric DEFAULT NULL,
  p_strict_manager_discount_auth boolean DEFAULT false
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RAISE EXCEPTION 'LEGACY_DISABLED_USE_V4';
END;
$$;

-- Bloqueia v2 (overload com event_source)
CREATE OR REPLACE FUNCTION public.finalizar_venda_transacional_canonica_v2(
  p_venda_id uuid,
  p_caixa_id uuid,
  p_operador_id uuid DEFAULT NULL,
  p_forma_pagamento text DEFAULT 'DINHEIRO',
  p_total_bruto numeric DEFAULT NULL,
  p_total_desconto numeric DEFAULT NULL,
  p_total_liquido numeric DEFAULT NULL,
  p_pagamentos jsonb DEFAULT NULL,
  p_itens jsonb DEFAULT '[]',
  p_desconto_gerente_token text DEFAULT NULL,
  p_desconto_gerente_percentual numeric DEFAULT NULL,
  p_strict_manager_discount_auth boolean DEFAULT false,
  p_event_source text DEFAULT 'sync_outbox'
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RAISE EXCEPTION 'LEGACY_DISABLED_USE_V4';
END;
$$;
