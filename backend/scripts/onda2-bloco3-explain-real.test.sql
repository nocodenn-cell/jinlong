-- Onda 2 · Bloco 3 — EXPLAIN real contra Postgres local (Docker), provando:
--   1. A query antiga (`nome ILIKE`) é accent-sensitive: "cafe" NÃO acha "Café".
--   2. A alternativa ingênua (`unaccent(nome) ILIKE`) NÃO usa nenhum índice
--      trigram existente — cai pra Seq Scan, degradando TODA busca por nome.
--   3. A solução escolhida (`nome_sem_acento ILIKE`) usa o NOVO índice trigram
--      (idx_produtos_nome_sem_acento_trgm) via Bitmap Index Scan, e acha "Café".
--
-- Populado com massa sintética suficiente (50k linhas) pro planner preferir
-- índice a sequential scan — a tabela real (15 linhas no seed local) é
-- pequena demais pra essa diferença aparecer.
--
-- Tudo dentro de uma transação com ROLLBACK final — nada persiste.

\set ON_ERROR_STOP on
\timing on
BEGIN;

-- Massa sintética: ativa/publicado (bate no filtro do PDV e no índice
-- parcial `WHERE ativo = true`), nomes variados. Controles acentuados
-- ("Café", "Plástico") em seletividade REALISTA (~10 em 50.000 = 0,02% —
-- um termo de busca específico batendo em poucos SKUs, não em 5% do
-- catálogo inteiro; a essa seletividade o planner só compensa usar índice
-- se ele realmente reduzir I/O, que é o cenário real do PDV).
INSERT INTO public.produtos (nome, preco_varejo, origem, tem_nf, ativo, status_publicacao)
SELECT
  CASE
    WHEN i % 5000 = 1 THEN 'Café Torrado Especial ' || i
    WHEN i % 5000 = 2 THEN 'Kit Plástico Organizador ' || i
    ELSE (ARRAY['Cadeira Vermelha','Mesa de Escritório','Caixa de Som','Luminária LED',
                'Suporte de Celular','Mouse sem Fio','Teclado Mecânico','Fone Bluetooth',
                'Carregador Portátil','Cabo USB-C','Adaptador HDMI','Power Bank',
                'Relógio Digital','Óculos de Sol','Garrafa Térmica','Mochila Executiva',
                'Tênis Esportivo','Camiseta Básica','Boné Ajustável','Bolsa Transversal'])[1 + (i % 20)] || ' ' || i
  END,
  (10 + (i % 500))::numeric,
  'brasil_nf',
  true,
  true,
  'PUBLICADO'
FROM generate_series(1, 50000) AS i;

ANALYZE public.produtos;

\echo '═══════════════════════════════════════════════════════════════'
\echo '1) ANTES — nome ILIKE (accent-sensitive): busca "cafe"'
\echo '═══════════════════════════════════════════════════════════════'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, nome FROM public.produtos
WHERE ativo = true AND status_publicacao = 'PUBLICADO'
  AND nome ILIKE '%cafe%'
ORDER BY nome ASC
LIMIT 8;

\echo ''
\echo 'Contagem real (nome ILIKE cafe, deve ser 0 — "Café" tem acento):'
SELECT count(*) AS achou_cafe_accent_sensitive
FROM public.produtos WHERE nome ILIKE '%cafe%';

\echo ''
\echo '═══════════════════════════════════════════════════════════════'
\echo '2) REJEITADO — unaccent(nome) ILIKE (a "solução ingênua")'
\echo '═══════════════════════════════════════════════════════════════'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, nome FROM public.produtos
WHERE ativo = true AND status_publicacao = 'PUBLICADO'
  AND unaccent(nome) ILIKE '%cafe%'
ORDER BY nome ASC
LIMIT 8;

\echo ''
\echo '═══════════════════════════════════════════════════════════════'
\echo '3) ESCOLHIDO — nome_sem_acento ILIKE (coluna gerada + índice novo)'
\echo '═══════════════════════════════════════════════════════════════'
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT id, nome FROM public.produtos
WHERE ativo = true AND status_publicacao = 'PUBLICADO'
  AND nome_sem_acento ILIKE '%cafe%'
ORDER BY nome ASC
LIMIT 8;

\echo ''
\echo 'Resultado (nome_sem_acento ILIKE cafe, deve achar as linhas "Café..."):'
SELECT nome FROM public.produtos WHERE nome_sem_acento ILIKE '%cafe%' ORDER BY nome LIMIT 3;

\echo ''
\echo '═══════════════════════════════════════════════════════════════'
\echo '4) Controle — "plastico" acha "Plástico" via nome_sem_acento'
\echo '═══════════════════════════════════════════════════════════════'
SELECT count(*) AS achou_plastico_normalizado FROM public.produtos WHERE nome_sem_acento ILIKE '%plastico%';
SELECT count(*) AS nao_acha_plastico_raw FROM public.produtos WHERE nome ILIKE '%plastico%';

ROLLBACK;
