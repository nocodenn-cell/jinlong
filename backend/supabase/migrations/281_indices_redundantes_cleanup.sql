-- 281_indices_redundantes_cleanup.sql
--
-- FRENTE 6 (Database Integrity Hardening) — remove 2 índices redundantes que
-- escaparam da migration 222, seguindo EXATAMENTE o mesmo critério dela:
-- mantém o índice respaldado por constraint (UNIQUE) ou de nome canônico, remove
-- a cópia simples redundante. DROP INDEX é seguro; independe de estatísticas de uso.
--
-- ESCOPO DELIBERADAMENTE MÍNIMO (evidência: pg_index/pg_stat de produção,
-- jinlong kbabmewnahysfvlybiak, 2026-07-17):
-- O inventário completo (229 índices) foi classificado em A) duplicados,
-- B) redundantes, C) não-usados. Apenas estes 2 são removidos. Ver
-- docs/DATABASE_INTEGRITY_FIXES.md (tabela completa) e DECISIONS DEC-08 para a
-- justificativa de MANTER todos os demais candidatos (paths multi-tenant quentes;
-- idx_scan não confiável em ambiente de baixo tráfego — 96 "não usados" refletem
-- workload não exercido, não inutilidade).
--
-- ── Índice 1: idx_produtos_categoria_id ─────────────────────────────────────
-- Duplicata EXATA de idx_produtos_categoria (001), mesma coluna (categoria_id).
-- Criado por 085_indices_filtros_produtos.sql. Não existe em produção (0 em
-- pg_class) — logo o DROP é no-op no remoto; corrige apenas o BOOTSTRAP, onde
-- 001 e 085 criariam os dois. Survivor: idx_produtos_categoria (nome canônico, 001).
--
-- ── Índice 2: idx_contas_receber_venda_id ───────────────────────────────────
-- Redundante com contas_receber_venda_id_unique (índice UNIQUE parcial em
-- venda_id WHERE venda_id IS NOT NULL). Ambos indexam venda_id; a UNIQUE cobre
-- todos os lookups por venda_id (sempre não-nulo quando consultado). O simples
-- (223_indices_fks_sem_cobertura.sql, criado como cobertura de FK) tornou-se
-- redundante quando 24701 adicionou a UNIQUE — que também cobre a FK.
-- Survivor: contas_receber_venda_id_unique (respaldado por constraint).
--
-- NÃO TOCADOS (mantidos — ver DEC-08): os 7 redundantes-por-prefixo de coluna
-- única loja_id/venda_id (idx_caixas_loja_id, idx_clientes_loja,
-- idx_contas_pagar_loja, idx_contas_receber_loja, idx_estoque_loja,
-- idx_vendas_pagamentos_venda_id) — a 222 os manteve por escolha (paths
-- multi-tenant quentes); os 96 índices com idx_scan=0 (métrica não confiável
-- neste ambiente); e os 2 duplicados de funcionarios_meta (tabela morta — DEC-02).
--
-- IDEMPOTÊNCIA: DROP INDEX IF EXISTS. ROLLBACK: recriar os índices simples.

BEGIN;

DROP INDEX IF EXISTS public.idx_produtos_categoria_id;
DROP INDEX IF EXISTS public.idx_contas_receber_venda_id;

COMMIT;

-- ─── VALIDAÇÃO PÓS-APLICAÇÃO ────────────────────────────────────────────────
-- (1) Os 2 removidos não existem mais; os survivors continuam:
--   SELECT relname FROM pg_class WHERE relname IN
--     ('idx_produtos_categoria_id','idx_contas_receber_venda_id',        -- devem sumir
--      'idx_produtos_categoria','contas_receber_venda_id_unique');       -- devem permanecer
-- (2) A constraint UNIQUE de contas_receber segue válida:
--   SELECT conname, convalidated FROM pg_constraint
--   WHERE conrelid='public.contas_receber'::regclass AND contype='u';
-- (3) Nenhum índice de PK/UNIQUE foi removido (só 2 índices simples).
