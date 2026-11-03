-- Rollback de 20261103121000 (D-05): remove idempotency_key e restaura o lançamento anterior.
BEGIN;
DROP INDEX IF EXISTS public.import_despesas_idempotency_uidx;
CREATE OR REPLACE FUNCTION public.import_salvar_lancamento(p_operacao uuid, p_tipo text, p_dados jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  o public.import_operacoes;
  v_id uuid := nullif(p_dados ->> 'id', '')::uuid;
  v_item uuid := nullif(p_dados ->> 'item_id', '')::uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'IMPORT_AUTH' USING ERRCODE = '42501';
  END IF;
  o := public._import_operacao_para_escrita(p_operacao);
  IF v_item IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.import_itens WHERE id = v_item AND operacao_id = o.id) THEN
    RAISE EXCEPTION 'IMPORT_ITEM_DE_OUTRA_OPERACAO';
  END IF;

  IF p_tipo = 'CAMBIO' THEN
    IF v_id IS NULL THEN
      INSERT INTO public.import_cambios (operacao_id, empresa_id, moeda, taxa, fonte, data, documento_id)
      VALUES (o.id, o.empresa_id, upper(p_dados ->> 'moeda'), (p_dados ->> 'taxa')::numeric, p_dados ->> 'fonte',
              (p_dados ->> 'data')::date, nullif(p_dados ->> 'documento_id', '')::uuid)
      RETURNING id INTO v_id;
    ELSE
      UPDATE public.import_cambios SET moeda = upper(p_dados ->> 'moeda'), taxa = (p_dados ->> 'taxa')::numeric,
             fonte = p_dados ->> 'fonte', data = (p_dados ->> 'data')::date, documento_id = nullif(p_dados ->> 'documento_id', '')::uuid
       WHERE id = v_id AND operacao_id = o.id;
      IF NOT FOUND THEN RAISE EXCEPTION 'IMPORT_LANCAMENTO_NAO_ENCONTRADO'; END IF;
    END IF;
  ELSIF p_tipo = 'DESPESA' THEN
    IF v_id IS NULL THEN
      INSERT INTO public.import_despesas (operacao_id, empresa_id, tipo, moeda, valor, incorporavel, atribuicao_modo,
                                         item_id, criterio, justificativa, documento_id)
      VALUES (o.id, o.empresa_id, p_dados ->> 'tipo', upper(p_dados ->> 'moeda'), (p_dados ->> 'valor')::numeric,
              p_dados ->> 'incorporavel', p_dados ->> 'atribuicao_modo', v_item, p_dados ->> 'criterio',
              coalesce(p_dados ->> 'justificativa', ''), nullif(p_dados ->> 'documento_id', '')::uuid)
      RETURNING id INTO v_id;
    ELSE
      UPDATE public.import_despesas SET tipo = p_dados ->> 'tipo', moeda = upper(p_dados ->> 'moeda'),
             valor = (p_dados ->> 'valor')::numeric, incorporavel = p_dados ->> 'incorporavel',
             atribuicao_modo = p_dados ->> 'atribuicao_modo', item_id = v_item, criterio = p_dados ->> 'criterio',
             justificativa = coalesce(p_dados ->> 'justificativa', ''), documento_id = nullif(p_dados ->> 'documento_id', '')::uuid
       WHERE id = v_id AND operacao_id = o.id;
      IF NOT FOUND THEN RAISE EXCEPTION 'IMPORT_LANCAMENTO_NAO_ENCONTRADO'; END IF;
    END IF;
  ELSIF p_tipo = 'DESCONTO' THEN
    IF v_id IS NULL THEN
      INSERT INTO public.import_descontos (operacao_id, empresa_id, escopo, moeda, valor, item_id, criterio, justificativa, documento_id)
      VALUES (o.id, o.empresa_id, p_dados ->> 'escopo', upper(p_dados ->> 'moeda'), (p_dados ->> 'valor')::numeric,
              v_item, p_dados ->> 'criterio', coalesce(p_dados ->> 'justificativa', ''), nullif(p_dados ->> 'documento_id', '')::uuid)
      RETURNING id INTO v_id;
    ELSE
      UPDATE public.import_descontos SET escopo = p_dados ->> 'escopo', moeda = upper(p_dados ->> 'moeda'),
             valor = (p_dados ->> 'valor')::numeric, item_id = v_item, criterio = p_dados ->> 'criterio',
             justificativa = coalesce(p_dados ->> 'justificativa', ''), documento_id = nullif(p_dados ->> 'documento_id', '')::uuid
       WHERE id = v_id AND operacao_id = o.id;
      IF NOT FOUND THEN RAISE EXCEPTION 'IMPORT_LANCAMENTO_NAO_ENCONTRADO'; END IF;
    END IF;
  ELSIF p_tipo = 'TRIBUTO' THEN
    IF v_id IS NULL THEN
      INSERT INTO public.import_tributos (operacao_id, empresa_id, tributo_codigo, status_recuperabilidade, valor_apurado_brl,
        item_id, regra_id, regra_incorpora_custo, regra_vigencia_inicio, regra_vigencia_fim, data_fato_gerador, validado_por, documento_id)
      VALUES (o.id, o.empresa_id, p_dados ->> 'tributo_codigo', p_dados ->> 'status_recuperabilidade',
        (p_dados ->> 'valor_apurado_brl')::numeric, v_item, p_dados ->> 'regra_id', (p_dados ->> 'regra_incorpora_custo')::boolean,
        (p_dados ->> 'regra_vigencia_inicio')::date, (p_dados ->> 'regra_vigencia_fim')::date,
        (p_dados ->> 'data_fato_gerador')::date, p_dados ->> 'validado_por', nullif(p_dados ->> 'documento_id', '')::uuid)
      RETURNING id INTO v_id;
    ELSE
      UPDATE public.import_tributos SET tributo_codigo = p_dados ->> 'tributo_codigo',
        status_recuperabilidade = p_dados ->> 'status_recuperabilidade', valor_apurado_brl = (p_dados ->> 'valor_apurado_brl')::numeric,
        item_id = v_item, regra_id = p_dados ->> 'regra_id', regra_incorpora_custo = (p_dados ->> 'regra_incorpora_custo')::boolean,
        regra_vigencia_inicio = (p_dados ->> 'regra_vigencia_inicio')::date, regra_vigencia_fim = (p_dados ->> 'regra_vigencia_fim')::date,
        data_fato_gerador = (p_dados ->> 'data_fato_gerador')::date, validado_por = p_dados ->> 'validado_por',
        documento_id = nullif(p_dados ->> 'documento_id', '')::uuid
       WHERE id = v_id AND operacao_id = o.id;
      IF NOT FOUND THEN RAISE EXCEPTION 'IMPORT_LANCAMENTO_NAO_ENCONTRADO'; END IF;
    END IF;
  ELSE
    RAISE EXCEPTION 'IMPORT_TIPO_LANCAMENTO_INVALIDO';
  END IF;

  PERFORM public._import_auditar(o.empresa_id, o.id, 'SALVAR', lower(p_tipo), v_id, p_dados);
  RETURN v_id;
END
$$;

ALTER TABLE public.import_despesas DROP COLUMN IF EXISTS idempotency_key;

COMMIT;
