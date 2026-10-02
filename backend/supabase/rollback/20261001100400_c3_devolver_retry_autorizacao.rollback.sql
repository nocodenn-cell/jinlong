-- ROLLBACK de 20261001100400 (retry idempotente com autorização).
-- Pré-imagem = corpo de 20261001100200 (PR-2D), ou seja, retry SEM checagem de permissão (bypass conhecido).
-- NÃO é uma migration (não roda no `supabase db push`); aplicar manualmente somente se necessário.

BEGIN;

CREATE OR REPLACE FUNCTION public.devolver_ou_trocar_venda(
  p_venda_id uuid,
  p_idempotency_key text,
  p_motivo text,
  p_tipo text,
  p_itens jsonb,
  p_valor_estorno numeric,
  p_forma_estorno text,
  p_venda_substituta_id uuid DEFAULT NULL::uuid,
  p_operador_id uuid DEFAULT NULL::uuid,
  p_caixa_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(operacao_id uuid, venda_id uuid, tipo text, valor_estornado numeric, valor_caixa_estornado numeric, status_venda text, itens jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := COALESCE(auth.uid(), p_operador_id);
  v_key text := NULLIF(btrim(p_idempotency_key), '');
  v_motivo text := NULLIF(btrim(p_motivo), '');
  v_tipo text := upper(NULLIF(btrim(p_tipo), ''));
  v_forma text := upper(NULLIF(btrim(p_forma_estorno), ''));
  v_venda record;
  v_caixa record;            -- caixa da venda de origem (somente leitura: nunca é alterado)
  v_caixa_pag record;        -- caixa pagador (travado quando há dinheiro a devolver)
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
  -- D-13
  v_pago_total numeric(10, 2) := 0;
  v_meio_ja numeric(10, 2) := 0;
  v_pago_restante numeric(10, 2) := 0;
  v_valor_meio numeric(10, 2) := 0;
  v_valor_ar numeric(10, 2) := 0;
  v_disp_ar numeric(10, 2) := 0;
  v_excesso numeric(10, 2) := 0;
  v_desc_impl numeric(10, 2) := 0;
  v_desc_abs numeric(10, 2) := 0;
  v_forma_op text;
  v_pagador uuid := NULL;
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
    -- Retry idempotente: mesma chave devolve a operação gravada; caixa divergente é erro explícito.
    IF p_caixa_id IS NOT NULL AND v_existing.caixa_desembolso_id IS NOT NULL
       AND p_caixa_id <> v_existing.caixa_desembolso_id THEN
      RAISE EXCEPTION 'DEVOLVER_VENDA_RETRY_CAIXA_DIVERGENTE';
    END IF;
    RETURN QUERY SELECT v_existing.id, v_existing.venda_id, v_existing.tipo, v_existing.valor_estornado, v_existing.valor_caixa_estornado, 'CONCLUIDA'::text, COALESCE((SELECT jsonb_agg(jsonb_build_object('nome', p.nome, 'quantidade', vpi.quantidade, 'preco_unitario', vpi.preco_unitario, 'subtotal', vpi.subtotal) ORDER BY p.nome) FROM public.venda_pos_venda_itens vpi INNER JOIN public.produtos p ON p.id = vpi.produto_id WHERE vpi.operacao_id = v_existing.id), '[]'::jsonb);
    RETURN;
  END IF;

  SELECT v.* INTO v_venda FROM public.vendas v WHERE v.id = p_venda_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DEVOLVER_VENDA_NAO_ENCONTRADA'; END IF;
  IF v_venda.status <> 'CONCLUIDA' THEN RAISE EXCEPTION 'DEVOLVER_VENDA_STATUS_INVALIDO'; END IF;

  -- Caixa da venda: só leitura (loja para autorização e estoque). Não é travado nem alterado (D-2).
  SELECT c.* INTO v_caixa FROM public.caixas c WHERE c.id = v_venda.caixa_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'DEVOLVER_VENDA_CAIXA_NAO_ENCONTRADO'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = v_uid AND u.loja_id = v_caixa.loja_id AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')) THEN
    RAISE EXCEPTION 'DEVOLVER_VENDA_SEM_PERMISSAO';
  END IF;

  IF v_tipo = 'TROCA' AND p_venda_substituta_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.vendas vs WHERE vs.id = p_venda_substituta_id AND vs.status = 'CONCLUIDA') THEN
      RAISE EXCEPTION 'DEVOLVER_VENDA_SUBSTITUTA_INVALIDA';
    END IF;
  END IF;

  -- Título da venda (no máximo um): travado para conciliar D-13 sem corrida com liquidações.
  SELECT cr.* INTO v_cr FROM public.contas_receber cr WHERE cr.venda_id = p_venda_id FOR UPDATE;

  -- D-13: com liquidação ativa (RECEBIMENTO sem ESTORNO) a devolução é bloqueada até o estorno pelo fluxo financeiro.
  IF v_cr.id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.liquidacoes_receber l
     WHERE l.titulo_id = v_cr.id
       AND COALESCE(l.operacao_tipo, 'RECEBIMENTO') = 'RECEBIMENTO'
       AND NOT EXISTS (
         SELECT 1 FROM public.liquidacoes_receber e
          WHERE e.operacao_origem_id = l.id AND e.operacao_tipo = 'ESTORNO')
  ) THEN
    RAISE EXCEPTION 'DEVOLVER_VENDA_TITULO_COM_LIQUIDACAO';
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

  -- ── D-13: conciliação exclusiva entre (a) meio de pagamento e (b) abatimento do saldo a receber ─────
  IF v_forma = 'CREDITO_CLIENTE' THEN
    -- Comportamento existente: a devolução inteira abate o saldo a receber.
    IF v_cr.id IS NULL OR v_cr.status NOT IN ('ABERTO', 'PARCIAL') THEN RAISE EXCEPTION 'DEVOLVER_VENDA_SEM_CONTA_RECEBER'; END IF;
    IF v_cr.valor_aberto < v_valor_estorno - 0.01 THEN RAISE EXCEPTION 'DEVOLVER_VENDA_VALOR_EXCEDE_ABERTO'; END IF;
    v_valor_meio := 0;
    v_valor_ar := v_valor_estorno;
  ELSE
    -- Valor efetivamente pago na venda (legado sem vendas_pagamentos = total_liquido; sem forma e sem pagamentos = 0,
    -- ou seja, 100% a prazo). Reembolsos anteriores em meio de pagamento já consumiram parte desse valor.
    IF EXISTS (SELECT 1 FROM public.vendas_pagamentos vp WHERE vp.venda_id = p_venda_id) THEN
      SELECT COALESCE(sum(vp.valor), 0) INTO v_pago_total FROM public.vendas_pagamentos vp WHERE vp.venda_id = p_venda_id;
    ELSIF v_venda.forma_pagamento IS NOT NULL THEN
      v_pago_total := v_venda.total_liquido;
    ELSE
      v_pago_total := 0;
    END IF;
    SELECT COALESCE(sum(d.valor), 0) INTO v_meio_ja
      FROM public.devolucoes d
      JOIN public.venda_pos_venda_operacoes o ON o.id = d.operacao_id
     WHERE o.venda_id = p_venda_id AND o.forma_estorno <> 'CREDITO_CLIENTE';
    v_pago_restante := GREATEST(0, public.round_abnt(v_pago_total - v_meio_ja, 2));

    -- Reembolso monetariamente FUNGÍVEL: não precisa ser pelo mesmo meio do pagamento original; o limite é o total
    -- efetivamente pago na venda e ainda não devolvido em meio de pagamento (sem rastreio por forma de pagamento).
    v_valor_meio := LEAST(v_valor_estorno, v_pago_restante);
    v_valor_ar := public.round_abnt(v_valor_estorno - v_valor_meio, 2);
    IF v_valor_ar > 0.009 THEN
      -- O excedente só pode abater saldo a receber existente; nunca vira dinheiro nem dívida artificial.
      v_disp_ar := CASE WHEN v_cr.id IS NOT NULL AND v_cr.status IN ('ABERTO', 'PARCIAL') THEN v_cr.valor_aberto ELSE 0 END;
      v_excesso := GREATEST(0, public.round_abnt(v_valor_ar - v_disp_ar, 2));
      v_valor_ar := LEAST(v_valor_ar, v_disp_ar);
      IF v_excesso > 0.009 THEN
        -- Sobra além do pago + saldo em aberto. Só é aceitável se vier do DESCONTO da venda (itens a preço cheio
        -- somam mais que o total líquido): esse valor nunca foi pago, logo não é reembolsável. Qualquer outra sobra
        -- é excesso real → rejeitado. O que sobra de desconto já "absorvido" em devoluções anteriores é descontado.
        SELECT GREATEST(0, COALESCE(sum(iv.preco_unitario * iv.quantidade), 0) - v_venda.total_liquido)
          INTO v_desc_impl FROM public.itens_venda iv WHERE iv.venda_id = p_venda_id;
        SELECT COALESCE(sum(op.itens_subtotal - op.valor_estornado), 0) INTO v_desc_abs
          FROM (SELECT o.valor_estornado,
                       COALESCE((SELECT sum(vpi.subtotal) FROM public.venda_pos_venda_itens vpi WHERE vpi.operacao_id = o.id), 0) AS itens_subtotal
                  FROM public.venda_pos_venda_operacoes o WHERE o.venda_id = p_venda_id) op;
        IF v_excesso > v_desc_impl - v_desc_abs + 0.01 THEN
          RAISE EXCEPTION 'DEVOLVER_VENDA_EXCEDE_VALOR_PAGO';
        END IF;
        -- Valor efetivamente devolvido = meio + abatimento de AR (a parcela de desconto não é estornada).
        v_valor_estorno := public.round_abnt(v_valor_meio + v_valor_ar, 2);
        IF v_valor_estorno <= 0 THEN RAISE EXCEPTION 'DEVOLVER_VENDA_VALOR_ZERO'; END IF;
      END IF;
    ELSE
      v_valor_ar := 0;
    END IF;
  END IF;

  IF v_valor_ar > 0 THEN v_contas_receber_id := v_cr.id; END IF;
  v_forma_op := CASE WHEN v_valor_meio > 0 THEN v_forma ELSE 'CREDITO_CLIENTE' END;

  -- ── Caixa pagador (D-2/D-3): só quando há DINHEIRO a devolver ──────────────────────────────────────
  IF v_forma = 'DINHEIRO' AND v_valor_meio > 0 THEN
    v_pagador := internal.resolver_caixa_pagador(p_caixa_id, v_uid, 'DEVOLVER_VENDA');
    -- FOR NO KEY UPDATE (e não FOR UPDATE): serializa os pagadores do MESMO caixa (conflita com ele mesmo, com FOR UPDATE e
    -- com os UPDATE de saldo dos demais escritores), mas NÃO bloqueia o FK KEY SHARE que outra devolução, pagando por
    -- outro caixa, precisa no caixa da venda de origem (provado em devolucao-concorrencia.sh, cenário 3).
    SELECT c.* INTO v_caixa_pag FROM public.caixas c WHERE c.id = v_pagador FOR NO KEY UPDATE;
    IF NOT FOUND OR v_caixa_pag.status <> 'ABERTO' THEN RAISE EXCEPTION 'DEVOLVER_VENDA_CAIXA_INVALIDO'; END IF;
    -- Disponibilidade pela AUTORIDADE (D-1), medida depois do lock e antes de qualquer saída.
    IF internal.valor_sistema_dinheiro(v_pagador) - v_valor_meio < 0 THEN
      RAISE EXCEPTION 'DEVOLVER_VENDA_SALDO_CAIXA_INSUFICIENTE';
    END IF;
  END IF;

  v_operacao_id := gen_random_uuid();
  INSERT INTO public.venda_pos_venda_operacoes (id, idempotency_key, venda_id, tipo, motivo, valor_estornado, valor_caixa_estornado, forma_estorno, operador_id, caixa_id, venda_substituta_id, contas_receber_id, caixa_desembolso_id, valor_abatido_ar)
  VALUES (v_operacao_id, v_key, p_venda_id, v_tipo, v_motivo, v_valor_estorno, 0, v_forma_op, v_uid, v_caixa.id, p_venda_substituta_id, v_contas_receber_id, v_pagador, v_valor_ar);

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

  -- Abatimento do saldo a receber (mecanismo existente de CREDITO_CLIENTE).
  IF v_valor_ar > 0 THEN
    UPDATE public.contas_receber cr
       SET valor_aberto = public.round_abnt(cr.valor_aberto - v_valor_ar, 2),
           status = CASE WHEN public.round_abnt(cr.valor_aberto - v_valor_ar, 2) <= 0.009 THEN 'QUITADO' ELSE 'PARCIAL' END
     WHERE cr.id = v_cr.id;
  END IF;

  -- Registro em `devolucoes`.
  IF v_forma = 'CREDITO_CLIENTE' THEN
    -- Legado preservado: linha rotulada 'PIX' com o valor integral (não é dinheiro; não afeta a autoridade).
    INSERT INTO public.devolucoes (venda_id, valor, forma_pagamento, motivo, operador_id, operacao_id)
    VALUES (p_venda_id, v_valor_estorno, 'PIX', v_motivo, v_uid, v_operacao_id);
  ELSIF v_valor_meio > 0 THEN
    INSERT INTO public.devolucoes (venda_id, valor, forma_pagamento, motivo, operador_id, operacao_id, caixa_desembolso_id)
    VALUES (p_venda_id, v_valor_meio, v_forma, v_motivo, v_uid, v_operacao_id, v_pagador);
    IF v_forma = 'DINHEIRO' THEN
      v_valor_caixa := v_valor_meio;
      -- Cache derivado do caixa PAGADOR (o caixa da venda, se fechado, permanece intacto).
      PERFORM internal.sincronizar_saldo_cache(v_pagador);
    END IF;
  END IF;

  UPDATE public.venda_pos_venda_operacoes SET valor_caixa_estornado = v_valor_caixa WHERE id = v_operacao_id;
  INSERT INTO public.venda_eventos (event_type, sale_id, caixa_id, operador_id, loja_id, items, total, total_bruto, forma_pagamento, source, idempotency_key)
  VALUES ('SALE_PARTIAL_RETURN', p_venda_id, v_caixa.id, v_uid, v_caixa.loja_id, v_event_items, v_valor_estorno, v_valor_estorno, v_forma, c_source, c_source || ':partial_return:' || v_operacao_id::text)
  ON CONFLICT (idempotency_key) DO NOTHING;
  RETURN QUERY SELECT v_operacao_id, p_venda_id, v_tipo, v_valor_estorno, v_valor_caixa, 'CONCLUIDA'::text, COALESCE((SELECT jsonb_agg(jsonb_build_object('nome', p.nome, 'quantidade', vpi.quantidade, 'preco_unitario', vpi.preco_unitario, 'subtotal', vpi.subtotal) ORDER BY p.nome) FROM public.venda_pos_venda_itens vpi INNER JOIN public.produtos p ON p.id = vpi.produto_id WHERE vpi.operacao_id = v_operacao_id), '[]'::jsonb);
END;
$function$;

-- Permissões explícitas (idempotente; CREATE OR REPLACE preserva a ACL, reaplicada aqui por segurança).
REVOKE ALL ON FUNCTION public.devolver_ou_trocar_venda(uuid, text, text, text, jsonb, numeric, text, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.devolver_ou_trocar_venda(uuid, text, text, text, jsonb, numeric, text, uuid, uuid, uuid) TO authenticated, service_role;

DO $verify$
BEGIN
  IF has_function_privilege('anon', 'public.devolver_ou_trocar_venda(uuid, text, text, text, jsonb, numeric, text, uuid, uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'devolver_ou_trocar_venda: anon não pode executar';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.devolver_ou_trocar_venda(uuid, text, text, text, jsonb, numeric, text, uuid, uuid, uuid)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.devolver_ou_trocar_venda(uuid, text, text, text, jsonb, numeric, text, uuid, uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'devolver_ou_trocar_venda: authenticated/service_role perderam EXECUTE';
  END IF;
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'devolver_ou_trocar_venda') <> 1 THEN
    RAISE EXCEPTION 'devolver_ou_trocar_venda: overload detectado';
  END IF;
END
$verify$;

NOTIFY pgrst, 'reload schema';

COMMIT;
