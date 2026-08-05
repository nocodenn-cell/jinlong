-- ============================================================================
-- PRÉ-CHECK DA MIGRATION 289 — Pacote 1 / Bloco A
--
-- Somente leitura. Rodar no banco ALVO antes de aplicar
-- `289_hardening_autorizacao_rpcs_p0.sql`.
--
-- Extensão `.txt` de propósito: este arquivo NÃO é uma migration e não pode ser
-- pego pelo `supabase db push`. É procedimento operacional.
--
-- Por que existe: os quatro tickets do Bloco A são de DRIFT — a acusação não é
-- "o código está errado", é "repositório e produção discordam". O guia
-- (§7.4, Regra 9) exige verificar o efeito por introspecção, nunca o registro em
-- schema_migrations. O dump disponível é de 2026-08-02 e não serve como prova
-- do estado de hoje.
--
-- Uso:
--   psql "$DATABASE_URL" -f backend/supabase/README_289_precheck.sql.txt
--   -- ou: npx supabase db execute --linked --file <este arquivo>
-- ============================================================================


-- ── BLOCO 1 — o defeito ainda existe? ───────────────────────────────────────
-- Esperado ANTES da 289: as três colunas `true`.
-- Se qualquer uma vier `false`, o estado divergiu do diagnosticado: PARAR e
-- reavaliar o ticket correspondente antes de aplicar.

SELECT
  (SELECT bool_or(pg_get_functiondef(p.oid) LIKE '%''OPERADOR''%')
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'criar_produto_com_estoque_inicial')
    AS sec02_tb01_operador_presente,

  (SELECT bool_or(pg_get_functiondef(p.oid) LIKE '%Estoque inicial no cadastro de produto%')
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'ajustar_estoque_manual')
    AS ssot01_string_magica_presente,

  (SELECT to_regprocedure('public.baixar_estoque_venda(uuid,jsonb)') IS NOT NULL)
    AS sec01_funcao_existe;


-- ── BLOCO 2 — qual é a superfície de execução hoje? ─────────────────────────
-- Esperado ANTES da 289:
--   baixar_estoque_venda              -> anon=true, authenticated=true   (SEC-01, o P0 real)
--   criar_produto_com_estoque_inicial -> anon=false, authenticated=false (já fechado)
--   ajustar_estoque_manual            -> anon=false, authenticated=false (já fechado)
--
-- Esperado DEPOIS da 289: todas as colunas anon/authenticated em `false`.
--
-- Nota de severidade: se criar_produto e ajustar_estoque já estiverem sem grant
-- de cliente, SEC-02/SSOT-01/TB-01 NÃO são exploráveis por chamada direta — a
-- correção do corpo é defesa em profundidade, não fechamento de brecha ativa.
-- Ver `docs/auditoria/tickets_P0_seguranca.md` e a nota de reavaliação.

WITH alvo(assinatura) AS (
  VALUES ('public.baixar_estoque_venda(uuid,jsonb)'),
         ('public.criar_produto_com_estoque_inicial(jsonb,uuid,uuid)'),
         ('public.ajustar_estoque_manual(uuid,uuid,numeric,numeric,text,text,uuid)'),
         ('public.ajustar_estoque_manual(uuid,uuid,numeric,numeric,text,text)')
)
SELECT
  assinatura,
  to_regprocedure(assinatura) IS NOT NULL AS existe,
  CASE WHEN to_regprocedure(assinatura) IS NULL THEN NULL
       ELSE has_function_privilege('anon', assinatura, 'EXECUTE') END AS anon,
  CASE WHEN to_regprocedure(assinatura) IS NULL THEN NULL
       ELSE has_function_privilege('authenticated', assinatura, 'EXECUTE') END AS authenticated,
  CASE WHEN to_regprocedure(assinatura) IS NULL THEN NULL
       ELSE has_function_privilege('service_role', assinatura, 'EXECUTE') END AS service_role
FROM alvo;


-- ── BLOCO 3 — o corpo em produção ainda é o da linhagem versionada? ─────────
-- A 289 faz CREATE OR REPLACE com corpo completo. Isso só é seguro se produção
-- não tiver divergido do repositório — caso contrário o REPLACE reverteria, em
-- silêncio, uma alteração feita fora do controle de versão.
--
-- Como usar: exportar as duas definições e comparar com
--   backend/supabase/migrations/20260718135138_criar_produto_permite_operador_pdv.sql
--   backend/supabase/migrations/20260718135500_ajuste_estoque_inicial_operador_pdv.sql
-- desconsiderando comentários e serialização (`DEFAULT NULL::uuid`,
-- `SET search_path TO 'public'`, identificadores citados).
--
-- Contra o dump de 2026-08-02 isso já foi conferido e bate:
--   node backend/scripts/verify-289-preconditions.mjs

SELECT p.oid::regprocedure AS assinatura, pg_get_functiondef(p.oid) AS definicao
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('criar_produto_com_estoque_inicial', 'ajustar_estoque_manual')
ORDER BY 1;


-- ── BLOCO 4 — a 20260730093000 realmente não surtiu efeito? ─────────────────
-- Confirma a causa-raiz: a migration consta aplicada mas seu efeito não está no
-- banco, porque o `supabase migration repair` de 2026-08-02 gravou a linha sem
-- executar o arquivo.
--
-- Esperado ANTES da 289: registrada = true E efeito_aplicado = false.
-- Essa combinação é a prova de que schema_migrations não é evidência de efeito.

SELECT
  EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations
           WHERE version = '20260730093000') AS registrada,
  NOT (SELECT bool_or(pg_get_functiondef(p.oid) LIKE '%''OPERADOR''%')
         FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'criar_produto_com_estoque_inicial')
    AS efeito_aplicado;


-- ── BLOCO 5 — há uso real de baixar_estoque_venda? (decide DROP no futuro) ──
-- A 289 faz REVOKE, não DROP, porque "sem chamador no repositório" não prova
-- "sem chamador". Este bloco é o que autoriza o DROP mais adiante.
--
-- Requer `pg_stat_statements`. Se a extensão não estiver instalada, a ausência
-- de dado NÃO é evidência de ausência de uso — mantenha o REVOKE e reavalie
-- depois de um período de observação com a função revogada e sem incidente.

SELECT calls, total_exec_time, query
FROM pg_stat_statements
WHERE query ILIKE '%baixar_estoque_venda%'
ORDER BY calls DESC
LIMIT 20;
