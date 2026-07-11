-- Migration 259: Adicionar vínculo de cliente em vendas (desbloqueio Fase 7)
--
-- CONTEXTO:
-- Migration 253 explicitou que vendas não possuía cliente_id (escopo Fase 7).
-- Esta migration implementa o vínculo: vendas ↔ clientes, habilitando:
-- - Rastreamento de cliente em venda
-- - Auditoria de cliente-vendedor
-- - Relatórios de vendas por cliente
-- - Integração com contas_receber (vínculo automático)
--
-- IDEMPOTÊNCIA: ADD COLUMN IF NOT EXISTS garante que re-run não falha.
-- RISCO: Nenhum — coluna NULL para vendas antigas (sem operação destrutiva).

-- 1) Adicionar coluna cliente_id (nullable, para vendas legadas)
ALTER TABLE public.vendas
  ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL;

-- 2) Índice para performance (gerente procura vendas por cliente)
CREATE INDEX IF NOT EXISTS idx_vendas_cliente
  ON public.vendas(cliente_id);

-- 3) Índice composto para relatórios (vendas de um cliente em período)
CREATE INDEX IF NOT EXISTS idx_vendas_cliente_data
  ON public.vendas(cliente_id, data)
  WHERE status = 'CONCLUIDA' AND cliente_id IS NOT NULL;

-- 4) RLS: operador pode inserir cliente_id de clientes visíveis
--    (herda RLS de clientes via FK)
-- (Sem policy explícita aqui; FK enforcement + RLS de leitura de clientes suficiente)

-- 5) Comentário para documentação
COMMENT ON COLUMN public.vendas.cliente_id IS
  'Referência ao cliente da venda (opcional). Usado para rastreamento de crédito, fiado e relatórios.';
