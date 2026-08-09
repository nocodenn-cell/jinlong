-- 289: Escopo obrigatório na finalizar_venda_transacional_canonica_v4
--
-- PROBLEMA
-- --------
-- A migration 274 (e antes 268/272) expõe a RPC canônica como SECURITY DEFINER
-- com EXECUTE para `authenticated`, sem validar que p_loja_id / p_caixa_id
-- pertencem ao auth.uid() da sessão. Um JWT válido pode informar loja divergente,
-- validar preços de outra loja e concluir venda/baixa no caixa local.
--
-- O PR #187 tentou o mesmo guard com timestamp 20260714110959 e assinatura de
-- 19 args (pré-272). Em main isso é inócuo: 274 recria a função DEPOIS (ordem
-- lexical `274_*` > `20260714*`) e a assinatura vigente tem 21 args
-- (+ motivo_desconto / motivo_descricao).
--
-- CORREÇÃO
-- --------
-- Renomeia o corpo atual para *_unscoped (sem grants públicos) e expõe um
-- wrapper com a assinatura canônica que valida auth, usuário ativo, loja,
-- operador e caixa ABERTO antes de qualquer escrita.
--
-- Idempotente: se *_unscoped já existe, não renomeia de novo.

DO $migrate$
BEGIN
  IF to_regprocedure(
    'public.finalizar_venda_transacional_canonica_v4(uuid,uuid,uuid,uuid,text,numeric,numeric,numeric,jsonb,jsonb,text,numeric,boolean,boolean,text,text,text,text,uuid,public.motivo_desconto_enum_tipo,text,text)'
  ) IS NOT NULL
  AND to_regprocedure(
    'public.finalizar_venda_transacional_canonica_v4_unscoped(uuid,uuid,uuid,uuid,text,numeric,numeric,numeric,jsonb,jsonb,text,numeric,boolean,boolean,text,text,text,text,uuid,public.motivo_desconto_enum_tipo,text,text)'
  ) IS NULL
  THEN
    ALTER FUNCTION public.finalizar_venda_transacional_canonica_v4(
      uuid, uuid, uuid, uuid, text, numeric, numeric, numeric,
      jsonb, jsonb, text, numeric, boolean, boolean, text, text, text, text, uuid,
      public.motivo_desconto_enum_tipo, text,
      text
    ) RENAME TO finalizar_venda_transacional_canonica_v4_unscoped;
  END IF;
END
$migrate$;

REVOKE ALL ON FUNCTION public.finalizar_venda_transacional_canonica_v4_unscoped(
  uuid, uuid, uuid, uuid, text, numeric, numeric, numeric,
  jsonb, jsonb, text, numeric, boolean, boolean, text, text, text, text, uuid,
  public.motivo_desconto_enum_tipo, text,
  text
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.finalizar_venda_transacional_canonica_v4(
  p_venda_id uuid,
  p_caixa_id uuid,
  p_operador_id uuid,
  p_loja_id uuid,
  p_forma_pagamento text DEFAULT 'DINHEIRO'::text,
  p_total_bruto numeric DEFAULT NULL::numeric,
  p_total_desconto numeric DEFAULT NULL::numeric,
  p_total_liquido numeric DEFAULT NULL::numeric,
  p_pagamentos jsonb DEFAULT NULL::jsonb,
  p_itens jsonb DEFAULT '[]'::jsonb,
  p_desconto_gerente_token text DEFAULT NULL::text,
  p_desconto_gerente_percentual numeric DEFAULT NULL::numeric,
  p_strict_manager_discount_auth boolean DEFAULT false,
  p_fiscal_auto_enqueue boolean DEFAULT false,
  p_ip_address text DEFAULT NULL::text,
  p_user_agent text DEFAULT NULL::text,
  p_device_id text DEFAULT NULL::text,
  p_terminal_id text DEFAULT NULL::text,
  p_cliente_id uuid DEFAULT NULL::uuid,
  p_motivo_desconto public.motivo_desconto_enum_tipo DEFAULT 'NAO_ESPECIFICADO'::public.motivo_desconto_enum_tipo,
  p_motivo_descricao text DEFAULT NULL::text,
  p_limite_credito_gerente_token text DEFAULT NULL::text
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
SET search_path TO 'public'
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
    FROM public.finalizar_venda_transacional_canonica_v4_unscoped(
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
      p_cliente_id,
      p_motivo_desconto,
      p_motivo_descricao,
      p_limite_credito_gerente_token
    );
END;
$function$;

COMMENT ON FUNCTION public.finalizar_venda_transacional_canonica_v4(
  uuid, uuid, uuid, uuid, text, numeric, numeric, numeric,
  jsonb, jsonb, text, numeric, boolean, boolean, text, text, text, text, uuid,
  public.motivo_desconto_enum_tipo, text,
  text
) IS 'Finaliza venda após validar auth.uid, operador, caixa aberto e loja da sessão.';

REVOKE ALL ON FUNCTION public.finalizar_venda_transacional_canonica_v4(
  uuid, uuid, uuid, uuid, text, numeric, numeric, numeric,
  jsonb, jsonb, text, numeric, boolean, boolean, text, text, text, text, uuid,
  public.motivo_desconto_enum_tipo, text,
  text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.finalizar_venda_transacional_canonica_v4(
  uuid, uuid, uuid, uuid, text, numeric, numeric, numeric,
  jsonb, jsonb, text, numeric, boolean, boolean, text, text, text, text, uuid,
  public.motivo_desconto_enum_tipo, text,
  text
) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
