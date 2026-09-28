-- ============================================================================
-- cancelar_venda_transacional: "Total estornado" nao pode mostrar R$ 0,00
-- para uma venda paga em forma eletronica (CARTAO/PIX sem split)
-- ============================================================================
-- Achado (browser audit, sprint de correcoes P0-P2): venda paga cancelada
-- aparecia com "Total estornado R$ 0,00" mesmo tendo sido efetivamente paga.
--
-- Causa raiz: no ramo ELSE (pagamento eletronico unico, nao-DINHEIRO e sem
-- split em vendas_pagamentos), a funcao ja grava corretamente o registro de
-- auditoria em `devolucoes` com o valor pendente real, mas hard-codeia
-- `v_valor_estornado := 0` -- o mesmo valor que a funcao RETORNA e que
-- `vendas_canceladas_auditoria.valor_estornado`/telas de auditoria exibem
-- como "Total estornado". Esse hard-code existe desde a migration
-- 059_cancelar_venda_split_e_auditoria_nao_dinheiro.sql e sobreviveu a todas
-- as reescritas seguintes da funcao.
--
-- Nao e o mesmo bug de `caixas.saldo_atual`: pagamento eletronico nunca
-- mexeu na gaveta, e `calcular_valor_sistema_dinheiro_caixa` (049/053/
-- 20260718184800/20260813234233) so soma `devolucoes WHERE forma_pagamento
-- = 'DINHEIRO'` -- nunca leu `vendas_canceladas_auditoria.valor_estornado`.
-- Ou seja: alinhar `v_valor_estornado` ao valor pendente real no ramo
-- eletronico e puramente uma correcao de relato/auditoria financeira, sem
-- nenhum efeito sobre a reconciliacao de caixa em dinheiro.
--
-- Correcao: `v_valor_estornado := v_pendente_total` no ramo eletronico,
-- exatamente como os ramos DINHEIRO e SPLIT ja fazem. Nenhum outro
-- comportamento da funcao (estoque, `contas_receber`, guard de saldo da
-- gaveta, idempotencia) e alterado.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.cancelar_venda_transacional(p_venda_id uuid, p_motivo text, p_operador_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(venda_id uuid, status_venda text, valor_estornado numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
  v_ja_devolvido_total numeric(10,2) := 0;
  v_pendente_total numeric(10,2) := 0;
  v_proporcao_pendente numeric := 1;
  v_ja_reposto_qtd numeric(10,3) := 0;
  v_qtd_a_repor numeric(10,3) := 0;
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

  SELECT COALESCE(SUM(o.valor_estornado), 0)::numeric(10,2)
    INTO v_ja_devolvido_total
    FROM public.venda_pos_venda_operacoes o
   WHERE o.venda_id = p_venda_id;

  v_pendente_total := GREATEST(0, ROUND(COALESCE(v_venda.total_liquido, 0) - v_ja_devolvido_total, 2));
  v_proporcao_pendente := CASE
    WHEN COALESCE(v_venda.total_liquido, 0) > 0 THEN v_pendente_total / v_venda.total_liquido
    ELSE 0
  END;

  SELECT EXISTS (SELECT 1 FROM public.vendas_pagamentos vp WHERE vp.venda_id = p_venda_id LIMIT 1) INTO v_tem_split;

  FOR v_item IN SELECT iv.produto_id, iv.quantidade FROM public.itens_venda iv WHERE iv.venda_id = p_venda_id
  LOOP
    SELECT COALESCE(SUM(erd.quantidade), 0)::numeric(10,3)
      INTO v_ja_reposto_qtd
      FROM public.estoque_reposicoes_devolucao erd
      JOIN public.venda_pos_venda_operacoes o ON o.id = erd.operacao_id
     WHERE o.venda_id = p_venda_id AND erd.produto_id = v_item.produto_id;

    v_qtd_a_repor := GREATEST(0, v_item.quantidade - v_ja_reposto_qtd);

    IF v_qtd_a_repor > 0 THEN
      PERFORM 1 FROM public.estoque e WHERE e.produto_id = v_item.produto_id AND e.loja_id = v_caixa.loja_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'CANCELAR_VENDA_ESTOQUE_NAO_ENCONTRADO'; END IF;
      UPDATE public.estoque e SET quantidade_atual = e.quantidade_atual + v_qtd_a_repor,
        version = e.version + 1, updated_at = now()
       WHERE e.produto_id = v_item.produto_id AND e.loja_id = v_caixa.loja_id;
      INSERT INTO public.estoque_reposicoes_cancelamento (venda_id, produto_id, quantidade)
      VALUES (p_venda_id, v_item.produto_id, v_qtd_a_repor)
      ON CONFLICT (venda_id, produto_id) DO NOTHING;
      INSERT INTO public.movimentos_estoque_log (
        loja_id, produto_id, tipo_codigo, quantidade_delta, venda_id, usuario_id, observacao
      ) VALUES (
        v_caixa.loja_id, v_item.produto_id, 'ENTRADA_DEVOLUCAO_CLIENTE', v_qtd_a_repor,
        p_venda_id, v_uid, 'cancelamento de venda | motivo=' || v_motivo ||
          CASE WHEN v_ja_reposto_qtd > 0 THEN ' | desconta ' || v_ja_reposto_qtd || ' ja devolvido antes' ELSE '' END
      );
    END IF;
  END LOOP;

  IF v_pendente_total <= 0 THEN
    v_valor_estornado := 0;
    v_forma_auditoria := CASE WHEN v_tem_split THEN 'SPLIT' ELSE v_venda.forma_pagamento END;
  ELSIF v_tem_split THEN
    SELECT COALESCE(SUM(vp.valor) FILTER (WHERE vp.forma_pagamento = 'DINHEIRO'), 0)::numeric(10,2)
      INTO v_valor_estornado FROM public.vendas_pagamentos vp WHERE vp.venda_id = p_venda_id;
    v_valor_estornado := ROUND(v_valor_estornado * v_proporcao_pendente, 2);
    INSERT INTO public.devolucoes (venda_id, valor, forma_pagamento, motivo, operador_id)
    SELECT p_venda_id, ROUND(SUM(vp.valor) * v_proporcao_pendente, 2), vp.forma_pagamento, v_motivo, v_uid
      FROM public.vendas_pagamentos vp WHERE vp.venda_id = p_venda_id GROUP BY vp.forma_pagamento
      HAVING ROUND(SUM(vp.valor) * v_proporcao_pendente, 2) > 0;
    IF v_valor_estornado > 0 THEN
      UPDATE public.caixas c SET saldo_atual = ROUND(c.saldo_atual - v_valor_estornado, 2)
       WHERE c.id = v_caixa.id AND (c.saldo_atual - v_valor_estornado) >= 0;
      IF NOT FOUND AND v_caixa.status = 'ABERTO' THEN
        RAISE EXCEPTION 'CANCELAR_VENDA_SALDO_CAIXA_INSUFICIENTE'
          USING DETAIL = format('saldo_atual=%s estorno_dinheiro=%s', v_caixa.saldo_atual, v_valor_estornado);
      END IF;
    END IF;
    v_forma_auditoria := 'SPLIT';
  ELSIF v_venda.forma_pagamento = 'DINHEIRO' THEN
    v_valor_estornado := v_pendente_total;
    INSERT INTO public.devolucoes (venda_id, valor, forma_pagamento, motivo, operador_id)
    VALUES (p_venda_id, v_valor_estornado, 'DINHEIRO', v_motivo, v_uid) ON CONFLICT DO NOTHING;
    UPDATE public.caixas c SET saldo_atual = ROUND(c.saldo_atual - v_valor_estornado, 2)
     WHERE c.id = v_caixa.id AND (c.saldo_atual - v_valor_estornado) >= 0;
    IF NOT FOUND AND v_caixa.status = 'ABERTO' THEN
      RAISE EXCEPTION 'CANCELAR_VENDA_SALDO_CAIXA_INSUFICIENTE'
        USING DETAIL = format('saldo_atual=%s estorno_dinheiro=%s', v_caixa.saldo_atual, v_valor_estornado);
    END IF;
    v_forma_auditoria := v_venda.forma_pagamento;
  ELSE
    -- Eletronico (CARTAO/PIX) unico, sem split: nao mexe na gaveta (nenhum
    -- UPDATE de caixas.saldo_atual aqui, de proposito), mas o valor
    -- efetivamente revertido para o cliente E o pendente da venda -- nao
    -- zero. Antes: `v_valor_estornado := 0` fazia "Total estornado" mentir
    -- para toda venda paga em forma eletronica.
    INSERT INTO public.devolucoes (venda_id, valor, forma_pagamento, motivo, operador_id)
    VALUES (p_venda_id, v_pendente_total, v_venda.forma_pagamento, v_motivo, v_uid);
    v_valor_estornado := v_pendente_total; v_forma_auditoria := v_venda.forma_pagamento;
  END IF;

  UPDATE public.vendas SET status = 'CANCELADA' WHERE id = p_venda_id;
  INSERT INTO public.vendas_canceladas_auditoria (venda_id, caixa_id, operador_id, motivo, forma_pagamento, valor_estornado)
  VALUES (p_venda_id, v_caixa.id, v_uid, v_motivo, v_forma_auditoria, v_valor_estornado)
  ON CONFLICT (venda_id) DO NOTHING;
  PERFORM public.registrar_venda_evento('SALE_CANCELLED', p_venda_id, c_source, v_caixa.id,
    v_venda.operador_id, v_caixa.loja_id, public.venda_eventos_items_from_sale(p_venda_id),
    COALESCE(v_venda.total_liquido,0), v_venda.total_bruto, v_venda.forma_pagamento, true);
  RETURN QUERY SELECT p_venda_id, 'CANCELADA'::text, v_valor_estornado;
END;
$function$;

COMMENT ON FUNCTION public.cancelar_venda_transacional(uuid, text, uuid) IS
  'Cancela venda: repoe estoque e estorna caixa descontando devolucoes/trocas ja registradas antes. Recusa (CANCELAR_VENDA_SALDO_CAIXA_INSUFICIENTE) quando o caixa ABERTO nao tem o dinheiro do estorno (2026-09-09). valor_estornado reflete o pendente real tambem no ramo eletronico, sem mexer no saldo da gaveta (2026-09-28).';

DO $verify_cancelar_venda_valor_estornado_eletronico$
DECLARE
  v_def text;
BEGIN
  v_def := pg_get_functiondef('public.cancelar_venda_transacional(uuid, text, uuid)'::regprocedure);
  IF position('v_valor_estornado := v_pendente_total; v_forma_auditoria := v_venda.forma_pagamento;' IN v_def) = 0 THEN
    RAISE EXCEPTION 'MIG20260928_CANCELAR_VENDA_ELETRONICO_NAO_CORRIGIDO';
  END IF;
END
$verify_cancelar_venda_valor_estornado_eletronico$;

NOTIFY pgrst, 'reload schema';

COMMIT;
