-- ============================================================================
-- cancelar_venda_transacional: estorno em dinheiro nao pode ser silenciosamente
-- ignorado quando a gaveta nao tem o valor
-- ============================================================================
-- Achado (stress test operacional do PDV, reproducao deterministica em stack
-- local): o debito de `caixas.saldo_atual` no cancelamento e um UPDATE
-- condicional (`AND (saldo_atual - estorno) >= 0`) SEM `IF NOT FOUND`. Quando a
-- gaveta nao tem o dinheiro do estorno, o debito e descartado em silencio.
--
-- Reproducao (fundo R$ 0):
--   venda R$ 100 em DINHEIRO  -> saldo_atual = 100 | valor_sistema = 100
--   sangria R$ 100            -> saldo_atual =   0 | valor_sistema =   0
--   gerente cancela a venda   -> saldo_atual =   0 | valor_sistema = -100  <-- divergem
--
-- A partir dai as duas autoridades de dinheiro discordam permanentemente:
--   . `caixas.saldo_atual` e o guard de sangria (`registrar_movimentacao`);
--   . `calcular_valor_sistema_dinheiro_caixa` e a base do fechamento.
--
-- Consequencias provadas na mesma reproducao:
--   1. Sangria autorizada sobre dinheiro inexistente -- com R$ 100 reais na
--      gaveta e saldo_atual inflado em R$ 200, uma sangria de R$ 150 e aceita
--      e o dinheiro fisico vai a -R$ 50.
--   2. Fechamento matematicamente incorreto -- contando o valor real da gaveta
--      o operador recebe uma diferenca fantasma.
--
-- Correcao: alinhar ao contrato que TODAS as funcoes irmas ja cumprem --
-- `registrar_movimentacao` (MOV_CAIXA_SALDO_INSUFICIENTE),
-- `aprovar_movimentacao` (MOV_CAIXA_APROVACAO_SALDO_INSUFICIENTE),
-- `devolver_ou_trocar_venda` (DEVOLVER_VENDA_SALDO_CAIXA_INSUFICIENTE) e
-- `estornar_liquidacao_receber` (ESTORNO_AR_SALDO_INSUFICIENTE) ja fazem
-- `IF NOT FOUND THEN RAISE` depois do mesmo UPDATE condicional. So
-- `cancelar_venda_transacional` omitia, nos dois ramos que devolvem dinheiro
-- (SPLIT e DINHEIRO). O cancelamento passa a ser recusado com
-- CANCELAR_VENDA_SALDO_CAIXA_INSUFICIENTE em vez de corromper a gaveta; o
-- caminho operacional e o mesmo ja usado pela devolucao: registrar um
-- suprimento (trazer o dinheiro de volta do cofre) e entao cancelar.
--
-- Escopo: o guard so dispara com o caixa ABERTO. Cancelar venda de caixa ja
-- FECHADO mantem exatamente o comportamento atual (o `saldo_atual` de um caixa
-- fechado e inerte -- o fechamento ja persistiu valor_fechamento/diferenca e
-- `retomar_caixa_atomico` cria um caixa novo em vez de reabrir a linha).
--
-- Regressao: backend/scripts/gate-a05-cancelamento-saldo-caixa-insuficiente.test.sql
-- (gate financeiro, roda no CI).
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
    INSERT INTO public.devolucoes (venda_id, valor, forma_pagamento, motivo, operador_id)
    VALUES (p_venda_id, v_pendente_total, v_venda.forma_pagamento, v_motivo, v_uid);
    v_valor_estornado := 0; v_forma_auditoria := v_venda.forma_pagamento;
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
  'Cancela venda: repoe estoque e estorna caixa descontando devolucoes/trocas ja registradas antes. Recusa (CANCELAR_VENDA_SALDO_CAIXA_INSUFICIENTE) quando o caixa ABERTO nao tem o dinheiro do estorno, em vez de descartar o debito em silencio (migration 2026-09-09).';

NOTIFY pgrst, 'reload schema';

COMMIT;
