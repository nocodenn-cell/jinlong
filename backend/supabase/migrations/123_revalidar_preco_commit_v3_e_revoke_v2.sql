-- Migration 123: revalidação de preço no commit (defesa em profundidade) + fechamento do bypass da v2.
--
-- Vulnerabilidade (auditoria do motor de precificação, Q2):
--   A revalidação de preço (recalcularItensNoServidor) vivia apenas na camada Next,
--   FORA da transação do banco. Qualquer cliente autenticado podia chamar
--   `finalizar_venda_transacional_canonica_v3` (ou a v2) direto via PostgREST com
--   `preco_unitario` arbitrário, burlando o recálculo do servidor.
--
-- Solução (2 partes):
--   1. A v3 (única que recebe p_loja_id e roda em tempo real no caixa web) revalida
--      cada item VAREJO/ATACADO contra `calcular_preco_produto` ANTES de delegar à v2,
--      espelhando recalcularItensNoServidor. Itens MANUAL/PROMOCAO continuam limitados
--      pelo trigger trg_itens_venda_limite_desconto (migration 122) e por
--      preco_unitario <= preco_original.
--   2. REVOKE EXECUTE da v2 em `authenticated`: força clientes JWT a passar pela v3.
--      A Edge Function sync-outbox (vendas offline do pdv-local) usa service_role e
--      permanece com EXECUTE — vendas offline NÃO são revalidadas contra o catálogo
--      atual de propósito (o preço era legítimo no momento da venda offline).
--
-- Tolerância: 0.02 (mesma EPS_PRECO de caixaPrecoAutoritativoServer.ts).

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
  v_uid uuid := COALESCE(auth.uid(), p_operador_id);
  v_doc_id uuid;
  v_payload jsonb;
  v_row_doc jsonb;
  v_item jsonb;
  v_produto_id uuid;
  v_quantidade numeric;
  v_q_int integer;
  v_preco_original numeric;
  v_preco_unitario numeric;
  v_tipo_preco text;
  v_calc jsonb;
  v_preco_esperado numeric;
  v_tipo_esperado text;
  v_eps constant numeric := 0.02;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_OPERADOR_OBRIGATORIO';
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

  -- ---------------------------------------------------------------------------
  -- Revalidação de preço (anti-fraude): re-deriva o piso legítimo por item
  -- via calcular_preco_produto (faixas precos_atacado + catálogo), ciente da loja.
  -- Roda dentro da transação, fechando o bypass da revalidação da camada Next.
  -- ---------------------------------------------------------------------------
  IF p_itens IS NOT NULL AND jsonb_typeof(p_itens) = 'array' THEN
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens)
    LOOP
      v_produto_id    := (v_item->>'produto_id')::uuid;
      v_quantidade    := (v_item->>'quantidade')::numeric;
      v_preco_original := (v_item->>'preco_original')::numeric;
      v_preco_unitario := (v_item->>'preco_unitario')::numeric;
      v_tipo_preco    := COALESCE(v_item->>'tipo_preco', 'VAREJO');

      -- Itens MANUAL/PROMOCAO: piso governado pelo trigger de desconto por item
      -- (migration 122). Aqui só barramos preço acima do de referência.
      IF v_tipo_preco IN ('MANUAL', 'PROMOCAO') THEN
        IF v_preco_unitario IS NOT NULL
           AND v_preco_original IS NOT NULL
           AND v_preco_unitario > v_preco_original + v_eps THEN
          RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_PRECO_ACIMA_REFERENCIA';
        END IF;
        CONTINUE;
      END IF;

      v_q_int := GREATEST(1, FLOOR(COALESCE(v_quantidade, 0)))::integer;
      v_calc := public.calcular_preco_produto(v_produto_id, v_q_int, p_loja_id);

      IF v_calc IS NULL
         OR v_calc->>'erro' IS NOT NULL
         OR v_calc->>'preco' IS NULL THEN
        RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_PRECO_NAO_VALIDADO:%', v_produto_id;
      END IF;

      v_preco_esperado := (v_calc->>'preco')::numeric;
      v_tipo_esperado  := COALESCE(v_calc->>'tipo', 'VAREJO');

      IF v_tipo_esperado IS DISTINCT FROM v_tipo_preco THEN
        RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_TIPO_PRECO_DIVERGENTE:%', v_produto_id;
      END IF;

      IF ABS(v_preco_esperado - v_preco_unitario) > v_eps THEN
        RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_PRECO_DIVERGENTE:%', v_produto_id;
      END IF;
    END LOOP;
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
  'Finalização canônica v3: revalida preço VAREJO/ATACADO via calcular_preco_produto (anti-fraude, '
  'dentro da transação), delega à v2 e retorna linha; opcionalmente enfileira NFC_E_STUB.';

-- ---------------------------------------------------------------------------
-- Fecha o bypass: clientes JWT não podem mais chamar a v2 diretamente.
-- A v3 (revalidada) e a Edge Function sync-outbox (service_role) seguem com EXECUTE.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.finalizar_venda_transacional_canonica_v2(
  uuid, uuid, uuid, text, numeric, numeric, numeric, jsonb, jsonb, text, numeric, boolean
) FROM authenticated;
