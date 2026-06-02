-- 222 — Remove índices duplicados (mesma tabela + mesmas colunas).
--
-- Em cada par, mantém-se o índice respaldado por constraint (PK/UNIQUE) ou o nome canônico, e
-- remove-se a cópia redundante (sempre um índice simples, não-constraint — DROP INDEX é seguro).
-- Ganho: menos custo de escrita e espaço, sem perda de cobertura. Independe de estatísticas de uso.

DROP INDEX IF EXISTS public.idx_clientes_loja_id;            -- = idx_clientes_loja (loja_id)
DROP INDEX IF EXISTS public.idx_contas_receber_loja_id;      -- = idx_contas_receber_loja (loja_id)
DROP INDEX IF EXISTS public.idx_configuracoes_gerais_chave;  -- = configuracoes_gerais_chave_key (UNIQUE)
DROP INDEX IF EXISTS public.idx_estoque_loja_produto;        -- = estoque_loja_produto_unique (UNIQUE)
DROP INDEX IF EXISTS public.estoque_baixas_venda_produto_unique; -- = estoque_baixas_pkey
DROP INDEX IF EXISTS public.idx_feature_flags_name;          -- = feature_flags_pkey (name)
DROP INDEX IF EXISTS public.idx_produtos_codigo_barras;      -- = produtos_codigo_barras_key (UNIQUE)
