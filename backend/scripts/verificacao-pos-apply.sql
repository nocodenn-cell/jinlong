-- ============================================================================
-- Verificação pós-aplicação das 30 migrations pendentes (Grupos A/B/C)
--
-- Somente leitura. Nenhuma linha é criada, alterada ou removida.
--
-- Uso (produção, dentro da janela coordenada, depois do `db push`):
--   psql "$PROD_DB_URL" -v ON_ERROR_STOP=1 -f backend/scripts/verificacao-pos-apply.sql
--
-- Uso (ensaio local):
--   docker exec -i supabase_db_fastproduct psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < backend/scripts/verificacao-pos-apply.sql
--
-- Critério de aceite: a última consulta deve retornar ZERO linhas.
-- Qualquer linha devolvida é uma falha e aborta o go-live.
-- ============================================================================

\pset pager off
\timing off

-- ---------------------------------------------------------------------------
-- 1. Panorama do ledger
-- ---------------------------------------------------------------------------
\echo '=== 1. Panorama do ledger ==='
SELECT
  count(*)                                                        AS total_versoes,
  count(*) FILTER (WHERE version ~ '^\d{14}$')                    AS timestamp_versoes,
  count(*) FILTER (WHERE version !~ '^\d{14}$')                   AS nao_timestamp_versoes,
  max(version) FILTER (WHERE version ~ '^\d{14}$')                AS maior_timestamp
FROM supabase_migrations.schema_migrations;

-- ---------------------------------------------------------------------------
-- 2. Resultado consolidado — cada linha é uma asserção
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 2. Asserções (esperado: coluna ok = t em todas) ==='

WITH esperadas(version, grupo) AS (
  VALUES
    ('20260810222702','A tombstone'),
    ('20260813231034','B AR/AP'), ('20260813232133','B AR/AP'),
    ('20260813234233','B AR/AP'), ('20260814000154','B AR/AP'),
    ('20260814012644','B AR/AP'), ('20260814013015','B AR/AP'),
    ('20260814013215','B AR/AP'), ('20260814013447','B AR/AP'),
    ('20260814013845','B AR/AP'), ('20260814014205','B AR/AP'),
    ('20260814015032','B AR/AP'), ('20260814090345','B AR/AP'),
    ('20260814095445','B AR/AP'), ('20260814105031','B AR/AP'),
    ('20260814105520','B AR/AP'), ('20260814110028','B comissao'),
    ('20260814111243','B comissao'), ('20260814114654','B comissao'),
    ('20260814142254','B comissao'), ('20260814142814','B comissao'),
    ('20260814151030','B comissao'), ('20260814161500','B comissao'),
    ('20260814171500','B comissao'), ('20260814180000','B comissao'),
    ('20260816135000','C produtos'), ('20260816140000','C produtos'),
    ('20260816141000','C produtos'), ('20260816142000','C produtos'),
    ('20260816143000','C produtos')
),
ledger AS (SELECT version FROM supabase_migrations.schema_migrations),
asserts AS (
  -- 2.1 as 30 versões esperadas estão no ledger
  SELECT
    'ledger: 30 pendentes aplicadas'          AS assercao,
    (SELECT count(*) FROM esperadas e JOIN ledger l USING (version)) = 30 AS ok,
    (SELECT count(*)::text FROM esperadas e JOIN ledger l USING (version)) || '/30' AS observado

  -- 2.2 tombstone presente
  UNION ALL SELECT
    'ledger: tombstone 20260810222702 presente',
    EXISTS (SELECT 1 FROM ledger WHERE version = '20260810222702'),
    ''

  -- 2.3 a reaplicação aposentada NAO pode estar no ledger (ADR-012)
  UNION ALL SELECT
    'ledger: 20260808130200 AUSENTE (ADR-012)',
    NOT EXISTS (SELECT 1 FROM ledger WHERE version = '20260808130200'),
    ''

  -- 2.4 total do ledger bate com os 307 arquivos do repositorio
  --
  -- Era 304 quando este script foi escrito. A constante e um retrato do
  -- repositorio, e o repositorio ganhou 3 migrations desde entao (Fase 6):
  --
  --   +1 20260809163502_relatorio_periodo_tz_bounds_sargable
  --        reconciliacao do relatorio de producao (commit e154f47b).
  --   +1 20260814015032_harden_diagnostics_and_ap_idempotency
  --        REABILITADA. Estava como _disabled_ por ter sido aplicada a mao em
  --        producao, o que tornava o banco local irreprodutivel a partir do
  --        repositorio e deixava a idempotencia de AP sem o fix P1-3.
  --   +1 20260819000000_revoke_relatorio_consistencia_vendas_de_public
  --        completa o REVOKE que a 20260818000001 fez so de authenticated,
  --        deixando a concessao default de PUBLIC intacta (GATE 9).
  --
  -- Ao adicionar migrations, atualize este numero JUNTO e diga o porque.
  UNION ALL SELECT
    'ledger: total = 307',
    (SELECT count(*) FROM ledger) = 307,
    (SELECT count(*)::text FROM ledger)

  -- 2.5 nenhuma versão legada numérica remanescente (prova do repair)
  UNION ALL SELECT
    'ledger: sem versões numéricas 205-289 remanescentes',
    NOT EXISTS (SELECT 1 FROM ledger WHERE version ~ '^(2[0-8][0-9]|2470[1-3])$'),
    COALESCE((SELECT string_agg(version, ',' ORDER BY version) FROM ledger
              WHERE version ~ '^(2[0-8][0-9]|2470[1-3])$'), '')

  -- 2.6 objetos que as migrations DEVEM ter criado
  UNION ALL SELECT
    'objeto: tabela comissoes_ajustes',
    to_regclass('public.comissoes_ajustes') IS NOT NULL, ''
  UNION ALL SELECT
    'objeto: tabela comissoes_itens',
    to_regclass('public.comissoes_itens') IS NOT NULL, ''
  UNION ALL SELECT
    'objeto: tabela comissoes_pagamentos',
    to_regclass('public.comissoes_pagamentos') IS NOT NULL, ''
  UNION ALL SELECT
    'objeto: view comissoes_vendedores_liquidas',
    to_regclass('public.comissoes_vendedores_liquidas') IS NOT NULL, ''
  UNION ALL SELECT
    'objeto: internal.calcular_totais_venda',
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'internal' AND p.proname = 'calcular_totais_venda'), ''
  UNION ALL SELECT
    'objeto: registrar_liquidacao_receber (AR, FIN-298-01)',
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'registrar_liquidacao_receber'), ''
  UNION ALL SELECT
    'objeto: registrar_pagamento_contas_pagar (AP, FIN-298-02)',
    EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'registrar_pagamento_contas_pagar'), ''

  -- 2.7 contrato de correlação AR/AP (Fase 1A)
  UNION ALL SELECT
    'coluna: liquidacoes_receber.idempotency_key',
    EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_schema='public' AND table_name='liquidacoes_receber'
              AND column_name='idempotency_key'), ''
  UNION ALL SELECT
    'coluna: liquidacoes_receber.caixa_id',
    EXISTS (SELECT 1 FROM information_schema.columns
            WHERE table_schema='public' AND table_name='liquidacoes_receber'
              AND column_name='caixa_id'), ''

  -- 2.8 objetos que as migrations DEVEM ter removido
  UNION ALL SELECT
    'removido: public.recalcular_saldo_caixa',
    NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'public' AND p.proname = 'recalcular_saldo_caixa'), ''
  UNION ALL SELECT
    'removido: venda_finance_context (tombstone)',
    to_regclass('public.venda_finance_context') IS NULL, ''

  -- 2.9 autoridade sobre o contador físico de caixa (P0-1)
  UNION ALL SELECT
    'grant: authenticated SEM update amplo em caixas.saldo_atual',
    NOT EXISTS (
      SELECT 1 FROM information_schema.column_privileges
      WHERE grantee = 'authenticated' AND table_schema = 'public'
        AND table_name = 'caixas' AND column_name = 'saldo_atual'
        AND privilege_type = 'UPDATE'), ''
)
SELECT assercao, ok, observado FROM asserts ORDER BY ok, assercao;

-- ---------------------------------------------------------------------------
-- 3. Portão final — DEVE retornar zero linhas
-- ---------------------------------------------------------------------------
\echo ''
\echo '=== 3. Falhas (esperado: 0 linhas) ==='

WITH esperadas(version) AS (
  VALUES ('20260810222702'),
    ('20260813231034'),('20260813232133'),('20260813234233'),('20260814000154'),
    ('20260814012644'),('20260814013015'),('20260814013215'),('20260814013447'),
    ('20260814013845'),('20260814014205'),('20260814015032'),('20260814090345'),
    ('20260814095445'),('20260814105031'),('20260814105520'),('20260814110028'),
    ('20260814111243'),('20260814114654'),('20260814142254'),('20260814142814'),
    ('20260814151030'),('20260814161500'),('20260814171500'),('20260814180000'),
    ('20260816135000'),('20260816140000'),('20260816141000'),('20260816142000'),
    ('20260816143000')
)
SELECT 'migration pendente NAO aplicada: ' || e.version AS falha
FROM esperadas e
WHERE NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations m
                  WHERE m.version = e.version)
UNION ALL
SELECT 'PROIBIDO: 20260808130200 presente no ledger (viola ADR-012)'
WHERE EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations
              WHERE version = '20260808130200')
UNION ALL
SELECT 'objeto ausente: public.comissoes_ajustes'
WHERE to_regclass('public.comissoes_ajustes') IS NULL
UNION ALL
SELECT 'objeto ausente: public.comissoes_vendedores_liquidas'
WHERE to_regclass('public.comissoes_vendedores_liquidas') IS NULL
UNION ALL
SELECT 'objeto ausente: internal.calcular_totais_venda'
WHERE NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'internal' AND p.proname = 'calcular_totais_venda')
UNION ALL
SELECT 'objeto residual: public.recalcular_saldo_caixa deveria ter sido removida'
WHERE EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname = 'recalcular_saldo_caixa')
UNION ALL
SELECT 'objeto residual: public.venda_finance_context deveria estar ausente'
WHERE to_regclass('public.venda_finance_context') IS NOT NULL;
