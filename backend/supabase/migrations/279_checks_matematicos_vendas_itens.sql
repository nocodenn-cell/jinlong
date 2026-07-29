-- Migration 279: DB-07 — CHECK constraints matemáticas em vendas e itens_venda
-- Data: 2026-07-29
--
-- PROBLEMA
-- --------
-- A auditoria mostrou que os invariantes centrais do PDV não tinham guarda no
-- banco. `vendas` tinha apenas `total_* >= 0`; a identidade contábil
-- `total_liquido = total_bruto - total_desconto` dependia exclusivamente da RPC.
-- `itens_venda` tinha apenas `quantidade > 0` e o CHECK de `tipo_preco`, sem
-- nenhuma guarda sobre valores monetários.
--
-- VERIFICAÇÃO PRÉVIA (dados reais de produção, igualdade EXATA, sem tolerância)
-- ---------------------------------------------------------------------------
--   vendas = 56, itens_venda = 56
--   total_liquido <> total_bruto - total_desconto ......... 0
--   total_* negativos ..................................... 0
--   total_desconto > total_bruto .......................... 0
--   preco_unitario / desconto / original negativos ........ 0
--   desconto_unitario > preco_unitario_original ........... 0
--   custo_unitario_snap negativo .......................... 0
--
-- Correção de uma previsão da auditoria: eu havia registrado que "2 linhas de
-- seed violariam o CHECK". Errado. Aquela inconsistência é ENTRE TABELAS
-- (cabeçalho `total_desconto` = 12,50 vs soma das linhas = 0), e um CHECK do
-- Postgres é intra-linha por definição — não pode referenciar outra tabela.
-- As 2 vendas satisfazem 125,00 - 12,50 = 112,50 exatamente.
--
-- O QUE NÃO ENTRA, E POR QUÊ
-- --------------------------
-- A igualdade estrita `preco_unitario = preco_unitario_original -
-- desconto_unitario` foi DELIBERADAMENTE EXCLUÍDA. A v4 calcula:
--
--     v_desconto_unitario := GREATEST(0, v_preco_original - v_preco_unitario);
--
-- O clamp em 0 significa que, num cenário de ACRÉSCIMO (preco_unitario acima do
-- preço de tabela, via tipo_preco='MANUAL'), o desconto vira 0 e a identidade
-- quebra POR CONSTRUÇÃO. Impor a igualdade rejeitaria acréscimo — isso é regra
-- de negócio, fora do escopo de hardening.
--
-- Em vez dela, entra a versão fraca e sempre verdadeira:
--     desconto_unitario <= preco_unitario_original
-- garantida pelo próprio GREATEST(0, orig - unit) quando orig >= 0.
--
-- INVARIANTE NÃO EXPRESSÁVEL COMO CHECK
-- -------------------------------------
-- `vendas.total_desconto = SUM(itens_venda.quantidade * desconto_unitario)` é
-- um invariante ENTRE TABELAS. CHECK não alcança outra tabela; exigiria trigger
-- ou constraint deferida. Fica registrado como dívida — é exatamente o que as
-- 2 vendas de seed de 2026-04-08 violam hoje (R$ 25,00 de desconto sem lastro
-- em nenhuma linha).
--
-- SEGUNDO ESCRITOR DE `vendas` — risco aceito e documentado
-- --------------------------------------------------------
-- `registrar_venda_com_itens` (PDV local offline, via edge function
-- sync-outbox) insere `p_total_liquido` DIRETO do parâmetro, sem recalcular.
-- A constraint passa a validar também esse caminho. Se o cliente offline
-- divergir, o sync falha em vez de gravar ledger incoerente — a fila do outbox
-- retém o registro e o erro fica visível. Trade-off consciente: preferimos sync
-- travado e detectável a total corrompido e silencioso.
-- Aritmética exata: os três campos são numeric(10,2); a diferença de dois
-- valores de 2 casas é exata em 2 casas. Não há risco de falso positivo por
-- arredondamento.
--
-- ESTRATÉGIA
-- ----------
-- ADD CONSTRAINT ... NOT VALID seguido de VALIDATE CONSTRAINT. Com 56 linhas a
-- diferença é irrelevante, mas o padrão é o correto para o PROD futuro: o ADD
-- não varre a tabela e o VALIDATE toma SHARE UPDATE EXCLUSIVE, sem bloquear
-- leitura/escrita. O sucesso do VALIDATE é, ele próprio, a prova de que não há
-- violação no momento da aplicação.
--
-- ROLLBACK
-- --------
--   ALTER TABLE public.vendas      DROP CONSTRAINT vendas_identidade_totais;
--   ALTER TABLE public.itens_venda DROP CONSTRAINT itens_venda_preco_original_nao_negativo;
--   ALTER TABLE public.itens_venda DROP CONSTRAINT itens_venda_preco_unitario_nao_negativo;
--   ALTER TABLE public.itens_venda DROP CONSTRAINT itens_venda_desconto_nao_negativo;
--   ALTER TABLE public.itens_venda DROP CONSTRAINT itens_venda_desconto_ate_preco_original;
--   ALTER TABLE public.itens_venda DROP CONSTRAINT itens_venda_custo_nao_negativo;

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- vendas — identidade contábil do cabeçalho
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.vendas
  ADD CONSTRAINT vendas_identidade_totais
  CHECK (total_liquido = total_bruto - total_desconto) NOT VALID;

ALTER TABLE public.vendas VALIDATE CONSTRAINT vendas_identidade_totais;

-- ═══════════════════════════════════════════════════════════════════════════
-- itens_venda — valores monetários
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.itens_venda
  ADD CONSTRAINT itens_venda_preco_original_nao_negativo
  CHECK (preco_unitario_original >= 0) NOT VALID;
ALTER TABLE public.itens_venda VALIDATE CONSTRAINT itens_venda_preco_original_nao_negativo;

ALTER TABLE public.itens_venda
  ADD CONSTRAINT itens_venda_preco_unitario_nao_negativo
  CHECK (preco_unitario >= 0) NOT VALID;
ALTER TABLE public.itens_venda VALIDATE CONSTRAINT itens_venda_preco_unitario_nao_negativo;

ALTER TABLE public.itens_venda
  ADD CONSTRAINT itens_venda_desconto_nao_negativo
  CHECK (desconto_unitario >= 0) NOT VALID;
ALTER TABLE public.itens_venda VALIDATE CONSTRAINT itens_venda_desconto_nao_negativo;

-- Versão fraca da identidade: sempre verdadeira dado GREATEST(0, orig - unit).
-- Não impede acréscimo (preco_unitario > preco_unitario_original).
ALTER TABLE public.itens_venda
  ADD CONSTRAINT itens_venda_desconto_ate_preco_original
  CHECK (desconto_unitario <= preco_unitario_original) NOT VALID;
ALTER TABLE public.itens_venda VALIDATE CONSTRAINT itens_venda_desconto_ate_preco_original;

ALTER TABLE public.itens_venda
  ADD CONSTRAINT itens_venda_custo_nao_negativo
  CHECK (custo_unitario_snap IS NULL OR custo_unitario_snap >= 0) NOT VALID;
ALTER TABLE public.itens_venda VALIDATE CONSTRAINT itens_venda_custo_nao_negativo;

COMMIT;
