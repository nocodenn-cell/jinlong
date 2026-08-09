-- ============================================================
-- Migration 253 (renumerado de 245 em 2026-07-03): Reparo do módulo Clientes
-- (desbloqueio Fase 1).
--
-- RENUMERADO: colidia com 245_calcular_preco_produto_precedence_comment.sql
-- (mesmo prefixo numérico) — quebrava `db reset`/replay sequencial com
-- duplicate key em schema_migrations_pkey. Confirmado com o usuário via
-- `npx supabase migration list` contra produção: nem esta migration nem sua
-- colidente tinham entrada em Remote antes desta mudança. Conteúdo abaixo
-- inalterado (sem dependência cruzada verificada antes de renumerar).
-- ============================================================
-- Migration 245: Reparo do módulo Clientes (desbloqueio Fase 1)
--
-- Contexto (auditoria 2026-06-20):
-- O frontend (app/gerente/clientes/actions.ts) lia/gravava colunas
-- inexistentes em `clientes` (`tipo`, `endereco`) e computados
-- (`saldo_crediario`, `ultima_compra`), além de nomes divergentes
-- (`limite_crediario`→`limite_credito`, `criado_em`→`created_at`).
-- Resultado: listar/criar/editar cliente quebravam em runtime
-- ("column does not exist").
--
-- Esta migration:
--   1. Adiciona as colunas reais que faltam: `tipo` (PF/PJ) e `endereco`.
--   2. Cria a view `v_clientes_gerente` (security_invoker) que expõe os
--      campos computados de forma consistente:
--        - saldo_crediario = soma de contas_receber em aberto do cliente
--          (contas_receber.cliente_id existe);
--        - ultima_compra = NULL por ora — `vendas` ainda não possui
--          `cliente_id` (vínculo venda↔cliente é escopo da Fase 7).
--
-- A view herda RLS de `clientes`/`contas_receber` (security_invoker=on),
-- preservando o isolamento por loja já estabelecido na migration 112.
-- Idempotente.
-- ============================================================

-- 1) Colunas reais que faltavam --------------------------------------------

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'PF',
  ADD COLUMN IF NOT EXISTS endereco text;

-- A coluna `tipo` já pode existir com valores/DEFAULT divergentes, vindos da
-- captura 20260620200253_244 (aplicada direto no DB em 2026-06-20, com
-- DEFAULT 'PESSOA_FISICA'). ADD COLUMN IF NOT EXISTS acima é no-op nesse
-- caso — normaliza aqui os valores legados para o domínio PF/PJ e corrige
-- o DEFAULT antes de travar o CHECK abaixo.
UPDATE public.clientes SET tipo = 'PF' WHERE tipo = 'PESSOA_FISICA';
UPDATE public.clientes SET tipo = 'PJ' WHERE tipo = 'PESSOA_JURIDICA';
ALTER TABLE public.clientes ALTER COLUMN tipo SET DEFAULT 'PF';

-- Garante o domínio PF/PJ sem falhar se já existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clientes_tipo_check'
  ) THEN
    ALTER TABLE public.clientes
      ADD CONSTRAINT clientes_tipo_check CHECK (tipo IN ('PF', 'PJ'));
  END IF;
END $$;

-- 2) View de leitura para o gerente (campos computados) ---------------------

CREATE OR REPLACE VIEW public.v_clientes_gerente
WITH (security_invoker = true) AS
SELECT
  c.id,
  c.nome,
  c.tipo,
  c.documento,
  c.email,
  c.telefone,
  c.endereco,
  c.limite_credito,
  COALESCE(cr.saldo, 0)::numeric AS saldo_crediario,
  NULL::timestamptz             AS ultima_compra,
  c.created_at,
  c.loja_id,
  c.ativo
FROM public.clientes c
LEFT JOIN LATERAL (
  SELECT SUM(r.valor_aberto) AS saldo
  FROM   public.contas_receber r
  WHERE  r.cliente_id = c.id
    AND  r.status IN ('ABERTO', 'PARCIAL')
) cr ON true;

GRANT SELECT ON public.v_clientes_gerente TO authenticated;
GRANT SELECT ON public.v_clientes_gerente TO service_role;

COMMENT ON VIEW public.v_clientes_gerente IS
  'Clientes com saldo_crediario computado (contas_receber em aberto). ultima_compra=NULL até a Fase 7 (vendas.cliente_id). security_invoker=on herda RLS por loja.';
