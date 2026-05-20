-- Suspensão global de vendas pelo painel gerencial.
--
-- Expõe duas chaves em configuracoes_gerais:
--   vendas_suspensas  — 'true' / 'false'
--   motivo_suspensao  — texto livre exibido no caixa e no painel
--
-- O caixa web lê essas chaves via configuracoes_para_caixa_web() e bloqueia
-- a finalização quando vendas_suspensas = 'true'.
-- A RPC finalizar_venda_transacional_canonica_v3 também verifica a flag e
-- levanta FINALIZAR_VENDA_VENDAS_SUSPENSAS antes de processar a venda.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Chaves na tabela de configurações
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO public.configuracoes_gerais (chave, valor, tipo_dado, descricao)
VALUES
  ('vendas_suspensas',  'false', 'text', 'Se true, todas as vendas estão suspensas no caixa'),
  ('motivo_suspensao',  '',      'text', 'Motivo exibido ao operador quando as vendas estão suspensas')
ON CONFLICT (chave) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Expor as novas chaves no RPC do caixa web
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.configuracoes_para_caixa_web()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT jsonb_object_agg(c.chave, to_jsonb(c.valor))
      FROM public.configuracoes_gerais c
      WHERE c.chave IN (
        'desconto_maximo_operador_percentual',
        'cancelamento_maximo_valor_sem_gerente',
        'lead_time_min_dias',
        'lead_time_max_dias',
        'vendas_suspensas',
        'motivo_suspensao'
      )
    ),
    '{}'::jsonb
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Guard na RPC de finalização v3 (operadores bloqueados; gerentes passam)
--    Reproduz a lógica original de 089_finalizar_venda_canonica_v3.sql com a
--    verificação de suspensão inserida antes da idempotência.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.finalizar_venda_transacional_canonica_v3(
  p_venda_id uuid,
  p_caixa_id uuid,
  p_operador_id uuid,
  p_loja_id uuid,
  p_forma_pagamento text DEFAULT 'DINHEIRO',
  p_total_bruto numeric DEFAULT NULL,
  p_total_desconto numeric DEFAULT NULL,
  p_total_liquido numeric DEFAULT NULL,
  p_pagamentos jsonb DEFAULT NULL,
  p_itens jsonb DEFAULT '[]'::jsonb,
  p_desconto_gerente_token text DEFAULT NULL,
  p_desconto_gerente_percentual numeric DEFAULT NULL,
  p_strict_manager_discount_auth boolean DEFAULT false,
  p_fiscal_auto_enqueue boolean DEFAULT false,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_device_id text DEFAULT NULL,
  p_terminal_id text DEFAULT NULL
)
RETURNS TABLE (
  venda_id uuid,
  status text,
  mensagem text,
  dados_fiscais jsonb,
  itens_atualizados jsonb,
  estoque_baixado jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid      uuid := COALESCE(auth.uid(), p_operador_id);
  v_perfil   text;
  v_suspensas text;
  v_doc_id   uuid;
  v_payload  jsonb;
  v_row_doc  jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_OPERADOR_OBRIGATORIO';
  END IF;

  -- Bloquear operadores quando vendas estão suspensas (gerentes/donos/admin passam)
  SELECT u.perfil INTO v_perfil
  FROM public.usuarios u WHERE u.id = v_uid;

  IF v_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN') THEN
    SELECT c.valor INTO v_suspensas
    FROM public.configuracoes_gerais c
    WHERE c.chave = 'vendas_suspensas';

    IF v_suspensas = 'true' THEN
      RAISE EXCEPTION 'FINALIZAR_VENDA_VENDAS_SUSPENSAS';
    END IF;
  END IF;

  -- Idempotência: mesma semântica da v2, mas devolvendo linha ao cliente.
  IF EXISTS (
    SELECT 1
    FROM public.vendas v
    WHERE v.id = p_venda_id
      AND v.status = 'CONCLUIDA'
  ) THEN
    SELECT jsonb_build_object(
      'documento_fiscal_id', d.id,
      'status', d.status,
      'tipo_doc', d.tipo_doc
    )
    INTO v_row_doc
    FROM public.documentos_fiscais_pendentes d
    WHERE d.venda_id = p_venda_id
      AND d.status <> 'CANCELADO'
      AND d.deleted_at IS NULL
    ORDER BY d.created_at DESC
    LIMIT 1;

    RETURN QUERY
    SELECT
      p_venda_id,
      'CONCLUIDA'::text,
      NULL::text,
      v_row_doc,
      NULL::jsonb,
      NULL::jsonb;
    RETURN;
  END IF;

  PERFORM public.finalizar_venda_transacional_canonica_v2(
    p_venda_id,
    p_caixa_id,
    p_operador_id,
    p_forma_pagamento,
    p_total_bruto,
    p_total_desconto,
    p_total_liquido,
    p_pagamentos,
    p_itens,
    p_desconto_gerente_token,
    p_desconto_gerente_percentual,
    p_strict_manager_discount_auth
  );

  IF p_fiscal_auto_enqueue THEN
    v_payload := jsonb_build_object(
      'origem', 'caixa_web_rpc_v3',
      'venda_id', p_venda_id,
      'loja_id', p_loja_id,
      'caixa_id', p_caixa_id,
      'operador_id', v_uid,
      'forma_pagamento', p_forma_pagamento,
      'pagamentos', COALESCE(p_pagamentos, '[]'::jsonb),
      'totais', jsonb_build_object(
        'bruto', p_total_bruto,
        'desconto', p_total_desconto,
        'liquido', p_total_liquido
      ),
      'itens', p_itens,
      'auditoria', jsonb_strip_nulls(jsonb_build_object(
        'ip_address', p_ip_address,
        'user_agent', p_user_agent,
        'device_id', p_device_id,
        'terminal_id', p_terminal_id
      ))
    );

    v_doc_id := public.fiscal_enfileirar_documento_venda(
      p_venda_id,
      'NFC_E_STUB',
      v_payload
    );

    RETURN QUERY
    SELECT
      p_venda_id,
      'CONCLUIDA'::text,
      NULL::text,
      jsonb_build_object(
        'documento_fiscal_id', v_doc_id,
        'tipo_doc', 'NFC_E_STUB'
      ),
      NULL::jsonb,
      NULL::jsonb;
  ELSE
    RETURN QUERY
    SELECT
      p_venda_id,
      'CONCLUIDA'::text,
      NULL::text,
      NULL::jsonb,
      NULL::jsonb,
      NULL::jsonb;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.finalizar_venda_transacional_canonica_v3(
  uuid, uuid, uuid, uuid, text, numeric, numeric, numeric, jsonb, jsonb, text, numeric, boolean, boolean, text, text, text, text
) IS
  'v3 com guard de suspensão de vendas: bloqueia OPERADOR quando vendas_suspensas=true; delega à v2 e retorna linha; opcionalmente enfileira NFC_E_STUB.';

REVOKE ALL ON FUNCTION public.finalizar_venda_transacional_canonica_v3(
  uuid, uuid, uuid, uuid, text, numeric, numeric, numeric, jsonb, jsonb, text, numeric, boolean, boolean, text, text, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.finalizar_venda_transacional_canonica_v3(
  uuid, uuid, uuid, uuid, text, numeric, numeric, numeric, jsonb, jsonb, text, numeric, boolean, boolean, text, text, text, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalizar_venda_transacional_canonica_v3(
  uuid, uuid, uuid, uuid, text, numeric, numeric, numeric, jsonb, jsonb, text, numeric, boolean, boolean, text, text, text, text
) TO service_role;
