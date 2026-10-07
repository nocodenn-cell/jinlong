-- SSOT-001 / SSOT-002 — painel usa E(c); cache derivado; cancel/venda sync.
-- Ver docs/regras-negocio/SSOT_CAIXA_SALDO_CONTRATO.md

BEGIN;

COMMENT ON COLUMN public.caixas.saldo_atual IS
  'CACHE / projeção de E(c)=internal.valor_sistema_dinheiro. NÃO é source of truth. '
  'Nenhuma decisão financeira (KPI, guard, fechamento, Contábil) pode ler esta coluna. '
  'Escrita preferida: internal.sincronizar_saldo_cache (só caixa ABERTO).';

DO $ssot001$
DECLARE
  fonte text;
  antigo text :=
    'SELECT coalesce(sum(saldo_atual),0) INTO pdv FROM public.caixas WHERE loja_id=l AND status=''ABERTO'';';
  novo text :=
    'SELECT coalesce((SELECT sum(internal.valor_sistema_dinheiro(c.id)) '
    'FROM public.caixas c WHERE c.loja_id=l AND c.status=''ABERTO''),0) INTO pdv;';
BEGIN
  SELECT pg_get_functiondef('public.financeiro_painel(date,date,integer)'::regprocedure)
    INTO fonte;
  IF strpos(fonte, 'internal.valor_sistema_dinheiro') > 0
     AND strpos(fonte, 'sum(saldo_atual)') = 0 THEN
    RAISE NOTICE 'SSOT-001: financeiro_painel já usa E(c)';
  ELSIF strpos(fonte, antigo) = 0 THEN
    RAISE EXCEPTION 'SSOT-001: padrão sum(saldo_atual) não encontrado em financeiro_painel';
  ELSE
    EXECUTE replace(fonte, antigo, novo);
    RAISE NOTICE 'SSOT-001: financeiro_painel.saldo_pdv → E(c)';
  END IF;
END
$ssot001$;

CREATE OR REPLACE FUNCTION public.trg_creditar_saldo_caixa_venda_dinheiro()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caixa_id uuid;
  v_delta numeric(10,2);
BEGIN
  IF upper(COALESCE(NEW.forma_pagamento, '')) <> 'DINHEIRO' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    v_delta := NEW.valor;
  ELSE
    v_delta := NEW.valor - OLD.valor;
  END IF;
  IF v_delta = 0 THEN
    RETURN NEW;
  END IF;
  SELECT v.caixa_id INTO v_caixa_id
  FROM public.vendas v
  WHERE v.id = NEW.venda_id
  FOR UPDATE;
  IF v_caixa_id IS NOT NULL THEN
    PERFORM internal.sincronizar_saldo_cache(v_caixa_id);
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_creditar_saldo_caixa_venda_dinheiro() IS
  'SSOT-002: após parcela DINHEIRO, materializa caixas.saldo_atual := E(c) via sincronizar_saldo_cache.';

CREATE OR REPLACE FUNCTION public.cancelar_venda_transacional(
  p_venda_id uuid, p_motivo text, p_operador_id uuid DEFAULT NULL::uuid
)
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

  SELECT EXISTS (SELECT 1 FROM public.vendas_pagamentos vp WHERE vp.venda_id = p_venda_id LIMIT 1)
    INTO v_tem_split;

  FOR v_item IN SELECT iv.produto_id, iv.quantidade FROM public.itens_venda iv WHERE iv.venda_id = p_venda_id
  LOOP
    SELECT COALESCE(SUM(erd.quantidade), 0)::numeric(10,3)
      INTO v_ja_reposto_qtd
      FROM public.estoque_reposicoes_devolucao erd
      JOIN public.venda_pos_venda_operacoes o ON o.id = erd.operacao_id
     WHERE o.venda_id = p_venda_id AND erd.produto_id = v_item.produto_id;
    v_qtd_a_repor := GREATEST(0, v_item.quantidade - v_ja_reposto_qtd);
    IF v_qtd_a_repor > 0 THEN
      PERFORM 1 FROM public.estoque e
       WHERE e.produto_id = v_item.produto_id AND e.loja_id = v_caixa.loja_id FOR UPDATE;
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
    IF v_valor_estornado > 0
       AND v_caixa.status = 'ABERTO'
       AND internal.valor_sistema_dinheiro(v_caixa.id) < v_valor_estornado THEN
      RAISE EXCEPTION 'CANCELAR_VENDA_SALDO_CAIXA_INSUFICIENTE'
        USING DETAIL = format('valor_sistema=%s estorno_dinheiro=%s',
          internal.valor_sistema_dinheiro(v_caixa.id), v_valor_estornado);
    END IF;
    v_forma_auditoria := 'SPLIT';
  ELSIF v_venda.forma_pagamento = 'DINHEIRO' THEN
    v_valor_estornado := v_pendente_total;
    INSERT INTO public.devolucoes (venda_id, valor, forma_pagamento, motivo, operador_id)
    VALUES (p_venda_id, v_valor_estornado, 'DINHEIRO', v_motivo, v_uid) ON CONFLICT DO NOTHING;
    IF v_caixa.status = 'ABERTO'
       AND internal.valor_sistema_dinheiro(v_caixa.id) < v_valor_estornado THEN
      RAISE EXCEPTION 'CANCELAR_VENDA_SALDO_CAIXA_INSUFICIENTE'
        USING DETAIL = format('valor_sistema=%s estorno_dinheiro=%s',
          internal.valor_sistema_dinheiro(v_caixa.id), v_valor_estornado);
    END IF;
    v_forma_auditoria := v_venda.forma_pagamento;
  ELSE
    INSERT INTO public.devolucoes (venda_id, valor, forma_pagamento, motivo, operador_id)
    VALUES (p_venda_id, v_pendente_total, v_venda.forma_pagamento, v_motivo, v_uid);
    v_valor_estornado := 0; v_forma_auditoria := v_venda.forma_pagamento;
  END IF;

  UPDATE public.vendas SET status = 'CANCELADA' WHERE id = p_venda_id;
  IF v_caixa.status = 'ABERTO' THEN
    PERFORM internal.sincronizar_saldo_cache(v_caixa.id);
  END IF;
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
  'Cancela venda: repõe estoque; guard por E(c); cache via sincronizar_saldo_cache (SSOT-002).';

DO $prova$
DECLARE
  painel text;
  cancel text;
  trig text;
BEGIN
  SELECT pg_get_functiondef('public.financeiro_painel(date,date,integer)'::regprocedure) INTO painel;
  IF strpos(painel, 'sum(saldo_atual)') > 0 THEN
    RAISE EXCEPTION 'SSOT-001 PROVA FAIL: painel ainda usa sum(saldo_atual)';
  END IF;
  IF strpos(painel, 'internal.valor_sistema_dinheiro') = 0 THEN
    RAISE EXCEPTION 'SSOT-001 PROVA FAIL: painel sem valor_sistema_dinheiro';
  END IF;
  SELECT pg_get_functiondef('public.cancelar_venda_transacional(uuid,text,uuid)'::regprocedure) INTO cancel;
  IF strpos(cancel, 'SET saldo_atual = ROUND(c.saldo_atual - v_valor_estornado') > 0 THEN
    RAISE EXCEPTION 'SSOT-002 PROVA FAIL: cancel ainda debita saldo_atual incremental';
  END IF;
  IF strpos(cancel, 'sincronizar_saldo_cache') = 0 THEN
    RAISE EXCEPTION 'SSOT-002 PROVA FAIL: cancel sem sincronizar_saldo_cache';
  END IF;
  SELECT pg_get_functiondef('public.trg_creditar_saldo_caixa_venda_dinheiro()'::regprocedure) INTO trig;
  IF strpos(trig, 'sincronizar_saldo_cache') = 0 THEN
    RAISE EXCEPTION 'SSOT-002 PROVA FAIL: trigger sem sincronizar_saldo_cache';
  END IF;
  IF strpos(trig, 'saldo_atual = ROUND(saldo_atual +') > 0 THEN
    RAISE EXCEPTION 'SSOT-002 PROVA FAIL: trigger ainda incrementa saldo_atual';
  END IF;
  RAISE NOTICE 'SSOT-001/002 PROVA ESTRUTURAL OK';
END
$prova$;

NOTIFY pgrst, 'reload schema';
COMMIT;
