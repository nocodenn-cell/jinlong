-- Migration 263: cliente_id em vendas — base para "Cliente da Venda" no PDV
--
-- Contexto: o PDV vai permitir vincular um cliente (existente ou cadastrado na
-- hora) à venda, para fortalecer atacado/fidelização. A tabela `vendas` (venda
-- concluída) ainda não tinha essa coluna — só `vendas_em_espera.cliente_id`
-- existia (migration 255). Esta migration fecha esse gap.
--
-- Coluna nullable: cliente na venda é opcional (não bloqueia finalização).
-- FK com ON DELETE SET NULL: excluir/anonimizar um cliente (LGPD) não pode
-- travar nem apagar o histórico de vendas já registrado.

ALTER TABLE public.vendas
  ADD COLUMN IF NOT EXISTS cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_vendas_cliente_id ON public.vendas (cliente_id) WHERE cliente_id IS NOT NULL;
