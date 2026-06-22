-- Capture: migration aplicada diretamente no DB em 2026-06-19.
-- Bloqueia TODOS os overloads de v2 e v3 substituindo por stubs LEGACY_DISABLED_USE_V4.
-- Contexto: v4 é o único fluxo canônico. v2/v3 são guards de transição, não deprecação permanente.
-- Idempotente: CREATE OR REPLACE.

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

-- Bloqueia v2 (overload com venda_id)
CREATE OR REPLACE FUNCTION public.finalizar_venda_transacional_canonica_v2(
  p_venda_id uuid,
  p_caixa_id uuid,
  p_operador_id uuid,
  p_forma_pagamento text,
  p_total_bruto numeric,
  p_total_desconto numeric,
  p_total_liquido numeric,
  p_pagamentos jsonb,
  p_itens jsonb,
  p_desconto_gerente_token text,
  p_desconto_gerente_percentual numeric,
  p_strict_manager_discount_auth boolean
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
