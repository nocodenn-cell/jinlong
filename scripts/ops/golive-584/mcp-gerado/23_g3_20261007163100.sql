-- golive-final-584 :: 20261007163100 ssot_003_nfe_obrigacao_duplicata :: sha256 fafa37eaf684d703ff21299b269fd8f11897d914322f02f207685828e5f4c8ca
BEGIN;
SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout = '180s';
DO $g$ BEGIN IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261007163100') THEN RAISE EXCEPTION 'GOLIVE_STOP: % já no histórico', '20261007163100'; END IF; END $g$;
-- SSOT-003 — reconhecimento explícito de obrigação financeira na NF-e.
--
-- Política (docs/regras-negocio/SSOT_AQUISICAO_OBRIGACAO_FINANCEIRA.md):
--   OC / remessa  → estoque sem obrigação (tipo_codigo ENTRADA_OC / ENTRADA_REMESSA_*)
--   NF-e confirm  → se valor econômico > 0, exige ≥1 duplicata; senão rejeita
--                   IMPORT_NFE_OBRIGACAO_SEM_DUPLICATA. Com duplicatas → AP+origem.
--
-- Não cria AP fictícia para OC/remessa.
-- Rollback: remover o bloco de guard desta migration (reaplicar confirmar anterior).


COMMENT ON FUNCTION public.receber_ordem_compra(uuid, jsonb, text, text) IS
  'UX-04 + SSOT-003: entrada física pelo pedido (ENTRADA_OC). Sem obrigação financeira '
  'nem AP — bem recebido sem título. Obrigação nasce só em confirmar_importacao_nfe com duplicatas.';

-- Substituição completa (corpo = 20261005225856 + guard SSOT-003).
CREATE OR REPLACE FUNCTION public.confirmar_importacao_nfe(p_importacao_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_remessa      uuid;
  v_uid          uuid := auth.uid();
  v_perfil       text;
  v_loja_usuario uuid;
  v_imp          record;
  v_it           record;
  v_dup          record;
  v_pendentes    int;
  v_oc           record;
  v_mov          uuid;
  v_obs          text;
  v_econ         numeric(14,2);
  v_n_dup        int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'IMPORT_NFE_AUTH';
  END IF;

  SELECT u.perfil, u.loja_id INTO v_perfil, v_loja_usuario
    FROM public.usuarios u WHERE u.id = v_uid;

  IF v_perfil IS NULL OR v_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN') THEN
    RAISE EXCEPTION 'IMPORT_NFE_PERFIL';
  END IF;

  SELECT id, loja_id, fornecedor_id, numero_nf, status, ordem_compra_id INTO v_imp
    FROM public.importacoes_nfe
   WHERE id = p_importacao_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'IMPORT_NFE_NAO_ENCONTRADA';
  END IF;

  IF v_perfil = 'GERENTE' AND v_loja_usuario IS DISTINCT FROM v_imp.loja_id THEN
    RAISE EXCEPTION 'IMPORT_NFE_LOJA';
  END IF;

  IF v_imp.status <> 'EM_CONFERENCIA' THEN
    RAISE EXCEPTION 'IMPORT_NFE_STATUS_INVALIDO';
  END IF;

  SELECT count(*) INTO v_pendentes
    FROM public.importacoes_nfe_itens
   WHERE importacao_nfe_id = p_importacao_id AND status_conferencia = 'EM_CONFERENCIA';

  IF v_pendentes > 0 THEN
    RAISE EXCEPTION 'IMPORT_NFE_CONFERENCIA_PENDENTE';
  END IF;

  SELECT remessa_id INTO v_remessa FROM public.entrada_documentos WHERE importacao_id=p_importacao_id;
  IF v_remessa IS NOT NULL THEN
    PERFORM public._validar_documento_entrega(p_importacao_id,v_remessa,v_imp.loja_id);
  END IF;

  IF v_remessa IS NULL AND v_imp.ordem_compra_id IS NOT NULL THEN
    SELECT oc.id, oc.loja_id, oc.status INTO v_oc
      FROM public.ordens_compra oc WHERE oc.id = v_imp.ordem_compra_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'OC_NAO_ENCONTRADA'; END IF;
    IF v_oc.loja_id IS DISTINCT FROM v_imp.loja_id THEN RAISE EXCEPTION 'OC_LOJA'; END IF;
    IF v_oc.status NOT IN ('CONFIRMADA', 'EM_TRANSITO') THEN RAISE EXCEPTION 'OC_STATUS_INVALIDO'; END IF;
  END IF;

  -- SSOT-003: bem com valor econômico exige reconhecimento de obrigação (duplicatas → AP).
  SELECT coalesce(sum(
           coalesce(quantidade_conferida, 0) * coalesce(custo_unitario, 0)
         ), 0)::numeric(14,2)
    INTO v_econ
    FROM public.importacoes_nfe_itens
   WHERE importacao_nfe_id = p_importacao_id;

  SELECT count(*)::int INTO v_n_dup
    FROM public.importacoes_nfe_duplicatas
   WHERE importacao_nfe_id = p_importacao_id;

  IF v_econ > 0 AND v_n_dup = 0 THEN
    RAISE EXCEPTION 'IMPORT_NFE_OBRIGACAO_SEM_DUPLICATA'
      USING DETAIL = format(
        'valor_economico=%s duplicatas=0 — confirme duplicatas ou registre entrada OC/remessa sem obrigação',
        v_econ
      );
  END IF;

  FOR v_it IN
    SELECT produto_id, quantidade_nfe, quantidade_conferida, custo_unitario, atualizar_custo, status_conferencia
      FROM public.importacoes_nfe_itens
     WHERE importacao_nfe_id = p_importacao_id
  LOOP
    IF v_remessa IS NULL AND v_it.quantidade_conferida IS NOT NULL AND v_it.quantidade_conferida > 0 THEN
      INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual, estoque_minimo, version)
      VALUES (v_it.produto_id, v_imp.loja_id, v_it.quantidade_conferida, 0, 1)
      ON CONFLICT (loja_id, produto_id) DO UPDATE
        SET quantidade_atual = public.estoque.quantidade_atual + EXCLUDED.quantidade_atual,
            version          = public.estoque.version + 1,
            updated_at       = now();

      v_obs := format('Importação NF-e %s (conferido%s)', p_importacao_id::text,
               CASE WHEN v_it.status_conferencia = 'DIVERGENTE' THEN ', divergente da nota' ELSE '' END);
      IF v_remessa IS NULL AND v_imp.ordem_compra_id IS NOT NULL THEN
        v_obs := v_obs || format(' · OC %s', v_imp.ordem_compra_id::text);
      END IF;

      INSERT INTO public.movimentos_estoque_log (
        loja_id, produto_id, tipo_codigo, quantidade_delta, usuario_id, observacao
      ) VALUES (
        v_imp.loja_id, v_it.produto_id, 'ENTRADA_NFE', v_it.quantidade_conferida, v_uid, v_obs
      ) RETURNING id INTO v_mov;

      IF v_remessa IS NULL AND v_imp.ordem_compra_id IS NOT NULL THEN
        PERFORM public._oc_abater_por_produto(
          v_imp.ordem_compra_id, v_imp.loja_id, v_uid, 'NFE', p_importacao_id, NULL, p_importacao_id,
          v_it.produto_id, v_it.quantidade_conferida, v_it.quantidade_nfe, v_mov, NULL, false
        );
      END IF;
    END IF;

    IF v_it.atualizar_custo AND v_it.custo_unitario > 0 THEN
      UPDATE public.produtos p
         SET preco_custo = v_it.custo_unitario,
             updated_at  = now()
       WHERE p.id = v_it.produto_id
         AND (
           p.permitir_abaixo_custo
           OR (
             (p.preco_varejo < v_it.custo_unitario) IS NOT TRUE
             AND (p.preco_atacado IS NULL OR p.preco_atacado >= v_it.custo_unitario)
           )
         );
    END IF;
  END LOOP;

  IF v_remessa IS NULL AND v_imp.ordem_compra_id IS NOT NULL THEN
    PERFORM public._oc_atualizar_estado(v_imp.ordem_compra_id);
  END IF;

  FOR v_dup IN
    SELECT numero_duplicata, data_vencimento, valor
      FROM public.importacoes_nfe_duplicatas
     WHERE importacao_nfe_id = p_importacao_id
  LOOP
    INSERT INTO public.contas_pagar (
      nfe_importacao_id, fornecedor_id, loja_id, nfe_numero, vencimento, valor_total, status
    ) VALUES (
      p_importacao_id, v_imp.fornecedor_id, v_imp.loja_id, v_imp.numero_nf,
      v_dup.data_vencimento, v_dup.valor, 'PENDENTE'
    );
  END LOOP;

  UPDATE public.importacoes_nfe
     SET status = 'CONCLUIDA'
   WHERE id = p_importacao_id;
END;
$$;

COMMENT ON FUNCTION public.confirmar_importacao_nfe(uuid) IS
  'SSOT-003: confirma NF-e. Estoque se sem remessa; AP por duplicata com nfe_importacao_id. '
  'Valor econômico > 0 sem duplicatas → IMPORT_NFE_OBRIGACAO_SEM_DUPLICATA. '
  'OC/remessa permanecem sem obrigação até este reconhecimento.';

REVOKE ALL ON FUNCTION public.confirmar_importacao_nfe(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirmar_importacao_nfe(uuid) TO authenticated, service_role;

DO $prova$
BEGIN
  IF position('IMPORT_NFE_OBRIGACAO_SEM_DUPLICATA' IN
       pg_get_functiondef('public.confirmar_importacao_nfe(uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'SSOT-003 PROVA FAIL: guard ausente';
  END IF;
  RAISE NOTICE 'SSOT-003 PROVA ESTRUTURAL OK';
END
$prova$;

NOTIFY pgrst, 'reload schema';
;
INSERT INTO supabase_migrations.schema_migrations(version, name, statements) VALUES ('20261007163100', 'ssot_003_nfe_obrigacao_duplicata', ARRAY[$golive_stmt_fafa37eaf684$-- SSOT-003 — reconhecimento explícito de obrigação financeira na NF-e.
--
-- Política (docs/regras-negocio/SSOT_AQUISICAO_OBRIGACAO_FINANCEIRA.md):
--   OC / remessa  → estoque sem obrigação (tipo_codigo ENTRADA_OC / ENTRADA_REMESSA_*)
--   NF-e confirm  → se valor econômico > 0, exige ≥1 duplicata; senão rejeita
--                   IMPORT_NFE_OBRIGACAO_SEM_DUPLICATA. Com duplicatas → AP+origem.
--
-- Não cria AP fictícia para OC/remessa.
-- Rollback: remover o bloco de guard desta migration (reaplicar confirmar anterior).

BEGIN;

COMMENT ON FUNCTION public.receber_ordem_compra(uuid, jsonb, text, text) IS
  'UX-04 + SSOT-003: entrada física pelo pedido (ENTRADA_OC). Sem obrigação financeira '
  'nem AP — bem recebido sem título. Obrigação nasce só em confirmar_importacao_nfe com duplicatas.';

-- Substituição completa (corpo = 20261005225856 + guard SSOT-003).
CREATE OR REPLACE FUNCTION public.confirmar_importacao_nfe(p_importacao_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_remessa      uuid;
  v_uid          uuid := auth.uid();
  v_perfil       text;
  v_loja_usuario uuid;
  v_imp          record;
  v_it           record;
  v_dup          record;
  v_pendentes    int;
  v_oc           record;
  v_mov          uuid;
  v_obs          text;
  v_econ         numeric(14,2);
  v_n_dup        int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'IMPORT_NFE_AUTH';
  END IF;

  SELECT u.perfil, u.loja_id INTO v_perfil, v_loja_usuario
    FROM public.usuarios u WHERE u.id = v_uid;

  IF v_perfil IS NULL OR v_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN') THEN
    RAISE EXCEPTION 'IMPORT_NFE_PERFIL';
  END IF;

  SELECT id, loja_id, fornecedor_id, numero_nf, status, ordem_compra_id INTO v_imp
    FROM public.importacoes_nfe
   WHERE id = p_importacao_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'IMPORT_NFE_NAO_ENCONTRADA';
  END IF;

  IF v_perfil = 'GERENTE' AND v_loja_usuario IS DISTINCT FROM v_imp.loja_id THEN
    RAISE EXCEPTION 'IMPORT_NFE_LOJA';
  END IF;

  IF v_imp.status <> 'EM_CONFERENCIA' THEN
    RAISE EXCEPTION 'IMPORT_NFE_STATUS_INVALIDO';
  END IF;

  SELECT count(*) INTO v_pendentes
    FROM public.importacoes_nfe_itens
   WHERE importacao_nfe_id = p_importacao_id AND status_conferencia = 'EM_CONFERENCIA';

  IF v_pendentes > 0 THEN
    RAISE EXCEPTION 'IMPORT_NFE_CONFERENCIA_PENDENTE';
  END IF;

  SELECT remessa_id INTO v_remessa FROM public.entrada_documentos WHERE importacao_id=p_importacao_id;
  IF v_remessa IS NOT NULL THEN
    PERFORM public._validar_documento_entrega(p_importacao_id,v_remessa,v_imp.loja_id);
  END IF;

  IF v_remessa IS NULL AND v_imp.ordem_compra_id IS NOT NULL THEN
    SELECT oc.id, oc.loja_id, oc.status INTO v_oc
      FROM public.ordens_compra oc WHERE oc.id = v_imp.ordem_compra_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'OC_NAO_ENCONTRADA'; END IF;
    IF v_oc.loja_id IS DISTINCT FROM v_imp.loja_id THEN RAISE EXCEPTION 'OC_LOJA'; END IF;
    IF v_oc.status NOT IN ('CONFIRMADA', 'EM_TRANSITO') THEN RAISE EXCEPTION 'OC_STATUS_INVALIDO'; END IF;
  END IF;

  -- SSOT-003: bem com valor econômico exige reconhecimento de obrigação (duplicatas → AP).
  SELECT coalesce(sum(
           coalesce(quantidade_conferida, 0) * coalesce(custo_unitario, 0)
         ), 0)::numeric(14,2)
    INTO v_econ
    FROM public.importacoes_nfe_itens
   WHERE importacao_nfe_id = p_importacao_id;

  SELECT count(*)::int INTO v_n_dup
    FROM public.importacoes_nfe_duplicatas
   WHERE importacao_nfe_id = p_importacao_id;

  IF v_econ > 0 AND v_n_dup = 0 THEN
    RAISE EXCEPTION 'IMPORT_NFE_OBRIGACAO_SEM_DUPLICATA'
      USING DETAIL = format(
        'valor_economico=%s duplicatas=0 — confirme duplicatas ou registre entrada OC/remessa sem obrigação',
        v_econ
      );
  END IF;

  FOR v_it IN
    SELECT produto_id, quantidade_nfe, quantidade_conferida, custo_unitario, atualizar_custo, status_conferencia
      FROM public.importacoes_nfe_itens
     WHERE importacao_nfe_id = p_importacao_id
  LOOP
    IF v_remessa IS NULL AND v_it.quantidade_conferida IS NOT NULL AND v_it.quantidade_conferida > 0 THEN
      INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual, estoque_minimo, version)
      VALUES (v_it.produto_id, v_imp.loja_id, v_it.quantidade_conferida, 0, 1)
      ON CONFLICT (loja_id, produto_id) DO UPDATE
        SET quantidade_atual = public.estoque.quantidade_atual + EXCLUDED.quantidade_atual,
            version          = public.estoque.version + 1,
            updated_at       = now();

      v_obs := format('Importação NF-e %s (conferido%s)', p_importacao_id::text,
               CASE WHEN v_it.status_conferencia = 'DIVERGENTE' THEN ', divergente da nota' ELSE '' END);
      IF v_remessa IS NULL AND v_imp.ordem_compra_id IS NOT NULL THEN
        v_obs := v_obs || format(' · OC %s', v_imp.ordem_compra_id::text);
      END IF;

      INSERT INTO public.movimentos_estoque_log (
        loja_id, produto_id, tipo_codigo, quantidade_delta, usuario_id, observacao
      ) VALUES (
        v_imp.loja_id, v_it.produto_id, 'ENTRADA_NFE', v_it.quantidade_conferida, v_uid, v_obs
      ) RETURNING id INTO v_mov;

      IF v_remessa IS NULL AND v_imp.ordem_compra_id IS NOT NULL THEN
        PERFORM public._oc_abater_por_produto(
          v_imp.ordem_compra_id, v_imp.loja_id, v_uid, 'NFE', p_importacao_id, NULL, p_importacao_id,
          v_it.produto_id, v_it.quantidade_conferida, v_it.quantidade_nfe, v_mov, NULL, false
        );
      END IF;
    END IF;

    IF v_it.atualizar_custo AND v_it.custo_unitario > 0 THEN
      UPDATE public.produtos p
         SET preco_custo = v_it.custo_unitario,
             updated_at  = now()
       WHERE p.id = v_it.produto_id
         AND (
           p.permitir_abaixo_custo
           OR (
             (p.preco_varejo < v_it.custo_unitario) IS NOT TRUE
             AND (p.preco_atacado IS NULL OR p.preco_atacado >= v_it.custo_unitario)
           )
         );
    END IF;
  END LOOP;

  IF v_remessa IS NULL AND v_imp.ordem_compra_id IS NOT NULL THEN
    PERFORM public._oc_atualizar_estado(v_imp.ordem_compra_id);
  END IF;

  FOR v_dup IN
    SELECT numero_duplicata, data_vencimento, valor
      FROM public.importacoes_nfe_duplicatas
     WHERE importacao_nfe_id = p_importacao_id
  LOOP
    INSERT INTO public.contas_pagar (
      nfe_importacao_id, fornecedor_id, loja_id, nfe_numero, vencimento, valor_total, status
    ) VALUES (
      p_importacao_id, v_imp.fornecedor_id, v_imp.loja_id, v_imp.numero_nf,
      v_dup.data_vencimento, v_dup.valor, 'PENDENTE'
    );
  END LOOP;

  UPDATE public.importacoes_nfe
     SET status = 'CONCLUIDA'
   WHERE id = p_importacao_id;
END;
$$;

COMMENT ON FUNCTION public.confirmar_importacao_nfe(uuid) IS
  'SSOT-003: confirma NF-e. Estoque se sem remessa; AP por duplicata com nfe_importacao_id. '
  'Valor econômico > 0 sem duplicatas → IMPORT_NFE_OBRIGACAO_SEM_DUPLICATA. '
  'OC/remessa permanecem sem obrigação até este reconhecimento.';

REVOKE ALL ON FUNCTION public.confirmar_importacao_nfe(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirmar_importacao_nfe(uuid) TO authenticated, service_role;

DO $prova$
BEGIN
  IF position('IMPORT_NFE_OBRIGACAO_SEM_DUPLICATA' IN
       pg_get_functiondef('public.confirmar_importacao_nfe(uuid)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'SSOT-003 PROVA FAIL: guard ausente';
  END IF;
  RAISE NOTICE 'SSOT-003 PROVA ESTRUTURAL OK';
END
$prova$;

NOTIFY pgrst, 'reload schema';
COMMIT;
$golive_stmt_fafa37eaf684$]);
DO $chk$ DECLARE v text; o bigint; BEGIN
  SELECT replace((SELECT (SELECT 'vendas:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(caixa_id,chave_nf,cliente_id,created_at,data,forma_pagamento,id,idempotency_key,numero_nf,operador_id,pricing_version_id,status,tipo_venda,total_bruto,total_desconto,total_liquido)::text) h FROM public.vendas) s)||' # '||(SELECT 'itens_venda:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(custo_unitario_snap,desconto_unitario,id,preco_unitario,preco_unitario_original,pricing_version_id,produto_id,promocao_desconto_percentual,promocao_nome_snapshot,promocao_regra_id,quantidade,regra_aplicada_id,tipo_preco,tipo_preco_fonte,venda_id)::text) h FROM public.itens_venda) s)||' # '||(SELECT 'vendas_pagamentos:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(created_at,forma_pagamento,id,valor,venda_id)::text) h FROM public.vendas_pagamentos) s)||' # '||(SELECT 'caixas:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(autorizado_por,conta_financeira_id,data_abertura,data_fechamento,fechamento_diferenca,fechamento_observacao,id,loja_id,motivo_retomada,operador_id,saldo_atual,status,turno_anterior_id,valor_fechamento,valor_inicial)::text) h FROM public.caixas) s)||' # '||(SELECT 'movimentacoes_caixa:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(caixa_id,created_at,deleted_at,device_id,forma_pagamento,gerente_id,id,idempotency_key,ip_address,loja_id,motivo,motivo_codigo,movimentacao_origem_id,numero_sequencial,operador_id,saldo_antes,saldo_depois,status,terminal_id,tipo,updated_at,user_agent,valor)::text) h FROM public.movimentacoes_caixa) s)||' # '||(SELECT 'estoque:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(estoque_minimo,id,loja_id,produto_id,quantidade_atual,updated_at,version)::text) h FROM public.estoque) s)||' # '||(SELECT 'produtos:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,atualizado_por,categoria_id,cest,cfop_produto,codigo_barras,codigo_interno,comissao_tipo,comissao_valor,created_at,criado_por,csosn,cst_cofins,cst_pis,estoque_minimo,fornecedor_id,icms_origem,id,imagem_url,limite_transferencia_sem_observacao,localizacao_prateleira,loja_id,marca_id,ncm,nome,nome_reduzido_pdv,nome_sem_acento,observacao,origem,permitir_abaixo_custo,preco_atacado,preco_custo,preco_custo_medio,preco_varejo,quantidade_gatilho_atacado,referencia_fornecedor,status_publicacao,tags,tem_nf,unidade_medida,updated_at)::text) h FROM public.produtos) s)||' # '||(SELECT 'usuarios:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,created_at,funcionario_id,id,idioma_preferido,loja_id,nome,perfil)::text) h FROM public.usuarios) s)||' # '||(SELECT 'clientes:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,consentimento_privacidade_em,created_at,documento,email,endereco,id,limite_credito,loja_id,nome,telefone,termos_aceitos_em,tipo)::text) h FROM public.clientes) s)||' # '||(SELECT 'lojas:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,cnae,cnpj,codigo,created_at,email,endereco_bairro,endereco_cep,endereco_cidade,endereco_complemento,endereco_logradouro,endereco_numero,endereco_uf,id,inscricao_estadual,logo_url,nome,nome_fantasia,numero_serie_nfce,numero_serie_nfe,razao_social,telefone)::text) h FROM public.lojas) s)||' # '||(SELECT 'formas_pagamento:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,codigo,created_at,id,loja_id,nome,prazo_compensacao_dias,taxa_percentual,updated_at)::text) h FROM public.formas_pagamento) s)||' # '||(SELECT 'contas_financeiras:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,created_at,criado_por,data_inicial,id,loja_id,nome,tipo)::text) h FROM public.contas_financeiras) s)||' # '||(SELECT 'contas_pagar:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(cancelamento_em,cancelamento_motivo,categoria_id,competencia,criado_em,descricao,favorecido,fornecedor_id,id,loja_id,lote_id,nfe_importacao_id,nfe_numero,observacao,parcela,status,valor_pago,valor_total,vencimento)::text) h FROM public.contas_pagar) s)||' # '||(SELECT 'contas_receber:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(categoria_id,cliente_id,competencia,created_at,descricao,id,loja_id,status,valor_aberto,valor_total,vencimento,venda_id)::text) h FROM public.contas_receber) s)||' # '||(SELECT 'pdv_config:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(alertas_leves_ativos,auto_enqueue_fiscal,blind_closure,cfop_padrao,cst_padrao,formato_impressao,gerente_id,gerente_senha_bcrypt,id,idioma_padrao,imprimir_cupom_auto,limite_sangria_sem_gerente,limite_transferencia_obs,loja_id,max_desconto_gerente_percentual,max_desconto_manual_item_percentual,max_desconto_total_percentual,modo_limite_credito,quantidade_minima_atacado_padrao,regime_tributario,show_margin_visual,show_preco_fonte,show_stock_alerts,tema_padrao)::text) h FROM public.pdv_config) s)||' # '||(SELECT 'documentos_fiscais_pendentes:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(chave_fiscal,correlation_id,created_at,deleted_at,fiscal_action_hint,fiscal_error_category,fiscal_error_code,fiscal_error_payload,fiscal_next_step_url,fiscal_retryable,id,payload,processado_em,protocolo,provider,provider_ref,proxima_tentativa_em,status,tentativas,tipo_doc,transicao_origem,ultima_tentativa_em,ultima_transicao_em,ultimo_erro,updated_at,venda_id,xml_armazenado_em,xml_lease_expires_em,xml_lease_token,xml_proxima_tentativa_em,xml_sha256,xml_status,xml_storage_path,xml_tentativas,xml_ultimo_erro)::text) h FROM public.documentos_fiscais_pendentes) s)||' # '||(SELECT 'totais:'||coalesce(string_agg(x,';' ORDER BY x),'') FROM (SELECT md5(l.id::text)||'|'||(SELECT count(*) FROM public.vendas v JOIN public.caixas c ON c.id=v.caixa_id WHERE c.loja_id=l.id)||'|'||(SELECT coalesce(sum(v.total_liquido),0) FROM public.vendas v JOIN public.caixas c ON c.id=v.caixa_id WHERE c.loja_id=l.id AND v.status<>'CANCELADA')||'|'||(SELECT coalesce(sum(p.valor),0) FROM public.vendas_pagamentos p JOIN public.vendas v ON v.id=p.venda_id JOIN public.caixas c ON c.id=v.caixa_id WHERE c.loja_id=l.id)||'|'||(SELECT coalesce(sum(saldo_atual),0) FROM public.caixas c WHERE c.loja_id=l.id)||'|'||(SELECT coalesce(round(sum(quantidade_atual),3),0) FROM public.estoque e WHERE e.loja_id=l.id) x FROM public.lojas l) z)), ' # ', chr(1)) INTO v;
  IF v IS DISTINCT FROM $b$vendas:260:5c1f5a5067490828724c7e6793e90486itens_venda:265:8c5a0c68d26d3683324ab4398a339663vendas_pagamentos:108:0a473fb3507497a004a8939017d6b319caixas:56:a6e57b48a99c3bfdc2ababb690273a69movimentacoes_caixa:11:2b75d41eb7791147043b68015c89c0bdestoque:152:8f192671704ed300a97bf971f5aee4a9produtos:155:ce12eba23be390e38a178815fc4775c7usuarios:11:c3771aebcbf5642fa549d05fcb882a47clientes:2:88eb3c9ee632ac0dbbe5a6eb00b1f5b0lojas:1:c9488d2a43396d63bb7b482208a72fceformas_pagamento:4:7e3fee7650f570993c242c9513012e19contas_financeiras:0:-contas_pagar:9:541b1dc81dc7b94c4658301b64af6585contas_receber:3:a8c78e9630e752753334b8b4bbf76cadpdv_config:2:56a096d60214c463df2cfcc6b5b9ef23documentos_fiscais_pendentes:42:638d9052af1666def9bd7513e9d8b809totais:b5381bb6313900060b277d41cd1d490c|260|19364.60|11048.90|14053.10|32304.095$b$ THEN RAISE EXCEPTION 'GOLIVE_STOP: totais/hashes divergem da baseline após 20261007163100: %', replace(v, chr(1), ' # '); END IF;
  WITH fk AS (SELECT c.conrelid::regclass filho, c.confrelid::regclass pai,
 (SELECT string_agg(format('f.%I = p.%I', af.attname, ap.attname), ' AND ' ORDER BY k.i) FROM unnest(c.conkey, c.confkey) WITH ORDINALITY k(fc, pc, i) JOIN pg_attribute af ON af.attrelid=c.conrelid AND af.attnum=k.fc JOIN pg_attribute ap ON ap.attrelid=c.confrelid AND ap.attnum=k.pc) cond,
 (SELECT string_agg(format('f.%I IS NOT NULL', af.attname), ' AND ') FROM unnest(c.conkey) k(fc) JOIN pg_attribute af ON af.attrelid=c.conrelid AND af.attnum=k.fc) nn
 FROM pg_constraint c WHERE c.contype='f' AND c.connamespace IN ('public'::regnamespace) )
SELECT count(*) FILTER (WHERE (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) c FROM %s f WHERE %s AND NOT EXISTS (SELECT 1 FROM %s p WHERE %s)', filho, nn, pai, cond), false, true, '')))[1]::text::bigint > 0) FROM fk INTO o;
  IF o <> 0 THEN RAISE EXCEPTION 'GOLIVE_STOP: % FK(s) com órfãos após 20261007163100', o; END IF;
  IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261007163100' AND name='ssot_003_nfe_obrigacao_duplicata') THEN RAISE EXCEPTION 'GOLIVE_STOP: linha de histórico ausente 20261007163100'; END IF;
END $chk$;
COMMIT;
