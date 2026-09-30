-- ROLLBACK do PR-2D (migrations 20261001100000, 20261001100100 e 20261001100200).
-- Pré-imagem = corpo em produção em 2026-09-30 (devolver_ou_trocar_venda md5 a99947852eef57b1fc6ab9fa95fde742).
-- NÃO é uma migration (não roda no `supabase db push`); aplicar manualmente, na ordem abaixo, somente se necessário.
--
-- ATENÇÃO: antes de reverter, operações criadas com caixa_desembolso_id NÃO nulo passam a ser atribuídas de novo ao
-- caixa da venda pela autoridade antiga (o valor esperado dos caixas envolvidos volta a mudar). Conferir com
-- `SELECT count(*) FROM devolucoes WHERE caixa_desembolso_id IS NOT NULL` antes de reverter em ambiente com dados.

BEGIN;

-- 1) Função de devolução: remove a assinatura de 10 argumentos e restaura a de 9.
DROP FUNCTION IF EXISTS public.devolver_ou_trocar_venda(uuid, text, text, text, jsonb, numeric, text, uuid, uuid, uuid);

CREATE FUNCTION public.devolver_ou_trocar_venda(
  p_venda_id uuid, p_idempotency_key text, p_motivo text, p_tipo text, p_itens jsonb,
  p_valor_estorno numeric, p_forma_estorno text,
  p_venda_substituta_id uuid DEFAULT NULL::uuid, p_operador_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(operacao_id uuid, venda_id uuid, tipo text, valor_estornado numeric, valor_caixa_estornado numeric, status_venda text, itens jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
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
  SELECT o.* INTO v_existing FROM public.venda_pos_venda_operacoes o WHERE o.idempotency_key = v_key;
  IF FOUND THEN
    RETURN QUERY SELECT v_existing.id, v_existing.venda_id, v_existing.tipo, v_existing.valor_estornado, v_existing.valor_caixa_estornado, 'CONCLUIDA'::text, COALESCE((SELECT jsonb_agg(jsonb_build_object('nome', p.nome, 'quantidade', vpi.quantidade, 'preco_unitario', vpi.preco_unitario, 'subtotal', vpi.subtotal) ORDER BY p.nome) FROM public.venda_pos_venda_itens vpi INNER JOIN public.produtos p ON p.id = vpi.produto_id WHERE vpi.operacao_id = v_existing.id), '[]'::jsonb);
    RETURN;
  END IF;
  SELECT v.* INTO v_venda FROM public.vendas v WHERE v.id = p_venda_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DEVOLVER_VENDA_NAO_ENCONTRADA'; END IF;
  IF v_venda.status <> 'CONCLUIDA' THEN RAISE EXCEPTION 'DEVOLVER_VENDA_STATUS_INVALIDO'; END IF;
  SELECT c.* INTO v_caixa FROM public.caixas c WHERE c.id = v_venda.caixa_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DEVOLVER_VENDA_CAIXA_NAO_ENCONTRADO'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = v_uid AND u.loja_id = v_caixa.loja_id AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')) THEN
    RAISE EXCEPTION 'DEVOLVER_VENDA_SEM_PERMISSAO';
  END IF;
  IF v_tipo = 'TROCA' AND p_venda_substituta_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.vendas vs WHERE vs.id = p_venda_substituta_id AND vs.status = 'CONCLUIDA') THEN
      RAISE EXCEPTION 'DEVOLVER_VENDA_SUBSTITUTA_INVALIDA';
    END IF;
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens) LOOP
    v_item_venda_id := (v_item->>'item_venda_id')::uuid;
    v_qtd := (v_item->>'quantidade')::numeric(10, 3);
    IF v_item_venda_id IS NULL OR v_qtd IS NULL OR v_qtd <= 0 THEN RAISE EXCEPTION 'DEVOLVER_VENDA_ITEM_INVALIDO'; END IF;
    SELECT iv.produto_id, iv.quantidade, iv.preco_unitario INTO v_produto_id, v_qtd_vendida, v_preco_unit FROM public.itens_venda iv WHERE iv.id = v_item_venda_id AND iv.venda_id = p_venda_id;
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
    SELECT cr.* INTO v_cr FROM public.contas_receber cr WHERE cr.venda_id = p_venda_id AND cr.status IN ('ABERTO', 'PARCIAL') FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'DEVOLVER_VENDA_SEM_CONTA_RECEBER'; END IF;
    IF v_cr.valor_aberto < v_valor_estorno - 0.01 THEN RAISE EXCEPTION 'DEVOLVER_VENDA_VALOR_EXCEDE_ABERTO'; END IF;
    v_contas_receber_id := v_cr.id;
  END IF;
  v_operacao_id := gen_random_uuid();
  INSERT INTO public.venda_pos_venda_operacoes (id, idempotency_key, venda_id, tipo, motivo, valor_estornado, valor_caixa_estornado, forma_estorno, operador_id, caixa_id, venda_substituta_id, contas_receber_id)
  VALUES (v_operacao_id, v_key, p_venda_id, v_tipo, v_motivo, v_valor_estorno, 0, v_forma, v_uid, v_caixa.id, p_venda_substituta_id, v_contas_receber_id);
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens) LOOP
    v_item_venda_id := (v_item->>'item_venda_id')::uuid;
    v_qtd := (v_item->>'quantidade')::numeric(10, 3);
    SELECT iv.produto_id, iv.preco_unitario INTO v_produto_id, v_preco_unit FROM public.itens_venda iv WHERE iv.id = v_item_venda_id AND iv.venda_id = p_venda_id;
    v_subtotal := public.round_abnt(v_preco_unit * v_qtd, 2);
    PERFORM 1 FROM public.estoque e WHERE e.produto_id = v_produto_id AND e.loja_id = v_caixa.loja_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'DEVOLVER_VENDA_ESTOQUE_NAO_ENCONTRADO'; END IF;
    UPDATE public.estoque e SET quantidade_atual = e.quantidade_atual + v_qtd, version = e.version + 1, updated_at = now() WHERE e.produto_id = v_produto_id AND e.loja_id = v_caixa.loja_id;
    INSERT INTO public.estoque_reposicoes_devolucao (operacao_id, produto_id, quantidade) VALUES (v_operacao_id, v_produto_id, v_qtd);
    INSERT INTO public.movimentos_estoque_log (loja_id, produto_id, tipo_codigo, quantidade_delta, venda_id, usuario_id, observacao)
    VALUES (v_caixa.loja_id, v_produto_id, 'ENTRADA_DEVOLUCAO_CLIENTE', v_qtd, p_venda_id, v_uid, lower(v_tipo) || ' | motivo=' || v_motivo || ' | operacao=' || v_operacao_id::text);
    INSERT INTO public.venda_pos_venda_itens (operacao_id, item_venda_id, produto_id, quantidade, preco_unitario, subtotal)
    VALUES (v_operacao_id, v_item_venda_id, v_produto_id, v_qtd, v_preco_unit, v_subtotal);
    v_event_items := v_event_items || jsonb_build_array(jsonb_build_object('item_venda_id', v_item_venda_id, 'produto_id', v_produto_id, 'quantidade', v_qtd, 'preco_unitario', v_preco_unit, 'subtotal', v_subtotal));
  END LOOP;
  IF v_forma = 'CREDITO_CLIENTE' THEN
    UPDATE public.contas_receber cr SET valor_aberto = public.round_abnt(cr.valor_aberto - v_valor_estorno, 2), status = CASE WHEN public.round_abnt(cr.valor_aberto - v_valor_estorno, 2) <= 0.009 THEN 'QUITADO' ELSE 'PARCIAL' END WHERE cr.id = v_cr.id;
    INSERT INTO public.devolucoes (venda_id, valor, forma_pagamento, motivo, operador_id, operacao_id) VALUES (p_venda_id, v_valor_estorno, 'PIX', v_motivo, v_uid, v_operacao_id);
  ELSIF v_forma = 'DINHEIRO' THEN
    v_valor_caixa := v_valor_estorno;
    IF v_caixa.status = 'ABERTO' AND v_valor_caixa > 0 THEN
      UPDATE public.caixas c SET saldo_atual = public.round_abnt(c.saldo_atual - v_valor_caixa, 2) WHERE c.id = v_caixa.id AND (c.saldo_atual - v_valor_caixa) >= 0;
      IF NOT FOUND THEN RAISE EXCEPTION 'DEVOLVER_VENDA_SALDO_CAIXA_INSUFICIENTE'; END IF;
    ELSE
      v_valor_caixa := 0;
    END IF;
    INSERT INTO public.devolucoes (venda_id, valor, forma_pagamento, motivo, operador_id, operacao_id) VALUES (p_venda_id, v_valor_estorno, 'DINHEIRO', v_motivo, v_uid, v_operacao_id);
  ELSE
    INSERT INTO public.devolucoes (venda_id, valor, forma_pagamento, motivo, operador_id, operacao_id) VALUES (p_venda_id, v_valor_estorno, v_forma, v_motivo, v_uid, v_operacao_id);
  END IF;
  UPDATE public.venda_pos_venda_operacoes SET valor_caixa_estornado = v_valor_caixa WHERE id = v_operacao_id;
  INSERT INTO public.venda_eventos (event_type, sale_id, caixa_id, operador_id, loja_id, items, total, total_bruto, forma_pagamento, source, idempotency_key)
  VALUES ('SALE_PARTIAL_RETURN', p_venda_id, v_caixa.id, v_uid, v_caixa.loja_id, v_event_items, v_valor_estorno, v_valor_estorno, v_forma, c_source, c_source || ':partial_return:' || v_operacao_id::text)
  ON CONFLICT (idempotency_key) DO NOTHING;
  RETURN QUERY SELECT v_operacao_id, p_venda_id, v_tipo, v_valor_estorno, v_valor_caixa, 'CONCLUIDA'::text, COALESCE((SELECT jsonb_agg(jsonb_build_object('nome', p.nome, 'quantidade', vpi.quantidade, 'preco_unitario', vpi.preco_unitario, 'subtotal', vpi.subtotal) ORDER BY p.nome) FROM public.venda_pos_venda_itens vpi INNER JOIN public.produtos p ON p.id = vpi.produto_id WHERE vpi.operacao_id = v_operacao_id), '[]'::jsonb);
END;
$function$;

REVOKE ALL ON FUNCTION public.devolver_ou_trocar_venda(uuid, text, text, text, jsonb, numeric, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.devolver_ou_trocar_venda(uuid, text, text, text, jsonb, numeric, text, uuid, uuid) TO authenticated, service_role;

-- 2) Autoridade: volta à implementação anterior (termo 7 atribuído ao caixa da venda, só venda CONCLUIDA).
CREATE OR REPLACE FUNCTION public.calcular_valor_sistema_dinheiro_caixa(p_caixa_id uuid)
RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_result numeric(10,2);
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.caixas c
      JOIN public.usuarios u ON u.id = auth.uid()
      WHERE c.id = p_caixa_id AND c.loja_id = u.loja_id
        AND (c.operador_id = auth.uid() OR u.perfil IN ('GERENTE', 'DONO', 'ADMIN'))
    ) THEN
      RAISE EXCEPTION 'Acesso negado ao caixa informado.' USING ERRCODE = '42501';
    END IF;
  END IF;

  WITH vendas_din_split AS (
    SELECT COALESCE(sum(vp.valor), 0)::numeric(10,2) AS t
    FROM public.vendas_pagamentos vp JOIN public.vendas v ON v.id = vp.venda_id
    WHERE v.caixa_id = p_caixa_id AND v.status = 'CONCLUIDA' AND vp.forma_pagamento = 'DINHEIRO'
  ), vendas_din_legado AS (
    SELECT COALESCE(sum(v.total_liquido), 0)::numeric(10,2) AS t
    FROM public.vendas v
    WHERE v.caixa_id = p_caixa_id AND v.forma_pagamento = 'DINHEIRO' AND v.status = 'CONCLUIDA'
      AND NOT EXISTS (SELECT 1 FROM public.vendas_pagamentos vp WHERE vp.venda_id = v.id)
  ), vendas_din AS (
    SELECT public.round_abnt((SELECT t FROM vendas_din_split) + (SELECT t FROM vendas_din_legado), 2) AS t
  ), ar_din AS (
    SELECT COALESCE(sum(CASE
      WHEN lr.operacao_tipo = 'ESTORNO' THEN -lr.valor
      ELSE lr.valor END), 0)::numeric(10,2) AS t
    FROM public.liquidacoes_receber lr
    WHERE lr.caixa_id = p_caixa_id AND lr.forma_pagamento = 'DINHEIRO'
      AND COALESCE(lr.operacao_tipo, 'RECEBIMENTO') IN ('RECEBIMENTO', 'ESTORNO')
  ), mov_legado AS (
    SELECT
      COALESCE(sum(CASE WHEN m.tipo = 'SUPRIMENTO' THEN m.valor ELSE 0 END), 0)::numeric(10,2) AS sup,
      COALESCE(sum(CASE WHEN m.tipo = 'SANGRIA' THEN m.valor ELSE 0 END), 0)::numeric(10,2) AS sang
    FROM public.movimentos_caixa m
    WHERE m.caixa_id = p_caixa_id AND m.tipo IN ('SUPRIMENTO', 'SANGRIA')
  ), mov_tx AS (
    SELECT COALESCE(sum(CASE
      WHEN m.tipo = 'suprimento' AND m.forma_pagamento = 'dinheiro' THEN m.valor
      WHEN m.tipo = 'sangria' THEN -m.valor
      WHEN m.tipo = 'estorno' AND orig.tipo = 'sangria' THEN m.valor
      WHEN m.tipo = 'estorno' AND orig.tipo = 'suprimento' AND orig.forma_pagamento = 'dinheiro' THEN -m.valor
      ELSE 0 END), 0)::numeric(10,2) AS t
    FROM public.movimentacoes_caixa m
    LEFT JOIN public.movimentacoes_caixa orig ON orig.id = m.movimentacao_origem_id
    WHERE m.caixa_id = p_caixa_id AND m.status = 'aprovado' AND m.deleted_at IS NULL
  ), dev_din AS (
    SELECT COALESCE(sum(d.valor), 0)::numeric(10,2) AS t
    FROM public.devolucoes d JOIN public.vendas v ON v.id = d.venda_id
    WHERE v.caixa_id = p_caixa_id AND v.status = 'CONCLUIDA' AND d.forma_pagamento = 'DINHEIRO'
  ), abertura AS (
    SELECT COALESCE(c.valor_inicial, 0)::numeric(10,2) AS t
    FROM public.caixas c WHERE c.id = p_caixa_id
  )
  SELECT public.round_abnt(
    COALESCE((SELECT t FROM abertura), 0)
    + (SELECT t FROM vendas_din)
    + (SELECT t FROM ar_din)
    + (SELECT sup FROM mov_legado) - (SELECT sang FROM mov_legado)
    + (SELECT t FROM mov_tx) - (SELECT t FROM dev_din), 2
  )::numeric(10,2) INTO v_result;

  RETURN v_result;
END;
$function$;

-- 3) Constraint de conciliação (20261001100300) — antes de remover a coluna que ela referencia.
ALTER TABLE public.venda_pos_venda_operacoes DROP CONSTRAINT IF EXISTS venda_pos_venda_operacoes_conciliacao_chk;

-- 4) Funções internas e colunas (ver a nota de ATENÇÃO no topo).
DROP FUNCTION IF EXISTS internal.sincronizar_saldo_cache(uuid);
DROP FUNCTION IF EXISTS internal.resolver_caixa_pagador(uuid, uuid, text);
DROP FUNCTION IF EXISTS internal.valor_sistema_dinheiro(uuid);

DROP INDEX IF EXISTS public.idx_devolucoes_caixa_desembolso;
ALTER TABLE public.venda_pos_venda_operacoes DROP COLUMN IF EXISTS valor_abatido_ar;
ALTER TABLE public.venda_pos_venda_operacoes DROP COLUMN IF EXISTS caixa_desembolso_id;
ALTER TABLE public.devolucoes DROP COLUMN IF EXISTS caixa_desembolso_id;

NOTIFY pgrst, 'reload schema';
COMMIT;
