-- Migration 122: Limite de desconto manual por item em itens_venda
--
-- Vulnerabilidade: operadores podiam baixar preco_unitario abaixo de qualquer limite
-- sem autorização de gerente, tornando indetectável manipulação de preços por item.
--
-- Solução (3 partes):
--   1. Adiciona max_desconto_manual_item_percentual a pdv_config (padrão: 15 %).
--   2. Trigger BEFORE INSERT/UPDATE em itens_venda rejeita desconto > limite
--      (exceto tipo_preco = 'ATACADO', que é pré-autorizado pelo catálogo de atacado).
--      Usa variável de sessão 'session.gerente_token_validado' para isentar itens
--      de vendas com token de gerente aprovado.
--   3. Atualiza finalizar_venda_transacional() para sinalizar o token via set_config()
--      logo após a validação do token, dentro da mesma transação.
--
-- Nota de design: tokens de gerente autorizam desconto sobre o TOTAL da venda
-- (tabela descontos_venda), e não redução de preco_unitario por item. As duas
-- mecânicas são independentes. A variável de sessão conecta as duas: qualquer
-- venda com token de gerente válido também isenta seus itens do limite por item,
-- pois o gerente já assumiu responsabilidade pelo desconto da operação.

-- ---------------------------------------------------------------------------
-- 1) Coluna de configuração em pdv_config
-- ---------------------------------------------------------------------------

ALTER TABLE public.pdv_config
  ADD COLUMN IF NOT EXISTS max_desconto_manual_item_percentual numeric(5,2) NOT NULL DEFAULT 15.00;

COMMENT ON COLUMN public.pdv_config.max_desconto_manual_item_percentual IS
  'Percentual máximo de desconto permitido por item para tipo_preco VAREJO ou MANUAL. '
  'Itens com tipo_preco ATACADO são isentos (precificação por tabela de atacado). '
  'Vendas com token de gerente validado também são isentas. Padrão: 15%.';

-- ---------------------------------------------------------------------------
-- 2) Trigger: limitar desconto por item
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_fn_itens_venda_limite_desconto()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limite  numeric(5,2);
  v_pct     numeric(10,4);
BEGIN
  -- ATACADO: preço de tabela atacado, desconto pré-autorizado pelo catálogo.
  IF NEW.tipo_preco = 'ATACADO' THEN
    RETURN NEW;
  END IF;

  -- Venda com token de gerente validado nesta transação: isenta todos os itens.
  IF current_setting('session.gerente_token_validado', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- Sem preço original ou sem desconto real: nada a verificar.
  IF COALESCE(NEW.preco_unitario_original, 0) <= 0 THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.preco_unitario, NEW.preco_unitario_original) >= NEW.preco_unitario_original THEN
    RETURN NEW;
  END IF;

  -- Busca limite configurado (com fallback para 15%).
  SELECT COALESCE(max_desconto_manual_item_percentual, 15.00)
  INTO   v_limite
  FROM   public.pdv_config
  WHERE  id = 1;

  v_limite := COALESCE(v_limite, 15.00);

  -- Percentual de desconto sobre o preço original.
  v_pct := ROUND(
    (NEW.preco_unitario_original - NEW.preco_unitario)
    / NEW.preco_unitario_original * 100,
    4
  );

  IF v_pct > v_limite THEN
    RAISE EXCEPTION 'DESCONTO_MANUAL_EXCESSIVO'
      USING DETAIL = format(
        'Desconto de %s%% no item excede o limite de %s%% (tipo_preco: %s). '
        'Solicite autorização de gerente para prosseguir.',
        round(v_pct, 2), round(v_limite, 2), NEW.tipo_preco
      );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_fn_itens_venda_limite_desconto() FROM PUBLIC;

COMMENT ON FUNCTION public.trg_fn_itens_venda_limite_desconto() IS
  'Trigger BEFORE INSERT/UPDATE em itens_venda: rejeita desconto por item acima do limite '
  'em pdv_config.max_desconto_manual_item_percentual (padrão 15%). '
  'Isenta tipo_preco ATACADO e vendas com session.gerente_token_validado = ''true''.';

DROP TRIGGER IF EXISTS trg_itens_venda_limite_desconto_bi ON public.itens_venda;
CREATE TRIGGER trg_itens_venda_limite_desconto_bi
  BEFORE INSERT ON public.itens_venda
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_fn_itens_venda_limite_desconto();

DROP TRIGGER IF EXISTS trg_itens_venda_limite_desconto_bu ON public.itens_venda;
CREATE TRIGGER trg_itens_venda_limite_desconto_bu
  BEFORE UPDATE ON public.itens_venda
  FOR EACH ROW
  WHEN (
    NEW.preco_unitario             IS DISTINCT FROM OLD.preco_unitario
    OR NEW.preco_unitario_original IS DISTINCT FROM OLD.preco_unitario_original
    OR NEW.tipo_preco              IS DISTINCT FROM OLD.tipo_preco
  )
  EXECUTE FUNCTION public.trg_fn_itens_venda_limite_desconto();

-- ---------------------------------------------------------------------------
-- 3) Atualiza finalizar_venda_transacional() para sinalizar token de gerente
--    via variável de sessão antes de inserir os itens.
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

    -- Sinaliza para o trigger trg_itens_venda_limite_desconto que esta transação
    -- possui token de gerente válido — isenta os itens do limite por item.
    PERFORM set_config('session.gerente_token_validado', 'true', true);
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
      operador_id,
      aplicado_em
    ) VALUES (
      p_venda_id,
      COALESCE(v_cfg_gerente_id, v_uid::text),
      p_desconto_gerente_percentual,
      v_desconto_gerente_valor,
      v_uid,
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
  'Finalização transacional de venda. V3 (migration 122): sinaliza token de gerente via '
  'set_config(''session.gerente_token_validado'', ''true'', true) antes do loop de itens, '
  'isentando-os do trigger trg_itens_venda_limite_desconto.';
