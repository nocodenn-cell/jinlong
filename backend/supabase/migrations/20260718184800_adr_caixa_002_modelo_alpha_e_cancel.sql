-- ADR-CAIXA-002 (Missão 4.2.1)
-- 1) Modelo α: devoluções só entram em E(c) se a venda ainda está CONCLUIDA.
-- 2) Cancel: decremento de saldo_atual é best-effort (não bloqueia).
--    E(c) permanece a autoridade do esperado; saldo_atual não é SSoT.
-- Não cria movimentacao de venda; não altera PIX/cartão; fechamento continua via E(c).

CREATE OR REPLACE FUNCTION public.calcular_valor_sistema_dinheiro_caixa(p_caixa_id uuid)
RETURNS numeric(10,2)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result numeric(10,2);
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.caixas c
      INNER JOIN public.usuarios u ON u.id = auth.uid()
      WHERE c.id = p_caixa_id
        AND c.loja_id = u.loja_id
        AND (
          c.operador_id = auth.uid()
          OR u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
        )
    ) THEN
      RAISE EXCEPTION 'Acesso negado ao caixa informado.' USING ERRCODE = '42501';
    END IF;
  END IF;

  WITH vendas_din_split AS (
    SELECT COALESCE(SUM(vp.valor), 0)::numeric(10,2) AS t
    FROM public.vendas_pagamentos vp
    INNER JOIN public.vendas v ON v.id = vp.venda_id
    WHERE v.caixa_id = p_caixa_id
      AND v.status = 'CONCLUIDA'
      AND vp.forma_pagamento = 'DINHEIRO'
  ),
  vendas_din_legado AS (
    SELECT COALESCE(SUM(v.total_liquido), 0)::numeric(10,2) AS t
    FROM public.vendas v
    WHERE v.caixa_id = p_caixa_id
      AND v.forma_pagamento = 'DINHEIRO'
      AND v.status = 'CONCLUIDA'
      AND NOT EXISTS (
        SELECT 1 FROM public.vendas_pagamentos vp WHERE vp.venda_id = v.id
      )
  ),
  vendas_din AS (
    SELECT ROUND((SELECT t FROM vendas_din_split) + (SELECT t FROM vendas_din_legado), 2)::numeric(10,2) AS t
  ),
  mov_legado AS (
    SELECT
      COALESCE(SUM(CASE WHEN m.tipo = 'SUPRIMENTO' THEN m.valor ELSE 0 END), 0)::numeric(10,2) AS sup,
      COALESCE(SUM(CASE WHEN m.tipo = 'SANGRIA' THEN m.valor ELSE 0 END), 0)::numeric(10,2) AS sang
    FROM public.movimentos_caixa m
    WHERE m.caixa_id = p_caixa_id
      AND m.tipo IN ('SUPRIMENTO', 'SANGRIA')
  ),
  mov_tx AS (
    SELECT COALESCE(SUM(
      CASE
        WHEN m.tipo = 'suprimento' AND m.forma_pagamento = 'dinheiro' THEN m.valor
        WHEN m.tipo = 'sangria' THEN -m.valor
        WHEN m.tipo = 'estorno' AND orig.tipo = 'sangria' THEN m.valor
        WHEN m.tipo = 'estorno' AND orig.tipo = 'suprimento' AND orig.forma_pagamento = 'dinheiro' THEN -m.valor
        ELSE 0::numeric(10,2)
      END
    ), 0)::numeric(10,2) AS t
    FROM public.movimentacoes_caixa m
    LEFT JOIN public.movimentacoes_caixa orig ON orig.id = m.movimentacao_origem_id
    WHERE m.caixa_id = p_caixa_id
      AND m.status = 'aprovado'
      AND m.deleted_at IS NULL
  ),
  -- Modelo α (ADR-CAIXA-002): D_din só com venda CONCLUIDA (evita -2P no cancel total).
  dev_din AS (
    SELECT COALESCE(SUM(d.valor), 0)::numeric(10,2) AS t
    FROM public.devolucoes d
    INNER JOIN public.vendas v ON v.id = d.venda_id
    WHERE v.caixa_id = p_caixa_id
      AND v.status = 'CONCLUIDA'
      AND d.forma_pagamento = 'DINHEIRO'
  ),
  abertura AS (
    SELECT COALESCE(c.valor_inicial, 0)::numeric(10,2) AS t
    FROM public.caixas c
    WHERE c.id = p_caixa_id
  )
  SELECT ROUND(
      COALESCE((SELECT t FROM abertura), 0)
      + (SELECT t FROM vendas_din)
      + (SELECT sup FROM mov_legado)
      - (SELECT sang FROM mov_legado)
      + (SELECT t FROM mov_tx)
      - (SELECT t FROM dev_din),
      2
    )::numeric(10,2)
  INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.calcular_valor_sistema_dinheiro_caixa(uuid) IS
  'E(c): valor_inicial + vendas DINHEIRO CONCLUIDA (split+legado) + movs aprovadas - devolucoes DINHEIRO de vendas CONCLUIDA (Modelo α ADR-CAIXA-002).';

CREATE OR REPLACE FUNCTION public.cancelar_venda_transacional(
  p_venda_id uuid,
  p_motivo text,
  p_operador_id uuid DEFAULT NULL
)
RETURNS TABLE (venda_id uuid, status_venda text, valor_estornado numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := COALESCE(auth.uid(), p_operador_id);
  v_motivo text := NULLIF(btrim(p_motivo), '');
  v_venda record;
  v_caixa record;
  v_item record;
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

  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = v_uid AND u.loja_id = v_caixa.loja_id AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
  ) THEN
    RAISE EXCEPTION 'CANCELAR_VENDA_SEM_PERMISSAO';
  END IF;

  UPDATE public.contas_receber cr
  SET valor_aberto = 0,
    status = 'CANCELADO'
  WHERE cr.venda_id = p_venda_id AND cr.status IN ('ABERTO', 'PARCIAL');

  SELECT EXISTS (SELECT 1 FROM public.vendas_pagamentos vp WHERE vp.venda_id = p_venda_id LIMIT 1)
  INTO v_tem_split;

  FOR v_item IN
    SELECT iv.produto_id, iv.quantidade FROM public.itens_venda iv WHERE iv.venda_id = p_venda_id
  LOOP
    PERFORM 1 FROM public.estoque e
    WHERE e.produto_id = v_item.produto_id AND e.loja_id = v_caixa.loja_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'CANCELAR_VENDA_ESTOQUE_NAO_ENCONTRADO'; END IF;

    UPDATE public.estoque e
    SET quantidade_atual = e.quantidade_atual + v_item.quantidade,
      version = e.version + 1,
      updated_at = now()
    WHERE e.produto_id = v_item.produto_id AND e.loja_id = v_caixa.loja_id;

    INSERT INTO public.estoque_reposicoes_cancelamento (venda_id, produto_id, quantidade)
    VALUES (p_venda_id, v_item.produto_id, v_item.quantidade)
    ON CONFLICT (venda_id, produto_id) DO NOTHING;
  END LOOP;

  IF v_tem_split THEN
    SELECT COALESCE(SUM(vp.valor) FILTER (WHERE vp.forma_pagamento = 'DINHEIRO'), 0)::numeric(10,2)
    INTO v_valor_estornado
    FROM public.vendas_pagamentos vp
    WHERE vp.venda_id = p_venda_id;
    v_valor_estornado := ROUND(v_valor_estornado, 2);

    INSERT INTO public.devolucoes (venda_id, valor, forma_pagamento, motivo, operador_id)
    SELECT p_venda_id, ROUND(SUM(vp.valor), 2), vp.forma_pagamento, v_motivo, v_uid
    FROM public.vendas_pagamentos vp
    WHERE vp.venda_id = p_venda_id
    GROUP BY vp.forma_pagamento;

    -- Best-effort: A (saldo_atual) não é SSoT de E(c). Não bloqueia cancel se A stale.
    IF v_valor_estornado > 0 THEN
      UPDATE public.caixas c
      SET saldo_atual = ROUND(c.saldo_atual - v_valor_estornado, 2)
      WHERE c.id = v_caixa.id
        AND (c.saldo_atual - v_valor_estornado) >= 0;
    END IF;
    v_forma_auditoria := 'SPLIT';
  ELSIF v_venda.forma_pagamento = 'DINHEIRO' THEN
    v_valor_estornado := ROUND(COALESCE(v_venda.total_liquido, 0), 2);
    INSERT INTO public.devolucoes (venda_id, valor, forma_pagamento, motivo, operador_id)
    VALUES (p_venda_id, v_valor_estornado, 'DINHEIRO', v_motivo, v_uid)
    ON CONFLICT DO NOTHING;
    UPDATE public.caixas c
    SET saldo_atual = ROUND(c.saldo_atual - v_valor_estornado, 2)
    WHERE c.id = v_caixa.id
      AND (c.saldo_atual - v_valor_estornado) >= 0;
    v_forma_auditoria := v_venda.forma_pagamento;
  ELSE
    INSERT INTO public.devolucoes (venda_id, valor, forma_pagamento, motivo, operador_id)
    VALUES (
      p_venda_id,
      ROUND(COALESCE(v_venda.total_liquido, 0), 2),
      v_venda.forma_pagamento,
      v_motivo,
      v_uid
    );
    v_valor_estornado := 0;
    v_forma_auditoria := v_venda.forma_pagamento;
  END IF;

  UPDATE public.vendas SET status = 'CANCELADA' WHERE id = p_venda_id;

  INSERT INTO public.vendas_canceladas_auditoria (
    venda_id, caixa_id, operador_id, motivo, forma_pagamento, valor_estornado
  ) VALUES (
    p_venda_id, v_caixa.id, v_uid, v_motivo, v_forma_auditoria,
    CASE
      WHEN v_tem_split THEN (
        SELECT COALESCE(SUM(vp.valor) FILTER (WHERE vp.forma_pagamento = 'DINHEIRO'), 0)::numeric(10,2)
        FROM public.vendas_pagamentos vp
        WHERE vp.venda_id = p_venda_id
      )
      WHEN v_venda.forma_pagamento = 'DINHEIRO' THEN ROUND(COALESCE(v_venda.total_liquido, 0), 2)
      ELSE 0::numeric(10,2)
    END
  ) ON CONFLICT (venda_id) DO NOTHING;

  PERFORM public.registrar_venda_evento(
    'SALE_CANCELLED', p_venda_id, c_source, v_caixa.id, v_venda.operador_id, v_caixa.loja_id,
    public.venda_eventos_items_from_sale(p_venda_id),
    COALESCE(v_venda.total_liquido, 0), v_venda.total_bruto, v_venda.forma_pagamento, true
  );

  RETURN QUERY SELECT p_venda_id, 'CANCELADA'::text, v_valor_estornado;
END;
$$;

COMMENT ON FUNCTION public.cancelar_venda_transacional(uuid, text, uuid) IS
  'Cancela venda: estoque, devolucoes (auditoria), status CANCELADA, evento. '
  'saldo_atual decremento best-effort (ADR-CAIXA-002: E(c) é autoridade do esperado).';
