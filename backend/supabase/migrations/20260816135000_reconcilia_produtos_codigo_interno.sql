-- Reconcilia colunas de `produtos` que existem em produção sem migration canônica.
--
-- ACHADO (2026-08-16, ao exercitar a RPC de criação em ambiente local isolado):
-- `criar_produto_com_estoque_inicial` insere em colunas que existem no banco de
-- produção mas que NENHUM arquivo de `backend/supabase/migrations/` cria. Um
-- banco reconstruído do zero falha com
--   column "codigo_interno" of relation "produtos" does not exist
--   column "quantidade_gatilho_atacado" of relation "produtos" does not exist
-- enquanto produção funciona normalmente. Ou seja: o replay limpo das migrations
-- NÃO reproduz o schema de produção, e o erro só aparece quando alguém exercita
-- o cadastro de produto localmente — foi assim que apareceu.
--
-- Diff completo `information_schema.columns` de `produtos` (local x produção,
-- 2026-08-16). Presentes só em produção:
--   codigo_interno              character varying(50)  NULL
--   estoque_minimo              integer  NOT NULL  DEFAULT 0
--   preco_custo_medio           numeric  NOT NULL  DEFAULT 0.00
--   quantidade_gatilho_atacado  integer  NULL      DEFAULT 0
--
-- A migration 258 (`produtos_localizacao_nome_reduzido`) já tratava
-- `codigo_interno` como coluna preexistente ao corrigir um bug adjacente, o que
-- confirma a origem: foram criadas fora do diretório canônico (diretório legado
-- `pdv-importados/supabase/migrations/`, hoje descontinuado) e nunca tiveram
-- contrapartida aqui.
--
-- Mesma classe de drift já tratada nesta sprint em
-- `reaplica_102_produtos_codigo_barras_loja_unique`: efeito presente no banco
-- vivo sem migration correspondente. Tipos idênticos aos de produção para que
-- os dois ambientes convirjam de fato; `IF NOT EXISTS` torna tudo no-op em
-- produção.
--
-- NOTA sobre `produtos.loja_id`: local tem DEFAULT
-- 'a0000001-...-000000000001' (herdado da migration 102 original), produção não
-- tem default. Não é corrigido aqui de propósito — a coluna é NOT NULL e todo
-- caminho de escrita informa a loja explicitamente, então o default é inócuo;
-- removê-lo mexeria em produção sem necessidade. Fica registrado.

ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS codigo_interno varchar(50),
  ADD COLUMN IF NOT EXISTS quantidade_gatilho_atacado integer DEFAULT 0;

-- NOT NULL com default: a coluna é preenchida para as linhas existentes pelo
-- próprio default no momento do ADD COLUMN, então o SET NOT NULL não falha.
--
-- `numeric(10,2)` (e não `numeric` sem precisão): produção usa precisão/escala
-- explícitas, e `ADD COLUMN IF NOT EXISTS` NÃO ajusta o tipo de uma coluna que
-- já existe. Declarar `numeric` puro aqui deixaria produção com (10,2) e todo
-- banco novo com numeric ilimitado — arredondamento e valores aceitos
-- divergentes entre ambientes, exatamente o drift que esta migration existe
-- para eliminar. Achado em auditoria de 2026-08-16.
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS estoque_minimo integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS preco_custo_medio numeric(10,2) NOT NULL DEFAULT 0.00;

-- Convergência de tipo quando a coluna JÁ existia com precisão diferente
-- (o ADD COLUMN acima vira no-op nesse caso e não corrigiria nada).
DO $$
DECLARE
  v_precisao integer;
  v_escala integer;
BEGIN
  SELECT numeric_precision, numeric_scale INTO v_precisao, v_escala
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'produtos'
    AND column_name = 'preco_custo_medio';

  IF v_precisao IS DISTINCT FROM 10 OR v_escala IS DISTINCT FROM 2 THEN
    RAISE NOTICE 'preco_custo_medio: convergindo de numeric(%,%) para numeric(10,2)', v_precisao, v_escala;
    ALTER TABLE public.produtos
      ALTER COLUMN preco_custo_medio TYPE numeric(10,2);
  END IF;
END $$;

COMMENT ON COLUMN public.produtos.codigo_interno IS
  'Código interno/SKU próprio da loja. Reconciliada em 2026-08-16 — existia em produção sem migration canônica.';
COMMENT ON COLUMN public.produtos.quantidade_gatilho_atacado IS
  'Quantidade a partir da qual o preço de atacado do produto passa a valer. Reconciliada em 2026-08-16.';
COMMENT ON COLUMN public.produtos.estoque_minimo IS
  'Espelho de conveniência do mínimo no catálogo; a autoridade de saldo é `estoque`. Reconciliada em 2026-08-16.';
COMMENT ON COLUMN public.produtos.preco_custo_medio IS
  'Custo médio calculado nas entradas. Reconciliada em 2026-08-16.';
