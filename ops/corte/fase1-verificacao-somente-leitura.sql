-- Fase 1 do corte — verificação SOMENTE LEITURA da reconciliação de migrations.
-- Rodar em prod (kbabmewnahysfvlybiak) com usuário de leitura. Só SELECT: não altera nada.
-- Referência e resultados esperados: ops/corte/CORTE.md, seção "Reconciliação de migrations".

-- 1. Migrations aplicadas em prod a partir de 2026-10-16 (comparar com backend/supabase/migrations).
--    Pendentes em 2026-10-23: 20261010120000 (adiada), 20261022020000 e 20261023120000 (aguardam autorização).
SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE version >= '20261016000000'
ORDER BY version;

-- 2. Conteúdo aplicado × arquivo do PR. Comparar com:
--    git show origin/<branch>:<arquivo> | tr -d '\r' | md5sum
--    Esperado (2026-10-23): 20261022100000 = d839f0c9fc345a18394fd4906a25b9eb (#618)
--                           20261022110000 = 442ec12eb6ab71a88658e59d11171992 (#621)
SELECT version, md5(array_to_string(statements, E'\n')) AS md5_statements
FROM supabase_migrations.schema_migrations
WHERE version IN ('20261022100000', '20261022110000')
ORDER BY version;

-- 3. Migration adiada 20261010120000: enquanto não for liberada, o DEFAULT continua presente.
--    Esperado: 'a0000001-0000-4000-8000-000000000001'::uuid
SELECT column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'caixas' AND column_name = 'loja_id';

-- 4. Pré-condição de qualquer janela que toque caixas: zero caixas abertos.
SELECT count(*) AS caixas_abertos
FROM public.caixas
WHERE status = 'ABERTO';
