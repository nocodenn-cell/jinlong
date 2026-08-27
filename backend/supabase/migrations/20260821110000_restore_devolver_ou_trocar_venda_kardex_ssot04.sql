-- Restaura o INSERT em movimentos_estoque_log (SSOT-04 / migration 303) que a
-- 20260820120000 apagou ao recriar devolver_ou_trocar_venda a partir do corpo
-- da 248, sem o kardex adicionado em 20260806090414.
--
-- Nao usa DROP FUNCTION: CREATE apos DROP reconcede EXECUTE a anon (drift
-- ja corrigido em 20260820120100). CREATE OR REPLACE preserva grants e a
-- assinatura vigente (incluindo itens jsonb da sprint de impressao).
--
-- Backfill idempotente: devolve linhas de estoque_reposicoes_devolucao que
-- ainda nao tem lancamento fisico com a operacao_id na observacao.

CREATE OR REPLACE FUNCTION public.devolver_ou_trocar_venda(
  p_venda_id uuid,
  p_idempotency_key text,
  p_motivo text,
  p_tipo text,
  p_itens jsonb,
  p_valor_estorno numeric,
  p_forma_estorno text,
  p_venda_substituta_id uuid DEFAULT NULL,
  p_operador_id uuid DEFAULT NULL
)
RETURNS TABLE (
  operacao_id uuid,
  venda_id uuid,
  tipo text,
  valor_estornado numeric,
  valor_caixa_estornado numeric,
  status_venda text,
  itens jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := COALESCE(auth.uid(), p_operador_id);
  v_key text := NULLIF(btrim(p_idempotency_key), '');
  v_motivo text := NULLIF(btrim(p_motivo), '');
  v_tipo text := upper(NULLIF(btrim(p_tipo), ''));
  v_forma text := upper(NULLIF(btrim(p_forma_estorno), ''));
  v_venda record;
  v_caixa record;
  v_existing record;
  v_operacao_id uuid;
  v_item jsonb;
  v_item_venda_id uuid;
  v_produto_id uuid;
  v_qtd numeric(10, 3);
  v_qtd_vendida numeric(10, 3);
  v_qtd_ja_devolvida numeric(10, 3);
  v_preco_unit numeric(10, 2);
  v_subtotal numeric(10, 2);
  v_total_itens numeric(10, 2) := 0;
  v_valor_estorno numeric(10, 2);
  v_valor_caixa numeric(10, 2) := 0;
  v_cr record;
  v_contas_receber_id uuid := NULL;
  v_event_items jsonb := '[]'::jsonb;
  c_source constant text := 'gerente_panel';
BEGIN
  PERFORM set_config('lock_timeout', '4s', true);

  IF v_uid IS NULL THEN RAISE EXCEPTION 'DEVOLVER_VENDA_AUTH'; END IF;
  IF v_key IS NULL THEN RAISE EXCEPTION 'DEVOLVER_VENDA_IDEMPOTENCY_OBRIGATORIA'; END IF;
  IF v_motivo IS NULL THEN RAISE EXCEPTION 'DEVOLVER_VENDA_MOTIVO_OBRIGATORIO'; END IF;
  IF v_tipo NOT IN ('DEVOLUCAO', 'TROCA') THEN RAISE EXCEPTION 'DEVOLVER_VENDA_TIPO_INVALIDO'; END IF;
  IF v_forma NOT IN ('DINHEIRO', 'PIX', 'CARTAO_DEBITO', 'CARTAO_CREDITO', 'CREDITO_CLIENTE') THEN
    RAISE EXCEPTION 'DEVOLVER_VENDA_FORMA_INVALIDA';
  END IF;
  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) <= 0 THEN
    RAISE EXCEPTION 'DEVOLVER_VENDA_ITENS_OBRIGATORIOS';
  END IF;

  -- Idempotência: retorno da operação existente (agora com itens)
  SELECT o.* INTO v_existing
  FROM public.venda_pos_venda_operacoes o
  WHERE o.idempotency_key = v_key;

  IF FOUND THEN
    RETURN QUERY
    SELECT
      v_existing.id, v_existing.venda_id, v_existing.tipo,
      v_existing.valor_estornado, v_existing.valor_caixa_estornado, 'CONCLUIDA'::text,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'nome', p.nome,
          'quantidade', vpi.quantidade,
          'preco_unitario', vpi.preco_unitario,
          'subtotal', vpi.subtotal
        ) ORDER BY p.nome)
        FROM public.venda_pos_venda_itens vpi
        INNER JOIN public.produtos p ON p.id = vpi.produto_id
        WHERE vpi.operacao_id = v_existing.id
      ), '[]'::jsonb);
    RETURN;
  END IF;

  SELECT v.* INTO v_venda FROM public.vendas v WHERE v.id = p_venda_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DEVOLVER_VENDA_NAO_ENCONTRADA'; END IF;
  IF v_venda.status <> 'CONCLUIDA' THEN RAISE EXCEPTION 'DEVOLVER_VENDA_STATUS_INVALIDO'; END IF;

  SELECT c.* INTO v_caixa FROM public.caixas c WHERE c.id = v_venda.caixa_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DEVOLVER_VENDA_CAIXA_NAO_ENCONTRADO'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = v_uid AND u.loja_id = v_caixa.loja_id AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
  ) THEN
    RAISE EXCEPTION 'DEVOLVER_VENDA_SEM_PERMISSAO';
  END IF;

  IF v_tipo = 'TROCA' AND p_venda_substituta_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.vendas vs
      WHERE vs.id = p_venda_substituta_id AND vs.status = 'CONCLUIDA'
    ) THEN
      RAISE EXCEPTION 'DEVOLVER_VENDA_SUBSTITUTA_INVALIDA';
    END IF;
  END IF;

  -- Calcular total dos itens devolvidos
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens)
  LOOP
    v_item_venda_id := (v_item->>'item_venda_id')::uuid;
    v_qtd := (v_item->>'quantidade')::numeric(10, 3);

    IF v_item_venda_id IS NULL OR v_qtd IS NULL OR v_qtd <= 0 THEN
      RAISE EXCEPTION 'DEVOLVER_VENDA_ITEM_INVALIDO';
    END IF;

    SELECT iv.produto_id, iv.quantidade, iv.preco_unitario
    INTO v_produto_id, v_qtd_vendida, v_preco_unit
    FROM public.itens_venda iv
    WHERE iv.id = v_item_venda_id AND iv.venda_id = p_venda_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'DEVOLVER_VENDA_ITEM_NAO_PERTENCE'; END IF;

    v_qtd_ja_devolvida := public.quantidade_devolvida_item_venda(v_item_venda_id);
    IF v_qtd_ja_devolvida + v_qtd > v_qtd_vendida + 0.0005 THEN
      RAISE EXCEPTION 'DEVOLVER_VENDA_QTD_EXCEDE_VENDIDA';
    END IF;

    v_subtotal := public.round_abnt(v_preco_unit * v_qtd, 2);
    v_total_itens := v_total_itens + v_subtotal;
  END LOOP;

  v_total_itens := public.round_abnt(v_total_itens, 2);
  v_valor_estorno := public.round_abnt(COALESCE(p_valor_estorno, v_total_itens), 2);

  IF ABS(v_valor_estorno - v_total_itens) > 0.02 THEN
    RAISE EXCEPTION 'DEVOLVER_VENDA_VALOR_DIVERGENTE';
  END IF;

  IF v_valor_estorno <= 0 THEN RAISE EXCEPTION 'DEVOLVER_VENDA_VALOR_ZERO'; END IF;

  -- Estorno contas_receber
  IF v_forma = 'CREDITO_CLIENTE' THEN
    SELECT cr.* INTO v_cr
    FROM public.contas_receber cr
    WHERE cr.venda_id = p_venda_id AND cr.status IN ('ABERTO', 'PARCIAL')
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'DEVOLVER_VENDA_SEM_CONTA_RECEBER'; END IF;
    IF v_cr.valor_aberto < v_valor_estorno - 0.01 THEN
      RAISE EXCEPTION 'DEVOLVER_VENDA_VALOR_EXCEDE_ABERTO';
    END IF;
    v_contas_receber_id := v_cr.id;
  END IF;

  v_operacao_id := gen_random_uuid();

  INSERT INTO public.venda_pos_venda_operacoes (
    id, idempotency_key, venda_id, tipo, motivo,
    valor_estornado, valor_caixa_estornado, forma_estorno,
    operador_id, caixa_id, venda_substituta_id, contas_receber_id
  ) VALUES (
    v_operacao_id, v_key, p_venda_id, v_tipo, v_motivo,
    v_valor_estorno, 0, v_forma,
    v_uid, v_caixa.id, p_venda_substituta_id,
    v_contas_receber_id
  );

  -- Processar itens: estoque + linhas de operação
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens)
  LOOP
    v_item_venda_id := (v_item->>'item_venda_id')::uuid;
    v_qtd := (v_item->>'quantidade')::numeric(10, 3);

    SELECT iv.produto_id, iv.preco_unitario
    INTO v_produto_id, v_preco_unit
    FROM public.itens_venda iv
    WHERE iv.id = v_item_venda_id AND iv.venda_id = p_venda_id;

    v_subtotal := public.round_abnt(v_preco_unit * v_qtd, 2);

    PERFORM 1 FROM public.estoque e
    WHERE e.produto_id = v_produto_id AND e.loja_id = v_caixa.loja_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'DEVOLVER_VENDA_ESTOQUE_NAO_ENCONTRADO'; END IF;

    UPDATE public.estoque e
    SET quantidade_atual = e.quantidade_atual + v_qtd,
      version = e.version + 1,
      updated_at = now()
    WHERE e.produto_id = v_produto_id AND e.loja_id = v_caixa.loja_id;

    INSERT INTO public.estoque_reposicoes_devolucao (operacao_id, produto_id, quantidade)
    VALUES (v_operacao_id, v_produto_id, v_qtd);

    INSERT INTO public.movimentos_estoque_log (
      loja_id, produto_id, tipo_codigo, quantidade_delta, venda_id, usuario_id, observacao
    ) VALUES (
      v_caixa.loja_id, v_produto_id, 'ENTRADA_DEVOLUCAO_CLIENTE', v_qtd, p_venda_id, v_uid,
      lower(v_tipo) || ' | motivo=' || v_motivo || ' | operacao=' || v_operacao_id::text
    );

    INSERT INTO public.venda_pos_venda_itens (
      operacao_id, item_venda_id, produto_id, quantidade, preco_unitario, subtotal
    ) VALUES (
      v_operacao_id, v_item_venda_id, v_produto_id, v_qtd, v_preco_unit, v_subtotal
    );

    v_event_items := v_event_items || jsonb_build_array(
      jsonb_build_object(
        'item_venda_id', v_item_venda_id,
        'produto_id', v_produto_id,
        'quantidade', v_qtd,
        'preco_unitario', v_preco_unit,
        'subtotal', v_subtotal
      )
    );
  END LOOP;

  -- Financeiro: devolucoes + caixa / contas_receber
  IF v_forma = 'CREDITO_CLIENTE' THEN
    UPDATE public.contas_receber cr
    SET valor_aberto = public.round_abnt(cr.valor_aberto - v_valor_estorno, 2),
      status = CASE
        WHEN public.round_abnt(cr.valor_aberto - v_valor_estorno, 2) <= 0.009 THEN 'QUITADO'
        ELSE 'PARCIAL'
      END
    WHERE cr.id = v_cr.id;

    INSERT INTO public.devolucoes (venda_id, valor, forma_pagamento, motivo, operador_id, operacao_id)
    VALUES (p_venda_id, v_valor_estorno, 'PIX', v_motivo, v_uid, v_operacao_id);
  ELSIF v_forma = 'DINHEIRO' THEN
    v_valor_caixa := v_valor_estorno;
    IF v_caixa.status = 'ABERTO' AND v_valor_caixa > 0 THEN
      UPDATE public.caixas c
      SET saldo_atual = public.round_abnt(c.saldo_atual - v_valor_caixa, 2)
      WHERE c.id = v_caixa.id AND (c.saldo_atual - v_valor_caixa) >= 0;
      IF NOT FOUND THEN RAISE EXCEPTION 'DEVOLVER_VENDA_SALDO_CAIXA_INSUFICIENTE'; END IF;
    ELSE
      v_valor_caixa := 0;
    END IF;

    INSERT INTO public.devolucoes (venda_id, valor, forma_pagamento, motivo, operador_id, operacao_id)
    VALUES (p_venda_id, v_valor_estorno, 'DINHEIRO', v_motivo, v_uid, v_operacao_id);
  ELSE
    INSERT INTO public.devolucoes (venda_id, valor, forma_pagamento, motivo, operador_id, operacao_id)
    VALUES (p_venda_id, v_valor_estorno, v_forma, v_motivo, v_uid, v_operacao_id);
  END IF;

  UPDATE public.venda_pos_venda_operacoes
  SET valor_caixa_estornado = v_valor_caixa
  WHERE id = v_operacao_id;

  INSERT INTO public.venda_eventos (
    event_type, sale_id, caixa_id, operador_id, loja_id,
    items, total, total_bruto, forma_pagamento, source, idempotency_key
  ) VALUES (
    'SALE_PARTIAL_RETURN', p_venda_id, v_caixa.id, v_uid, v_caixa.loja_id,
    v_event_items, v_valor_estorno, v_valor_estorno, v_forma, c_source,
    c_source || ':partial_return:' || v_operacao_id::text
  ) ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN QUERY
  SELECT
    v_operacao_id, p_venda_id, v_tipo, v_valor_estorno, v_valor_caixa, 'CONCLUIDA'::text,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'nome', p.nome,
        'quantidade', vpi.quantidade,
        'preco_unitario', vpi.preco_unitario,
        'subtotal', vpi.subtotal
      ) ORDER BY p.nome)
      FROM public.venda_pos_venda_itens vpi
      INNER JOIN public.produtos p ON p.id = vpi.produto_id
      WHERE vpi.operacao_id = v_operacao_id
    ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.devolver_ou_trocar_venda(
  uuid, text, text, text, jsonb, numeric, text, uuid, uuid
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.devolver_ou_trocar_venda(
  uuid, text, text, text, jsonb, numeric, text, uuid, uuid
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.devolver_ou_trocar_venda(
  uuid, text, text, text, jsonb, numeric, text, uuid, uuid
) TO service_role;

COMMENT ON FUNCTION public.devolver_ou_trocar_venda IS
  'Devolução parcial ou troca pós-venda: estoque, devolucoes, caixa/contas_receber, kardex (movimentos_estoque_log) e ledger. Idempotente. Retorna itens (jsonb) para comprovante impresso. SSOT-04 restaurado em 2026-08-21.';

REVOKE EXECUTE ON FUNCTION public.devolver_ou_trocar_venda(
  uuid, text, text, text, jsonb, numeric, text, uuid, uuid
) FROM anon;

INSERT INTO public.movimentos_estoque_log (
  loja_id, produto_id, tipo_codigo, quantidade_delta, venda_id, usuario_id, observacao
)
SELECT
  c.loja_id,
  erd.produto_id,
  'ENTRADA_DEVOLUCAO_CLIENTE',
  erd.quantidade,
  o.venda_id,
  o.operador_id,
  lower(o.tipo) || ' | motivo=' || o.motivo || ' | operacao=' || o.id::text
FROM public.estoque_reposicoes_devolucao erd
JOIN public.venda_pos_venda_operacoes o ON o.id = erd.operacao_id
JOIN public.caixas c ON c.id = o.caixa_id
WHERE o.operador_id IS NOT NULL
  AND NOT EXISTS (
  SELECT 1
  FROM public.movimentos_estoque_log m
  WHERE m.venda_id = o.venda_id
    AND m.produto_id = erd.produto_id
    AND m.tipo_codigo = 'ENTRADA_DEVOLUCAO_CLIENTE'
    AND position(o.id::text IN COALESCE(m.observacao, '')) > 0
);

DO $verify_devolver_kardex_20260821$
DECLARE
  v_def text;
BEGIN
  v_def := pg_get_functiondef(
    'public.devolver_ou_trocar_venda(uuid,text,text,text,jsonb,numeric,text,uuid,uuid)'::regprocedure
  );
  IF position('movimentos_estoque_log' IN v_def) = 0 THEN
    RAISE EXCEPTION 'MIG20260821_DEVOLVER_SEM_KARDEX';
  END IF;
  IF position('ENTRADA_DEVOLUCAO_CLIENTE' IN v_def) = 0 THEN
    RAISE EXCEPTION 'MIG20260821_DEVOLVER_TIPO_ERRADO';
  END IF;
  IF position('itens jsonb' IN v_def) = 0 THEN
    RAISE EXCEPTION 'MIG20260821_DEVOLVER_SEM_ITENS';
  END IF;
END
$verify_devolver_kardex_20260821$;

NOTIFY pgrst, 'reload schema';
