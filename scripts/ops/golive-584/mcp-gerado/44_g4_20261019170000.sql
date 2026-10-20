-- golive-final-584 :: 20261019170000 multiempresa_fase5_catalogo_empresa :: sha256 63102fc475069f7f5f6291f75331ae7a7a0adbab0dc1dfd400fee6d73004ce22
BEGIN;
SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout = '180s';
DO $g$ BEGIN IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261019170000') THEN RAISE EXCEPTION 'GOLIVE_STOP: % já no histórico', '20261019170000'; END IF; END $g$;
-- Multiempresa — fase 5: catálogo de produtos por EMPRESA (correção de regressão do cliente 1).
--
-- Problema: produtos.loja_id é NOT NULL com default = loja matriz; o catálogo é compartilhado
-- pelas lojas da empresa (o estoque é que é por loja). As guardas/envelopes das fases 2–4
-- exigiam acesso à loja DO PRODUTO ⇒ usuário vinculado só a uma filial perdia o catálogo,
-- não vendia/baixava estoque nem transferia. Também: transferir_estoque_seguro exigia acesso
-- à loja de DESTINO (gerente da matriz não transferia para filial).
--
-- Correção (aditiva e reversível — rollback/20261019170000_...rollback.sql):
--  * produto é visível/operável por quem tem acesso à EMPRESA da loja dona do produto;
--  * guardas de produtos, precos_atacado, historico_precos_produto, historico_tiers_crud;
--  * envelopes de RPC com p_produto_id passam a usar public.fp_assert_produto;
--  * transferir_estoque_seguro: exige origem + mesma empresa (destino não precisa estar no escopo).
--  * fp_assert_loja (envelopes): só recusa loja de OUTRA EMPRESA. Dentro da mesma empresa o corpo
--    original decide, com os mesmos códigos de erro de antes (cliente 1 inalterado).
-- Originais guardados em internal.fp_fase5_guardas / internal.fp_fase5_envelopes.

CREATE OR REPLACE VIEW fp_guarda.produto_empresa AS
  SELECT p.id, l.empresa_id FROM public.produtos p JOIN public.lojas l ON l.id = p.loja_id;
REVOKE ALL ON fp_guarda.produto_empresa FROM PUBLIC;
GRANT SELECT ON fp_guarda.produto_empresa TO authenticated;

CREATE OR REPLACE FUNCTION internal.fp_empresa_usuario_legado()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  -- empresa da loja LEGADA do chamador (usuarios.loja_id, ativo ou não). Cobre usuário inativo e
  -- usuário sem vínculo sincronizado: o envelope deixa o corpo original decidir com o código de
  -- antes (ex.: LIQUIDACAO_PERFIL), sem nunca abrir outra empresa.
  SELECT l.empresa_id FROM public.usuarios u JOIN public.lojas l ON l.id = u.loja_id
   WHERE u.id = (SELECT auth.uid());
$fn$;
REVOKE ALL ON FUNCTION internal.fp_empresa_usuario_legado() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION internal.fp_empresa_usuario_legado() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fp_assert_produto(p_produto uuid, p_rotulo text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_empresa uuid; v_existe boolean;
BEGIN
  IF internal.fp_contexto_servidor() OR p_produto IS NULL THEN RETURN true; END IF;
  IF auth.uid() IS NULL THEN RETURN true; END IF; -- sem identidade: o corpo original recusa
  SELECT true, l.empresa_id INTO v_existe, v_empresa
    FROM public.produtos p LEFT JOIN public.lojas l ON l.id = p.loja_id WHERE p.id = p_produto;
  IF v_existe IS NULL THEN RETURN true; END IF; -- inexistente: o corpo original decide
  IF public.fp_admin_legado() OR v_empresa = ANY (public.fp_empresas_arr())
     OR v_empresa = internal.fp_empresa_usuario_legado() THEN RETURN true; END IF;
  RAISE EXCEPTION 'ACESSO_LOJA_NEGADO: %', p_rotulo USING ERRCODE = '42501';
END $$;
REVOKE ALL ON FUNCTION public.fp_assert_produto(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fp_assert_produto(uuid, text) TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS internal.fp_fase5_guardas (
  tabela text PRIMARY KEY, qual text, with_check text, em timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS internal.fp_fase5_envelopes (
  assinatura text PRIMARY KEY, definicao_original text NOT NULL, em timestamptz NOT NULL DEFAULT now());

INSERT INTO internal.fp_fase5_envelopes (assinatura, definicao_original)
  SELECT 'public.fp_assert_loja(uuid, boolean, text)', pg_get_functiondef('public.fp_assert_loja(uuid, boolean, text)'::regprocedure)
  ON CONFLICT (assinatura) DO NOTHING;

CREATE OR REPLACE FUNCTION public.fp_assert_loja(p_loja uuid, p_direta boolean, p_rotulo text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
BEGIN
  IF internal.fp_contexto_servidor() THEN RETURN true; END IF;
  -- sem identidade (authenticated sem sub): o corpo original recusa, como antes (c1 garante a checagem)
  IF auth.uid() IS NULL THEN RETURN true; END IF;
  IF p_loja IS NULL THEN
    IF NOT p_direta THEN RETURN true; END IF; -- entidade inexistente: o corpo original decide (não-encontrado)
    IF public.fp_admin_legado() OR ((SELECT count(*) FROM public.empresas) <= 1 AND public.fp_pode_loja_nula(NULL)) THEN
      RETURN true;
    END IF;
    RAISE EXCEPTION 'ACESSO_LOJA_OBRIGATORIA: %', p_rotulo USING ERRCODE = '42501';
  END IF;
  -- loja no escopo, ADMIN legado, ou loja da MESMA empresa (o corpo original aplica as regras por loja)
  IF public.fp_pode_loja(p_loja, NULL)
     OR public.fp_empresa_da_loja(p_loja) = ANY (public.fp_empresas_arr())
     OR public.fp_empresa_da_loja(p_loja) = internal.fp_empresa_usuario_legado() THEN
    RETURN true;
  END IF;
  -- loja inexistente: o corpo original decide (não-encontrado), como antes
  IF NOT EXISTS (SELECT 1 FROM public.lojas WHERE id = p_loja) THEN RETURN true; END IF;
  RAISE EXCEPTION 'ACESSO_LOJA_NEGADO: %', p_rotulo USING ERRCODE = '42501';
END $fn$;

DO $$
DECLARE
  r record; v_expr text; v_def text; v_novo text;
  c_emp constant text := 'COALESCE(%s IN (SELECT pe.id FROM fp_guarda.produto_empresa pe WHERE pe.empresa_id = ANY ((SELECT public.fp_empresas_arr())::uuid[])), false)';
  c_adm constant text := '(SELECT public.fp_admin_legado())';
BEGIN
  -- 1) Guardas
  FOR r IN SELECT p.tablename, p.qual, p.with_check FROM pg_policies p
            WHERE p.schemaname = 'public' AND p.policyname = 'tenant_guard'
              AND p.tablename IN ('produtos', 'precos_atacado', 'historico_precos_produto', 'historico_tiers_crud') LOOP
    v_expr := CASE r.tablename
      WHEN 'produtos' THEN format(c_emp, 'id') || ' OR ' || c_adm
      WHEN 'precos_atacado' THEN '(' || format(c_emp, 'produto_id') || ' OR ' || c_adm || ') AND (loja_id IS NULL OR '
           || 'COALESCE(loja_id = ANY ((SELECT public.fp_lojas_permitidas_arr())::uuid[]), false) OR ' || c_adm || ')'
      ELSE '(produto_id IS NULL AND (SELECT public.fp_pode_loja_nula(NULL::uuid))) OR '
           || format(c_emp, 'produto_id') || ' OR ' || c_adm END;
    INSERT INTO internal.fp_fase5_guardas (tabela, qual, with_check) VALUES (r.tablename, r.qual, r.with_check)
      ON CONFLICT (tabela) DO NOTHING; -- reexecução preserva o original
    EXECUTE format('ALTER POLICY tenant_guard ON public.%I USING (%s)%s', r.tablename, v_expr,
      CASE WHEN r.with_check IS NOT NULL THEN format(' WITH CHECK (%s)', v_expr) ELSE '' END);
  END LOOP;

  -- 2) Envelopes de RPC
  FOR r IN SELECT e.assinatura, p.oid FROM internal.fp_rpc_envelopes e
             JOIN pg_proc p ON p.pronamespace = 'public'::regnamespace
              AND format('public.%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid)) = e.assinatura
            WHERE e.checagens ILIKE '%fp_loja_de(''produto''%' OR e.nome = 'transferir_estoque_seguro' LOOP
    v_def := pg_get_functiondef(r.oid);
    v_novo := regexp_replace(v_def,
      'public\.fp_assert_loja\(public\.fp_loja_de\(''produto'', (\w+)\), false, (''[^'']*'')\)',
      'public.fp_assert_produto(\1, \2)', 'g');
    v_novo := regexp_replace(v_novo,
      'public\.fp_assert_loja\((p_loja_destino(_id)?), true, ''[^'']*''\) AND ', '', 'g');
    IF v_novo <> v_def THEN
      INSERT INTO internal.fp_fase5_envelopes (assinatura, definicao_original) VALUES (r.assinatura, v_def)
        ON CONFLICT (assinatura) DO NOTHING;
      EXECUTE v_novo;
    END IF;
  END LOOP;
END $$;
;
INSERT INTO supabase_migrations.schema_migrations(version, name, statements) VALUES ('20261019170000', 'multiempresa_fase5_catalogo_empresa', ARRAY[$golive_stmt_63102fc47506$-- Multiempresa — fase 5: catálogo de produtos por EMPRESA (correção de regressão do cliente 1).
--
-- Problema: produtos.loja_id é NOT NULL com default = loja matriz; o catálogo é compartilhado
-- pelas lojas da empresa (o estoque é que é por loja). As guardas/envelopes das fases 2–4
-- exigiam acesso à loja DO PRODUTO ⇒ usuário vinculado só a uma filial perdia o catálogo,
-- não vendia/baixava estoque nem transferia. Também: transferir_estoque_seguro exigia acesso
-- à loja de DESTINO (gerente da matriz não transferia para filial).
--
-- Correção (aditiva e reversível — rollback/20261019170000_...rollback.sql):
--  * produto é visível/operável por quem tem acesso à EMPRESA da loja dona do produto;
--  * guardas de produtos, precos_atacado, historico_precos_produto, historico_tiers_crud;
--  * envelopes de RPC com p_produto_id passam a usar public.fp_assert_produto;
--  * transferir_estoque_seguro: exige origem + mesma empresa (destino não precisa estar no escopo).
--  * fp_assert_loja (envelopes): só recusa loja de OUTRA EMPRESA. Dentro da mesma empresa o corpo
--    original decide, com os mesmos códigos de erro de antes (cliente 1 inalterado).
-- Originais guardados em internal.fp_fase5_guardas / internal.fp_fase5_envelopes.

CREATE OR REPLACE VIEW fp_guarda.produto_empresa AS
  SELECT p.id, l.empresa_id FROM public.produtos p JOIN public.lojas l ON l.id = p.loja_id;
REVOKE ALL ON fp_guarda.produto_empresa FROM PUBLIC;
GRANT SELECT ON fp_guarda.produto_empresa TO authenticated;

CREATE OR REPLACE FUNCTION internal.fp_empresa_usuario_legado()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  -- empresa da loja LEGADA do chamador (usuarios.loja_id, ativo ou não). Cobre usuário inativo e
  -- usuário sem vínculo sincronizado: o envelope deixa o corpo original decidir com o código de
  -- antes (ex.: LIQUIDACAO_PERFIL), sem nunca abrir outra empresa.
  SELECT l.empresa_id FROM public.usuarios u JOIN public.lojas l ON l.id = u.loja_id
   WHERE u.id = (SELECT auth.uid());
$fn$;
REVOKE ALL ON FUNCTION internal.fp_empresa_usuario_legado() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION internal.fp_empresa_usuario_legado() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fp_assert_produto(p_produto uuid, p_rotulo text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_empresa uuid; v_existe boolean;
BEGIN
  IF internal.fp_contexto_servidor() OR p_produto IS NULL THEN RETURN true; END IF;
  IF auth.uid() IS NULL THEN RETURN true; END IF; -- sem identidade: o corpo original recusa
  SELECT true, l.empresa_id INTO v_existe, v_empresa
    FROM public.produtos p LEFT JOIN public.lojas l ON l.id = p.loja_id WHERE p.id = p_produto;
  IF v_existe IS NULL THEN RETURN true; END IF; -- inexistente: o corpo original decide
  IF public.fp_admin_legado() OR v_empresa = ANY (public.fp_empresas_arr())
     OR v_empresa = internal.fp_empresa_usuario_legado() THEN RETURN true; END IF;
  RAISE EXCEPTION 'ACESSO_LOJA_NEGADO: %', p_rotulo USING ERRCODE = '42501';
END $$;
REVOKE ALL ON FUNCTION public.fp_assert_produto(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fp_assert_produto(uuid, text) TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS internal.fp_fase5_guardas (
  tabela text PRIMARY KEY, qual text, with_check text, em timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS internal.fp_fase5_envelopes (
  assinatura text PRIMARY KEY, definicao_original text NOT NULL, em timestamptz NOT NULL DEFAULT now());

INSERT INTO internal.fp_fase5_envelopes (assinatura, definicao_original)
  SELECT 'public.fp_assert_loja(uuid, boolean, text)', pg_get_functiondef('public.fp_assert_loja(uuid, boolean, text)'::regprocedure)
  ON CONFLICT (assinatura) DO NOTHING;

CREATE OR REPLACE FUNCTION public.fp_assert_loja(p_loja uuid, p_direta boolean, p_rotulo text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
BEGIN
  IF internal.fp_contexto_servidor() THEN RETURN true; END IF;
  -- sem identidade (authenticated sem sub): o corpo original recusa, como antes (c1 garante a checagem)
  IF auth.uid() IS NULL THEN RETURN true; END IF;
  IF p_loja IS NULL THEN
    IF NOT p_direta THEN RETURN true; END IF; -- entidade inexistente: o corpo original decide (não-encontrado)
    IF public.fp_admin_legado() OR ((SELECT count(*) FROM public.empresas) <= 1 AND public.fp_pode_loja_nula(NULL)) THEN
      RETURN true;
    END IF;
    RAISE EXCEPTION 'ACESSO_LOJA_OBRIGATORIA: %', p_rotulo USING ERRCODE = '42501';
  END IF;
  -- loja no escopo, ADMIN legado, ou loja da MESMA empresa (o corpo original aplica as regras por loja)
  IF public.fp_pode_loja(p_loja, NULL)
     OR public.fp_empresa_da_loja(p_loja) = ANY (public.fp_empresas_arr())
     OR public.fp_empresa_da_loja(p_loja) = internal.fp_empresa_usuario_legado() THEN
    RETURN true;
  END IF;
  -- loja inexistente: o corpo original decide (não-encontrado), como antes
  IF NOT EXISTS (SELECT 1 FROM public.lojas WHERE id = p_loja) THEN RETURN true; END IF;
  RAISE EXCEPTION 'ACESSO_LOJA_NEGADO: %', p_rotulo USING ERRCODE = '42501';
END $fn$;

DO $$
DECLARE
  r record; v_expr text; v_def text; v_novo text;
  c_emp constant text := 'COALESCE(%s IN (SELECT pe.id FROM fp_guarda.produto_empresa pe WHERE pe.empresa_id = ANY ((SELECT public.fp_empresas_arr())::uuid[])), false)';
  c_adm constant text := '(SELECT public.fp_admin_legado())';
BEGIN
  -- 1) Guardas
  FOR r IN SELECT p.tablename, p.qual, p.with_check FROM pg_policies p
            WHERE p.schemaname = 'public' AND p.policyname = 'tenant_guard'
              AND p.tablename IN ('produtos', 'precos_atacado', 'historico_precos_produto', 'historico_tiers_crud') LOOP
    v_expr := CASE r.tablename
      WHEN 'produtos' THEN format(c_emp, 'id') || ' OR ' || c_adm
      WHEN 'precos_atacado' THEN '(' || format(c_emp, 'produto_id') || ' OR ' || c_adm || ') AND (loja_id IS NULL OR '
           || 'COALESCE(loja_id = ANY ((SELECT public.fp_lojas_permitidas_arr())::uuid[]), false) OR ' || c_adm || ')'
      ELSE '(produto_id IS NULL AND (SELECT public.fp_pode_loja_nula(NULL::uuid))) OR '
           || format(c_emp, 'produto_id') || ' OR ' || c_adm END;
    INSERT INTO internal.fp_fase5_guardas (tabela, qual, with_check) VALUES (r.tablename, r.qual, r.with_check)
      ON CONFLICT (tabela) DO NOTHING; -- reexecução preserva o original
    EXECUTE format('ALTER POLICY tenant_guard ON public.%I USING (%s)%s', r.tablename, v_expr,
      CASE WHEN r.with_check IS NOT NULL THEN format(' WITH CHECK (%s)', v_expr) ELSE '' END);
  END LOOP;

  -- 2) Envelopes de RPC
  FOR r IN SELECT e.assinatura, p.oid FROM internal.fp_rpc_envelopes e
             JOIN pg_proc p ON p.pronamespace = 'public'::regnamespace
              AND format('public.%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid)) = e.assinatura
            WHERE e.checagens ILIKE '%fp_loja_de(''produto''%' OR e.nome = 'transferir_estoque_seguro' LOOP
    v_def := pg_get_functiondef(r.oid);
    v_novo := regexp_replace(v_def,
      'public\.fp_assert_loja\(public\.fp_loja_de\(''produto'', (\w+)\), false, (''[^'']*'')\)',
      'public.fp_assert_produto(\1, \2)', 'g');
    v_novo := regexp_replace(v_novo,
      'public\.fp_assert_loja\((p_loja_destino(_id)?), true, ''[^'']*''\) AND ', '', 'g');
    IF v_novo <> v_def THEN
      INSERT INTO internal.fp_fase5_envelopes (assinatura, definicao_original) VALUES (r.assinatura, v_def)
        ON CONFLICT (assinatura) DO NOTHING;
      EXECUTE v_novo;
    END IF;
  END LOOP;
END $$;
$golive_stmt_63102fc47506$]);
DO $chk$ DECLARE v text; o bigint; BEGIN
  SELECT replace((SELECT (SELECT 'vendas:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(caixa_id,chave_nf,cliente_id,created_at,data,forma_pagamento,id,idempotency_key,numero_nf,operador_id,pricing_version_id,status,tipo_venda,total_bruto,total_desconto,total_liquido)::text) h FROM public.vendas) s)||' # '||(SELECT 'itens_venda:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(custo_unitario_snap,desconto_unitario,id,preco_unitario,preco_unitario_original,pricing_version_id,produto_id,promocao_desconto_percentual,promocao_nome_snapshot,promocao_regra_id,quantidade,regra_aplicada_id,tipo_preco,tipo_preco_fonte,venda_id)::text) h FROM public.itens_venda) s)||' # '||(SELECT 'vendas_pagamentos:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(created_at,forma_pagamento,id,valor,venda_id)::text) h FROM public.vendas_pagamentos) s)||' # '||(SELECT 'caixas:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(autorizado_por,conta_financeira_id,data_abertura,data_fechamento,fechamento_diferenca,fechamento_observacao,id,loja_id,motivo_retomada,operador_id,saldo_atual,status,turno_anterior_id,valor_fechamento,valor_inicial)::text) h FROM public.caixas) s)||' # '||(SELECT 'movimentacoes_caixa:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(caixa_id,created_at,deleted_at,device_id,forma_pagamento,gerente_id,id,idempotency_key,ip_address,loja_id,motivo,motivo_codigo,movimentacao_origem_id,numero_sequencial,operador_id,saldo_antes,saldo_depois,status,terminal_id,tipo,updated_at,user_agent,valor)::text) h FROM public.movimentacoes_caixa) s)||' # '||(SELECT 'estoque:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(estoque_minimo,id,loja_id,produto_id,quantidade_atual,updated_at,version)::text) h FROM public.estoque) s)||' # '||(SELECT 'produtos:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,atualizado_por,categoria_id,cest,cfop_produto,codigo_barras,codigo_interno,comissao_tipo,comissao_valor,created_at,criado_por,csosn,cst_cofins,cst_pis,estoque_minimo,fornecedor_id,icms_origem,id,imagem_url,limite_transferencia_sem_observacao,localizacao_prateleira,loja_id,marca_id,ncm,nome,nome_reduzido_pdv,nome_sem_acento,observacao,origem,permitir_abaixo_custo,preco_atacado,preco_custo,preco_custo_medio,preco_varejo,quantidade_gatilho_atacado,referencia_fornecedor,status_publicacao,tags,tem_nf,unidade_medida,updated_at)::text) h FROM public.produtos) s)||' # '||(SELECT 'usuarios:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,created_at,funcionario_id,id,idioma_preferido,loja_id,nome,perfil)::text) h FROM public.usuarios) s)||' # '||(SELECT 'clientes:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,consentimento_privacidade_em,created_at,documento,email,endereco,id,limite_credito,loja_id,nome,telefone,termos_aceitos_em,tipo)::text) h FROM public.clientes) s)||' # '||(SELECT 'lojas:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,cnae,cnpj,codigo,created_at,email,endereco_bairro,endereco_cep,endereco_cidade,endereco_complemento,endereco_logradouro,endereco_numero,endereco_uf,id,inscricao_estadual,logo_url,nome,nome_fantasia,numero_serie_nfce,numero_serie_nfe,razao_social,telefone)::text) h FROM public.lojas) s)||' # '||(SELECT 'formas_pagamento:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,codigo,created_at,id,loja_id,nome,prazo_compensacao_dias,taxa_percentual,updated_at)::text) h FROM public.formas_pagamento) s)||' # '||(SELECT 'contas_financeiras:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(ativo,created_at,criado_por,data_inicial,id,loja_id,nome,tipo)::text) h FROM public.contas_financeiras) s)||' # '||(SELECT 'contas_pagar:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(cancelamento_em,cancelamento_motivo,categoria_id,competencia,criado_em,descricao,favorecido,fornecedor_id,id,loja_id,lote_id,nfe_importacao_id,nfe_numero,observacao,parcela,status,valor_pago,valor_total,vencimento)::text) h FROM public.contas_pagar) s)||' # '||(SELECT 'contas_receber:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(categoria_id,cliente_id,competencia,created_at,descricao,id,loja_id,status,valor_aberto,valor_total,vencimento,venda_id)::text) h FROM public.contas_receber) s)||' # '||(SELECT 'pdv_config:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(alertas_leves_ativos,auto_enqueue_fiscal,blind_closure,cfop_padrao,cst_padrao,formato_impressao,gerente_id,gerente_senha_bcrypt,id,idioma_padrao,imprimir_cupom_auto,limite_sangria_sem_gerente,limite_transferencia_obs,loja_id,max_desconto_gerente_percentual,max_desconto_manual_item_percentual,max_desconto_total_percentual,modo_limite_credito,quantidade_minima_atacado_padrao,regime_tributario,show_margin_visual,show_preco_fonte,show_stock_alerts,tema_padrao)::text) h FROM public.pdv_config) s)||' # '||(SELECT 'documentos_fiscais_pendentes:'||count(*)||':'||coalesce(md5(string_agg(h,'' ORDER BY h)),'-') FROM (SELECT md5(ROW(chave_fiscal,correlation_id,created_at,deleted_at,fiscal_action_hint,fiscal_error_category,fiscal_error_code,fiscal_error_payload,fiscal_next_step_url,fiscal_retryable,id,payload,processado_em,protocolo,provider,provider_ref,proxima_tentativa_em,status,tentativas,tipo_doc,transicao_origem,ultima_tentativa_em,ultima_transicao_em,ultimo_erro,updated_at,venda_id,xml_armazenado_em,xml_lease_expires_em,xml_lease_token,xml_proxima_tentativa_em,xml_sha256,xml_status,xml_storage_path,xml_tentativas,xml_ultimo_erro)::text) h FROM public.documentos_fiscais_pendentes) s)||' # '||(SELECT 'totais:'||coalesce(string_agg(x,';' ORDER BY x),'') FROM (SELECT md5(l.id::text)||'|'||(SELECT count(*) FROM public.vendas v JOIN public.caixas c ON c.id=v.caixa_id WHERE c.loja_id=l.id)||'|'||(SELECT coalesce(sum(v.total_liquido),0) FROM public.vendas v JOIN public.caixas c ON c.id=v.caixa_id WHERE c.loja_id=l.id AND v.status<>'CANCELADA')||'|'||(SELECT coalesce(sum(p.valor),0) FROM public.vendas_pagamentos p JOIN public.vendas v ON v.id=p.venda_id JOIN public.caixas c ON c.id=v.caixa_id WHERE c.loja_id=l.id)||'|'||(SELECT coalesce(sum(saldo_atual),0) FROM public.caixas c WHERE c.loja_id=l.id)||'|'||(SELECT coalesce(round(sum(quantidade_atual),3),0) FROM public.estoque e WHERE e.loja_id=l.id) x FROM public.lojas l) z)), ' # ', chr(1)) INTO v;
  IF v IS DISTINCT FROM $b$vendas:268:d91380e73abcf09a1086cba6e9aa094eitens_venda:266:db402eee5f6d7957110757600882edccvendas_pagamentos:201:3432d6d312e6f6f24ea9612a7257e235caixas:58:1b639b4221cdfaf9bfcc3ebf5660fbedmovimentacoes_caixa:0:-estoque:158:061c9e8da8142a531eb8d0728e3b4b15produtos:161:8fba5ff547239f94467b7a2126222120usuarios:13:2acdeaaf217d2571a434f8e8ff767aa2clientes:0:-lojas:4:812269b5692f7006f88ec49b088e9c36formas_pagamento:16:c1bbdbff97007016877776ad56afcccccontas_financeiras:0:-contas_pagar:2:2567d13b490befeaf7cc8bf48d01cfe1contas_receber:0:-pdv_config:1:899f43bdba711cfddea47afd00c8b21adocumentos_fiscais_pendentes:0:-totais:528f99d0e010f11ef321f548d3a7b51c|0|0|0|0|20.000;7ab49c7a91a109170b7e57fef3243a59|2|100.00|0|100.00|0.000;86641fb0d5893caebab1d0b38f0ef759|0|0|0|0|0;b5381bb6313900060b277d41cd1d490c|266|49013.80|38569.80|6500.00|284546.000$b$ THEN RAISE EXCEPTION 'GOLIVE_STOP: totais/hashes divergem da baseline após 20261019170000: %', replace(v, chr(1), ' # '); END IF;
  WITH fk AS (SELECT c.conrelid::regclass filho, c.confrelid::regclass pai,
 (SELECT string_agg(format('f.%I = p.%I', af.attname, ap.attname), ' AND ' ORDER BY k.i) FROM unnest(c.conkey, c.confkey) WITH ORDINALITY k(fc, pc, i) JOIN pg_attribute af ON af.attrelid=c.conrelid AND af.attnum=k.fc JOIN pg_attribute ap ON ap.attrelid=c.confrelid AND ap.attnum=k.pc) cond,
 (SELECT string_agg(format('f.%I IS NOT NULL', af.attname), ' AND ') FROM unnest(c.conkey) k(fc) JOIN pg_attribute af ON af.attrelid=c.conrelid AND af.attnum=k.fc) nn
 FROM pg_constraint c WHERE c.contype='f' AND c.connamespace IN ('public'::regnamespace) )
SELECT count(*) FILTER (WHERE (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) c FROM %s f WHERE %s AND NOT EXISTS (SELECT 1 FROM %s p WHERE %s)', filho, nn, pai, cond), false, true, '')))[1]::text::bigint > 0) FROM fk INTO o;
  IF o <> 0 THEN RAISE EXCEPTION 'GOLIVE_STOP: % FK(s) com órfãos após 20261019170000', o; END IF;
  IF NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261019170000' AND name='multiempresa_fase5_catalogo_empresa') THEN RAISE EXCEPTION 'GOLIVE_STOP: linha de histórico ausente 20261019170000'; END IF;
END $chk$;
COMMIT;
