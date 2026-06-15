-- Migration 236: PostgreSQL como autoridade COMPLETA da finalização (v3).
--
-- Pré-requisito da arquitetura "zero decisão de negócio fora do PostgreSQL":
-- antes de remover a revalidação da camada TypeScript, a v3 precisa cobrir
-- TODA regra que o TS cobria. Duas lacunas foram identificadas na auditoria:
--
--   L1. VENDABILIDADE (produto vendável):
--       O TS (recalcularItensNoServidor → filtrarSomenteProdutosVendaveis)
--       rejeitava qualquer item cujo produto não fosse `ativo = true AND
--       status_publicacao = 'PUBLICADO'`. Na v3, itens VAREJO/ATACADO eram
--       cobertos indiretamente (calcular_preco_produto exige ativo=true), mas
--       itens MANUAL/PROMOCAO faziam apenas SELECT preco_varejo — sem checar
--       ativo nem status_publicacao. Logo, um produto inativo/DRAFT/INATIVO
--       podia ser vendido via MANUAL/PROMOCAO. Esta migration adiciona uma
--       checagem de vendabilidade UNIFORME para TODOS os tipos, no topo do laço.
--
--   L2. totalLiquido > 0:
--       O TS exigia `totalLiquido: z.number().positive()`. A constraint da
--       tabela vendas é `total_liquido >= 0` (permite zero). A v3 passa a
--       rejeitar p_total_liquido <= 0 explicitamente, espelhando o `.positive()`.
--
-- Escopo: APENAS v3 (caixa web). A v2 (sync_outbox / vendas offline) NÃO é
-- alterada — uma venda offline de produto que ficou inativo DEPOIS da venda
-- deve continuar sincronizando (o produto era vendável no momento da venda).
--
-- Definição de vendável (idêntica a shared-core/src/catalog/isProdutoVendavel.ts
-- e a lib/catalog/aplicarFiltroProdutoVendavel.ts):
--   ativo = true AND status_publicacao = 'PUBLICADO'
--
-- Rollback: migration 237 com CREATE OR REPLACE restaurando o corpo da 235
-- (sem o bloco de vendabilidade e sem a checagem de total líquido).

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
  v_ativo boolean;
  v_status_pub text;
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

  -- L2: total líquido deve ser estritamente positivo (espelha .positive() do TS).
  IF COALESCE(p_total_liquido, 0) <= 0 THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_TOTAL_LIQUIDO_INVALIDO';
  END IF;

  -- ---------------------------------------------------------------------------
  -- Revalidação por item (anti-fraude), dentro da transação:
  --   • Vendabilidade (L1): ativo = true AND status_publicacao = 'PUBLICADO',
  --     uniforme para TODOS os tipos de preço.
  --   • VAREJO/ATACADO: piso legítimo via calcular_preco_produto.
  --   • MANUAL/PROMOCAO: âncora de catálogo (preco_original == preco_varejo) +
  --     limite de sobrecarga (preco_unitario <= preco_original).
  -- ---------------------------------------------------------------------------
  IF p_itens IS NOT NULL AND jsonb_typeof(p_itens) = 'array' THEN
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens)
    LOOP
      v_produto_id     := (v_item->>'produto_id')::uuid;
      v_quantidade     := (v_item->>'quantidade')::numeric;
      v_preco_original := (v_item->>'preco_original')::numeric;
      v_preco_unitario := (v_item->>'preco_unitario')::numeric;
      v_tipo_preco     := COALESCE(v_item->>'tipo_preco', 'VAREJO');

      -- L1: vendabilidade uniforme (todos os tipos). Uma única leitura do
      -- catálogo serve tanto à checagem de vendabilidade quanto à âncora de
      -- preço de MANUAL/PROMOCAO logo abaixo.
      SELECT p.ativo, p.status_publicacao, p.preco_varejo
        INTO v_ativo, v_status_pub, v_preco_varejo
        FROM public.produtos p
       WHERE p.id = v_produto_id;

      IF v_ativo IS NULL THEN
        RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_PRODUTO_NAO_ENCONTRADO:%', v_produto_id;
      END IF;

      IF NOT (v_ativo = true AND v_status_pub = 'PUBLICADO') THEN
        RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_PRODUTO_NAO_VENDAVEL:%', v_produto_id;
      END IF;

      IF v_tipo_preco IN ('MANUAL', 'PROMOCAO') THEN
        -- Âncora de catálogo: preco_original deve coincidir com preco_varejo ± eps.
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
  'Finalização canônica v3 (migration 236): autoridade COMPLETA — EPS 0.005, '
  'vendabilidade uniforme (ativo + status_publicacao=PUBLICADO) para todos os tipos, '
  'total líquido > 0, âncora de catálogo MANUAL/PROMOCAO, revalidação VAREJO/ATACADO '
  'via calcular_preco_produto. Espelha integralmente as regras antes feitas no TS.';
