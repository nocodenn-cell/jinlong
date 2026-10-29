-- Verificação pós-aplicação SOMENTE LEITURA — janela 20261022020000 + 20261023120000. Só SELECT.
-- Esperados em ROTEIRO.md §4 (V1–V5).
-- V1: md5 esperado (arquivo sem CR e sem a quebra de linha final, que o psql remove):
--     20261022020000 = 701f1b01481f98c0629278605b7799b3 · 20261023120000 = 117cb4950873e60b7c4e8e35de1c458e

SELECT 'V1 ' || version AS item, md5(array_to_string(statements, E'\n')) AS valor
FROM supabase_migrations.schema_migrations
WHERE version IN ('20261022020000', '20261023120000')
UNION ALL
SELECT 'V2 authenticated_executa',
       has_function_privilege('authenticated', 'public.decrementar_estoque_seguro(uuid, numeric, uuid)', 'EXECUTE')::text
UNION ALL
SELECT 'V3 service_role_executa',
       has_function_privilege('service_role', 'public.decrementar_estoque_seguro(uuid, numeric, uuid)', 'EXECUTE')::text
UNION ALL
SELECT 'V4 anon_executa',
       has_function_privilege('anon', 'public.decrementar_estoque_seguro(uuid, numeric, uuid)', 'EXECUTE')::text
UNION ALL
SELECT 'V5 diagnostico_com_check_novo',
       (pg_get_functiondef(to_regprocedure('public.pdv_diagnostico_pre_producao(text)'))
         ~ $re$v_ok\s*:=\s*NOT\s+has_function_privilege\(\s*'authenticated'\s*,\s*'public\.decrementar_estoque_seguro$re$)::text
ORDER BY 1;
