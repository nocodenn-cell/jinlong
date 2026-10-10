-- Sync-outbox inseria `caixas` sem loja_id. A coluna é NOT NULL com default
-- a0000001-0000-4000-8000-000000000001 (migration 032), então a venda e a baixa
-- de estoque iam para a loja piloto. Sem default, o INSERT sem loja falha.
-- A Edge passa a exigir loja_id no evento. Não aplicar em produção nesta sprint.
--
-- Rollback: ALTER TABLE public.caixas ALTER COLUMN loja_id
--   SET DEFAULT 'a0000001-0000-4000-8000-000000000001'::uuid;

ALTER TABLE public.caixas ALTER COLUMN loja_id DROP DEFAULT;
