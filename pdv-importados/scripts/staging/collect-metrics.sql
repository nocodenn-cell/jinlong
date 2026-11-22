-- Métricas de capacidade — rodar no SQL Editor do projeto STAGING apenas.
-- Não executar em produção.
-- Exportar resultados para /opt/cursor/artifacts/ ou anexo do relatório FASE 5.

-- 1) Conexões
SELECT count(*) AS numbackends,
       (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') AS max_connections
FROM pg_stat_activity;

-- 2) Backends por estado
SELECT state, count(*) FROM pg_stat_activity GROUP BY state ORDER BY 2 DESC;

-- 3) Locks em espera
SELECT relation::regclass, mode, granted, count(*)
FROM pg_locks
WHERE NOT granted
GROUP BY 1, 2, 3
ORDER BY 4 DESC
LIMIT 50;

-- 4) Top queries (se pg_stat_statements existir)
-- SELECT substring(query, 1, 120) AS q, calls, mean_exec_time, total_exec_time
-- FROM pg_stat_statements
-- ORDER BY total_exec_time DESC
-- LIMIT 20;

-- 5) Volume sintético
SELECT l.codigo, count(v.id) AS vendas
FROM public.lojas l
LEFT JOIN public.caixas c ON c.loja_id = l.id
LEFT JOIN public.vendas v ON v.caixa_id = c.id
WHERE l.codigo LIKE 'CAP_L%'
GROUP BY l.codigo
ORDER BY l.codigo;

-- 6) Estoque negativo (deve ser 0)
SELECT count(*) AS estoque_negativo
FROM public.estoque e
JOIN public.lojas l ON l.id = e.loja_id
WHERE l.codigo LIKE 'CAP_L%' AND e.quantidade_atual < 0;
