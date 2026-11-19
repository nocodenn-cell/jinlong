-- PROPOSTA FASE 3.1 — venda offline com desconto de gerente: consumo único e gravação na MESMA transação.
--
-- NÃO É MIGRATION. Não copiar para backend/supabase/migrations sem decisão (entra no PR e publica em produção).
-- Depende de: token_desconto_consumo_unico_offline.sql (tabela de consumo e internal.consumir_token_desconto_venda).
--
-- Por que um wrapper: chamar o consumo e a venda em duas RPCs separadas seria duas transações. Se a venda falhasse
-- depois do consumo, o token ficaria queimado sem venda. Aqui as duas coisas acontecem numa única função
-- PL/pgSQL: se qualquer passo falhar, o consumo é desfeito junto.
--
-- Retry: repetir a mesma venda (mesmo venda_id) passa pelo consumo sem efeito e a própria RPC de venda já é
-- idempotente por venda_id. Outra venda com o mesmo token é recusada com TOKEN_GERENTE_JA_USADO.

CREATE OR REPLACE FUNCTION public.registrar_venda_offline_com_token(
  p_token                        text,
  p_loja                         uuid,
  p_v2                           boolean,
  p_venda_id                     uuid,
  p_caixa_id                     uuid,
  p_operador_id                  uuid,
  p_forma_pagamento              text,
  p_total_bruto                  numeric,
  p_total_desconto               numeric,
  p_total_liquido                numeric,
  p_itens                        jsonb,
  p_desconto_gerente_percentual  numeric,
  p_desconto_gerente_valor       numeric,
  p_gerente_id                   text,
  p_pagamentos                   jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, internal, pg_temp
AS $$
BEGIN
  -- 1) Consome o token para ESTA venda (ou aceita o retry da mesma venda).
  PERFORM internal.consumir_token_desconto_venda(p_token, p_loja, p_venda_id);

  -- 2) Grava a venda com todas as validações da RPC atual (totais, preços, desconto, pagamentos).
  IF p_v2 THEN
    PERFORM public.registrar_venda_com_itens_v2(
      p_venda_id, p_caixa_id, p_operador_id, p_forma_pagamento, p_total_bruto, p_total_desconto,
      p_total_liquido, p_itens, p_desconto_gerente_percentual, p_desconto_gerente_valor, p_gerente_id, p_pagamentos);
  ELSE
    PERFORM public.registrar_venda_com_itens(
      p_venda_id, p_caixa_id, p_operador_id, p_forma_pagamento, p_total_bruto, p_total_desconto,
      p_total_liquido, p_itens, p_desconto_gerente_percentual, p_desconto_gerente_valor, p_gerente_id, p_pagamentos);
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.registrar_venda_offline_com_token(text, uuid, boolean, uuid, uuid, uuid, text,
  numeric, numeric, numeric, jsonb, numeric, numeric, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_venda_offline_com_token(text, uuid, boolean, uuid, uuid, uuid, text,
  numeric, numeric, numeric, jsonb, numeric, numeric, text, jsonb) TO service_role;
