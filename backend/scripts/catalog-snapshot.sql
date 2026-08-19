-- ============================================================================
-- Retrato do catálogo — fonte única para o diff produção × repositório
--
-- SOMENTE LEITURA. Nenhuma linha é criada, alterada ou removida. Só lê
-- pg_catalog / information_schema / supabase_migrations.
--
-- Contrato: este arquivo é UM `SELECT` puro, sem meta-comandos do psql e sem
-- ponto-e-vírgula final, para poder ser embrulhado como subconsulta:
--
--   SELECT section, count(*), md5(...) FROM ( <este arquivo> ) s GROUP BY 1
--   SELECT obj_key, digest        FROM ( <este arquivo> ) s WHERE section = 'functions'
--
-- Quem embrulha é `catalog-diff.mjs`. Não adicione `;` nem `\set` aqui.
--
-- Colunas devolvidas:
--   section  text  família do objeto (functions, tables, columns, …)
--   obj_key  text  identidade estável do objeto — o que casa os dois lados
--   digest   text  md5 do conteúdo comparável do objeto
--
-- Por que digest em vez do conteúdo: o catálogo inteiro de produção passa de
-- centenas de KB. O digest detecta a divergência; a inspeção do que mudou é
-- feita depois, só no objeto que divergiu.
--
-- Objetos pertencentes a extensões são EXCLUÍDOS. Sem isso, pgcrypto, pg_trgm
-- e afins instalados em `public` produzem centenas de divergências falsas
-- sempre que as versões de extensão diferirem entre ambientes.
--
-- Corpo das funções: usamos `prosrc` (fonte crua) e não `pg_get_functiondef`,
-- porque functiondef falha para agregados e reescreve formatação. `prosrc` é
-- byte a byte o que a migration gravou — que é exatamente o que queremos
-- comparar entre um banco reconstruído do repositório e produção.
-- ============================================================================

WITH incluidos AS (
  SELECT oid, nspname
  FROM pg_namespace
  WHERE nspname IN ('public', 'internal')
),

-- OIDs que pertencem a alguma extensão instalada. Ruído, não drift.
de_extensao AS (
  SELECT objid
  FROM pg_depend
  WHERE deptype = 'e'
),

funcoes AS (
  SELECT
    'functions'::text AS section,
    n.nspname || '.' || p.proname || '(' ||
      pg_get_function_identity_arguments(p.oid) || ')' AS obj_key,
    md5(
      coalesce(p.prokind::text, '') || '|' ||
      coalesce(p.prosecdef::text, '') || '|' ||
      coalesce(p.provolatile::text, '') || '|' ||
      coalesce(p.proacl::text, '<default>') || '|' ||
      coalesce(pg_get_function_result(p.oid), '') || '|' ||
      coalesce(p.proconfig::text, '') || '|' ||
      coalesce(p.prosrc, '')
    ) AS digest
  FROM pg_proc p
  JOIN incluidos n ON n.oid = p.pronamespace
  WHERE p.oid NOT IN (SELECT objid FROM de_extensao)
),

tabelas AS (
  SELECT
    'tables'::text AS section,
    n.nspname || '.' || c.relname AS obj_key,
    md5(
      c.relkind::text || '|' ||
      c.relrowsecurity::text || '|' ||
      c.relforcerowsecurity::text || '|' ||
      coalesce(c.relacl::text, '<default>')
    ) AS digest
  FROM pg_class c
  JOIN incluidos n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f')
    AND c.oid NOT IN (SELECT objid FROM de_extensao)
),

colunas AS (
  SELECT
    'columns'::text AS section,
    n.nspname || '.' || c.relname || '.' || a.attname AS obj_key,
    md5(
      format_type(a.atttypid, a.atttypmod) || '|' ||
      a.attnotnull::text || '|' ||
      coalesce(pg_get_expr(d.adbin, d.adrelid), '') || '|' ||
      coalesce(a.attidentity::text, '') || '|' ||
      coalesce(a.attgenerated::text, '')
    ) AS digest
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN incluidos n ON n.oid = c.relnamespace
  LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
  WHERE a.attnum > 0
    AND NOT a.attisdropped
    AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
    AND c.oid NOT IN (SELECT objid FROM de_extensao)
),

indices AS (
  SELECT
    'indexes'::text AS section,
    n.nspname || '.' || ci.relname AS obj_key,
    md5(pg_get_indexdef(i.indexrelid)) AS digest
  FROM pg_index i
  JOIN pg_class ci ON ci.oid = i.indexrelid
  JOIN incluidos n ON n.oid = ci.relnamespace
  WHERE ci.oid NOT IN (SELECT objid FROM de_extensao)
),

restricoes AS (
  SELECT
    'constraints'::text AS section,
    n.nspname || '.' || c.relname || '.' || con.conname AS obj_key,
    md5(pg_get_constraintdef(con.oid)) AS digest
  FROM pg_constraint con
  JOIN pg_class c ON c.oid = con.conrelid
  JOIN incluidos n ON n.oid = c.relnamespace
  WHERE con.oid NOT IN (SELECT objid FROM de_extensao)
),

gatilhos AS (
  SELECT
    'triggers'::text AS section,
    n.nspname || '.' || c.relname || '.' || t.tgname AS obj_key,
    md5(pg_get_triggerdef(t.oid)) AS digest
  FROM pg_trigger t
  JOIN pg_class c ON c.oid = t.tgrelid
  JOIN incluidos n ON n.oid = c.relnamespace
  WHERE NOT t.tgisinternal
    AND t.oid NOT IN (SELECT objid FROM de_extensao)
),

politicas AS (
  SELECT
    'policies'::text AS section,
    n.nspname || '.' || c.relname || '.' || pol.polname AS obj_key,
    md5(
      pol.polcmd::text || '|' ||
      pol.polpermissive::text || '|' ||
      coalesce((
        SELECT string_agg(r.rolname, ',' ORDER BY r.rolname)
        FROM pg_roles r WHERE r.oid = ANY (pol.polroles)
      ), 'PUBLIC') || '|' ||
      coalesce(pg_get_expr(pol.polqual, pol.polrelid), '') || '|' ||
      coalesce(pg_get_expr(pol.polwithcheck, pol.polrelid), '')
    ) AS digest
  FROM pg_policy pol
  JOIN pg_class c ON c.oid = pol.polrelid
  JOIN incluidos n ON n.oid = c.relnamespace
),

visoes AS (
  SELECT
    'views'::text AS section,
    n.nspname || '.' || c.relname AS obj_key,
    md5(pg_get_viewdef(c.oid)) AS digest
  FROM pg_class c
  JOIN incluidos n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('v', 'm')
    AND c.oid NOT IN (SELECT objid FROM de_extensao)
),

tipos_enum AS (
  SELECT
    'enums'::text AS section,
    n.nspname || '.' || t.typname AS obj_key,
    md5(coalesce((
      SELECT string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder)
      FROM pg_enum e WHERE e.enumtypid = t.oid
    ), '')) AS digest
  FROM pg_type t
  JOIN incluidos n ON n.oid = t.typnamespace
  WHERE t.typtype = 'e'
    AND t.oid NOT IN (SELECT objid FROM de_extensao)
),

-- Extensões entram como seção própria: divergir de versão aqui é informação
-- legítima, e é o que justifica excluir os objetos delas das outras seções.
extensoes AS (
  SELECT
    'extensions'::text AS section,
    e.extname AS obj_key,
    md5(e.extversion) AS digest
  FROM pg_extension e
),

-- O ledger entra no mesmo retrato para que uma única execução responda
-- "o catálogo bate?" e "as migrations bateram?" com a mesma evidência.
ledger AS (
  SELECT
    'migrations'::text AS section,
    m.version AS obj_key,
    md5(m.version) AS digest
  FROM supabase_migrations.schema_migrations m
)

SELECT section, obj_key, digest FROM funcoes
UNION ALL SELECT section, obj_key, digest FROM tabelas
UNION ALL SELECT section, obj_key, digest FROM colunas
UNION ALL SELECT section, obj_key, digest FROM indices
UNION ALL SELECT section, obj_key, digest FROM restricoes
UNION ALL SELECT section, obj_key, digest FROM gatilhos
UNION ALL SELECT section, obj_key, digest FROM politicas
UNION ALL SELECT section, obj_key, digest FROM visoes
UNION ALL SELECT section, obj_key, digest FROM tipos_enum
UNION ALL SELECT section, obj_key, digest FROM extensoes
UNION ALL SELECT section, obj_key, digest FROM ledger
