-- ============================================================
-- Migration 113: Auditoria completa de descontos de gerente
--
-- Vulnerabilidade V8 (auditoria 2026-05-27):
-- descontos_venda registrava apenas gerente_id (quem autorizou),
-- mas não registrava o operador que aplicou o desconto nem o
-- timestamp exato da aplicação — lacuna para compliance e
-- investigação de fraude.
--
-- Fix:
--   1. Adiciona operador_id (quem finalizou a venda) e
--      aplicado_em (timestamp) em descontos_venda.
--   2. Atualiza finalizar_venda_transacional() para popular
--      os novos campos (auth.uid() = operador da sessão).
--
-- Idempotente via IF NOT EXISTS / CREATE OR REPLACE.
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1) Novos campos em descontos_venda
-- ---------------------------------------------------------------------------

ALTER TABLE public.descontos_venda
  ADD COLUMN IF NOT EXISTS operador_id uuid REFERENCES public.usuarios(id),
  ADD COLUMN IF NOT EXISTS aplicado_em timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN public.descontos_venda.operador_id IS
  'Operador (caixa) que finalizou a venda usando o token de desconto. '
  'Distinto de gerente_id (quem autorizou).';

COMMENT ON COLUMN public.descontos_venda.aplicado_em IS
  'Timestamp UTC em que a venda foi finalizada com o desconto. '
  'Permite correlação precisa em auditorias.';

CREATE INDEX IF NOT EXISTS idx_descontos_venda_operador
  ON public.descontos_venda(operador_id);

-- ---------------------------------------------------------------------------
-- 2) Atualiza finalizar_venda_transacional() para gravar operador_id
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.finalizar_venda_transacional(
  p_venda_id                  uuid,
  p_caixa_id                  uuid,
  p_forma_pagamento           text,
  p_total_bruto               numeric,
  p_total_desconto            numeric,
  p_total_liquido             numeric,
  p_itens                     jsonb,
  p_desconto_gerente_token    text    DEFAULT NULL,
  p_desconto_gerente_percentual numeric DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid                       uuid;
  v_item                      jsonb;
  v_item_id                   uuid;
  v_produto_id                uuid;
  v_quantidade                numeric;
  v_preco_original            numeric;
  v_preco_unitario            numeric;
  v_desconto_unitario         numeric;
  v_tipo_preco                text;
  v_rpc_row                   record;
  v_total_bruto_calc          numeric := 0;
  v_total_liquido_base_calc   numeric := 0;
  v_total_desconto_base_calc  numeric := 0;
  v_total_desconto_final_calc numeric := 0;
  v_total_liquido_final_calc  numeric := 0;
  v_desconto_gerente_valor    numeric := 0;
  v_max_desconto_gerente      numeric := 0;
  v_cfg_gerente_id            text   := NULL;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_UNAUTHORIZED';
  END IF;

  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) <= 0 THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_ITENS_INVALIDOS';
  END IF;

  IF (p_desconto_gerente_token IS NULL) <> (p_desconto_gerente_percentual IS NULL) THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_DESCONTO_GERENTE_PARAMS_INVALIDOS';
  END IF;

  SELECT max_desconto_gerente_percentual, gerente_id
  INTO   v_max_desconto_gerente, v_cfg_gerente_id
  FROM   public.pdv_config
  WHERE  id = 1;

  IF p_desconto_gerente_token IS NOT NULL THEN
    IF p_desconto_gerente_percentual <= 0 OR p_desconto_gerente_percentual > COALESCE(v_max_desconto_gerente, 0) THEN
      RAISE EXCEPTION 'FINALIZAR_VENDA_DESCONTO_GERENTE_LIMITE';
    END IF;

    PERFORM 1
    FROM public.tokens_desconto_gerente t
    WHERE t.token = p_desconto_gerente_token
      AND t.usado = false
      AND t.expira_em > now()
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'FINALIZAR_VENDA_TOKEN_GERENTE_INVALIDO';
    END IF;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens)
  LOOP
    v_item_id        := COALESCE((v_item->>'item_id')::uuid, gen_random_uuid());
    v_produto_id     := (v_item->>'produto_id')::uuid;
    v_quantidade     := (v_item->>'quantidade')::numeric;
    v_preco_original := (v_item->>'preco_original')::numeric;
    v_preco_unitario := (v_item->>'preco_unitario')::numeric;
    v_tipo_preco     := COALESCE(v_item->>'tipo_preco', 'VAREJO');
    v_desconto_unitario := GREATEST(0, v_preco_original - v_preco_unitario);

    IF v_produto_id IS NULL OR v_quantidade IS NULL OR v_quantidade <= 0 THEN
      RAISE EXCEPTION 'FINALIZAR_VENDA_ITEM_INVALIDO';
    END IF;
    IF v_preco_original IS NULL OR v_preco_original < 0 OR v_preco_unitario IS NULL OR v_preco_unitario < 0 THEN
      RAISE EXCEPTION 'FINALIZAR_VENDA_PRECO_INVALIDO';
    END IF;

    v_total_bruto_calc          := v_total_bruto_calc          + (v_preco_original * v_quantidade);
    v_total_liquido_base_calc   := v_total_liquido_base_calc   + (v_preco_unitario * v_quantidade);

    INSERT INTO public.itens_venda (
      id, venda_id, produto_id, quantidade,
      preco_unitario_original, preco_unitario, desconto_unitario, tipo_preco
    ) VALUES (
      v_item_id, p_venda_id, v_produto_id, v_quantidade,
      v_preco_original, v_preco_unitario, v_desconto_unitario, v_tipo_preco
    );

    SELECT * INTO v_rpc_row
    FROM public.decrementar_estoque_seguro(v_produto_id, v_quantidade, p_venda_id)
    LIMIT 1;

    IF v_rpc_row IS NULL OR v_rpc_row.sucesso IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'FINALIZAR_VENDA_ESTOQUE:%', COALESCE(v_rpc_row.mensagem, 'DESCONHECIDO');
    END IF;
  END LOOP;

  v_total_bruto_calc          := ROUND(v_total_bruto_calc, 2);
  v_total_liquido_base_calc   := ROUND(v_total_liquido_base_calc, 2);
  v_total_desconto_base_calc  := ROUND(v_total_bruto_calc - v_total_liquido_base_calc, 2);

  IF p_desconto_gerente_token IS NOT NULL THEN
    v_desconto_gerente_valor := ROUND(
      (v_total_liquido_base_calc * p_desconto_gerente_percentual) / 100, 2
    );
  END IF;

  v_total_desconto_final_calc := ROUND(v_total_desconto_base_calc + v_desconto_gerente_valor, 2);
  v_total_liquido_final_calc  := ROUND(v_total_bruto_calc - v_total_desconto_final_calc, 2);

  IF ABS(v_total_bruto_calc      - p_total_bruto)     > 0.02
  OR ABS(v_total_desconto_final_calc - p_total_desconto) > 0.02
  OR ABS(v_total_liquido_final_calc  - p_total_liquido)  > 0.02 THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_TOTAIS_DIVERGENTES';
  END IF;

  INSERT INTO public.vendas (
    id, caixa_id, operador_id, total_bruto, total_desconto,
    total_liquido, forma_pagamento, status
  ) VALUES (
    p_venda_id, p_caixa_id, v_uid, v_total_bruto_calc,
    v_total_desconto_final_calc, v_total_liquido_final_calc,
    p_forma_pagamento, 'CONCLUIDA'
  );

  IF p_desconto_gerente_token IS NOT NULL THEN
    UPDATE public.tokens_desconto_gerente
    SET    usado = true
    WHERE  token = p_desconto_gerente_token AND usado = false;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'FINALIZAR_VENDA_TOKEN_GERENTE_JA_USADO';
    END IF;

    INSERT INTO public.descontos_venda (
      venda_id,
      gerente_id,
      desconto_percentual,
      desconto_valor,
      operador_id,      -- NOVO: quem finalizou a venda
      aplicado_em       -- NOVO: timestamp da aplicação
    ) VALUES (
      p_venda_id,
      COALESCE(v_cfg_gerente_id, v_uid::text),
      p_desconto_gerente_percentual,
      v_desconto_gerente_valor,
      v_uid,            -- operador = auth.uid() da sessão do caixa
      now()
    );
  END IF;
END;
$$;

REVOKE ALL    ON FUNCTION public.finalizar_venda_transacional(
  uuid, uuid, text, numeric, numeric, numeric, jsonb, text, numeric
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.finalizar_venda_transacional(
  uuid, uuid, text, numeric, numeric, numeric, jsonb, text, numeric
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.finalizar_venda_transacional(
  uuid, uuid, text, numeric, numeric, numeric, jsonb, text, numeric
) TO service_role;

COMMENT ON FUNCTION public.finalizar_venda_transacional(
  uuid, uuid, text, numeric, numeric, numeric, jsonb, text, numeric
) IS
  'Finalização transacional de venda. V2 — registra operador_id e aplicado_em em descontos_venda (migration 113).';
