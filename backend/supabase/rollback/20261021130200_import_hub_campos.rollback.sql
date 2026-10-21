-- ============================================================================
-- ROLLBACK da F5 (20261010170000_f5_import_hub_campos.sql). Manual, com autorização.
-- Remove os campos documentais do hub e restaura a aprovação e o salvamento de item da F4.
-- Perde: fornecedor/moeda/datas da operação, código do fornecedor e NCM dos itens e o status de
-- conferência dos lançamentos. O cálculo não é afetado (esses campos não entram no motor).
-- ============================================================================
BEGIN;

DROP FUNCTION IF EXISTS public.import_listar_operacoes();
DROP FUNCTION IF EXISTS public.import_conferir_lancamento(uuid, text, uuid, text);
DROP FUNCTION IF EXISTS public.import_atualizar_operacao(uuid, jsonb);
DROP FUNCTION IF EXISTS public._import_fornecedor_da_empresa(uuid, uuid);
DROP TRIGGER IF EXISTS import_despesas_reconferir ON public.import_despesas;
DROP TRIGGER IF EXISTS import_tributos_reconferir ON public.import_tributos;
DROP FUNCTION IF EXISTS public.trg_import_lancamento_reconferir();

ALTER TABLE public.import_despesas DROP COLUMN IF EXISTS status_conferencia;
ALTER TABLE public.import_tributos DROP COLUMN IF EXISTS status_conferencia;
ALTER TABLE public.import_itens DROP COLUMN IF EXISTS codigo_fornecedor, DROP COLUMN IF EXISTS ncm;
ALTER TABLE public.import_operacoes
  DROP COLUMN IF EXISTS fornecedor_id, DROP COLUMN IF EXISTS moeda, DROP COLUMN IF EXISTS data_invoice,
  DROP COLUMN IF EXISTS data_embarque, DROP COLUMN IF EXISTS data_desembaraco;

-- Definições da F4 (restauradas)
CREATE OR REPLACE FUNCTION public.import_salvar_item(p_operacao uuid, p_item jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  o public.import_operacoes;
  v_id uuid := nullif(p_item ->> 'id', '')::uuid;
  v_prod uuid := nullif(p_item ->> 'produto_id', '')::uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'IMPORT_AUTH' USING ERRCODE = '42501';
  END IF;
  o := public._import_operacao_para_escrita(p_operacao);
  IF v_prod IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.produtos p JOIN public.lojas l ON l.id = p.loja_id
        WHERE p.id = v_prod AND l.empresa_id = o.empresa_id) THEN
    RAISE EXCEPTION 'IMPORT_PRODUTO_FORA_DA_EMPRESA' USING ERRCODE = '42501';
  END IF;
  IF v_id IS NULL THEN
    INSERT INTO public.import_itens (operacao_id, empresa_id, produto_id, descricao, moeda, valor_mercadoria_moeda,
      valor_aduaneiro_brl, quantidade_comercial, unidade_comercial, fator_para_estoque, quantidade_estoque,
      peso_liquido_kg, peso_bruto_kg, volume_m3, documento_id)
    VALUES (o.id, o.empresa_id, v_prod, p_item ->> 'descricao', upper(p_item ->> 'moeda'),
      (p_item ->> 'valor_mercadoria_moeda')::numeric, (p_item ->> 'valor_aduaneiro_brl')::numeric,
      (p_item ->> 'quantidade_comercial')::numeric, p_item ->> 'unidade_comercial',
      (p_item ->> 'fator_para_estoque')::numeric, (p_item ->> 'quantidade_estoque')::numeric,
      (p_item ->> 'peso_liquido_kg')::numeric, (p_item ->> 'peso_bruto_kg')::numeric, (p_item ->> 'volume_m3')::numeric,
      nullif(p_item ->> 'documento_id', '')::uuid)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.import_itens SET produto_id = v_prod, descricao = p_item ->> 'descricao', moeda = upper(p_item ->> 'moeda'),
      valor_mercadoria_moeda = (p_item ->> 'valor_mercadoria_moeda')::numeric,
      valor_aduaneiro_brl = (p_item ->> 'valor_aduaneiro_brl')::numeric,
      quantidade_comercial = (p_item ->> 'quantidade_comercial')::numeric, unidade_comercial = p_item ->> 'unidade_comercial',
      fator_para_estoque = (p_item ->> 'fator_para_estoque')::numeric, quantidade_estoque = (p_item ->> 'quantidade_estoque')::numeric,
      peso_liquido_kg = (p_item ->> 'peso_liquido_kg')::numeric, peso_bruto_kg = (p_item ->> 'peso_bruto_kg')::numeric,
      volume_m3 = (p_item ->> 'volume_m3')::numeric, documento_id = nullif(p_item ->> 'documento_id', '')::uuid
     WHERE id = v_id AND operacao_id = o.id;
    IF NOT FOUND THEN RAISE EXCEPTION 'IMPORT_ITEM_NAO_ENCONTRADO'; END IF;
  END IF;
  PERFORM public._import_auditar(o.empresa_id, o.id, 'SALVAR', 'item', v_id, p_item);
  RETURN v_id;
END
$function$

;
CREATE OR REPLACE FUNCTION public.import_aprovar_apuracao(p_apuracao uuid, p_ator uuid, p_motivo text, p_verificacao jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  IF coalesce((p_verificacao ->> 'recalculo_confere')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'IMPORT_RECALCULO_NAO_CONFERIDO';
  END IF;

  INSERT INTO public.import_aprovacoes (operacao_id, apuracao_id, empresa_id, decisao, por, motivo, verificacao)
  VALUES (o.id, a.id, o.empresa_id, 'APROVADA', p_ator, btrim(p_motivo), coalesce(p_verificacao, '{}'::jsonb));
  UPDATE public.import_operacoes SET status = 'APROVADA', apuracao_aprovada_id = a.id, atualizado_em = now() WHERE id = o.id;
  INSERT INTO public.import_auditoria (empresa_id, operacao_id, acao, entidade, entidade_id, por, detalhe)
  VALUES (o.empresa_id, o.id, 'APROVAR', 'apuracao', a.id, p_ator, coalesce(p_verificacao, '{}'::jsonb));
END
$function$

;


COMMIT;
