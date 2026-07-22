-- P0.3 / P0.2 follow-up: revoga EXECUTE de anon em RPCs críticas do PDV
-- e corrige falsos negativos do diagnóstico pré-produção (migrations com
-- version timestamp + assinatura v4 com cliente_id).

-- 1) Revogar anon nas RPCs pedidas (todas as overloads pelo nome)
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'finalizar_venda_transacional_canonica_v4',
        'fechar_caixa_atomico',
        'fechar_caixa_pdv_atomico'
      )
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.sig);
  END LOOP;
END $$;

-- Defesa em profundidade: reaplicar varredura SECURITY DEFINER → anon (mig 218)
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.sig);
  END LOOP;
END $$;

-- Garantir authenticated/service_role nas RPCs web de caixa/venda
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'finalizar_venda_transacional_canonica_v4',
        'fechar_caixa_atomico'
      )
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;

  -- PDV local sync: service_role only (desenho mig 227)
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'fechar_caixa_pdv_atomico'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- 2) Diagnóstico: checks por existência de RPC/nome de migration (sem falso negativo)
CREATE OR REPLACE FUNCTION public.pdv_diagnostico_pre_producao(
  p_produto_codigo text DEFAULT '7898512340003'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_codigo text := NULLIF(btrim(COALESCE(p_produto_codigo, '')), '');
  v_checks jsonb := '[]'::jsonb;
  v_ok boolean;
  v_aviso boolean;
  v_detalhe text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'sessao_expirada' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = v_uid AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
  ) THEN
    RAISE EXCEPTION 'nao_autorizado' USING ERRCODE = '42501';
  END IF;

  IF v_codigo IS NULL THEN
    v_codigo := '7898512340003';
  END IF;

  -- v4: função presente OU migration nomeada (version timestamp no remoto)
  v_ok := EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'finalizar_venda_transacional_canonica_v4'
    )
    OR EXISTS (
      SELECT 1 FROM supabase_migrations.schema_migrations m
      WHERE m.version::text LIKE '%243%'
         OR m.name ILIKE '%243%'
         OR m.name ILIKE '%canonica_v4%'
    );
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'id', 'migration_243_v4_finalize', 'categoria', 'migrations', 'titulo', 'Migration v4 finalização',
    'status', CASE WHEN v_ok THEN 'ok' ELSE 'falha' END,
    'detalhe', 'RPC finalizar_venda_transacional_canonica_v4 presente (243/264/268).'));

  v_ok := EXISTS (
      SELECT 1 FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'calcular_preco_produto'
    )
    OR EXISTS (
      SELECT 1 FROM supabase_migrations.schema_migrations m
      WHERE m.version::text LIKE '%234%' OR m.name ILIKE '%234%' OR m.name ILIKE '%calcular_preco%'
    );
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'id', 'migration_234_preco', 'categoria', 'migrations', 'titulo', 'Migration calcular_preco',
    'status', CASE WHEN v_ok THEN 'ok' ELSE 'falha' END,
    'detalhe', 'RPC calcular_preco_produto.'));

  v_ok := to_regclass('public.movimentos_estoque_log') IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM supabase_migrations.schema_migrations m
      WHERE m.version::text LIKE '%127%' OR m.name ILIKE '%127%' OR m.name ILIKE '%kardex%'
    );
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'id', 'migration_127_kardex', 'categoria', 'migrations', 'titulo', 'Migration kardex estoque',
    'status', CASE WHEN v_ok THEN 'ok' ELSE 'falha' END,
    'detalhe', 'movimentos_estoque_log / kardex.'));

  v_aviso := NOT EXISTS (
    SELECT 1 FROM supabase_migrations.schema_migrations m
    WHERE m.version::text LIKE '%255%grant%'
       OR m.version::text LIKE '%255_grant%'
       OR m.name ILIKE '%grant_baseline%'
  );
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'id', 'migration_255_grant', 'categoria', 'migrations', 'titulo', 'GRANT baseline (255)',
    'status', CASE WHEN v_aviso THEN 'aviso' ELSE 'ok' END,
    'detalhe', 'Recomendado em ambiente novo para evitar drift de permissões.'));

  v_ok := EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'finalizar_venda_transacional_canonica_v4');
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'id', 'rpc_finalizar_venda_v4', 'categoria', 'rpc', 'titulo', 'RPC finalizar venda v4',
    'status', CASE WHEN v_ok THEN 'ok' ELSE 'falha' END,
    'detalhe', 'Função canônica de finalização do caixa web.'));

  v_ok := EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'decrementar_estoque_seguro');
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'id', 'rpc_decrementar_estoque', 'categoria', 'rpc', 'titulo', 'RPC decrementar estoque',
    'status', CASE WHEN v_ok THEN 'ok' ELSE 'falha' END,
    'detalhe', 'Baixa atômica de estoque na venda.'));

  v_ok := EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'calcular_preco_produto');
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'id', 'rpc_calcular_preco', 'categoria', 'rpc', 'titulo', 'RPC calcular preço',
    'status', CASE WHEN v_ok THEN 'ok' ELSE 'falha' END,
    'detalhe', 'Preço varejo/atacado no servidor.'));

  v_ok := EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'obter_status_caixa_operador');
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'id', 'rpc_status_caixa', 'categoria', 'rpc', 'titulo', 'RPC status caixa',
    'status', CASE WHEN v_ok THEN 'ok' ELSE 'falha' END,
    'detalhe', 'Abrir/fechar turno e saldo sistema.'));

  -- GRANT por oid (assinatura v4 evoluiu com cliente_id)
  v_ok := EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'finalizar_venda_transacional_canonica_v4'
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
  );
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'id', 'grant_finalizar_v4', 'categoria', 'grants', 'titulo', 'GRANT finalizar v4',
    'status', CASE WHEN v_ok THEN 'ok' ELSE 'falha' END,
    'detalhe', 'authenticated pode executar finalizar_venda v4.'));

  v_ok := NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'finalizar_venda_transacional_canonica_v4',
        'fechar_caixa_atomico',
        'fechar_caixa_pdv_atomico'
      )
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  );
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'id', 'grant_anon_revoked_pdv', 'categoria', 'grants', 'titulo', 'anon sem EXECUTE PDV',
    'status', CASE WHEN v_ok THEN 'ok' ELSE 'falha' END,
    'detalhe', 'anon não executa finalizar_venda v4 nem fechar_caixa_*.'));

  v_ok := has_function_privilege('authenticated',
    'public.decrementar_estoque_seguro(uuid, numeric, uuid)', 'EXECUTE');
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'id', 'grant_estoque_seguro', 'categoria', 'grants', 'titulo', 'GRANT estoque seguro',
    'status', CASE WHEN v_ok THEN 'ok' ELSE 'falha' END,
    'detalhe', 'authenticated pode executar decrementar_estoque_seguro.'));

  v_ok := EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'calcular_preco_produto'
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
  );
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'id', 'grant_calcular_preco', 'categoria', 'grants', 'titulo', 'GRANT calcular preço',
    'status', CASE WHEN v_ok THEN 'ok' ELSE 'falha' END,
    'detalhe', 'authenticated pode executar calcular_preco_produto.'));

  v_ok := NOT COALESCE((
    SELECT lower(btrim(c.valor)) IN ('true', '1', 'yes', 'on')
    FROM public.configuracoes_gerais c WHERE c.chave = 'vendas_suspensas' LIMIT 1
  ), false);
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'id', 'config_vendas_suspensas', 'categoria', 'config', 'titulo', 'Vendas não suspensas',
    'status', CASE WHEN v_ok THEN 'ok' ELSE 'falha' END,
    'detalhe', CASE WHEN v_ok THEN 'Operadores podem finalizar vendas.'
      ELSE 'vendas_suspensas=true bloqueia finalização no caixa.' END));

  v_ok := EXISTS (
    SELECT 1 FROM public.produtos p
    WHERE p.codigo_barras = v_codigo OR p.codigo_interno = v_codigo
    LIMIT 1
  );
  v_detalhe := format('Produto código %s.', v_codigo);
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'id', 'estoque_produto_existe', 'categoria', 'estoque', 'titulo', 'Produto teste cadastrado',
    'status', CASE WHEN v_ok THEN 'ok' ELSE 'aviso' END,
    'detalhe', v_detalhe));

  v_ok := EXISTS (
    SELECT 1 FROM public.produtos p
    JOIN public.estoque e ON e.produto_id = p.id
    WHERE (p.codigo_barras = v_codigo OR p.codigo_interno = v_codigo)
      AND e.quantidade_atual > 0
    LIMIT 1
  );
  v_checks := v_checks || jsonb_build_array(jsonb_build_object(
    'id', 'estoque_produto_saldo', 'categoria', 'estoque', 'titulo', 'Produto teste com estoque',
    'status', CASE WHEN v_ok THEN 'ok' ELSE 'aviso' END,
    'detalhe', 'Saldo > 0 em estoque para o produto teste.'));

  RETURN jsonb_build_object(
    'verificado_em', now(),
    'produto_codigo', v_codigo,
    'checks', v_checks,
    'total_falhas', (
      SELECT COUNT(*)::int FROM jsonb_array_elements(v_checks) c
      WHERE c->>'status' = 'falha'
    ),
    'total_avisos', (
      SELECT COUNT(*)::int FROM jsonb_array_elements(v_checks) c
      WHERE c->>'status' = 'aviso'
    ),
    'veredito', CASE WHEN EXISTS (
      SELECT 1 FROM jsonb_array_elements(v_checks) c WHERE c->>'status' = 'falha'
    ) THEN 'BLOQUEADO' ELSE 'PRONTO_PILOTO' END
  );
END;
$$;

COMMENT ON FUNCTION public.pdv_diagnostico_pre_producao(text) IS
  'Checklist read-only pré-produção PDV: RPCs/grants/config/produto. GERENTE/DONO/ADMIN.';

REVOKE ALL ON FUNCTION public.pdv_diagnostico_pre_producao(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pdv_diagnostico_pre_producao(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.pdv_diagnostico_pre_producao(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pdv_diagnostico_pre_producao(text) TO service_role;
