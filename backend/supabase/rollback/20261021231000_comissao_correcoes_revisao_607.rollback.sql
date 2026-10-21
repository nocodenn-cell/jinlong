-- Rollback de 20261021231000_comissao_correcoes_revisao_607: volta às definições de P0/P1/P2.
BEGIN;
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
    PERFORM internal.comissao_registrar_falha(p_venda_id, 'AJUSTE', SQLSTATE, SQLERRM);
    RETURN;
  END;
  IF NOT v_ok THEN PERFORM internal.comissao_registrar_falha(p_venda_id, 'AJUSTE', NULL, 'RECALCULO_SEM_RESULTADO'); RETURN; END IF;
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
BEGIN
  RETURN internal.definir_vendedor_venda_core(p_venda_id, p_vendedor_id);
EXCEPTION WHEN OTHERS THEN
  PERFORM internal.comissao_registrar_falha(p_venda_id, 'REATRIBUICAO', SQLSTATE, SQLERRM);
  RETURN jsonb_build_object('ok', false, 'erro', SQLERRM);
END $$;

CREATE OR REPLACE FUNCTION public.reprocessar_comissao_venda(p_venda_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_loja uuid; v_id uuid;
BEGIN
  SELECT c.loja_id INTO v_loja FROM public.vendas v JOIN public.caixas c ON c.id = v.caixa_id WHERE v.id = p_venda_id;
  IF v_loja IS NULL OR NOT public.fp_pode_loja(v_loja, ARRAY['DONO','GERENTE']) THEN RAISE EXCEPTION 'SEM_PERMISSAO'; END IF;
  PERFORM public.processar_comissao_venda(p_venda_id);
  SELECT id INTO v_id FROM public.comissoes_vendedores WHERE venda_id = p_venda_id LIMIT 1;
  IF v_id IS NOT NULL THEN
    PERFORM internal.comissao_resolver_falhas(p_venda_id, 'APURACAO', auth.uid());
    PERFORM internal.comissao_resolver_falhas(p_venda_id, 'REATRIBUICAO', auth.uid());
  END IF;
  RETURN jsonb_build_object('ok', v_id IS NOT NULL, 'comissao_id', v_id,
    'falha', (SELECT motivo FROM public.comissoes_falhas WHERE venda_id = p_venda_id AND resolvida_em IS NULL ORDER BY created_at DESC LIMIT 1));
END $$;

CREATE OR REPLACE FUNCTION public.definir_divisao_comissao(p_venda_id uuid, p_segundo_id uuid, p_percentual numeric DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v record; v_bloq text;
BEGIN
  SELECT cv.loja_id, cv.operador_id, cv.competencia, cv.created_at INTO v FROM public.comissoes_vendedores cv WHERE cv.venda_id = p_venda_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'COMISSAO_NAO_ENCONTRADA'; END IF;
  IF NOT public.fp_pode_loja(v.loja_id, ARRAY['DONO','GERENTE']) THEN RAISE EXCEPTION 'SEM_PERMISSAO'; END IF;
  IF internal.comissao_periodo_travado(v.loja_id, coalesce(v.competencia, date_trunc('month', v.created_at AT TIME ZONE 'America/Sao_Paulo')::date)) THEN
    RAISE EXCEPTION 'COMISSAO_PERIODO_TRAVADO'; END IF;
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

CREATE OR REPLACE FUNCTION internal.comissao_competencia_aberta(p_loja uuid, p_data timestamptz)
RETURNS date LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE c date := date_trunc('month', (coalesce(p_data, now()) AT TIME ZONE 'America/Sao_Paulo'))::date;
BEGIN
  WHILE EXISTS (SELECT 1 FROM public.comissoes_periodos WHERE loja_id = p_loja AND competencia = c AND status IN ('APROVADO','PAGO')) LOOP
    c := (c + interval '1 month')::date;
  END LOOP;
  RETURN c;
END $$;

CREATE OR REPLACE FUNCTION public.comissao_periodo_transicionar(p_loja_id uuid, p_competencia date, p_para text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_comp date := date_trunc('month', p_competencia)::date; p record; v_uid uuid := auth.uid();
BEGIN
  IF NOT public.fp_pode_loja(p_loja_id, ARRAY['DONO','GERENTE']) THEN RAISE EXCEPTION 'SEM_PERMISSAO'; END IF;
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

CREATE OR REPLACE FUNCTION internal.comissao_eh_gestor(p_empresa uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.usuario_vinculos v JOIN public.usuarios u ON u.id = v.usuario_id AND u.ativo
                  WHERE v.usuario_id = auth.uid() AND v.empresa_id = p_empresa AND v.ativo AND v.papel IN ('DONO','GERENTE'));
$$;

DROP FUNCTION IF EXISTS internal.comissao_registrar_falha(uuid, text, text, text, jsonb);
ALTER TABLE public.comissoes_falhas DROP COLUMN IF EXISTS contexto;
REVOKE ALL ON FUNCTION internal.comissao_competencia_aberta(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
COMMIT;
