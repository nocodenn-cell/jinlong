-- Regressão da migration 20260828160000_revoke_grants_residuais_tabelas_deny_all.sql.
--
-- Prova duas coisas na mesma transação (ROLLBACK no final — não persiste nada):
--   1. NEGATIVO: anon/authenticated não têm mais SELECT/INSERT nas 3 tabelas.
--   2. POSITIVO: o mecanismo legítimo (RPC SECURITY DEFINER dono `postgres`)
--      continua escrevendo em `produto_create_requests` normalmente mesmo
--      chamado sob role `authenticated` — porque o acesso interno da RPC usa
--      os privilégios do dono da função, não os da role que chamou.
--
-- Não cobre gerente_auth_attempts/gerente_auth_rate_limits com uma chamada
-- funcional completa (o consumidor real é uma Edge Function em Deno, fora do
-- alcance de um teste SQL puro) — a prova ali é só a de privilégio (1) mais a
-- checagem direta de que `service_role`, a única role que o consumidor real
-- usa, continua com SELECT/INSERT.

\set ON_ERROR_STOP on
BEGIN;

DO $residual_grants_check$
DECLARE
  v_fail text[] := ARRAY[]::text[];
  v_tbl text;
BEGIN
  -- ═══════════════════════════════════════════════════════════════════════
  -- 1. NEGATIVO — anon/authenticated sem SELECT/INSERT nas 3 tabelas
  -- ═══════════════════════════════════════════════════════════════════════
  FOREACH v_tbl IN ARRAY ARRAY[
    'public.gerente_auth_attempts',
    'public.gerente_auth_rate_limits',
    'public.produto_create_requests'
  ]
  LOOP
    IF to_regclass(v_tbl) IS NULL THEN CONTINUE; END IF;

    IF has_table_privilege('anon', v_tbl, 'SELECT') THEN
      v_fail := array_append(v_fail, v_tbl || ': anon SELECT deveria ser false');
    END IF;
    IF has_table_privilege('anon', v_tbl, 'INSERT') THEN
      v_fail := array_append(v_fail, v_tbl || ': anon INSERT deveria ser false');
    END IF;
    IF has_table_privilege('authenticated', v_tbl, 'SELECT') THEN
      v_fail := array_append(v_fail, v_tbl || ': authenticated SELECT deveria ser false');
    END IF;
    IF has_table_privilege('authenticated', v_tbl, 'INSERT') THEN
      v_fail := array_append(v_fail, v_tbl || ': authenticated INSERT deveria ser false');
    END IF;

    -- service_role é o único consumidor real de gerente_auth_* — precisa
    -- continuar intacto. produto_create_requests não é lida/escrita por
    -- service_role diretamente (só via RPC SECURITY DEFINER, checado abaixo),
    -- mas o dono da tabela (postgres) sempre tem acesso independente de GRANT.
    IF v_tbl IN ('public.gerente_auth_attempts', 'public.gerente_auth_rate_limits')
       AND NOT (has_table_privilege('service_role', v_tbl, 'SELECT')
                AND has_table_privilege('service_role', v_tbl, 'INSERT')) THEN
      v_fail := array_append(v_fail, v_tbl || ': service_role deveria manter SELECT/INSERT');
    END IF;
  END LOOP;

  IF array_length(v_fail, 1) > 0 THEN
    RAISE EXCEPTION 'RESIDUAL_GRANTS_NEGATIVO_FALHOU: %', array_to_string(v_fail, ' | ');
  END IF;

  RAISE NOTICE 'RESIDUAL_GRANTS negativo OK — anon/authenticated sem SELECT/INSERT, service_role preservado';
END
$residual_grants_check$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. POSITIVO — criar_produto_com_estoque_inicial (SECURITY DEFINER, dono
--    postgres) continua gravando em produto_create_requests via seu caminho
--    real de chamada.
--
--    Achado ao rodar este teste pela primeira vez: `authenticated` NUNCA teve
--    EXECUTE nesta função (confirmado via has_function_privilege — anon=false,
--    authenticated=false, service_role=true), independente desta migration.
--    O único caminho legítimo é `service_role`, cujos privilégios (função E
--    tabela) esta migration não toca. O teste abaixo exercita esse caminho
--    real; a prova de que o REVOKE em si não quebrou nada é a asserção
--    negativa acima (anon/authenticated nunca conseguiriam chamar esta RPC de
--    qualquer forma — a proteção real sempre foi a ausência de EXECUTE, este
--    GRANT de tabela era redundante mesmo antes do RLS entrar em jogo).
-- ═══════════════════════════════════════════════════════════════════════════

DO $positivo_produto_create_requests$
DECLARE
  v_loja_id uuid;
  v_ator_id uuid;
  v_request_id uuid := gen_random_uuid();
  v_payload jsonb;
  v_result jsonb;
  v_produto_id uuid;
  v_count_antes integer;
  v_count_depois integer;
BEGIN
  IF to_regprocedure('public.criar_produto_com_estoque_inicial(jsonb,uuid,uuid)') IS NULL THEN
    RAISE NOTICE 'RESIDUAL_GRANTS positivo (produto_create_requests): função não encontrada nesta versão do schema — pulando (não é falha desta migration)';
    RETURN;
  END IF;

  SELECT u.id, u.loja_id INTO v_ator_id, v_loja_id
  FROM public.usuarios u
  WHERE u.perfil IN ('GERENTE', 'DONO', 'ADMIN') AND u.ativo
  LIMIT 1;

  IF v_ator_id IS NULL THEN
    RAISE NOTICE 'RESIDUAL_GRANTS positivo (produto_create_requests): sem usuário GERENTE/DONO/ADMIN no seed local — pulando';
    RETURN;
  END IF;

  v_payload := jsonb_build_object(
    'nome', 'TESTE RESIDUAL GRANTS ' || v_request_id::text,
    'preco_varejo', 10.00,
    'unidade_medida', 'UN',
    'quantidade_inicial', 0
  );

  SELECT count(*) INTO v_count_antes
  FROM public.produto_create_requests WHERE request_id = v_request_id;

  -- Chama a RPC pelo caminho real: service_role (único com EXECUTE nesta
  -- função). Privilégios de service_role não são tocados por esta migration.
  SET LOCAL ROLE service_role;
  SELECT public.criar_produto_com_estoque_inicial(v_payload, v_ator_id, v_request_id) INTO v_result;
  RESET ROLE;

  IF v_result IS NULL OR v_result->>'produto_id' IS NULL THEN
    RAISE EXCEPTION 'RESIDUAL_GRANTS_POSITIVO_FALHOU: criar_produto_com_estoque_inicial não retornou produto_id sob role service_role';
  END IF;
  v_produto_id := (v_result->>'produto_id')::uuid;

  SELECT count(*) INTO v_count_depois
  FROM public.produto_create_requests WHERE request_id = v_request_id;

  IF v_count_depois <> v_count_antes + 1 THEN
    RAISE EXCEPTION 'RESIDUAL_GRANTS_POSITIVO_FALHOU: produto_create_requests não recebeu a linha esperada (antes=%, depois=%)', v_count_antes, v_count_depois;
  END IF;

  -- Idempotência: replay do mesmo request_id devolve o mesmo produto_id sem duplicar linha.
  SET LOCAL ROLE service_role;
  SELECT public.criar_produto_com_estoque_inicial(v_payload, v_ator_id, v_request_id) INTO v_result;
  RESET ROLE;

  IF (v_result->>'produto_id')::uuid <> v_produto_id THEN
    RAISE EXCEPTION 'RESIDUAL_GRANTS_POSITIVO_FALHOU: replay do request_id não devolveu o mesmo produto_id';
  END IF;

  IF has_function_privilege('authenticated', 'public.criar_produto_com_estoque_inicial(jsonb,uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.criar_produto_com_estoque_inicial(jsonb,uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'RESIDUAL_GRANTS_POSITIVO_FALHOU: anon/authenticated não deveriam ter EXECUTE em criar_produto_com_estoque_inicial (achado pré-existente, fora desta migration, mas a asserção documenta o estado real)';
  END IF;

  RAISE NOTICE 'RESIDUAL_GRANTS positivo OK — criar_produto_com_estoque_inicial grava/idempotência em produto_create_requests via service_role; anon/authenticated confirmados sem EXECUTE nesta RPC (pré-existente) e sem SELECT/INSERT na tabela (efeito desta migration)';
END
$positivo_produto_create_requests$;

ROLLBACK;
