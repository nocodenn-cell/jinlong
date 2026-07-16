-- ============================================================
-- Migration 273 — CAPTURE de reconciliação (P0.1)
-- Versiona objetos aplicados em produção fora do repo (ledger:
-- 263_vendas_cliente_id, 265_clientes_insert_operador_pdv,
-- 266_clientes_unique_documento_loja). Captura fiel de 2026-07-16.
-- Idempotente, behavior-preserving. NÃO inclui a evolução da RPC
-- finalizar_venda v4 (264) — ver P0_DB_DRIFT_RECONCILIATION.md §"divergente".
-- ============================================================

-- 263: coluna cliente_id em vendas + índice parcial
ALTER TABLE public.vendas ADD COLUMN IF NOT EXISTS cliente_id uuid;
CREATE INDEX IF NOT EXISTS idx_vendas_cliente_id ON public.vendas USING btree (cliente_id) WHERE (cliente_id IS NOT NULL);

-- 266: unicidade de documento por loja (parcial: só quando documento não nulo)
CREATE UNIQUE INDEX IF NOT EXISTS clientes_loja_documento_unique ON public.clientes USING btree (loja_id, documento) WHERE (documento IS NOT NULL);

-- 265: policy de INSERT em clientes (operador/admin da loja)
DROP POLICY IF EXISTS clientes_insert_loja ON public.clientes;
CREATE POLICY clientes_insert_loja ON public.clientes FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid()
    AND (u.perfil = 'ADMIN' OR u.loja_id = clientes.loja_id)));
