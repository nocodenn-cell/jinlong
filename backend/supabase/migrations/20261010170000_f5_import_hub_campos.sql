-- ============================================================================
-- F5 — Campos do hub de Importações (aditivo sobre a F4).
--
-- Somente o que a tela usa:
--   operação: fornecedor vinculado (da mesma empresa), moeda principal, datas (invoice,
--             embarque, desembaraço) e observações (reaproveita `descricao`);
--   item:     código do fornecedor (TEXTO, zeros à esquerda preservados) e NCM documental;
--   despesa/tributo: status de conferência (PENDENTE | CONFERIDO).
-- Listagem para o hub com agregados da última apuração (somente leitura, sob as mesmas regras).
-- Nenhuma integração com estoque, contas a pagar ou preços.
-- Rollback: backend/supabase/rollback/20261010170000_f5_import_hub_campos.rollback.sql
-- ============================================================================
BEGIN;

ALTER TABLE public.import_operacoes
  ADD COLUMN IF NOT EXISTS fornecedor_id    uuid REFERENCES public.fornecedores (id),
  ADD COLUMN IF NOT EXISTS moeda            text CHECK (moeda IS NULL OR moeda ~ '^[A-Z]{3}$'),
  ADD COLUMN IF NOT EXISTS data_invoice     date,
  ADD COLUMN IF NOT EXISTS data_embarque    date,
  ADD COLUMN IF NOT EXISTS data_desembaraco date;

ALTER TABLE public.import_itens
  ADD COLUMN IF NOT EXISTS codigo_fornecedor text,
  ADD COLUMN IF NOT EXISTS ncm               text CHECK (ncm IS NULL OR ncm ~ '^[0-9]{8}$');

ALTER TABLE public.import_despesas
  ADD COLUMN IF NOT EXISTS status_conferencia text NOT NULL DEFAULT 'PENDENTE'
    CHECK (status_conferencia IN ('PENDENTE', 'CONFERIDO'));
ALTER TABLE public.import_tributos
  ADD COLUMN IF NOT EXISTS status_conferencia text NOT NULL DEFAULT 'PENDENTE'
    CHECK (status_conferencia IN ('PENDENTE', 'CONFERIDO'));

-- Fornecedor precisa ser da mesma empresa da operação.
CREATE OR REPLACE FUNCTION public._import_fornecedor_da_empresa(p_fornecedor uuid, p_empresa uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT p_fornecedor IS NULL OR EXISTS (
    SELECT 1 FROM public.fornecedores f JOIN public.lojas l ON l.id = f.loja_id
     WHERE f.id = p_fornecedor AND l.empresa_id = p_empresa)
$$;
REVOKE ALL ON FUNCTION public._import_fornecedor_da_empresa(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;

-- Cabeçalho da operação (rascunho).
CREATE OR REPLACE FUNCTION public.import_atualizar_operacao(p_operacao uuid, p_dados jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  o public.import_operacoes;
  v_forn uuid := nullif(p_dados ->> 'fornecedor_id', '')::uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'IMPORT_AUTH' USING ERRCODE = '42501';
  END IF;
  o := public._import_operacao_para_escrita(p_operacao);
  IF NOT public._import_fornecedor_da_empresa(v_forn, o.empresa_id) THEN
    RAISE EXCEPTION 'IMPORT_FORNECEDOR_FORA_DA_EMPRESA' USING ERRCODE = '42501';
  END IF;
  UPDATE public.import_operacoes SET
    referencia       = coalesce(nullif(btrim(p_dados ->> 'referencia'), ''), referencia),
    descricao        = nullif(btrim(coalesce(p_dados ->> 'observacoes', '')), ''),
    fornecedor_id    = v_forn,
    moeda            = nullif(upper(btrim(coalesce(p_dados ->> 'moeda', ''))), ''),
    data_invoice     = nullif(p_dados ->> 'data_invoice', '')::date,
    data_embarque    = nullif(p_dados ->> 'data_embarque', '')::date,
    data_desembaraco = nullif(p_dados ->> 'data_desembaraco', '')::date
   WHERE id = o.id;
  PERFORM public._import_auditar(o.empresa_id, o.id, 'SALVAR', 'operacao', o.id, p_dados);
END
$$;

-- Item: mesma regra da F4, com código do fornecedor e NCM.
CREATE OR REPLACE FUNCTION public.import_salvar_item(p_operacao uuid, p_item jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
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
      peso_liquido_kg, peso_bruto_kg, volume_m3, documento_id, codigo_fornecedor, ncm)
    VALUES (o.id, o.empresa_id, v_prod, p_item ->> 'descricao', upper(p_item ->> 'moeda'),
      (p_item ->> 'valor_mercadoria_moeda')::numeric, nullif(p_item ->> 'valor_aduaneiro_brl', '')::numeric,
      (p_item ->> 'quantidade_comercial')::numeric, p_item ->> 'unidade_comercial',
      (p_item ->> 'fator_para_estoque')::numeric, (p_item ->> 'quantidade_estoque')::numeric,
      nullif(p_item ->> 'peso_liquido_kg', '')::numeric, nullif(p_item ->> 'peso_bruto_kg', '')::numeric,
      nullif(p_item ->> 'volume_m3', '')::numeric, nullif(p_item ->> 'documento_id', '')::uuid,
      nullif(p_item ->> 'codigo_fornecedor', ''), nullif(p_item ->> 'ncm', ''))
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.import_itens SET produto_id = v_prod, descricao = p_item ->> 'descricao', moeda = upper(p_item ->> 'moeda'),
      valor_mercadoria_moeda = (p_item ->> 'valor_mercadoria_moeda')::numeric,
      valor_aduaneiro_brl = nullif(p_item ->> 'valor_aduaneiro_brl', '')::numeric,
      quantidade_comercial = (p_item ->> 'quantidade_comercial')::numeric, unidade_comercial = p_item ->> 'unidade_comercial',
      fator_para_estoque = (p_item ->> 'fator_para_estoque')::numeric, quantidade_estoque = (p_item ->> 'quantidade_estoque')::numeric,
      peso_liquido_kg = nullif(p_item ->> 'peso_liquido_kg', '')::numeric, peso_bruto_kg = nullif(p_item ->> 'peso_bruto_kg', '')::numeric,
      volume_m3 = nullif(p_item ->> 'volume_m3', '')::numeric, documento_id = nullif(p_item ->> 'documento_id', '')::uuid,
      codigo_fornecedor = nullif(p_item ->> 'codigo_fornecedor', ''), ncm = nullif(p_item ->> 'ncm', '')
     WHERE id = v_id AND operacao_id = o.id;
    IF NOT FOUND THEN RAISE EXCEPTION 'IMPORT_ITEM_NAO_ENCONTRADO'; END IF;
  END IF;
  PERFORM public._import_auditar(o.empresa_id, o.id, 'SALVAR', 'item', v_id, p_item);
  RETURN v_id;
END
$$;

-- Conferência de lançamento (despesa/tributo): marca CONFERIDO/PENDENTE, auditado.
CREATE OR REPLACE FUNCTION public.import_conferir_lancamento(p_operacao uuid, p_tipo text, p_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  o public.import_operacoes;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'IMPORT_AUTH' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('PENDENTE', 'CONFERIDO') THEN RAISE EXCEPTION 'IMPORT_STATUS_CONFERENCIA_INVALIDO'; END IF;
  -- Conferir não altera a entrada do cálculo: não incrementa versao_dados (não invalida a apuração).
  SELECT * INTO o FROM public.import_operacoes WHERE id = p_operacao FOR UPDATE;
  IF o.id IS NULL OR NOT public.fp_import_pode_operacao(p_operacao, ARRAY['DONO', 'GERENTE'])
     OR NOT public.fp_pode_operar_loja(o.loja_importadora_id, ARRAY['DONO', 'GERENTE']) THEN
    RAISE EXCEPTION 'IMPORT_NAO_AUTORIZADO' USING ERRCODE = '42501';
  END IF;
  IF o.status <> 'RASCUNHO' THEN RAISE EXCEPTION 'IMPORT_OPERACAO_NAO_EDITAVEL'; END IF;
  IF p_tipo = 'DESPESA' THEN
    UPDATE public.import_despesas SET status_conferencia = p_status WHERE id = p_id AND operacao_id = o.id;
  ELSIF p_tipo = 'TRIBUTO' THEN
    UPDATE public.import_tributos SET status_conferencia = p_status WHERE id = p_id AND operacao_id = o.id;
  ELSE
    RAISE EXCEPTION 'IMPORT_TIPO_LANCAMENTO_INVALIDO';
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'IMPORT_LANCAMENTO_NAO_ENCONTRADO'; END IF;
  PERFORM public._import_auditar(o.empresa_id, o.id, 'CONFERIR', lower(p_tipo), p_id, jsonb_build_object('status', p_status));
END
$$;

-- Despesa/tributo: preserva o status de conferência existente ao salvar (import_salvar_lancamento da F4
-- não conhece a coluna; o default PENDENTE vale para inserção). Alterar um lançamento conferido o
-- devolve para PENDENTE: conferência vale para o valor conferido.
CREATE OR REPLACE FUNCTION public.trg_import_lancamento_reconferir()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status_conferencia = OLD.status_conferencia
     AND (to_jsonb(NEW) - 'status_conferencia') IS DISTINCT FROM (to_jsonb(OLD) - 'status_conferencia') THEN
    NEW.status_conferencia := 'PENDENTE';
  END IF;
  RETURN NEW;
END
$$;
DROP TRIGGER IF EXISTS import_despesas_reconferir ON public.import_despesas;
CREATE TRIGGER import_despesas_reconferir BEFORE UPDATE ON public.import_despesas
  FOR EACH ROW EXECUTE FUNCTION public.trg_import_lancamento_reconferir();
DROP TRIGGER IF EXISTS import_tributos_reconferir ON public.import_tributos;
CREATE TRIGGER import_tributos_reconferir BEFORE UPDATE ON public.import_tributos
  FOR EACH ROW EXECUTE FUNCTION public.trg_import_lancamento_reconferir();

-- Listagem do hub: só operações que o usuário pode ler (mesma regra da RLS).
-- Valores monetários como TEXTO (numeric exato; o JSON numérico do PostgREST passaria por float).
DROP FUNCTION IF EXISTS public.import_listar_operacoes();
CREATE FUNCTION public.import_listar_operacoes()
RETURNS TABLE (
  id uuid, referencia text, status text, loja_importadora_id uuid, fornecedor_id uuid, fornecedor_nome text,
  moeda text, data_invoice date, criado_em timestamptz, atualizado_em timestamptz, n_itens bigint,
  ultima_apuracao_id uuid, ultima_apuracao_versao integer, ultima_apuracao_tipo text, ultima_apuracao_status text,
  ultima_apuracao_atual boolean, ultima_apuracao_bloqueantes bigint, ultima_apuracao_custo_total text,
  aprovada_custo_total text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'IMPORT_AUTH' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT o.id, o.referencia, o.status, o.loja_importadora_id, o.fornecedor_id, f.nome, o.moeda, o.data_invoice,
         o.criado_em, o.atualizado_em,
         (SELECT count(*) FROM public.import_itens i WHERE i.operacao_id = o.id),
         ua.id, ua.versao, ua.tipo, ua.status_calculo, ua.versao_dados = o.versao_dados,
         (SELECT count(*) FROM public.import_divergencias d WHERE d.apuracao_id = ua.id AND d.severidade = 'BLOQUEANTE'),
         (SELECT sum(ai.custo_total_brl)::text FROM public.import_apuracao_itens ai WHERE ai.apuracao_id = ua.id),
         (SELECT sum(ai.custo_total_brl)::text FROM public.import_apuracao_itens ai WHERE ai.apuracao_id = o.apuracao_aprovada_id)
    FROM public.import_operacoes o
    LEFT JOIN public.fornecedores f ON f.id = o.fornecedor_id
    LEFT JOIN LATERAL (SELECT a.* FROM public.import_apuracoes a WHERE a.operacao_id = o.id
                        ORDER BY a.versao DESC LIMIT 1) ua ON true
   WHERE public.fp_import_pode_operacao(o.id)
   ORDER BY o.atualizado_em DESC;
END
$$;

REVOKE ALL ON FUNCTION public.import_atualizar_operacao(uuid, jsonb), public.import_conferir_lancamento(uuid, text, uuid, text),
  public.import_listar_operacoes() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_atualizar_operacao(uuid, jsonb), public.import_conferir_lancamento(uuid, text, uuid, text),
  public.import_listar_operacoes() TO authenticated, service_role;

-- Aprovação (F4) + exigência de lançamentos conferidos.
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

-- A entrada do motor não muda: código do fornecedor, NCM, datas e conferência são documentais.
COMMIT;
