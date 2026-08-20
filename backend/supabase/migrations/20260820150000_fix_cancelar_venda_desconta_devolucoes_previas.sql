-- Migration: corrige cancelar_venda_transacional para descontar devolucoes/trocas
-- ja registradas antes de estornar caixa e repor estoque.
-- Data: 2026-08-20
--
-- Achado: docs/DECISAO_CANCELAMENTO_REEMBOLSO_DUPLICADO.md
-- Confirmado ao vivo em teste de impressao de recibos (docs/ROTEIRO_TESTE_IMPRESSAO_2026-08-20.md):
-- uma venda com 1 item devolvido parcialmente e depois cancelada por completo gerava
-- DOIS estornos do mesmo valor (recibo de devolucao + recibo de cancelamento, ambos
-- mostrando o valor cheio) e DUAS reposicoes de estoque para o mesmo item.
--
-- Causa raiz: cancelar_venda_transacional operava sempre sobre os dados ORIGINAIS
-- da venda (itens_venda.quantidade, vendas.total_liquido), sem consultar
-- venda_pos_venda_operacoes/venda_pos_venda_itens/estoque_reposicoes_devolucao
-- (as tabelas que devolver_ou_trocar_venda usa para registrar o que ja foi
-- devolvido). As duas operacoes eram tratadas como totalmente independentes.
--
-- Correcao:
--   1) Estoque: antes de repor, desconta por produto a quantidade ja reposta em
--      estoque_reposicoes_devolucao (soma de todas as operacoes de devolucao/troca
--      daquela venda). So repoe o saldo remanescente (nunca negativo).
--   2) Caixa/estorno: calcula quanto do total_liquido da venda ja foi devolvido ao
--      cliente (SUM(valor_estornado) em venda_pos_venda_operacoes) e usa apenas o
--      valor pendente (total_liquido - ja_devolvido, nunca negativo) como base do
--      estorno do cancelamento, nos tres ramos existentes (split, dinheiro sem
--      split, outras formas sem split), preservando a logica original quando nao
--      houve devolucao previa.
--      No ramo split, o valor pendente e distribuido proporcionalmente entre as
--      formas de pagamento originais.
--   3) Se apos o desconto nao sobrar nada a devolver (venda ja totalmente
--      devolvida), o cancelamento ainda muda o status para CANCELADA e repoe o
--      estoque remanescente, mas nao gera novo lancamento de devolucao nem debita
--      o caixa.
--
-- Nao houve mudanca de assinatura (mesmos parametros, mesmo retorno).

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
    END IF;
    v_forma_auditoria := 'SPLIT';
  ELSIF v_venda.forma_pagamento = 'DINHEIRO' THEN
    v_valor_estornado := v_pendente_total;
    INSERT INTO public.devolucoes (venda_id, valor, forma_pagamento, motivo, operador_id)
    VALUES (p_venda_id, v_valor_estornado, 'DINHEIRO', v_motivo, v_uid) ON CONFLICT DO NOTHING;
    UPDATE public.caixas c SET saldo_atual = ROUND(c.saldo_atual - v_valor_estornado, 2)
     WHERE c.id = v_caixa.id AND (c.saldo_atual - v_valor_estornado) >= 0;
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
  'Cancela venda: repoe estoque e estorna caixa descontando devolucoes/trocas ja registradas antes (migration 2026-08-20).';

NOTIFY pgrst, 'reload schema';

COMMIT;
