-- T4 (auditoria Jinlong 2026-09-27): finalizar_venda_transacional_canonica_v4
-- aceitava soma de pagamentos < total sempre que p_cliente_id não era nulo,
-- criando um contas_receber automaticamente para a diferença. O módulo fiado
-- já foi removido do PDV (migration 246_remover_venda_fiado.sql bloqueia
-- forma_pagamento='FIADO'), mas esse caminho de "pagamento parcial + cliente
-- vinculado" continuava aberto e funcionava como um fiado informal — inclusive
-- por engano, quando o cliente é vinculado à venda por outro motivo (ex.:
-- cadastro para contato) e o "Recebido" do PDV fica desatualizado (bug do
-- caixa corrigido separadamente em useCaixaPagamentos.ts).
--
-- Decisão de produto (Jinlong/decisoes/REMOVER_MODULO_FIADO.md): o subsistema
-- de contas a receber será removido por completo, em fases, com backup de
-- produção antes do DROP. Esta migration NÃO antecipa essa remoção — não
-- toca em tabelas, RLS ou telas de contas_receber. Ela só fecha a única
-- porta de entrada ainda aberta para criar um título a partir de uma venda:
-- qualquer soma de pagamentos abaixo do total líquido agora é rejeitada na
-- validação pré-transação, antes de qualquer INSERT (vendas, itens_venda,
-- estoque ou contas_receber) — independentemente de p_cliente_id.
--
-- Único trecho alterado (~linha 270 da versão anterior, 20260902140300): a
-- checagem de v_saldo_pendente passa a ser incondicional. O restante do
-- corpo é cópia verbatim de 20260902140300_fiscal_payload_snapshot_icms_origem.sql
-- — nenhuma mudança em preço, estoque, fiscal, desconto de gerente ou limite
-- de crédito.
--
-- O bloco de limite de crédito / INSERT INTO contas_receber mais abaixo
-- (guardado por `IF v_saldo_pendente_atual > 0.009`) fica como código morto,
-- de propósito: nunca mais é alcançado (v_saldo_pendente_atual não pode ficar
-- acima de 0.009 quando a validação pré-transação já barrou o caso), mas
-- removê-lo é escopo da Fase 5 do plano de remoção do fiado, não deste T4.
--
-- ROLLBACK: reaplicar o CREATE OR REPLACE anterior, disponível em
-- 20260902140300_fiscal_payload_snapshot_icms_origem.sql.

BEGIN;

CREATE OR REPLACE FUNCTION public.finalizar_venda_transacional_canonica_v4_unscoped(
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
  p_motivo_desconto motivo_desconto_enum_tipo DEFAULT 'NAO_ESPECIFICADO'::motivo_desconto_enum_tipo,
  p_motivo_descricao text DEFAULT NULL::text,
  p_limite_credito_gerente_token text DEFAULT NULL::text
)
RETURNS TABLE(venda_id uuid, status text, mensagem text, dados_fiscais jsonb, itens_atualizados jsonb, estoque_baixado jsonb, event_id uuid, contas_receber_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_uid uuid := COALESCE(auth.uid(), p_operador_id);
  v_item jsonb; v_item_id uuid; v_produto_id uuid; v_quantidade numeric;
  v_preco_original numeric; v_preco_unitario numeric; v_desconto_unitario numeric;
  v_tipo_preco text; v_q_int integer; v_calc jsonb; v_preco_esperado numeric;
  v_tipo_esperado text; v_rpc_row record;
  v_total_bruto_calc numeric := 0; v_total_liquido_base_calc numeric := 0;
  v_total_desconto_base_calc numeric := 0; v_total_desconto_final_calc numeric := 0;
  v_total_liquido_final_calc numeric := 0; v_desconto_gerente_valor numeric := 0;
  v_max_desconto_gerente numeric := 0; v_cfg_gerente_id text := NULL;
  v_has_gerente_desconto boolean := false;
  v_pag jsonb; v_pag_forma text; v_pag_valor numeric; v_pag_total numeric := 0;
  v_eps constant numeric := 0.02;
  v_doc_id uuid; v_payload jsonb; v_row_doc jsonb; v_event_id uuid;
  v_fiscal jsonb;
  c_source constant text := 'web_caixa';
  v_saldo_pendente numeric := 0;
  v_saldo_pendente_atual numeric := 0;
  v_total_pago_atual numeric := 0;
  v_contas_receber_id uuid;
  v_categoria_id uuid;
  v_promo_regra_id uuid;
  v_promo_tipo_desconto text;
  v_promo_valor numeric;
  v_preco_pos_promo numeric;
  v_promo_pct_snapshot numeric;
  v_promo_nome text;
  v_max_desconto_total numeric := 60.00;
  v_pct_desconto_total numeric;
  v_custo_unitario_snap numeric;
  v_tipo_preco_fonte text;
  v_regra_aplicada_id uuid;
  v_saldo_devedor_cliente numeric := 0;
  v_limite_credito_cliente numeric := 0;
  v_modo_credito text := 'AVISO';
  v_aviso_limite_credito text := NULL;
  v_venda_existente record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_OPERADOR_OBRIGATORIO';
  END IF;

  IF upper(COALESCE(p_forma_pagamento, '')) = 'FIADO' THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_FIADO_DESABILITADO';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_venda_id::text));

  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) <= 0 THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_ITENS_INVALIDOS';
  END IF;

  SELECT v.total_bruto, v.total_desconto, v.total_liquido, v.forma_pagamento
  INTO v_venda_existente
  FROM public.vendas v
  WHERE v.id = p_venda_id AND v.status = 'CONCLUIDA';

  IF FOUND THEN
    IF v_venda_existente.total_bruto IS DISTINCT FROM p_total_bruto
       OR v_venda_existente.total_desconto IS DISTINCT FROM p_total_desconto
       OR v_venda_existente.total_liquido IS DISTINCT FROM p_total_liquido
       OR v_venda_existente.forma_pagamento IS DISTINCT FROM p_forma_pagamento THEN
      RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_RETRY_PAYLOAD_DIVERGENTE';
    END IF;

    SELECT jsonb_build_object('documento_fiscal_id', d.id, 'status', d.status, 'tipo_doc', d.tipo_doc)
    INTO v_row_doc FROM public.documentos_fiscais_pendentes d
    WHERE d.venda_id = p_venda_id AND d.status <> 'CANCELADO' AND d.deleted_at IS NULL
    ORDER BY d.created_at DESC LIMIT 1;
    v_event_id := public.ensure_venda_evento_registrado(p_venda_id, c_source);
    RETURN QUERY SELECT p_venda_id, 'CONCLUIDA'::text, NULL::text, v_row_doc, NULL::jsonb, NULL::jsonb, v_event_id, NULL::uuid;
    RETURN;
  END IF;

  v_has_gerente_desconto := COALESCE(p_desconto_gerente_percentual, 0) > 0;
  IF p_strict_manager_discount_auth AND v_has_gerente_desconto AND p_desconto_gerente_token IS NULL THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_GERENTE_TOKEN_OBRIGATORIO';
  END IF;
  IF p_desconto_gerente_token IS NOT NULL AND COALESCE(p_desconto_gerente_percentual, 0) <= 0 THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_GERENTE_PERCENTUAL_INVALIDO';
  END IF;

  SELECT max_desconto_gerente_percentual, gerente_id, COALESCE(max_desconto_total_percentual, 60.00)
  INTO v_max_desconto_gerente, v_cfg_gerente_id, v_max_desconto_total FROM public.pdv_config WHERE id = 1;

  IF p_desconto_gerente_token IS NOT NULL THEN
    IF p_desconto_gerente_percentual <= 0 OR p_desconto_gerente_percentual > COALESCE(v_max_desconto_gerente, 0) THEN
      RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_DESCONTO_GERENTE_LIMITE';
    END IF;
    PERFORM 1 FROM public.tokens_desconto_gerente t
    WHERE t.token = p_desconto_gerente_token AND t.usado = false AND t.expira_em > now() FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_TOKEN_GERENTE_INVALIDO'; END IF;
  ELSIF p_strict_manager_discount_auth AND v_has_gerente_desconto THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_GERENTE_TOKEN_OBRIGATORIO';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens)
  LOOP
    v_produto_id := (v_item->>'produto_id')::uuid;
    v_quantidade := (v_item->>'quantidade')::numeric;
    v_preco_original := (v_item->>'preco_original')::numeric;
    v_preco_unitario := (v_item->>'preco_unitario')::numeric;
    v_tipo_preco := COALESCE(v_item->>'tipo_preco', 'VAREJO');
    IF v_produto_id IS NULL OR v_quantidade IS NULL OR v_quantidade <= 0 THEN
      RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_ITEM_INVALIDO';
    END IF;
    IF v_preco_original IS NULL OR v_preco_original < 0 OR v_preco_unitario IS NULL OR v_preco_unitario < 0 THEN
      RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_PRECO_INVALIDO';
    END IF;
    IF v_tipo_preco = 'MANUAL' THEN
      IF v_preco_unitario > v_preco_original + v_eps THEN
        RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_PRECO_ACIMA_REFERENCIA';
      END IF;
    ELSE
      v_q_int := GREATEST(1, FLOOR(COALESCE(v_quantidade, 0)))::integer;
      v_calc := public.calcular_preco_produto(v_produto_id, v_q_int, p_loja_id);
      IF v_calc IS NULL OR v_calc->>'erro' IS NOT NULL OR v_calc->>'preco' IS NULL THEN
        RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_PRECO_NAO_VALIDADO:%', v_produto_id;
      END IF;
      v_preco_esperado := (v_calc->>'preco')::numeric;
      v_tipo_esperado := COALESCE(v_calc->>'tipo', 'VAREJO');
      IF v_tipo_esperado IS DISTINCT FROM v_tipo_preco THEN
        RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_TIPO_PRECO_DIVERGENTE:%', v_produto_id;
      END IF;

      SELECT categoria_id INTO v_categoria_id FROM public.produtos WHERE id = v_produto_id;
      SELECT regra_id, tipo_desconto, valor_desconto
      INTO v_promo_regra_id, v_promo_tipo_desconto, v_promo_valor
      FROM public.calcular_promocao_aplicavel(v_produto_id, v_categoria_id, v_quantidade);

      IF v_promo_regra_id IS NOT NULL THEN
        IF v_promo_tipo_desconto = 'PERCENTUAL' THEN
          v_preco_pos_promo := v_preco_esperado * (1 - v_promo_valor / 100);
        ELSE
          v_preco_pos_promo := GREATEST(0, v_preco_esperado - v_promo_valor);
        END IF;
        v_preco_esperado := v_preco_pos_promo;
      END IF;

      IF ABS(v_preco_esperado - v_preco_unitario) > v_eps THEN
        RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_PRECO_DIVERGENTE:%', v_produto_id;
      END IF;
    END IF;
    v_total_bruto_calc := v_total_bruto_calc + (v_preco_original * v_quantidade);
    v_total_liquido_base_calc := v_total_liquido_base_calc + (v_preco_unitario * v_quantidade);
  END LOOP;

  v_total_bruto_calc := public.round_abnt(v_total_bruto_calc, 2);
  v_total_liquido_base_calc := public.round_abnt(v_total_liquido_base_calc, 2);
  v_total_desconto_base_calc := public.round_abnt(v_total_bruto_calc - v_total_liquido_base_calc, 2);
  IF p_desconto_gerente_token IS NOT NULL THEN
    v_desconto_gerente_valor := public.round_abnt((v_total_liquido_base_calc * p_desconto_gerente_percentual) / 100, 2);
  END IF;
  v_total_desconto_final_calc := public.round_abnt(v_total_desconto_base_calc + v_desconto_gerente_valor, 2);
  v_total_liquido_final_calc := public.round_abnt(v_total_bruto_calc - v_total_desconto_final_calc, 2);

  IF v_total_bruto_calc > 0 THEN
    v_pct_desconto_total := public.round_abnt(v_total_desconto_final_calc / v_total_bruto_calc * 100, 4);
    IF v_pct_desconto_total > v_max_desconto_total THEN
      RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_DESCONTO_TOTAL_EXCEDE_LIMITE:%', v_pct_desconto_total;
    END IF;
  END IF;

  IF p_pagamentos IS NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.formas_pagamento fp
      WHERE fp.loja_id = p_loja_id AND fp.codigo = upper(COALESCE(p_forma_pagamento, '')) AND fp.ativo = true
    ) THEN
      RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_FORMA_PAGAMENTO_INVALIDA';
    END IF;
    v_pag_total := v_total_liquido_final_calc;
  ELSE
    IF jsonb_typeof(p_pagamentos) <> 'array' OR jsonb_array_length(p_pagamentos) <= 0 THEN
      RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_PAGAMENTOS_INVALIDOS';
    END IF;
    FOR v_pag IN SELECT value FROM jsonb_array_elements(p_pagamentos)
    LOOP
      v_pag_forma := upper(COALESCE(v_pag->>'forma_pagamento', ''));
      v_pag_valor := public.round_abnt(COALESCE((v_pag->>'valor')::numeric, 0), 2);
      IF NOT EXISTS (
        SELECT 1 FROM public.formas_pagamento fp
        WHERE fp.loja_id = p_loja_id AND fp.codigo = v_pag_forma AND fp.ativo = true
      ) THEN
        RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_FORMA_PAGAMENTO_INVALIDA';
      END IF;
      IF v_pag_valor <= 0 THEN RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_VALOR_PAGAMENTO_INVALIDO'; END IF;
      v_pag_total := public.round_abnt(v_pag_total + v_pag_valor, 2);
    END LOOP;
  END IF;

  IF v_pag_total > v_total_liquido_final_calc + 0.01 THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_PAGAMENTOS_EXCEDEM_TOTAL';
  END IF;
  IF v_pag_total <= 0.009 THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_PAGAMENTO_ZERO';
  END IF;

  IF p_total_bruto IS NOT NULL AND p_total_desconto IS NOT NULL AND p_total_liquido IS NOT NULL
     AND (ABS(v_total_bruto_calc - p_total_bruto) > 0.02
       OR ABS(v_total_desconto_final_calc - p_total_desconto) > 0.02
       OR ABS(v_total_liquido_final_calc - p_total_liquido) > 0.02) THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_TOTAIS_DIVERGENTES';
  END IF;

  v_saldo_pendente := public.round_abnt(v_total_liquido_final_calc - v_pag_total, 2);

  -- T4 (auditoria 2026-09-27): fiado foi removido do PDV — nenhuma venda
  -- pode ser concluída com soma de pagamentos menor que o total, com ou sem
  -- cliente vinculado. Substitui a checagem anterior, que só rejeitava
  -- pagamento parcial quando p_cliente_id era nulo e, com cliente
  -- vinculado, seguia para criar um contas_receber automaticamente.
  IF v_saldo_pendente > 0.009 THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_PAGAMENTOS_INSUFICIENTES';
  END IF;

  INSERT INTO public.vendas (
    id, caixa_id, operador_id, total_bruto, total_desconto, total_liquido, forma_pagamento, status, cliente_id
  ) VALUES (
    p_venda_id, p_caixa_id, v_uid, v_total_bruto_calc, v_total_desconto_final_calc,
    v_total_liquido_final_calc, p_forma_pagamento, 'CONCLUIDA', p_cliente_id
  ) ON CONFLICT (id) DO NOTHING;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens)
  LOOP
    v_item_id := COALESCE((v_item->>'item_id')::uuid, gen_random_uuid());
    v_produto_id := (v_item->>'produto_id')::uuid;
    v_quantidade := (v_item->>'quantidade')::numeric;
    v_preco_original := (v_item->>'preco_original')::numeric;
    v_preco_unitario := (v_item->>'preco_unitario')::numeric;
    v_tipo_preco := COALESCE(v_item->>'tipo_preco', 'VAREJO');
    v_desconto_unitario := GREATEST(0, v_preco_original - v_preco_unitario);

    SELECT p.preco_custo INTO v_custo_unitario_snap FROM public.produtos p WHERE p.id = v_produto_id;
    v_tipo_preco_fonte := v_item->>'tipo_preco_fonte';
    v_regra_aplicada_id := (v_item->>'regra_aplicada_id')::uuid;

    v_promo_regra_id := NULL;
    v_promo_pct_snapshot := NULL;
    v_promo_nome := NULL;

    IF v_tipo_preco IN ('VAREJO', 'ATACADO') THEN
      SELECT categoria_id INTO v_categoria_id FROM public.produtos WHERE id = v_produto_id;
      SELECT regra_id, tipo_desconto, valor_desconto
      INTO v_promo_regra_id, v_promo_tipo_desconto, v_promo_valor
      FROM public.calcular_promocao_aplicavel(v_produto_id, v_categoria_id, v_quantidade);

      IF v_promo_regra_id IS NOT NULL THEN
        IF v_promo_tipo_desconto = 'PERCENTUAL' THEN
          v_promo_pct_snapshot := v_promo_valor;
        ELSIF v_preco_original > 0 THEN
          v_promo_pct_snapshot := ROUND(LEAST(100, GREATEST(0, v_promo_valor / v_preco_original * 100)), 4);
        ELSE
          v_promo_pct_snapshot := 0;
        END IF;
        SELECT nome INTO v_promo_nome FROM public.regras_preco WHERE id = v_promo_regra_id;
      END IF;
    END IF;

    INSERT INTO public.itens_venda (
      id, venda_id, produto_id, quantidade, preco_unitario_original, preco_unitario, desconto_unitario, tipo_preco,
      custo_unitario_snap, tipo_preco_fonte, regra_aplicada_id,
      promocao_regra_id, promocao_desconto_percentual, promocao_nome_snapshot
    ) VALUES (
      v_item_id, p_venda_id, v_produto_id, v_quantidade, v_preco_original, v_preco_unitario, v_desconto_unitario, v_tipo_preco,
      v_custo_unitario_snap, v_tipo_preco_fonte, v_regra_aplicada_id,
      v_promo_regra_id, v_promo_pct_snapshot, v_promo_nome
    ) ON CONFLICT (id) DO NOTHING;

    SELECT * INTO v_rpc_row
    FROM public.decrementar_estoque_seguro(v_produto_id, v_quantidade, p_venda_id)
    LIMIT 1;
    IF v_rpc_row IS NULL OR v_rpc_row.sucesso IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_ESTOQUE:%', COALESCE(v_rpc_row.mensagem, 'DESCONHECIDO');
    END IF;
  END LOOP;

  IF p_pagamentos IS NULL THEN
    INSERT INTO public.vendas_pagamentos (venda_id, forma_pagamento, valor)
    VALUES (p_venda_id, p_forma_pagamento, v_total_liquido_final_calc)
    ON CONFLICT (venda_id, forma_pagamento) DO NOTHING;
  ELSE
    FOR v_pag IN SELECT value FROM jsonb_array_elements(p_pagamentos)
    LOOP
      v_pag_forma := upper(COALESCE(v_pag->>'forma_pagamento', ''));
      v_pag_valor := public.round_abnt(COALESCE((v_pag->>'valor')::numeric, 0), 2);

      INSERT INTO public.vendas_pagamentos (venda_id, forma_pagamento, valor)
      VALUES (p_venda_id, v_pag_forma, v_pag_valor)
      ON CONFLICT (venda_id, forma_pagamento) DO UPDATE SET valor = vendas_pagamentos.valor + EXCLUDED.valor;
    END LOOP;
  END IF;

  SELECT COALESCE(SUM(vp.valor), 0)
  INTO v_total_pago_atual
  FROM public.vendas_pagamentos vp
  WHERE vp.venda_id = p_venda_id;

  v_saldo_pendente_atual := public.round_abnt(v_total_liquido_final_calc - v_total_pago_atual, 2);

  IF ABS(v_saldo_pendente_atual - v_saldo_pendente) > 0.01 THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_SALDO_DIVERGENTE';
  END IF;

  IF p_desconto_gerente_token IS NOT NULL THEN
    UPDATE public.tokens_desconto_gerente
    SET usado = true
    WHERE token = p_desconto_gerente_token AND usado = false;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_TOKEN_GERENTE_JA_USADO';
    END IF;

    INSERT INTO public.descontos_venda (
      venda_id, gerente_id, desconto_percentual, desconto_valor, operador_id,
      aplicado_em, motivo_desconto, motivo_descricao_livre
    ) VALUES (
      p_venda_id, COALESCE(v_cfg_gerente_id, v_uid::text), p_desconto_gerente_percentual,
      v_desconto_gerente_valor, v_uid, now(), p_motivo_desconto, p_motivo_descricao
    )
    ON CONFLICT (venda_id) DO UPDATE SET
      gerente_id = EXCLUDED.gerente_id,
      desconto_percentual = EXCLUDED.desconto_percentual,
      desconto_valor = EXCLUDED.desconto_valor,
      operador_id = EXCLUDED.operador_id,
      aplicado_em = EXCLUDED.aplicado_em,
      motivo_desconto = EXCLUDED.motivo_desconto,
      motivo_descricao_livre = EXCLUDED.motivo_descricao_livre;
  END IF;

  -- Código morto pós-T4: v_saldo_pendente_atual nunca fica acima de 0.009
  -- aqui, porque a validação pré-transação acima já rejeitou esse caso antes
  -- de qualquer INSERT. Mantido intacto de propósito — removê-lo (junto do
  -- restante do subsistema de contas_receber) é a Fase 5 de
  -- Jinlong/decisoes/REMOVER_MODULO_FIADO.md, fora do escopo deste T4.
  IF v_saldo_pendente_atual > 0.009 THEN
    IF NOT EXISTS (SELECT 1 FROM public.clientes c
                   WHERE c.id = p_cliente_id AND c.loja_id = p_loja_id) THEN
      RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_CLIENTE_LOJA_INVALIDO_TX';
    END IF;

    SELECT COALESCE(c.limite_credito, 0) INTO v_limite_credito_cliente
      FROM public.clientes c WHERE c.id = p_cliente_id;

    SELECT COALESCE(SUM(cr.valor_aberto), 0) INTO v_saldo_devedor_cliente
      FROM public.contas_receber cr
      WHERE cr.cliente_id = p_cliente_id AND cr.status IN ('ABERTO', 'PARCIAL');

    v_saldo_devedor_cliente := public.round_abnt(v_saldo_devedor_cliente + v_saldo_pendente_atual, 2);

    IF v_saldo_devedor_cliente > v_limite_credito_cliente THEN
      SELECT pc.modo_limite_credito INTO v_modo_credito
        FROM public.pdv_config pc WHERE pc.loja_id = p_loja_id;
      v_modo_credito := COALESCE(v_modo_credito, 'AVISO');

      IF v_modo_credito = 'BLOQUEIO' THEN
        RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_LIMITE_CREDITO_EXCEDIDO:%/%', v_saldo_devedor_cliente, v_limite_credito_cliente;
      ELSIF v_modo_credito = 'AUTORIZACAO_GERENTE' THEN
        IF p_limite_credito_gerente_token IS NULL THEN
          RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_LIMITE_CREDITO_TOKEN_OBRIGATORIO';
        END IF;
        PERFORM 1 FROM public.tokens_desconto_gerente t
        WHERE t.token = p_limite_credito_gerente_token AND t.usado = false AND t.expira_em > now() FOR UPDATE;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_LIMITE_CREDITO_TOKEN_INVALIDO';
        END IF;
        UPDATE public.tokens_desconto_gerente
          SET usado = true
          WHERE token = p_limite_credito_gerente_token AND usado = false;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_LIMITE_CREDITO_TOKEN_JA_USADO';
        END IF;
      ELSE
        v_aviso_limite_credito := format(
          'Limite de crédito excedido: saldo %s após esta venda, limite %s.',
          v_saldo_devedor_cliente::text, v_limite_credito_cliente::text
        );
      END IF;
    END IF;

    INSERT INTO public.contas_receber (
      id, cliente_id, venda_id, loja_id,
      valor_total, valor_aberto, status, created_at
    ) VALUES (
      gen_random_uuid(), p_cliente_id, p_venda_id, p_loja_id,
      v_total_liquido_final_calc, v_saldo_pendente_atual, 'ABERTO', now()
    )
    ON CONFLICT (venda_id) WHERE (venda_id IS NOT NULL) DO UPDATE SET
      valor_total = EXCLUDED.valor_total,
      valor_aberto = EXCLUDED.valor_aberto
    RETURNING id INTO v_contas_receber_id;
  END IF;

  v_event_id := public.ensure_venda_evento_registrado(p_venda_id, c_source);

  IF p_fiscal_auto_enqueue THEN
    BEGIN
      SELECT jsonb_build_object(
        'origem', c_source,
        'venda_id', p_venda_id,
        'loja_id', p_loja_id,
        'caixa_id', p_caixa_id,
        'operador_id', v_uid,
        'cliente_id', p_cliente_id,
        'data_venda', v.data,
        'totais', jsonb_build_object(
          'bruto', v_total_bruto_calc,
          'desconto', v_total_desconto_final_calc,
          'liquido', v_total_liquido_final_calc
        ),
        'pagamentos', (
          SELECT jsonb_agg(jsonb_build_object('forma_pagamento', vp.forma_pagamento, 'valor', vp.valor))
          FROM public.vendas_pagamentos vp
          WHERE vp.venda_id = p_venda_id
        ),
        'destinatario', (
          SELECT jsonb_build_object('cliente_id', c.id, 'nome', c.nome, 'documento', c.documento, 'tipo', c.tipo)
          FROM public.clientes c
          WHERE c.id = p_cliente_id
        ),
        'itens', (
          SELECT jsonb_agg(jsonb_build_object(
            'produto_id', iv.produto_id,
            'nome', p.nome,
            'codigo_barras', p.codigo_barras,
            'quantidade', iv.quantidade,
            'preco_unitario_original', iv.preco_unitario_original,
            'preco_unitario', iv.preco_unitario,
            'desconto_unitario', iv.desconto_unitario,
            'tipo_preco', iv.tipo_preco,
            'unidade_medida', p.unidade_medida,
            'ncm', p.ncm,
            'cfop', COALESCE(p.cfop_produto, pc2.cfop_padrao),
            'csosn', p.csosn,
            'cest', p.cest,
            'cst_pis', p.cst_pis,
            'cst_cofins', p.cst_cofins,
            -- Onda C2.6: código de origem ICMS (tag `orig` da Focus), capturado
            -- do produto no momento da venda — como qualquer outro campo
            -- tributário desta lista. NULL quando o produto ainda não foi
            -- classificado; não é derivado/inferido aqui.
            'icms_origem', p.icms_origem
          ))
          FROM public.itens_venda iv
          JOIN public.produtos p ON p.id = iv.produto_id
          LEFT JOIN public.pdv_config pc2 ON pc2.loja_id = p_loja_id
          WHERE iv.venda_id = p_venda_id
        ),
        'emitente', (
          SELECT jsonb_build_object(
            'loja_id', l.id,
            'cnpj', l.cnpj,
            'inscricao_estadual', l.inscricao_estadual,
            'razao_social', l.razao_social,
            'nome_fantasia', l.nome_fantasia,
            'endereco_logradouro', l.endereco_logradouro,
            'endereco_numero', l.endereco_numero,
            'endereco_complemento', l.endereco_complemento,
            'endereco_bairro', l.endereco_bairro,
            'endereco_cidade', l.endereco_cidade,
            'endereco_uf', l.endereco_uf,
            'endereco_cep', l.endereco_cep,
            'cnae', l.cnae,
            'numero_serie_nfce', l.numero_serie_nfce,
            'numero_serie_nfe', l.numero_serie_nfe,
            'regime_tributario', pc2.regime_tributario
          )
          FROM public.lojas l
          LEFT JOIN public.pdv_config pc2 ON pc2.loja_id = l.id
          WHERE l.id = p_loja_id
        )
      )
      INTO v_payload
      FROM public.vendas v
      WHERE v.id = p_venda_id;

      INSERT INTO public.documentos_fiscais_pendentes (venda_id, tipo_doc, status, payload)
      VALUES (p_venda_id, 'NFC_E_STUB', 'PENDENTE', COALESCE(v_payload, '{}'::jsonb));
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Fiscal enqueue falhou para venda %: %', p_venda_id, SQLERRM;
    END;
  END IF;

  SELECT jsonb_build_object('documento_fiscal_id', d.id, 'status', d.status, 'tipo_doc', d.tipo_doc)
  INTO v_row_doc FROM public.documentos_fiscais_pendentes d
  WHERE d.venda_id = p_venda_id AND d.status <> 'CANCELADO' AND d.deleted_at IS NULL
  ORDER BY d.created_at DESC LIMIT 1;

  RETURN QUERY SELECT
    p_venda_id, 'CONCLUIDA'::text, v_aviso_limite_credito,
    v_row_doc, NULL::jsonb, NULL::jsonb,
    v_event_id, v_contas_receber_id;
END;
$function$;

COMMENT ON FUNCTION public.finalizar_venda_transacional_canonica_v4_unscoped(
  uuid, uuid, uuid, uuid, text, numeric, numeric, numeric, jsonb, jsonb, text, numeric,
  boolean, boolean, text, text, text, text, uuid, motivo_desconto_enum_tipo, text, text
) IS 'T4 (2026-09-27): saldo pendente > 0 sempre rejeita (FINALIZAR_VENDA_CANONICA_PAGAMENTOS_INSUFICIENTES), independente de p_cliente_id — fecha a porta de fiado informal via pagamento parcial. Resto do corpo idêntico a 20260902140300_fiscal_payload_snapshot_icms_origem.sql. CORE TRANSACIONAL.';

NOTIFY pgrst, 'reload schema';

DO $verify$
DECLARE
  v_def text;
BEGIN
  v_def := pg_get_functiondef('public.finalizar_venda_transacional_canonica_v4_unscoped(
    uuid, uuid, uuid, uuid, text, numeric, numeric, numeric, jsonb, jsonb, text, numeric,
    boolean, boolean, text, text, text, text, uuid, motivo_desconto_enum_tipo, text, text
  )'::regprocedure);

  -- Regressões pré-existentes continuam presentes.
  IF position('FINALIZAR_VENDA_CANONICA_RETRY_PAYLOAD_DIVERGENTE' IN v_def) = 0 THEN
    RAISE EXCEPTION 'T4_GUARD_RETRY_AUSENTE';
  END IF;
  IF position('pg_advisory_xact_lock(hashtext(p_venda_id::text))' IN v_def) = 0 THEN
    RAISE EXCEPTION 'T4_GUARD_LOCK_AUSENTE';
  END IF;
  IF position('''icms_origem'', p.icms_origem' IN v_def) = 0 THEN
    RAISE EXCEPTION 'T4_ICMS_ORIGEM_AUSENTE_NO_SNAPSHOT';
  END IF;

  -- T4: novo gate incondicional presente, gate condicional antigo ausente.
  IF position('FINALIZAR_VENDA_CANONICA_PAGAMENTOS_INSUFICIENTES' IN v_def) = 0 THEN
    RAISE EXCEPTION 'T4_GATE_PAGAMENTOS_INSUFICIENTES_AUSENTE';
  END IF;
  IF position('v_saldo_pendente > 0.009 AND p_cliente_id IS NULL' IN v_def) > 0 THEN
    RAISE EXCEPTION 'T4_GATE_CONDICIONAL_ANTIGO_REMANESCENTE';
  END IF;
  IF position('FINALIZAR_VENDA_CANONICA_SALDO_PENDENTE_EXIGE_CLIENTE' IN v_def) > 0 THEN
    RAISE EXCEPTION 'T4_CODIGO_ERRO_ANTIGO_REMANESCENTE';
  END IF;
END
$verify$;

COMMIT;
