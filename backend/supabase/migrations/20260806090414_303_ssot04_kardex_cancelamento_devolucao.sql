-- Backport Fase 1 (Git-only) from supabase_migrations.schema_migrations.statements
-- version: 20260806090414
-- name: 303_ssot04_kardex_cancelamento_devolucao
-- source: production read-only export (schema_migrations)
-- Applied in production: yes (do NOT re-run on production).

CREATE OR REPLACE FUNCTION public.cancelar_venda_transacional(
  p_venda_id uuid, p_motivo text, p_operador_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(venda_id uuid, status_venda text, valor_estornado numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_uid uuid := COALESCE(auth.uid(), p_operador_id);
  v_motivo text := NULLIF(btrim(p_motivo), '');
  v_venda record; v_caixa record; v_item record;
  v_valor_estornado numeric(10,2) := 0;
  v_tem_split boolean := false;
  v_forma_auditoria text;
  c_source constant text := 'gerente_panel';
BEGIN
  PERFORM set_config('lock_timeout', '4s', true);
  IF v_uid IS NULL THEN RAISE EXCEPTION 'CANCELAR_VENDA_AUTH'; END IF;
  IF v_motivo IS NULL THEN RAISE EXCEPTION 'CANCELAR_VENDA_MOTIVO_OBRIGATORIO'; END IF;
  SELECT v.* INTO v_venda FROM public.vendas v WHERE v.id = p_venda_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CANCELAR_VENDA_NAO_ENCONTRADA'; END IF;
  IF v_venda.status = 'CANCELADA' THEN RAISE EXCEPTION 'CANCELAR_VENDA_JA_CANCELADA'; END IF;
  SELECT c.* INTO v_caixa FROM public.caixas c WHERE c.id = v_venda.caixa_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CANCELAR_VENDA_CAIXA_NAO_ENCONTRADO'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.usuarios u
    WHERE u.id = v_uid AND u.loja_id = v_caixa.loja_id AND u.perfil IN ('GERENTE','DONO','ADMIN')) THEN
    RAISE EXCEPTION 'CANCELAR_VENDA_SEM_PERMISSAO';
  END IF;
  UPDATE public.contas_receber cr SET valor_aberto = 0, status = 'CANCELADO'
   WHERE cr.venda_id = p_venda_id AND cr.status IN ('ABERTO','PARCIAL');
  SELECT EXISTS (SELECT 1 FROM public.vendas_pagamentos vp WHERE vp.venda_id = p_venda_id LIMIT 1) INTO v_tem_split;
  FOR v_item IN SELECT iv.produto_id, iv.quantidade FROM public.itens_venda iv WHERE iv.venda_id = p_venda_id
  LOOP
    PERFORM 1 FROM public.estoque e WHERE e.produto_id = v_item.produto_id AND e.loja_id = v_caixa.loja_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'CANCELAR_VENDA_ESTOQUE_NAO_ENCONTRADO'; END IF;
    UPDATE public.estoque e SET quantidade_atual = e.quantidade_atual + v_item.quantidade,
      version = e.version + 1, updated_at = now()
     WHERE e.produto_id = v_item.produto_id AND e.loja_id = v_caixa.loja_id;
    INSERT INTO public.estoque_reposicoes_cancelamento (venda_id, produto_id, quantidade)
    VALUES (p_venda_id, v_item.produto_id, v_item.quantidade)
    ON CONFLICT (venda_id, produto_id) DO NOTHING;
    -- SSOT-04: retorno de estoque passa a existir no kardex, mesma transacao e mesmo loop.
    INSERT INTO public.movimentos_estoque_log (
      loja_id, produto_id, tipo_codigo, quantidade_delta, venda_id, usuario_id, observacao
    ) VALUES (
      v_caixa.loja_id, v_item.produto_id, 'ENTRADA_DEVOLUCAO_CLIENTE', v_item.quantidade,
      p_venda_id, v_uid, 'cancelamento de venda | motivo=' || v_motivo
    );
  END LOOP;
  IF v_tem_split THEN
    SELECT COALESCE(SUM(vp.valor) FILTER (WHERE vp.forma_pagamento = 'DINHEIRO'), 0)::numeric(10,2)
      INTO v_valor_estornado FROM public.vendas_pagamentos vp WHERE vp.venda_id = p_venda_id;
    v_valor_estornado := ROUND(v_valor_estornado, 2);
    INSERT INTO public.devolucoes (venda_id, valor, forma_pagamento, motivo, operador_id)
    SELECT p_venda_id, ROUND(SUM(vp.valor),2), vp.forma_pagamento, v_motivo, v_uid
      FROM public.vendas_pagamentos vp WHERE vp.venda_id = p_venda_id GROUP BY vp.forma_pagamento;
    IF v_valor_estornado > 0 THEN
      UPDATE public.caixas c SET saldo_atual = ROUND(c.saldo_atual - v_valor_estornado, 2)
       WHERE c.id = v_caixa.id AND (c.saldo_atual - v_valor_estornado) >= 0;
    END IF;
    v_forma_auditoria := 'SPLIT';
  ELSIF v_venda.forma_pagamento = 'DINHEIRO' THEN
    v_valor_estornado := ROUND(COALESCE(v_venda.total_liquido,0),2);
    INSERT INTO public.devolucoes (venda_id, valor, forma_pagamento, motivo, operador_id)
    VALUES (p_venda_id, v_valor_estornado, 'DINHEIRO', v_motivo, v_uid) ON CONFLICT DO NOTHING;
    UPDATE public.caixas c SET saldo_atual = ROUND(c.saldo_atual - v_valor_estornado, 2)
     WHERE c.id = v_caixa.id AND (c.saldo_atual - v_valor_estornado) >= 0;
    v_forma_auditoria := v_venda.forma_pagamento;
  ELSE
    INSERT INTO public.devolucoes (venda_id, valor, forma_pagamento, motivo, operador_id)
    VALUES (p_venda_id, ROUND(COALESCE(v_venda.total_liquido,0),2), v_venda.forma_pagamento, v_motivo, v_uid);
    v_valor_estornado := 0; v_forma_auditoria := v_venda.forma_pagamento;
  END IF;
  UPDATE public.vendas SET status = 'CANCELADA' WHERE id = p_venda_id;
  INSERT INTO public.vendas_canceladas_auditoria (venda_id, caixa_id, operador_id, motivo, forma_pagamento, valor_estornado)
  VALUES (p_venda_id, v_caixa.id, v_uid, v_motivo, v_forma_auditoria,
    CASE WHEN v_tem_split THEN (SELECT COALESCE(SUM(vp.valor) FILTER (WHERE vp.forma_pagamento='DINHEIRO'),0)::numeric(10,2)
      FROM public.vendas_pagamentos vp WHERE vp.venda_id = p_venda_id)
      WHEN v_venda.forma_pagamento='DINHEIRO' THEN ROUND(COALESCE(v_venda.total_liquido,0),2)
      ELSE 0::numeric(10,2) END
  ) ON CONFLICT (venda_id) DO NOTHING;
  PERFORM public.registrar_venda_evento('SALE_CANCELLED', p_venda_id, c_source, v_caixa.id,
    v_venda.operador_id, v_caixa.loja_id, public.venda_eventos_items_from_sale(p_venda_id),
    COALESCE(v_venda.total_liquido,0), v_venda.total_bruto, v_venda.forma_pagamento, true);
  RETURN QUERY SELECT p_venda_id, 'CANCELADA'::text, v_valor_estornado;
END;
$function$;

COMMENT ON FUNCTION public.cancelar_venda_transacional(uuid, text, uuid) IS
  'Cancela venda, estorna financeiro e devolve estoque. SSOT-04 (2026-08-06): a devolucao de estoque passa a lancar em movimentos_estoque_log (ENTRADA_DEVOLUCAO_CLIENTE) na mesma transacao.';

CREATE OR REPLACE FUNCTION public.devolver_ou_trocar_venda(
  p_venda_id uuid, p_idempotency_key text, p_motivo text, p_tipo text, p_itens jsonb,
  p_valor_estorno numeric, p_forma_estorno text,
  p_venda_substituta_id uuid DEFAULT NULL::uuid, p_operador_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(operacao_id uuid, venda_id uuid, tipo text, valor_estornado numeric, valor_caixa_estornado numeric, status_venda text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := COALESCE(auth.uid(), p_operador_id);
  v_key text := NULLIF(btrim(p_idempotency_key), '');
  v_motivo text := NULLIF(btrim(p_motivo), '');
  v_tipo text := upper(NULLIF(btrim(p_tipo), ''));
  v_forma text := upper(NULLIF(btrim(p_forma_estorno), ''));
  v_venda record; v_caixa record; v_existing record; v_operacao_id uuid; v_item jsonb;
  v_item_venda_id uuid; v_produto_id uuid; v_qtd numeric(10,3); v_qtd_vendida numeric(10,3);
  v_qtd_ja_devolvida numeric(10,3); v_preco_unit numeric(10,2); v_subtotal numeric(10,2);
  v_total_itens numeric(10,2) := 0; v_valor_estorno numeric(10,2); v_valor_caixa numeric(10,2) := 0;
  v_cr record; v_contas_receber_id uuid := NULL; v_event_items jsonb := '[]'::jsonb;
  c_source constant text := 'gerente_panel';
BEGIN
  PERFORM set_config('lock_timeout', '4s', true);
  IF v_uid IS NULL THEN RAISE EXCEPTION 'DEVOLVER_VENDA_AUTH'; END IF;
  IF v_key IS NULL THEN RAISE EXCEPTION 'DEVOLVER_VENDA_IDEMPOTENCY_OBRIGATORIA'; END IF;
  IF v_motivo IS NULL THEN RAISE EXCEPTION 'DEVOLVER_VENDA_MOTIVO_OBRIGATORIO'; END IF;
  IF v_tipo NOT IN ('DEVOLUCAO','TROCA') THEN RAISE EXCEPTION 'DEVOLVER_VENDA_TIPO_INVALIDO'; END IF;
  IF v_forma NOT IN ('DINHEIRO','PIX','CARTAO_DEBITO','CARTAO_CREDITO','CREDITO_CLIENTE') THEN
    RAISE EXCEPTION 'DEVOLVER_VENDA_FORMA_INVALIDA'; END IF;
  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) <= 0 THEN
    RAISE EXCEPTION 'DEVOLVER_VENDA_ITENS_OBRIGATORIOS'; END IF;
  SELECT o.* INTO v_existing FROM public.venda_pos_venda_operacoes o WHERE o.idempotency_key = v_key;
  IF FOUND THEN
    RETURN QUERY SELECT v_existing.id, v_existing.venda_id, v_existing.tipo,
      v_existing.valor_estornado, v_existing.valor_caixa_estornado, 'CONCLUIDA'::text;
    RETURN;
  END IF;
  SELECT v.* INTO v_venda FROM public.vendas v WHERE v.id = p_venda_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DEVOLVER_VENDA_NAO_ENCONTRADA'; END IF;
  IF v_venda.status <> 'CONCLUIDA' THEN RAISE EXCEPTION 'DEVOLVER_VENDA_STATUS_INVALIDO'; END IF;
  SELECT c.* INTO v_caixa FROM public.caixas c WHERE c.id = v_venda.caixa_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DEVOLVER_VENDA_CAIXA_NAO_ENCONTRADO'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.usuarios u
    WHERE u.id = v_uid AND u.loja_id = v_caixa.loja_id AND u.perfil IN ('GERENTE','DONO','ADMIN')) THEN
    RAISE EXCEPTION 'DEVOLVER_VENDA_SEM_PERMISSAO'; END IF;
  IF v_tipo = 'TROCA' AND p_venda_substituta_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.vendas vs WHERE vs.id = p_venda_substituta_id AND vs.status='CONCLUIDA') THEN
      RAISE EXCEPTION 'DEVOLVER_VENDA_SUBSTITUTA_INVALIDA'; END IF;
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens)
  LOOP
    v_item_venda_id := (v_item->>'item_venda_id')::uuid;
    v_qtd := (v_item->>'quantidade')::numeric(10,3);
    IF v_item_venda_id IS NULL OR v_qtd IS NULL OR v_qtd <= 0 THEN RAISE EXCEPTION 'DEVOLVER_VENDA_ITEM_INVALIDO'; END IF;
    SELECT iv.produto_id, iv.quantidade, iv.preco_unitario INTO v_produto_id, v_qtd_vendida, v_preco_unit
      FROM public.itens_venda iv WHERE iv.id = v_item_venda_id AND iv.venda_id = p_venda_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'DEVOLVER_VENDA_ITEM_NAO_PERTENCE'; END IF;
    v_qtd_ja_devolvida := public.quantidade_devolvida_item_venda(v_item_venda_id);
    IF v_qtd_ja_devolvida + v_qtd > v_qtd_vendida + 0.0005 THEN RAISE EXCEPTION 'DEVOLVER_VENDA_QTD_EXCEDE_VENDIDA'; END IF;
    v_subtotal := public.round_abnt(v_preco_unit * v_qtd, 2);
    v_total_itens := v_total_itens + v_subtotal;
  END LOOP;
  v_total_itens := public.round_abnt(v_total_itens, 2);
  v_valor_estorno := public.round_abnt(COALESCE(p_valor_estorno, v_total_itens), 2);
  IF ABS(v_valor_estorno - v_total_itens) > 0.02 THEN RAISE EXCEPTION 'DEVOLVER_VENDA_VALOR_DIVERGENTE'; END IF;
  IF v_valor_estorno <= 0 THEN RAISE EXCEPTION 'DEVOLVER_VENDA_VALOR_ZERO'; END IF;
  IF v_forma = 'CREDITO_CLIENTE' THEN
    SELECT cr.* INTO v_cr FROM public.contas_receber cr
      WHERE cr.venda_id = p_venda_id AND cr.status IN ('ABERTO','PARCIAL') FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'DEVOLVER_VENDA_SEM_CONTA_RECEBER'; END IF;
    IF v_cr.valor_aberto < v_valor_estorno - 0.01 THEN RAISE EXCEPTION 'DEVOLVER_VENDA_VALOR_EXCEDE_ABERTO'; END IF;
    v_contas_receber_id := v_cr.id;
  END IF;
  v_operacao_id := gen_random_uuid();
  INSERT INTO public.venda_pos_venda_operacoes (id, idempotency_key, venda_id, tipo, motivo,
    valor_estornado, valor_caixa_estornado, forma_estorno, operador_id, caixa_id,
    venda_substituta_id, contas_receber_id)
  VALUES (v_operacao_id, v_key, p_venda_id, v_tipo, v_motivo, v_valor_estorno, 0, v_forma,
    v_uid, v_caixa.id, p_venda_substituta_id, v_contas_receber_id);
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens)
  LOOP
    v_item_venda_id := (v_item->>'item_venda_id')::uuid;
    v_qtd := (v_item->>'quantidade')::numeric(10,3);
    SELECT iv.produto_id, iv.preco_unitario INTO v_produto_id, v_preco_unit
      FROM public.itens_venda iv WHERE iv.id = v_item_venda_id AND iv.venda_id = p_venda_id;
    v_subtotal := public.round_abnt(v_preco_unit * v_qtd, 2);
    PERFORM 1 FROM public.estoque e WHERE e.produto_id = v_produto_id AND e.loja_id = v_caixa.loja_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'DEVOLVER_VENDA_ESTOQUE_NAO_ENCONTRADO'; END IF;
    UPDATE public.estoque e SET quantidade_atual = e.quantidade_atual + v_qtd,
      version = e.version + 1, updated_at = now()
     WHERE e.produto_id = v_produto_id AND e.loja_id = v_caixa.loja_id;
    INSERT INTO public.estoque_reposicoes_devolucao (operacao_id, produto_id, quantidade)
    VALUES (v_operacao_id, v_produto_id, v_qtd);
    -- SSOT-04: reposicao de devolucao/troca vira lancamento de kardex na mesma transacao.
    INSERT INTO public.movimentos_estoque_log (
      loja_id, produto_id, tipo_codigo, quantidade_delta, venda_id, usuario_id, observacao
    ) VALUES (
      v_caixa.loja_id, v_produto_id, 'ENTRADA_DEVOLUCAO_CLIENTE', v_qtd, p_venda_id, v_uid,
      lower(v_tipo) || ' | motivo=' || v_motivo || ' | operacao=' || v_operacao_id::text
    );
    INSERT INTO public.venda_pos_venda_itens (operacao_id, item_venda_id, produto_id, quantidade, preco_unitario, subtotal)
    VALUES (v_operacao_id, v_item_venda_id, v_produto_id, v_qtd, v_preco_unit, v_subtotal);
    v_event_items := v_event_items || jsonb_build_array(jsonb_build_object(
      'item_venda_id', v_item_venda_id, 'produto_id', v_produto_id, 'quantidade', v_qtd,
      'preco_unitario', v_preco_unit, 'subtotal', v_subtotal));
  END LOOP;
  IF v_forma = 'CREDITO_CLIENTE' THEN
    UPDATE public.contas_receber cr SET valor_aberto = public.round_abnt(cr.valor_aberto - v_valor_estorno, 2),
      status = CASE WHEN public.round_abnt(cr.valor_aberto - v_valor_estorno,2) <= 0.009 THEN 'QUITADO' ELSE 'PARCIAL' END
     WHERE cr.id = v_cr.id;
    INSERT INTO public.devolucoes (venda_id, valor, forma_pagamento, motivo, operador_id, operacao_id)
    VALUES (p_venda_id, v_valor_estorno, 'PIX', v_motivo, v_uid, v_operacao_id);
  ELSIF v_forma = 'DINHEIRO' THEN
    v_valor_caixa := v_valor_estorno;
    IF v_caixa.status = 'ABERTO' AND v_valor_caixa > 0 THEN
      UPDATE public.caixas c SET saldo_atual = public.round_abnt(c.saldo_atual - v_valor_caixa, 2)
       WHERE c.id = v_caixa.id AND (c.saldo_atual - v_valor_caixa) >= 0;
      IF NOT FOUND THEN RAISE EXCEPTION 'DEVOLVER_VENDA_SALDO_CAIXA_INSUFICIENTE'; END IF;
    ELSE v_valor_caixa := 0; END IF;
    INSERT INTO public.devolucoes (venda_id, valor, forma_pagamento, motivo, operador_id, operacao_id)
    VALUES (p_venda_id, v_valor_estorno, 'DINHEIRO', v_motivo, v_uid, v_operacao_id);
  ELSE
    INSERT INTO public.devolucoes (venda_id, valor, forma_pagamento, motivo, operador_id, operacao_id)
    VALUES (p_venda_id, v_valor_estorno, v_forma, v_motivo, v_uid, v_operacao_id);
  END IF;
  UPDATE public.venda_pos_venda_operacoes SET valor_caixa_estornado = v_valor_caixa WHERE id = v_operacao_id;
  INSERT INTO public.venda_eventos (event_type, sale_id, caixa_id, operador_id, loja_id,
    items, total, total_bruto, forma_pagamento, source, idempotency_key)
  VALUES ('SALE_PARTIAL_RETURN', p_venda_id, v_caixa.id, v_uid, v_caixa.loja_id,
    v_event_items, v_valor_estorno, v_valor_estorno, v_forma, c_source,
    c_source || ':partial_return:' || v_operacao_id::text) ON CONFLICT (idempotency_key) DO NOTHING;
  RETURN QUERY SELECT v_operacao_id, p_venda_id, v_tipo, v_valor_estorno, v_valor_caixa, 'CONCLUIDA'::text;
END;
$function$;

COMMENT ON FUNCTION public.devolver_ou_trocar_venda(uuid, text, text, text, jsonb, numeric, text, uuid, uuid) IS
  'Devolucao/troca parcial de venda. SSOT-04 (2026-08-06): a reposicao de estoque passa a lancar em movimentos_estoque_log (ENTRADA_DEVOLUCAO_CLIENTE) na mesma transacao. Idempotente por idempotency_key.';

DO $verify$
DECLARE v_def text;
BEGIN
  v_def := pg_get_functiondef('public.cancelar_venda_transacional(uuid,text,uuid)'::regprocedure);
  IF position('movimentos_estoque_log' IN v_def) = 0 THEN RAISE EXCEPTION 'MIG303_CANCELAR_SEM_KARDEX'; END IF;
  IF position('ENTRADA_DEVOLUCAO_CLIENTE' IN v_def) = 0 THEN RAISE EXCEPTION 'MIG303_CANCELAR_TIPO_ERRADO'; END IF;

  v_def := pg_get_functiondef('public.devolver_ou_trocar_venda(uuid,text,text,text,jsonb,numeric,text,uuid,uuid)'::regprocedure);
  IF position('movimentos_estoque_log' IN v_def) = 0 THEN RAISE EXCEPTION 'MIG303_DEVOLVER_SEM_KARDEX'; END IF;
  IF position('ENTRADA_DEVOLUCAO_CLIENTE' IN v_def) = 0 THEN RAISE EXCEPTION 'MIG303_DEVOLVER_TIPO_ERRADO'; END IF;

  IF (SELECT count(*) FROM public.tipos_movimento_estoque) <> 10 THEN
    RAISE EXCEPTION 'MIG303_CATALOGO_DE_TIPOS_ALTERADO';
  END IF;

  RAISE NOTICE '303 OK';
END
$verify$;
