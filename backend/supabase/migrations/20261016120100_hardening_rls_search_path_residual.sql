-- Hardening residual do Security Advisor (defesa em profundidade, sem mudança de comportamento).
--
-- EVIDÊNCIA (produção kbabmewnahysfvlybiak, 2026-10-16, somente leitura):
--   1. `public.sync_request_nonces` e `public.venda_engine_shadow_runs` estão com RLS DESLIGADA. Hoje só
--      postgres/service_role têm grant (relacl), então não há exposição via API; mas qualquer GRANT futuro
--      (ex.: default privileges, migration de baseline como a 255) as exporia sem filtro algum. Com RLS ligada e
--      nenhuma policy, anon/authenticated passam a ser negados por padrão; service_role (BYPASSRLS) e o dono
--      postgres seguem iguais — sync-outbox (anti-replay HMAC) e o shadow engine não mudam.
--      DRIFT: a 024 já liga RLS em sync_request_nonces (homologação está ligada); produção perdeu esse estado.
--      venda_engine_shadow_runs só existe em produção (nenhuma migration do repo a cria) — por isso o bloco 1
--      só age sobre as tabelas que existirem.
--   2. Advisor 0011 (function_search_path_mutable) acusa 8 funções sem search_path fixo. Todas são
--      SECURITY INVOKER e os corpos usam só built-ins ou nomes qualificados (public.motivo_desconto_enum_tipo);
--      3 são stubs LEGACY_DISABLED_USE_V4 e 2 são triggers append-only. search_path = '' é o mais estrito e
--      não altera o resultado de nenhuma delas (pg_catalog é sempre pesquisado).
--
-- ROLLBACK (idempotente):
--   ALTER TABLE public.sync_request_nonces DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.venda_engine_shadow_runs DISABLE ROW LEVEL SECURITY;
--   ALTER FUNCTION <cada assinatura abaixo> RESET search_path;

-- 1) RLS deny-by-default em tabelas internas -----------------------------------------------------------------
DO $rls$
DECLARE
  v_tab text;
BEGIN
  FOREACH v_tab IN ARRAY ARRAY['public.sync_request_nonces', 'public.venda_engine_shadow_runs']
  LOOP
    IF to_regclass(v_tab) IS NULL THEN
      RAISE NOTICE 'RLS: % ausente neste ambiente — ignorada', v_tab;
      CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', v_tab);
  END LOOP;
END
$rls$;

-- 2) search_path fixo (só as assinaturas que existirem; ambientes antigos podem não ter todas) -----------------
DO $sp$
DECLARE
  v_sig text;
BEGIN
  FOREACH v_sig IN ARRAY ARRAY[
    'internal.desconto_comercial_operador_ok(text,numeric,public.motivo_desconto_enum_tipo)',
    'internal.comissao_valor_item(numeric,numeric,text,numeric,numeric)',
    'public.trg_comissoes_ajustes_bloquear_mutacao()',
    'public.trg_movimentos_estoque_log_bloquear_mutacao()',
    'public.venda_evento_idempotency_key(text,uuid,boolean)',
    'public.finalizar_venda_transacional_canonica_v2()',
    'public.finalizar_venda_transacional_canonica_v3()',
    'public.finalizar_venda_transacional(uuid,uuid,text,numeric,numeric,numeric,jsonb)'
  ]
  LOOP
    IF to_regprocedure(v_sig) IS NULL THEN
      RAISE NOTICE 'search_path: % ausente neste ambiente — ignorado', v_sig;
      CONTINUE;
    END IF;
    EXECUTE format('ALTER FUNCTION %s SET search_path = %L', to_regprocedure(v_sig)::text, '');
  END LOOP;
END
$sp$;
