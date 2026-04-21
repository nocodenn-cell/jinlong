-- =============================================================================
-- SMOKE RLS — painel gerente + admin dashboard (vendas, usuarios, v_estoque_baixo)
-- =============================================================================
-- Contexto: no SQL Editor do Supabase a sessão costuma ser **superuser**,
-- que **ignora RLS**. Por isso este ficheiro faz duas coisas:
--   A) Verifica que existem policies nas tabelas críticas (governação).
--   B) Documenta no final (comentários) o teste manual com JWT via PostgREST.
--
-- Parte A — execute no SQL Editor (qualquer role com leitura em pg_catalog).
-- =============================================================================

DO $$
DECLARE
  v_esperadas text[] := ARRAY[
    'usuarios',
    'produtos',
    'estoque',
    'lojas',
    'vendas',
    'documentos_fiscais_pendentes',
    'documentos_fiscais_eventos',
    'contas_receber',
    'clientes'
  ];
  v_t text;
  v_cnt int;
  v_falta text[] := ARRAY[]::text[];
BEGIN
  FOREACH v_t IN ARRAY v_esperadas
  LOOP
    SELECT COUNT(*) INTO v_cnt
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = v_t;

    IF v_cnt < 1 THEN
      v_falta := array_append(v_falta, v_t || ' (0 policies)');
    END IF;
  END LOOP;

  IF array_length(v_falta, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'RLS_SMOKE_FAIL: tabelas sem policy em public: %', array_to_string(v_falta, '; ');
  END IF;

  RAISE NOTICE 'RLS_SMOKE_OK: todas as tabelas listadas têm pelo menos 1 policy em public.';
END $$;

-- View v_estoque_baixo: security_invoker (migration 040) — RLS das tabelas base (produtos, estoque, lojas).
DO $$
DECLARE
  v_opts text[];
BEGIN
  SELECT c.reloptions INTO v_opts
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'v'
    AND c.relname = 'v_estoque_baixo';

  IF v_opts IS NULL
     OR NOT (
       'security_invoker=true' = ANY (v_opts)
       OR 'security_invoker=on' = ANY (v_opts)
     ) THEN
    RAISE EXCEPTION 'RLS_SMOKE_FAIL: public.v_estoque_baixo deve existir com security_invoker (migration 040). reloptions=%', v_opts;
  END IF;

  RAISE NOTICE 'RLS_SMOKE_OK: v_estoque_baixo com security_invoker=true.';
END $$;

-- Resumo legível (opcional)
SELECT
  tablename,
  policyname,
  cmd AS comando,
  roles::text AS roles
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'usuarios',
    'produtos',
    'estoque',
    'lojas',
    'vendas',
    'documentos_fiscais_pendentes',
    'documentos_fiscais_eventos',
    'contas_receber',
    'clientes',
    'liquidacoes_receber'
  )
ORDER BY tablename, policyname;

-- =============================================================================
-- Parte B — RLS real (manual): use PostgREST + JWT de dois utilizadores
-- =============================================================================
-- 1) Obtenha o JWT de sessão (não o anon key):
--    - Browser: login em /login → DevTools → Application → Local Storage
--      (ou Network no request ao Supabase) → copiar access_token.
--    - Ou: supabase-js signInWithPassword e campo data.session.access_token.
--
-- 2) Substitua REF, ANON_KEY, ACCESS_TOKEN_GERENTE, ACCESS_TOKEN_OPERADOR.
--
-- 3) Gerente (deve ver linhas conforme RLS de loja / perfil):
--
--   curl -sS -H "apikey: ANON_KEY" -H "Authorization: Bearer ACCESS_TOKEN_GERENTE" \
--     "https://REF.supabase.co/rest/v1/vendas?select=id&limit=3"
--
--   curl -sS -H "apikey: ANON_KEY" -H "Authorization: Bearer ACCESS_TOKEN_GERENTE" \
--     "https://REF.supabase.co/rest/v1/v_estoque_baixo?select=id,loja_id&limit=5"
--
--   curl -sS -H "apikey: ANON_KEY" -H "Authorization: Bearer ACCESS_TOKEN_GERENTE" \
--     "https://REF.supabase.co/rest/v1/usuarios?select=id,perfil&id=eq.<SUB_DO_JWT>"
--
--   curl -sS -H "apikey: ANON_KEY" -H "Authorization: Bearer ACCESS_TOKEN_GERENTE" \
--     "https://REF.supabase.co/rest/v1/documentos_fiscais_pendentes?select=id,status,venda_id&limit=3"
--
--   curl -sS -H "apikey: ANON_KEY" -H "Authorization: Bearer ACCESS_TOKEN_GERENTE" \
--     "https://REF.supabase.co/rest/v1/documentos_fiscais_eventos?select=id,evento_tipo&limit=3"
--
--   curl -sS -H "apikey: ANON_KEY" -H "Authorization: Bearer ACCESS_TOKEN_GERENTE" \
--     "https://REF.supabase.co/rest/v1/contas_receber?select=id,status&limit=3"
--
-- 4) Operador (perfil OPERADOR): rotas só-gerente (fiscal / fiado) devem devolver **[]** (200 + []):
--
--   curl -sS -H "apikey: ANON_KEY" -H "Authorization: Bearer ACCESS_TOKEN_OPERADOR" \
--     "https://REF.supabase.co/rest/v1/documentos_fiscais_eventos?select=id&limit=5"
--
--   curl -sS -H "apikey: ANON_KEY" -H "Authorization: Bearer ACCESS_TOKEN_OPERADOR" \
--     "https://REF.supabase.co/rest/v1/documentos_fiscais_pendentes?select=id&limit=5"
--
--   curl -sS -H "apikey: ANON_KEY" -H "Authorization: Bearer ACCESS_TOKEN_OPERADOR" \
--     "https://REF.supabase.co/rest/v1/contas_receber?select=id&limit=5"
--
--    Para vendas / v_estoque_baixo o operador pode ver dados da **própria loja**
--    conforme policies 042/044 — automatizar: `node backend/scripts/p0-rls-rest-smoke.mjs`
--    (env RLS_SMOKE_JWT_PAINEL + RLS_SMOKE_JWT_CAIXA).
--
-- 5) Isolamento entre lojas (se aplicável): repetir (3) com JWT de outro
--    gerente de **outra loja** e confirmar que **não** aparecem vendas/caixas
--    da primeira loja (ajuste expectativa ao modelo em 044: vendas via caixa/operador).
--
-- Critério de sucesso: nenhuma resposta JSON com dados que o utilizador não
-- deveria ver segundo a política de negócio; status HTTP coerente (200 + [] ok).
-- =============================================================================
