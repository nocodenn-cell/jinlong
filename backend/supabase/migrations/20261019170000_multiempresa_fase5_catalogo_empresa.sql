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
-- Originais guardados em internal.fp_fase5_guardas / internal.fp_fase5_envelopes.

CREATE OR REPLACE VIEW fp_guarda.produto_empresa AS
  SELECT p.id, l.empresa_id FROM public.produtos p JOIN public.lojas l ON l.id = p.loja_id;
REVOKE ALL ON fp_guarda.produto_empresa FROM PUBLIC;
GRANT SELECT ON fp_guarda.produto_empresa TO authenticated;

CREATE OR REPLACE FUNCTION public.fp_assert_produto(p_produto uuid, p_rotulo text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_empresa uuid; v_existe boolean;
BEGIN
  IF internal.fp_contexto_servidor() OR p_produto IS NULL THEN RETURN true; END IF;
  SELECT true, l.empresa_id INTO v_existe, v_empresa
    FROM public.produtos p LEFT JOIN public.lojas l ON l.id = p.loja_id WHERE p.id = p_produto;
  IF v_existe IS NULL THEN RETURN true; END IF; -- inexistente: o corpo original decide
  IF public.fp_admin_legado() OR v_empresa = ANY (public.fp_empresas_arr()) THEN RETURN true; END IF;
  RAISE EXCEPTION 'ACESSO_LOJA_NEGADO: %', p_rotulo USING ERRCODE = '42501';
END $$;
REVOKE ALL ON FUNCTION public.fp_assert_produto(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fp_assert_produto(uuid, text) TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS internal.fp_fase5_guardas (
  tabela text PRIMARY KEY, qual text, with_check text, em timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS internal.fp_fase5_envelopes (
  assinatura text PRIMARY KEY, definicao_original text NOT NULL, em timestamptz NOT NULL DEFAULT now());

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
