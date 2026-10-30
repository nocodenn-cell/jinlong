-- Pré-checagem SOMENTE LEITURA — janela 20261022020000 + 20261023120000. Só SELECT.
-- Esperados em ROTEIRO.md §2 (P1–P7). Qualquer divergência = parar.

SELECT 'P1 versoes_ja_aplicadas' AS item,
       coalesce(string_agg(version, ', '), '(nenhuma)') AS valor
FROM supabase_migrations.schema_migrations
WHERE version IN ('20261022020000', '20261023120000')
UNION ALL
SELECT 'P2 coluna_gerente_senha_sha256',
       coalesce((SELECT 'existe; is_nullable=' || is_nullable
                 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'pdv_config'
                   AND column_name = 'gerente_senha_sha256'), 'ausente')
UNION ALL
SELECT 'P3 acl_decrementar_estoque_seguro',
       coalesce(proacl::text, '(default)')
FROM pg_proc WHERE oid = to_regprocedure('public.decrementar_estoque_seguro(uuid, numeric, uuid)')
UNION ALL
SELECT 'P4 diagnostico_tem_check_antigo',
       (pg_get_functiondef(to_regprocedure('public.pdv_diagnostico_pre_producao(text)'))
         ~ $re$v_ok\s*:=\s*has_function_privilege\(\s*'authenticated'\s*,\s*'public\.decrementar_estoque_seguro\(uuid, numeric, uuid\)'\s*,\s*'EXECUTE'\s*\)$re$)::text
UNION ALL
SELECT 'P5 diagnostico_md5',
       md5(pg_get_functiondef(to_regprocedure('public.pdv_diagnostico_pre_producao(text)')))
UNION ALL
SELECT 'P6 chamadores_no_banco',
       string_agg(p.proname || '/' || pg_get_userbyid(p.proowner) || '/secdef=' || p.prosecdef, ', ')
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosrc ILIKE '%decrementar_estoque_seguro(%'
  AND p.proname <> 'decrementar_estoque_seguro'
UNION ALL
SELECT 'P7 caixas_abertos', count(*)::text FROM public.caixas WHERE status = 'ABERTO';
