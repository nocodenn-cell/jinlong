-- Migration 235: EPS unificado (0.005) + âncora de precoOriginal para MANUAL/PROMOCAO.
--
-- Duas lacunas fechadas (auditoria de integridade financeira):
--
--   L1. EPS inconsistente entre camadas:
--       caixaPrecoAutoritativoServer.ts usava EPS_PRECO = 0.005 após migration 7acc53a,
--       mas a v3 mantinha v_eps = 0.02. Uma chamada autenticada direta ao RPC v3
--       (sem passar pelo server action Next) aceitava desvios de até R$ 0,019 por item.
--       Solução: alinhar v_eps para 0.005 — mesmo valor do TypeScript.
--
--   L2. precoOriginal livre para MANUAL/PROMOCAO:
--       O bloco MANUAL/PROMOCAO da v3 validava apenas preco_unitario <= preco_original,
--       mas aceitava qualquer valor de preco_original vindo do payload do cliente.
--       Isso permitia inflar preco_original acima do catálogo para ampliar a margem de
--       desconto visível sem disparar a trigger de 15% (migration 122).
--       Solução: SELECT preco_varejo FROM produtos WHERE id = v_produto_id e comparar
--       com |preco_varejo - preco_original| > v_eps antes de aceitar o item.
--
-- Invariante garantida pós-migration:
--   Para todo item MANUAL/PROMOCAO:
--     |produtos.preco_varejo - preco_original| ≤ 0.005    (âncora de catálogo)
--     preco_unitario ≤ preco_original + 0.005              (limite de sobrecarga)
--   Para todo item VAREJO/ATACADO:
--     |calcular_preco_produto() - preco_unitario| ≤ 0.005  (mesmo eps do TS)
--
-- Janela de deploy:
--   Aplicar esta migration ANTES do deploy Next.js que alinha o TS.
--   Durante a janela (SQL atualizado, TS antigo): SQL é a camada mais restritiva —
--   vendas legítimas continuam passando; chamadas diretas ao RPC ficam mais seguras.
--   Após o deploy TS: ambas as camadas concordam em EPS = 0.005 e na âncora de catálogo.
--
-- Rollback:
--   migration 236_rollback_eps_e_ancora.sql com CREATE OR REPLACE restaurando
--   v_eps = 0.02 e removendo o SELECT/validação de preco_varejo para MANUAL/PROMOCAO.
--
-- O REVOKE de v2 em authenticated (migration 123) NÃO é repetido — já está em vigor.

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
  v_preco_varejo numeric;
  v_eps constant numeric := 0.005;
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
      v_produto_id     := (v_item->>'produto_id')::uuid;
      v_quantidade     := (v_item->>'quantidade')::numeric;
      v_preco_original := (v_item->>'preco_original')::numeric;
      v_preco_unitario := (v_item->>'preco_unitario')::numeric;
      v_tipo_preco     := COALESCE(v_item->>'tipo_preco', 'VAREJO');

      IF v_tipo_preco IN ('MANUAL', 'PROMOCAO') THEN
        -- Âncora de catálogo: preco_original deve coincidir com preco_varejo ± eps.
        -- Impede que o cliente infle preco_original para ampliar margem de desconto
        -- sem disparar a trigger de 15% (migration 122).
        SELECT preco_varejo
        INTO v_preco_varejo
        FROM public.produtos
        WHERE id = v_produto_id;

        IF v_preco_varejo IS NULL
           OR ABS(v_preco_varejo - COALESCE(v_preco_original, -1)) > v_eps THEN
          RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_PRECO_ORIGINAL_DIVERGENTE:%', v_produto_id;
        END IF;

        -- Limite de sobrecarga: preco_unitario não pode superar preco_original.
        IF v_preco_unitario IS NOT NULL
           AND v_preco_original IS NOT NULL
           AND v_preco_unitario > v_preco_original + v_eps THEN
          RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_PRECO_ACIMA_REFERENCIA';
        END IF;

        CONTINUE;
      END IF;

      -- VAREJO / ATACADO: derivação autoritativa via calcular_preco_produto.
      v_q_int := GREATEST(1, FLOOR(COALESCE(v_quantidade, 0)))::integer;
      v_calc  := public.calcular_preco_produto(v_produto_id, v_q_int, p_loja_id);

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
  'Finalização canônica v3 (migration 235): EPS = 0.005 (unificado com TS), '
  'âncora de catálogo para MANUAL/PROMOCAO (preco_original validado contra produtos.preco_varejo), '
  'revalidação VAREJO/ATACADO via calcular_preco_produto (anti-fraude, dentro da transação).';
