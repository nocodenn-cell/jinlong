-- Restringe a finalização v4 ao operador, caixa e loja da sessão.
--
-- A migration 268 recriou a RPC como SECURITY DEFINER e concedeu EXECUTE a
-- authenticated sem validar que p_loja_id e p_caixa_id pertenciam ao caller.
-- Isso permitia usar preços de outra loja e registrar a venda no caixa local.
--
-- Mantemos o corpo reconciliado de 268 como implementação interna sem grants e
-- expomos um wrapper que valida todo o escopo antes de executar qualquer escrita.

ALTER FUNCTION public.finalizar_venda_transacional_canonica_v4(
  uuid, uuid, uuid, uuid, text, numeric, numeric, numeric,
  jsonb, jsonb, text, numeric, boolean, boolean, text, text, text, text, uuid
) RENAME TO finalizar_venda_transacional_canonica_v4_unscoped_268;

REVOKE ALL ON FUNCTION public.finalizar_venda_transacional_canonica_v4_unscoped_268(
  uuid, uuid, uuid, uuid, text, numeric, numeric, numeric,
  jsonb, jsonb, text, numeric, boolean, boolean, text, text, text, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.finalizar_venda_transacional_canonica_v4(
  p_venda_id uuid,
  p_caixa_id uuid,
  p_operador_id uuid,
  p_loja_id uuid,
  p_forma_pagamento text DEFAULT 'DINHEIRO',
  p_total_bruto numeric DEFAULT NULL,
  p_total_desconto numeric DEFAULT NULL,
  p_total_liquido numeric DEFAULT NULL,
  p_pagamentos jsonb DEFAULT NULL,
  p_itens jsonb DEFAULT '[]',
  p_desconto_gerente_token text DEFAULT NULL,
  p_desconto_gerente_percentual numeric DEFAULT NULL,
  p_strict_manager_discount_auth boolean DEFAULT false,
  p_fiscal_auto_enqueue boolean DEFAULT false,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_device_id text DEFAULT NULL,
  p_terminal_id text DEFAULT NULL,
  p_cliente_id uuid DEFAULT NULL
)
RETURNS TABLE(
  venda_id uuid,
  status text,
  mensagem text,
  dados_fiscais jsonb,
  itens_atualizados jsonb,
  estoque_baixado jsonb,
  event_id uuid,
  contas_receber_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_auth_uid uuid := auth.uid();
  v_uid uuid := COALESCE(v_auth_uid, p_operador_id);
  v_usuario_loja_id uuid;
  v_caixa_loja_id uuid;
  v_caixa_operador_id uuid;
  v_caixa_status text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_AUTH';
  END IF;

  IF v_auth_uid IS NOT NULL AND p_operador_id IS DISTINCT FROM v_auth_uid THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_OPERADOR_INVALIDO';
  END IF;

  SELECT u.loja_id
    INTO v_usuario_loja_id
    FROM public.usuarios u
   WHERE u.id = v_uid
     AND COALESCE(u.ativo, true) = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_USUARIO_INVALIDO';
  END IF;

  IF v_usuario_loja_id IS DISTINCT FROM p_loja_id THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_LOJA_INVALIDA';
  END IF;

  SELECT c.loja_id, c.operador_id, c.status
    INTO v_caixa_loja_id, v_caixa_operador_id, v_caixa_status
    FROM public.caixas c
   WHERE c.id = p_caixa_id
   FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_CAIXA_NAO_ENCONTRADO';
  END IF;

  IF v_caixa_loja_id IS DISTINCT FROM p_loja_id THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_CAIXA_LOJA_INVALIDA';
  END IF;

  IF v_caixa_operador_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_CAIXA_OPERADOR_INVALIDO';
  END IF;

  IF v_caixa_status IS DISTINCT FROM 'ABERTO' THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_CAIXA_FECHADO';
  END IF;

  RETURN QUERY
  SELECT *
    FROM public.finalizar_venda_transacional_canonica_v4_unscoped_268(
      p_venda_id,
      p_caixa_id,
      p_operador_id,
      p_loja_id,
      p_forma_pagamento,
      p_total_bruto,
      p_total_desconto,
      p_total_liquido,
      p_pagamentos,
      p_itens,
      p_desconto_gerente_token,
      p_desconto_gerente_percentual,
      p_strict_manager_discount_auth,
      p_fiscal_auto_enqueue,
      p_ip_address,
      p_user_agent,
      p_device_id,
      p_terminal_id,
      p_cliente_id
    );
END;
$function$;

COMMENT ON FUNCTION public.finalizar_venda_transacional_canonica_v4(
  uuid, uuid, uuid, uuid, text, numeric, numeric, numeric,
  jsonb, jsonb, text, numeric, boolean, boolean, text, text, text, text, uuid
) IS 'Finaliza venda após validar auth.uid, operador, caixa aberto e loja da sessão.';

REVOKE ALL ON FUNCTION public.finalizar_venda_transacional_canonica_v4(
  uuid, uuid, uuid, uuid, text, numeric, numeric, numeric,
  jsonb, jsonb, text, numeric, boolean, boolean, text, text, text, text, uuid
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.finalizar_venda_transacional_canonica_v4(
  uuid, uuid, uuid, uuid, text, numeric, numeric, numeric,
  jsonb, jsonb, text, numeric, boolean, boolean, text, text, text, text, uuid
) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
