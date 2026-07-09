-- Migration 258: cadastro de produto profissional (atacado) — Aba 1/2.
--
-- 1) produtos.localizacao_prateleira: coluna já esperada pelo código da aplicação
--    (app/gerente/produtos/actions.ts seleciona esta coluna em `produtos`), mas
--    NUNCA foi aplicada em produção (só existia numa migration legada em
--    pdv-importados/supabase/migrations/075_localizacao_prateleira.sql, fora do
--    diretório canônico backend/supabase/migrations). Efeito do bug: o SELECT
--    falhava silenciosamente (erro ignorado pelo `?? []`), zerando também
--    codigo_interno, preco_custo, permitir_abaixo_custo e status_publicacao no
--    catálogo (`buscarProdutosComFiltros`). Esta migration corrige a causa raiz.
--
-- 2) produtos.nome_reduzido_pdv: campo comercial novo (nome curto para exibição
--    no PDV), aditivo e opcional — não afeta produtos existentes nem o motor
--    de preço.
--
-- Ambas idempotentes (ADD COLUMN IF NOT EXISTS); nenhuma lógica de negócio ou
-- RPC é alterada.

ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS localizacao_prateleira text NULL;

COMMENT ON COLUMN public.produtos.localizacao_prateleira IS
  'Localização física do produto na loja (ex.: "A-12", "ESTANTE 3"). Somente informativo.';

ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS nome_reduzido_pdv text NULL;

COMMENT ON COLUMN public.produtos.nome_reduzido_pdv IS
  'Nome reduzido opcional para exibição compacta no PDV (cupom/tela de venda). NULL usa produtos.nome.';
