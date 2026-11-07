-- Módulo Comissão — correções da revisão do PR #607 (ADITIVA; não altera dados existentes).
--  1. Reprocessar refaz de fato a etapa que falhou (AJUSTE / REATRIBUICAO), com o contexto gravado na falha.
--  2. Divisão bloqueada em comissão já liquidada (status/pagamento_id).
--  3. Fechamento serializado com a escolha de competência (advisory lock por loja: vendas = compartilhado,
--     transição = exclusivo) — venda concorrente à aprovação nunca entra num mês já fotografado.
--  4. ADMIN legado (usuarios.perfil='ADMIN', sem vínculo) tem as mesmas permissões de gestão que DONO/GERENTE,
--     igual a fp_pode_loja.
-- Rollback: backend/supabase/rollback/20261021231000_comissao_correcoes_revisao_607.rollback.sql
BEGIN;

-- 1. Contexto da falha para reprocessar ---------------------------------------------------------------
ALTER TABLE public.comissoes_falhas ADD COLUMN IF NOT EXISTS contexto jsonb NULL;
COMMENT ON COLUMN public.comissoes_falhas.contexto IS
  'Dados para refazer a etapa: AJUSTE {tipo, origem_id}, REATRIBUICAO {vendedor_id}.';

CREATE OR REPLACE FUNCTION internal.comissao_registrar_falha(p_venda_id uuid, p_etapa text, p_sqlstate text, p_motivo text, p_contexto jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_loja uuid;
BEGIN
  SELECT c.loja_id INTO v_loja FROM public.vendas v LEFT JOIN public.caixas c ON c.id = v.caixa_id WHERE v.id = p_venda_id;
  INSERT INTO public.comissoes_falhas (venda_id, loja_id, etapa, motivo, sqlstate, contexto)
  VALUES (p_venda_id, v_loja, p_etapa, left(coalesce(p_motivo, '?'), 500), p_sqlstate, p_contexto)
  ON CONFLICT (venda_id, etapa) WHERE resolvida_em IS NULL
  DO UPDATE SET tentativas = public.comissoes_falhas.tentativas + 1, motivo = EXCLUDED.motivo, sqlstate = EXCLUDED.sqlstate,
                contexto = coalesce(EXCLUDED.contexto, public.comissoes_falhas.contexto), ultima_tentativa_em = now();
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'comissao_registrar_falha: % %', SQLSTATE, SQLERRM;
END $$;
REVOKE ALL ON FUNCTION internal.comissao_registrar_falha(uuid, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.processar_ajuste_comissao_venda(p_venda_id uuid, p_tipo text, p_origem_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_com public.comissoes_vendedores%ROWTYPE; v_efetivo record; v_alvo numeric(14,2); v_ja numeric(14,2);
  v_delta numeric(14,2); v_key text; v_ok boolean := false;
BEGIN
  IF p_tipo NOT IN ('CANCELAMENTO', 'DEVOLUCAO', 'TROCA') THEN RAISE EXCEPTION 'COMISSAO_AJUSTE_TIPO_INVALIDO'; END IF;
  SELECT * INTO v_com FROM public.comissoes_vendedores cv WHERE cv.venda_id = p_venda_id ORDER BY cv.created_at, cv.id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  v_key := p_tipo || ':' || coalesce(p_origem_id, p_venda_id)::text;
  IF EXISTS (SELECT 1 FROM public.comissoes_ajustes a WHERE a.idempotency_key = v_key) THEN RETURN; END IF;
  BEGIN
    SELECT * INTO v_efetivo FROM internal.calcular_comissao_venda(p_venda_id, true);
    v_ok := FOUND;
  EXCEPTION WHEN OTHERS THEN
    PERFORM internal.comissao_registrar_falha(p_venda_id, 'AJUSTE', SQLSTATE, SQLERRM, jsonb_build_object('tipo', p_tipo, 'origem_id', p_origem_id));
    RETURN;
  END;
  IF NOT v_ok THEN PERFORM internal.comissao_registrar_falha(p_venda_id, 'AJUSTE', NULL, 'RECALCULO_SEM_RESULTADO', jsonb_build_object('tipo', p_tipo, 'origem_id', p_origem_id)); RETURN; END IF;
  v_alvo := greatest(0, v_com.valor_comissao - coalesce(v_efetivo.o_valor, 0));
  SELECT coalesce(sum(a.valor), 0) INTO v_ja FROM public.comissoes_ajustes a WHERE a.comissao_id = v_com.id;
  v_delta := public.round_abnt(v_alvo - v_ja, 2);
  IF v_delta <= 0 THEN RETURN; END IF;
  INSERT INTO public.comissoes_ajustes (comissao_id, venda_id, operador_id, loja_id, tipo, valor, origem_id, idempotency_key)
  VALUES (v_com.id, p_venda_id, v_com.operador_id, v_com.loja_id, p_tipo, v_delta, p_origem_id, v_key)
  ON CONFLICT (idempotency_key) DO NOTHING;
  PERFORM internal.comissao_resolver_falhas(p_venda_id, 'AJUSTE', NULL);
END $$;

CREATE OR REPLACE FUNCTION public.definir_vendedor_venda_pdv(p_venda_id uuid, p_vendedor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r jsonb;
BEGIN
  r := internal.definir_vendedor_venda_core(p_venda_id, p_vendedor_id);
  PERFORM internal.comissao_resolver_falhas(p_venda_id, 'REATRIBUICAO', NULL);
  RETURN r;
EXCEPTION WHEN OTHERS THEN
  PERFORM internal.comissao_registrar_falha(p_venda_id, 'REATRIBUICAO', SQLSTATE, SQLERRM, jsonb_build_object('vendedor_id', p_vendedor_id));
  RETURN jsonb_build_object('ok', false, 'erro', SQLERRM);
END $$;
REVOKE ALL ON FUNCTION public.definir_vendedor_venda_pdv(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.definir_vendedor_venda_pdv(uuid, uuid) TO service_role;

-- Reprocessar: cada etapa aberta é refeita pela sua própria rotina; só resolve o que de fato deu certo.
CREATE OR REPLACE FUNCTION public.reprocessar_comissao_venda(p_venda_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_loja uuid; v_id uuid; f record; v_tipo text; v_status text; v_alvo uuid;
BEGIN
  SELECT c.loja_id, v.status INTO v_loja, v_status FROM public.vendas v JOIN public.caixas c ON c.id = v.caixa_id WHERE v.id = p_venda_id;
  IF v_loja IS NULL OR NOT public.fp_pode_loja(v_loja, ARRAY['DONO','GERENTE']) THEN RAISE EXCEPTION 'SEM_PERMISSAO'; END IF;

  -- APURACAO (e venda sem comissão): reapura
  PERFORM public.processar_comissao_venda(p_venda_id);
  SELECT id INTO v_id FROM public.comissoes_vendedores WHERE venda_id = p_venda_id LIMIT 1;
  IF v_id IS NOT NULL THEN PERFORM internal.comissao_resolver_falhas(p_venda_id, 'APURACAO', auth.uid()); END IF;

  -- REATRIBUICAO: reaplica o vendedor pedido
  SELECT * INTO f FROM public.comissoes_falhas WHERE venda_id = p_venda_id AND etapa = 'REATRIBUICAO' AND resolvida_em IS NULL;
  IF FOUND THEN
    v_alvo := nullif(f.contexto->>'vendedor_id', '')::uuid;
    IF v_alvo IS NULL THEN
      PERFORM internal.comissao_registrar_falha(p_venda_id, 'REATRIBUICAO', NULL, 'SEM_CONTEXTO_REATRIBUA_MANUALMENTE', NULL);
    ELSE
      BEGIN
        PERFORM internal.definir_vendedor_venda_core(p_venda_id, v_alvo);
        PERFORM internal.comissao_resolver_falhas(p_venda_id, 'REATRIBUICAO', auth.uid());
      EXCEPTION WHEN OTHERS THEN
        PERFORM internal.comissao_registrar_falha(p_venda_id, 'REATRIBUICAO', SQLSTATE, SQLERRM, f.contexto);
      END;
    END IF;
  END IF;

  -- AJUSTE: refaz o estorno com o tipo/origem gravados (ou derivados do status da venda)
  SELECT * INTO f FROM public.comissoes_falhas WHERE venda_id = p_venda_id AND etapa = 'AJUSTE' AND resolvida_em IS NULL;
  IF FOUND THEN
    v_tipo := coalesce(f.contexto->>'tipo', CASE WHEN v_status = 'CANCELADA' THEN 'CANCELAMENTO' END);
    IF v_tipo IS NULL THEN
      PERFORM internal.comissao_registrar_falha(p_venda_id, 'AJUSTE', NULL, 'SEM_CONTEXTO_AJUSTE', NULL);
    ELSE
      PERFORM public.processar_ajuste_comissao_venda(p_venda_id, v_tipo, nullif(f.contexto->>'origem_id', '')::uuid);
      -- sucesso real = ajuste gravado (ou nada a estornar) e falha resolvida pela própria rotina
    END IF;
  END IF;

  SELECT id INTO v_id FROM public.comissoes_vendedores WHERE venda_id = p_venda_id LIMIT 1;
  RETURN jsonb_build_object(
    'ok', v_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.comissoes_falhas WHERE venda_id = p_venda_id AND resolvida_em IS NULL),
    'comissao_id', v_id,
    'falha', (SELECT etapa || ': ' || motivo FROM public.comissoes_falhas WHERE venda_id = p_venda_id AND resolvida_em IS NULL ORDER BY created_at DESC LIMIT 1));
END $$;
REVOKE ALL ON FUNCTION public.reprocessar_comissao_venda(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reprocessar_comissao_venda(uuid) TO authenticated;

-- 2. Divisão bloqueada em comissão paga --------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.definir_divisao_comissao(p_venda_id uuid, p_segundo_id uuid, p_percentual numeric DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v record; v_bloq text;
BEGIN
  SELECT cv.loja_id, cv.operador_id, cv.competencia, cv.created_at, cv.status, cv.pagamento_id INTO v FROM public.comissoes_vendedores cv WHERE cv.venda_id = p_venda_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'COMISSAO_NAO_ENCONTRADA'; END IF;
  IF NOT public.fp_pode_loja(v.loja_id, ARRAY['DONO','GERENTE']) THEN RAISE EXCEPTION 'SEM_PERMISSAO'; END IF;
  IF internal.comissao_periodo_travado(v.loja_id, coalesce(v.competencia, date_trunc('month', v.created_at AT TIME ZONE 'America/Sao_Paulo')::date)) THEN
    RAISE EXCEPTION 'COMISSAO_PERIODO_TRAVADO'; END IF;
  -- comissão já liquidada no fluxo de pagamentos existente: divisão imutável
  IF v.status <> 'pendente' OR v.pagamento_id IS NOT NULL THEN RAISE EXCEPTION 'COMISSAO_JA_PAGA'; END IF;
  IF p_segundo_id IS NULL THEN
    DELETE FROM public.comissoes_divisoes WHERE venda_id = p_venda_id;
    RETURN jsonb_build_object('ok', true, 'dividida', false);
  END IF;
  IF p_segundo_id = v.operador_id THEN RAISE EXCEPTION 'DIVISAO_MESMO_VENDEDOR'; END IF;
  IF p_percentual IS NULL OR p_percentual <= 0 OR p_percentual >= 100 THEN RAISE EXCEPTION 'DIVISAO_PERCENTUAL_INVALIDO'; END IF;
  IF NOT public.fp_usuario_pode_loja(p_segundo_id, v.loja_id) THEN RAISE EXCEPTION 'VENDEDOR_FORA_DA_LOJA'; END IF;
  INSERT INTO public.comissoes_divisoes (venda_id, loja_id, operador_secundario_id, percentual, criado_por)
  VALUES (p_venda_id, v.loja_id, p_segundo_id, round(p_percentual, 2), auth.uid())
  ON CONFLICT (venda_id) DO UPDATE SET operador_secundario_id = excluded.operador_secundario_id, percentual = excluded.percentual,
    criado_por = excluded.criado_por, created_at = now();
  RETURN jsonb_build_object('ok', true, 'dividida', true);
END $$;
REVOKE ALL ON FUNCTION public.definir_divisao_comissao(uuid, uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.definir_divisao_comissao(uuid, uuid, numeric) TO authenticated;

-- 3. Serialização fechamento × vendas ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION internal.comissao_competencia_aberta(p_loja uuid, p_data timestamptz)
RETURNS date LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE c date := date_trunc('month', (coalesce(p_data, now()) AT TIME ZONE 'America/Sao_Paulo'))::date;
BEGIN
  -- compartilhado: vendas não se bloqueiam entre si; espera uma transição de período em andamento terminar
  PERFORM pg_advisory_xact_lock_shared(hashtextextended('comissao_periodo:' || p_loja::text, 0));
  WHILE EXISTS (SELECT 1 FROM public.comissoes_periodos WHERE loja_id = p_loja AND competencia = c AND status IN ('APROVADO','PAGO')) LOOP
    c := (c + interval '1 month')::date;
  END LOOP;
  RETURN c;
END $$;
REVOKE ALL ON FUNCTION internal.comissao_competencia_aberta(uuid, timestamptz) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.comissao_periodo_transicionar(p_loja_id uuid, p_competencia date, p_para text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_comp date := date_trunc('month', p_competencia)::date; p record; v_uid uuid := auth.uid();
BEGIN
  IF NOT public.fp_pode_loja(p_loja_id, ARRAY['DONO','GERENTE']) THEN RAISE EXCEPTION 'SEM_PERMISSAO'; END IF;
  -- serializa com a escolha de competência das vendas em andamento (lock compartilhado em comissao_competencia_aberta)
  PERFORM pg_advisory_xact_lock(hashtextextended('comissao_periodo:' || p_loja_id::text, 0));
  INSERT INTO public.comissoes_periodos (empresa_id, loja_id, competencia)
  VALUES (public.fp_empresa_da_loja(p_loja_id), p_loja_id, v_comp) ON CONFLICT (loja_id, competencia) DO NOTHING;
  SELECT * INTO p FROM public.comissoes_periodos WHERE loja_id = p_loja_id AND competencia = v_comp FOR UPDATE;
  IF (p.status, p_para) IN (('ABERTO','EM_REVISAO')) THEN
    PERFORM internal.comissao_periodo_snapshot(p.id);
    UPDATE public.comissoes_periodos SET status = 'EM_REVISAO', revisado_por = v_uid, revisado_em = now() WHERE id = p.id;
  ELSIF (p.status, p_para) IN (('EM_REVISAO','ABERTO')) THEN
    UPDATE public.comissoes_periodos SET status = 'ABERTO' WHERE id = p.id;
  ELSIF (p.status, p_para) IN (('EM_REVISAO','APROVADO')) THEN
    PERFORM internal.comissao_periodo_snapshot(p.id);   -- foto final no instante da aprovação
    UPDATE public.comissoes_periodos SET status = 'APROVADO', aprovado_por = v_uid, aprovado_em = now() WHERE id = p.id;
  ELSIF (p.status, p_para) IN (('APROVADO','PAGO')) THEN
    UPDATE public.comissoes_periodos SET status = 'PAGO', pago_por = v_uid, pago_em = now() WHERE id = p.id;  -- só marcação
  ELSE
    RAISE EXCEPTION 'COMISSAO_TRANSICAO_INVALIDA:%->%', p.status, p_para;
  END IF;
  SELECT * INTO p FROM public.comissoes_periodos WHERE id = p.id;
  RETURN jsonb_build_object('id', p.id, 'status', p.status, 'total', p.total);
END $$;
REVOKE ALL ON FUNCTION public.comissao_periodo_transicionar(uuid, date, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.comissao_periodo_transicionar(uuid, date, text) TO authenticated;

-- 4. ADMIN legado = gestor (mesma regra de fp_pode_loja) --------------------------------------------
CREATE OR REPLACE FUNCTION internal.comissao_eh_gestor(p_empresa uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.usuario_vinculos v JOIN public.usuarios u ON u.id = v.usuario_id AND u.ativo
                  WHERE v.usuario_id = auth.uid() AND v.empresa_id = p_empresa AND v.ativo AND v.papel IN ('DONO','GERENTE'))
      OR (p_empresa IS NOT NULL AND public.fp_admin_legado());
$$;
COMMIT;
