-- golive-final-584 :: 20261007163000 ssot_001_002_painel_ec_cache :: sha256 fe628dee4fe97669acfec878c6005ce9e25b6eed2907ddaece2b16c75995e0ab
BEGIN;
SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout = '180s';
DO $g$ BEGIN IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261007163000') THEN RAISE EXCEPTION 'GOLIVE_STOP: % já no histórico', '20261007163000'; END IF; END $g$;
-- SSOT-001 / SSOT-002 — painel usa E(c); cache derivado; cancel/venda sync.
-- Ver docs/regras-negocio/SSOT_CAIXA_SALDO_CONTRATO.md


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
    -- Guard ANTES de inserir devolucoes: E(c) já subtrai devolucoes.
    IF v_valor_estornado > 0
       AND v_caixa.status = 'ABERTO'
       AND internal.valor_sistema_dinheiro(v_caixa.id) < v_valor_estornado THEN
      RAISE EXCEPTION 'CANCELAR_VENDA_SALDO_CAIXA_INSUFICIENTE'
        USING DETAIL = format('valor_sistema=%s estorno_dinheiro=%s',
          internal.valor_sistema_dinheiro(v_caixa.id), v_valor_estornado);
    END IF;
    INSERT INTO public.devolucoes (venda_id, valor, forma_pagamento, motivo, operador_id)
    SELECT p_venda_id, ROUND(SUM(vp.valor) * v_proporcao_pendente, 2), vp.forma_pagamento, v_motivo, v_uid
      FROM public.vendas_pagamentos vp WHERE vp.venda_id = p_venda_id GROUP BY vp.forma_pagamento
      HAVING ROUND(SUM(vp.valor) * v_proporcao_pendente, 2) > 0;
    v_forma_auditoria := 'SPLIT';
  ELSIF v_venda.forma_pagamento = 'DINHEIRO' THEN
    v_valor_estornado := v_pendente_total;
    IF v_caixa.status = 'ABERTO'
       AND internal.valor_sistema_dinheiro(v_caixa.id) < v_valor_estornado THEN
      RAISE EXCEPTION 'CANCELAR_VENDA_SALDO_CAIXA_INSUFICIENTE'
        USING DETAIL = format('valor_sistema=%s estorno_dinheiro=%s',
          internal.valor_sistema_dinheiro(v_caixa.id), v_valor_estornado);
    END IF;
    INSERT INTO public.devolucoes (venda_id, valor, forma_pagamento, motivo, operador_id)
    VALUES (p_venda_id, v_valor_estornado, 'DINHEIRO', v_motivo, v_uid) ON CONFLICT DO NOTHING;
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
;
INSERT INTO supabase_migrations.schema_migrations(version, name, statements) VALUES ('20261007163000', 'ssot_001_002_painel_ec_cache', ARRAY[$golive_stmt_fe628dee4fe9$-- SSOT-001 / SSOT-002 — painel usa E(c); cache derivado; cancel/venda sync.
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
    -- Guard ANTES de inserir devolucoes: E(c) já subtrai devolucoes.
    IF v_valor_estornado > 0
       AND v_caixa.status = 'ABERTO'
       AND internal.valor_sistema_dinheiro(v_caixa.id) < v_valor_estornado THEN
      RAISE EXCEPTION 'CANCELAR_VENDA_SALDO_CAIXA_INSUFICIENTE'
        USING DETAIL = format('valor_sistema=%s estorno_dinheiro=%s',
          internal.valor_sistema_dinheiro(v_caixa.id), v_valor_estornado);
    END IF;
    INSERT INTO public.devolucoes (venda_id, valor, forma_pagamento, motivo, operador_id)
    SELECT p_venda_id, ROUND(SUM(vp.valor) * v_proporcao_pendente, 2), vp.forma_pagamento, v_motivo, v_uid
      FROM public.vendas_pagamentos vp WHERE vp.venda_id = p_venda_id GROUP BY vp.forma_pagamento
      HAVING ROUND(SUM(vp.valor) * v_proporcao_pendente, 2) > 0;
    v_forma_auditoria := 'SPLIT';
  ELSIF v_venda.forma_pagamento = 'DINHEIRO' THEN
    v_valor_estornado := v_pendente_total;
    IF v_caixa.status = 'ABERTO'
       AND internal.valor_sistema_dinheiro(v_caixa.id) < v_valor_estornado THEN
      RAISE EXCEPTION 'CANCELAR_VENDA_SALDO_CAIXA_INSUFICIENTE'
        USING DETAIL = format('valor_sistema=%s estorno_dinheiro=%s',
          internal.valor_sistema_dinheiro(v_caixa.id), v_valor_estornado);
    END IF;
    INSERT INTO public.devolucoes (venda_id, valor, forma_pagamento, motivo, operador_id)
    VALUES (p_venda_id, v_valor_estornado, 'DINHEIRO', v_motivo, v_uid) ON CONFLICT DO NOTHING;
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
$golive_stmt_fe628dee4fe9$]);
DO $chk$ DECLARE v text; o bigint; BEGIN
  SELECT replace((SELECT (SELECT 'vendas:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(caixa_id,chave_nf,cliente_id,created_at,data,forma_pagamento,id,idempotency_key,numero_nf,operador_id,pricing_version_id,status,tipo_venda,total_bruto,total_desconto,total_liquido)::text) h FROM public.vendas) s)||' # '||(SELECT 'itens_venda:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(custo_unitario_snap,desconto_unitario,id,preco_unitario,preco_unitario_original,pricing_version_id,produto_id,promocao_desconto_percentual,promocao_nome_snapshot,promocao_regra_id,quantidade,regra_aplicada_id,tipo_preco,tipo_preco_fonte,venda_id)::text) h FROM public.itens_venda) s)||' # '||(SELECT 'vendas_pagamentos:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(created_at,forma_pagamento,id,valor,venda_id)::text) h FROM public.vendas_pagamentos) s)||' # '||(SELECT 'caixas:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(autorizado_por,conta_financeira_id,data_abertura,data_fechamento,fechamento_diferenca,fechamento_observacao,id,loja_id,motivo_retomada,operador_id,saldo_atual,status,turno_anterior_id,valor_fechamento,valor_inicial)::text) h FROM public.caixas) s)||' # '||(SELECT 'movimentacoes_caixa:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(caixa_id,created_at,deleted_at,device_id,forma_pagamento,gerente_id,id,idempotency_key,ip_address,loja_id,motivo,motivo_codigo,movimentacao_origem_id,numero_sequencial,operador_id,saldo_antes,saldo_depois,status,terminal_id,tipo,updated_at,user_agent,valor)::text) h FROM public.movimentacoes_caixa) s)||' # '||(SELECT 'estoque:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(estoque_minimo,id,loja_id,produto_id,quantidade_atual,updated_at,version)::text) h FROM public.estoque) s)||' # '||(SELECT 'produtos:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,atualizado_por,categoria_id,cest,cfop_produto,codigo_barras,codigo_interno,comissao_tipo,comissao_valor,created_at,criado_por,csosn,cst_cofins,cst_pis,estoque_minimo,fornecedor_id,icms_origem,id,imagem_url,limite_transferencia_sem_observacao,localizacao_prateleira,loja_id,marca_id,ncm,nome,nome_reduzido_pdv,nome_sem_acento,observacao,origem,permitir_abaixo_custo,preco_atacado,preco_custo,preco_custo_medio,preco_varejo,quantidade_gatilho_atacado,referencia_fornecedor,status_publicacao,tags,tem_nf,unidade_medida,updated_at)::text) h FROM public.produtos) s)||' # '||(SELECT 'usuarios:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,created_at,funcionario_id,id,idioma_preferido,loja_id,nome,perfil)::text) h FROM public.usuarios) s)||' # '||(SELECT 'clientes:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,consentimento_privacidade_em,created_at,documento,email,endereco,id,limite_credito,loja_id,nome,telefone,termos_aceitos_em,tipo)::text) h FROM public.clientes) s)||' # '||(SELECT 'lojas:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,cnae,cnpj,codigo,created_at,email,endereco_bairro,endereco_cep,endereco_cidade,endereco_complemento,endereco_logradouro,endereco_numero,endereco_uf,id,inscricao_estadual,logo_url,nome,nome_fantasia,numero_serie_nfce,numero_serie_nfe,razao_social,telefone)::text) h FROM public.lojas) s)||' # '||(SELECT 'formas_pagamento:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,codigo,created_at,id,loja_id,nome,prazo_compensacao_dias,taxa_percentual,updated_at)::text) h FROM public.formas_pagamento) s)||' # '||(SELECT 'contas_financeiras:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,created_at,criado_por,data_inicial,id,loja_id,nome,tipo)::text) h FROM public.contas_financeiras) s)||' # '||(SELECT 'contas_pagar:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(cancelamento_em,cancelamento_motivo,categoria_id,competencia,criado_em,descricao,favorecido,fornecedor_id,id,loja_id,lote_id,nfe_importacao_id,nfe_numero,observacao,parcela,status,valor_pago,valor_total,vencimento)::text) h FROM public.contas_pagar) s)||' # '||(SELECT 'contas_receber:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(categoria_id,cliente_id,competencia,created_at,descricao,id,loja_id,status,valor_aberto,valor_total,vencimento,venda_id)::text) h FROM public.contas_receber) s)||' # '||(SELECT 'pdv_config:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(alertas_leves_ativos,auto_enqueue_fiscal,blind_closure,cfop_padrao,cst_padrao,formato_impressao,gerente_id,gerente_senha_bcrypt,id,idioma_padrao,imprimir_cupom_auto,limite_sangria_sem_gerente,limite_transferencia_obs,loja_id,max_desconto_gerente_percentual,max_desconto_manual_item_percentual,max_desconto_total_percentual,modo_limite_credito,quantidade_minima_atacado_padrao,regime_tributario,show_margin_visual,show_preco_fonte,show_stock_alerts,tema_padrao)::text) h FROM public.pdv_config) s)||' # '||(SELECT 'documentos_fiscais_pendentes:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(chave_fiscal,correlation_id,created_at,deleted_at,fiscal_action_hint,fiscal_error_category,fiscal_error_code,fiscal_error_payload,fiscal_next_step_url,fiscal_retryable,id,payload,processado_em,protocolo,provider,provider_ref,proxima_tentativa_em,status,tentativas,tipo_doc,transicao_origem,ultima_tentativa_em,ultima_transicao_em,ultimo_erro,updated_at,venda_id,xml_armazenado_em,xml_lease_expires_em,xml_lease_token,xml_proxima_tentativa_em,xml_sha256,xml_status,xml_storage_path,xml_tentativas,xml_ultimo_erro)::text) h FROM public.documentos_fiscais_pendentes) s)||' # '||(SELECT 'totais:'||coalesce(string_agg(x,';' ORDER BY x),'') FROM (SELECT md5(l.id::text)||'|'||(SELECT count(*) FROM public.vendas v JOIN public.caixas c ON c.id=v.caixa_id WHERE c.loja_id=l.id)||'|'||(SELECT coalesce(sum(v.total_liquido),0) FROM public.vendas v JOIN public.caixas c ON c.id=v.caixa_id WHERE c.loja_id=l.id AND v.status<>'CANCELADA')||'|'||(SELECT coalesce(sum(p.valor),0) FROM public.vendas_pagamentos p JOIN public.vendas v ON v.id=p.venda_id JOIN public.caixas c ON c.id=v.caixa_id WHERE c.loja_id=l.id)||'|'||(SELECT coalesce(sum(saldo_atual),0) FROM public.caixas c WHERE c.loja_id=l.id)||'|'||(SELECT coalesce(round(sum(quantidade_atual),3),0) FROM public.estoque e WHERE e.loja_id=l.id) x FROM public.lojas l) z)), ' # ', chr(1)) INTO v;
  IF v IS DISTINCT FROM $b$vendas:268:d91380e73abcf09a1086cba6e9aa094eitens_venda:266:db402eee5f6d7957110757600882edccvendas_pagamentos:201:3432d6d312e6f6f24ea9612a7257e235caixas:58:1b639b4221cdfaf9bfcc3ebf5660fbedmovimentacoes_caixa:0:-estoque:158:061c9e8da8142a531eb8d0728e3b4b15produtos:161:8fba5ff547239f94467b7a2126222120usuarios:13:2acdeaaf217d2571a434f8e8ff767aa2clientes:0:-lojas:4:812269b5692f7006f88ec49b088e9c36formas_pagamento:16:c1bbdbff97007016877776ad56afcccccontas_financeiras:0:-contas_pagar:2:2567d13b490befeaf7cc8bf48d01cfe1contas_receber:0:-pdv_config:1:899f43bdba711cfddea47afd00c8b21adocumentos_fiscais_pendentes:0:-totais:528f99d0e010f11ef321f548d3a7b51c|0|0|0|0|20.000;7ab49c7a91a109170b7e57fef3243a59|2|100.00|0|100.00|0.000;86641fb0d5893caebab1d0b38f0ef759|0|0|0|0|0;b5381bb6313900060b277d41cd1d490c|266|49013.80|38569.80|6500.00|284546.000$b$ THEN RAISE EXCEPTION 'GOLIVE_STOP: totais/hashes divergem da baseline após 20261007163000: %', replace(v, chr(1), ' # '); END IF;
  WITH fk AS (SELECT c.conrelid::regclass filho, c.confrelid::regclass pai,
 (SELECT string_agg(format('f.%I = p.%I', af.attname, ap.attname), ' AND ' ORDER BY k.i) FROM unnest(c.conkey, c.confkey) WITH ORDINALITY k(fc, pc, i) JOIN pg_attribute af ON af.attrelid=c.conrelid AND af.attnum=k.fc JOIN pg_attribute ap ON ap.attrelid=c.confrelid AND ap.attnum=k.pc) cond,
 (SELECT string_agg(format('f.%I IS NOT NULL', af.attname), ' AND ') FROM unnest(c.conkey) k(fc) JOIN pg_attribute af ON af.attrelid=c.conrelid AND af.attnum=k.fc) nn
 FROM pg_constraint c WHERE c.contype='f' AND c.connamespace IN ('public'::regnamespace) )
SELECT count(*) FILTER (WHERE (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) c FROM %s f WHERE %s AND NOT EXISTS (SELECT 1 FROM %s p WHERE %s)', filho, nn, pai, cond), false, true, '')))[1]::text::bigint > 0) FROM fk INTO o;
  IF o <> 0 THEN RAISE EXCEPTION 'GOLIVE_STOP: % FK(s) com órfãos após 20261007163000', o; END IF;
  IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261007163000' AND name='ssot_001_002_painel_ec_cache') THEN RAISE EXCEPTION 'GOLIVE_STOP: linha de histórico ausente 20261007163000'; END IF;
END $chk$;
COMMIT;
