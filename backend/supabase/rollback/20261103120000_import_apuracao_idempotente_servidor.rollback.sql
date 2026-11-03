-- Rollback de 20261103120000 (D-04/D-06): restaura o registro e a aprovação anteriores.
-- Atenção: apuração gravada com a nova identidade permanece; só a regra de acesso e a assinatura voltam.
BEGIN;
DROP INDEX IF EXISTS public.import_apuracoes_identidade_uidx;
DROP FUNCTION IF EXISTS public.import_registrar_apuracao(uuid, uuid, text, integer, jsonb, text);

CREATE OR REPLACE FUNCTION public.import_registrar_apuracao(
  p_operacao uuid, p_tipo text, p_versao_dados integer,
  p_entrada_sha256 text, p_saida jsonb, p_saida_sha256 text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  o public.import_operacoes;
  v_id uuid;
  v_versao int;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'IMPORT_AUTH' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO o FROM public.import_operacoes WHERE id = p_operacao FOR UPDATE;
  IF o.id IS NULL OR NOT public.fp_import_pode_operacao(p_operacao, ARRAY['DONO', 'GERENTE'])
     OR NOT public.fp_pode_operar_loja(o.loja_importadora_id, ARRAY['DONO', 'GERENTE']) THEN
    RAISE EXCEPTION 'IMPORT_NAO_AUTORIZADO' USING ERRCODE = '42501';
  END IF;
  IF o.status <> 'RASCUNHO' THEN
    RAISE EXCEPTION 'IMPORT_OPERACAO_NAO_EDITAVEL';
  END IF;
  -- concorrência: o cálculo tem de ter partido da versão atual dos dados
  IF p_versao_dados IS DISTINCT FROM o.versao_dados THEN
    RAISE EXCEPTION 'IMPORT_DADOS_ALTERADOS_DURANTE_CALCULO';
  END IF;
  IF p_tipo NOT IN ('SIMULACAO', 'APURACAO') OR p_saida ->> 'schema_version' <> '1'
     OR p_saida ->> 'status' NOT IN ('OK', 'BLOQUEADO') OR coalesce(p_saida ->> 'engine_version', '') = '' THEN
    RAISE EXCEPTION 'IMPORT_SAIDA_INVALIDA';
  END IF;
  -- os itens da saída precisam ser exatamente os itens da operação
  IF (SELECT array_agg(x ->> 'item_id' ORDER BY x ->> 'item_id') FROM jsonb_array_elements(p_saida -> 'itens') x)
     IS DISTINCT FROM (SELECT array_agg(i.id::text ORDER BY i.id::text) FROM public.import_itens i WHERE i.operacao_id = o.id) THEN
    RAISE EXCEPTION 'IMPORT_SAIDA_NAO_CORRESPONDE_AOS_ITENS';
  END IF;

  SELECT coalesce(max(versao), 0) + 1 INTO v_versao FROM public.import_apuracoes WHERE operacao_id = o.id;
  INSERT INTO public.import_apuracoes (operacao_id, empresa_id, versao, tipo, versao_dados, engine_version, entrada,
      entrada_sha256, saida, saida_sha256, status_calculo, conservacao_ok, criado_por)
  VALUES (o.id, o.empresa_id, v_versao, p_tipo, o.versao_dados, p_saida ->> 'engine_version',
          public._import_montar_entrada(o.id), lower(p_entrada_sha256), p_saida, lower(p_saida_sha256),
          p_saida ->> 'status', coalesce((p_saida -> 'conservacao' ->> 'ok')::boolean, false), auth.uid())
  RETURNING id INTO v_id;

  INSERT INTO public.import_apuracao_itens (apuracao_id, empresa_id, item_id, produto_id, quantidade_estoque, custo_total_brl,
      custo_unitario_brl, residuo_unitario_brl, residuo_total_brl, componentes_brl, memoria)
  SELECT v_id, o.empresa_id, (x ->> 'item_id')::uuid, nullif(x ->> 'produto_id', '')::uuid,
         (x ->> 'quantidade_estoque')::numeric, (x ->> 'custo_total_brl')::numeric, (x ->> 'custo_unitario_brl')::numeric,
         (x ->> 'residuo_unitario_brl')::numeric, (x ->> 'residuo_total_brl')::numeric,
         x -> 'componentes_brl', coalesce(x -> 'memoria', '[]'::jsonb)
    FROM jsonb_array_elements(p_saida -> 'itens') x;

  INSERT INTO public.import_apuracao_rateios (apuracao_id, empresa_id, origem_id, componente, criterio, base_total, item_id,
      base_item, valor_alocado_brl, justificativa)
  SELECT v_id, o.empresa_id, x ->> 'origem_id', x ->> 'componente', x ->> 'criterio', (x ->> 'base_total')::numeric,
         (x ->> 'item_id')::uuid, (x ->> 'base_item')::numeric, (x ->> 'valor_alocado_brl')::numeric, x ->> 'justificativa'
    FROM jsonb_array_elements(coalesce(p_saida -> 'rateios', '[]'::jsonb)) x;

  INSERT INTO public.import_divergencias (apuracao_id, empresa_id, codigo, severidade, referencia, mensagem)
  SELECT v_id, o.empresa_id, x ->> 'codigo', x ->> 'severidade', x ->> 'referencia', x ->> 'mensagem'
    FROM jsonb_array_elements(coalesce(p_saida -> 'divergencias', '[]'::jsonb)) x;

  PERFORM public._import_auditar(o.empresa_id, o.id, 'APURAR', 'apuracao', v_id,
    jsonb_build_object('tipo', p_tipo, 'versao', v_versao, 'status', p_saida ->> 'status',
                       'entrada_sha256', lower(p_entrada_sha256), 'saida_sha256', lower(p_saida_sha256)));
  RETURN v_id;
END
$$;

GRANT EXECUTE ON FUNCTION public.import_registrar_apuracao(uuid, text, integer, text, jsonb, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.import_aprovar_apuracao(p_apuracao uuid, p_ator uuid, p_motivo text, p_verificacao jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  a public.import_apuracoes;
  o public.import_operacoes;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    RAISE EXCEPTION 'IMPORT_APROVACAO_SOMENTE_SERVIDOR' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO a FROM public.import_apuracoes WHERE id = p_apuracao;
  IF a.id IS NULL THEN RAISE EXCEPTION 'IMPORT_APURACAO_NAO_ENCONTRADA'; END IF;
  SELECT * INTO o FROM public.import_operacoes WHERE id = a.operacao_id FOR UPDATE;
  IF p_ator IS NULL OR NOT public._fp_import_usuario_pode(p_ator, o.id, ARRAY['DONO']) THEN
    RAISE EXCEPTION 'IMPORT_APROVADOR_NAO_AUTORIZADO' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(coalesce(p_motivo, ''))) < 10 THEN RAISE EXCEPTION 'IMPORT_MOTIVO_OBRIGATORIO'; END IF;
  IF o.status <> 'RASCUNHO' THEN RAISE EXCEPTION 'IMPORT_OPERACAO_NAO_EDITAVEL'; END IF;
  IF a.tipo <> 'APURACAO' THEN RAISE EXCEPTION 'IMPORT_SIMULACAO_NAO_APROVAVEL'; END IF;
  IF a.versao_dados <> o.versao_dados THEN RAISE EXCEPTION 'IMPORT_DADOS_ALTERADOS_APOS_APURACAO'; END IF;
  IF a.status_calculo <> 'OK' OR NOT a.conservacao_ok
     OR EXISTS (SELECT 1 FROM public.import_divergencias d WHERE d.apuracao_id = a.id AND d.severidade = 'BLOQUEANTE') THEN
    RAISE EXCEPTION 'IMPORT_APURACAO_BLOQUEADA';
  END IF;
  -- F5: lançamentos (despesas e tributos) precisam estar conferidos
  IF EXISTS (SELECT 1 FROM public.import_despesas WHERE operacao_id = o.id AND status_conferencia <> 'CONFERIDO')
     OR EXISTS (SELECT 1 FROM public.import_tributos WHERE operacao_id = o.id AND status_conferencia <> 'CONFERIDO') THEN
    RAISE EXCEPTION 'IMPORT_LANCAMENTOS_NAO_CONFERIDOS';
  END IF;
  IF coalesce((p_verificacao ->> 'recalculo_confere')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'IMPORT_RECALCULO_NAO_CONFERIDO';
  END IF;

  INSERT INTO public.import_aprovacoes (operacao_id, apuracao_id, empresa_id, decisao, por, motivo, verificacao)
  VALUES (o.id, a.id, o.empresa_id, 'APROVADA', p_ator, btrim(p_motivo), coalesce(p_verificacao, '{}'::jsonb));
  UPDATE public.import_operacoes SET status = 'APROVADA', apuracao_aprovada_id = a.id, atualizado_em = now() WHERE id = o.id;
  INSERT INTO public.import_auditoria (empresa_id, operacao_id, acao, entidade, entidade_id, por, detalhe)
  VALUES (o.empresa_id, o.id, 'APROVAR', 'apuracao', a.id, p_ator, coalesce(p_verificacao, '{}'::jsonb));
END
$$;

COMMIT;
