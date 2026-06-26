-- Capture: migration aplicada diretamente no DB em 2026-06-20.
-- Adiciona colunas tipo e endereco à tabela clientes.
-- Cria view v_clientes_gerente com saldo de crediário.
-- Idempotente: ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE VIEW.

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'PESSOA_FISICA',
  ADD COLUMN IF NOT EXISTS endereco text;

CREATE OR REPLACE VIEW public.v_clientes_gerente AS
SELECT
  c.id,
  c.nome,
  c.tipo,
  c.documento,
  c.email,
  c.telefone,
  c.endereco,
  c.limite_credito,
  COALESCE(cr.saldo, 0) AS saldo_crediario,
  NULL::timestamptz AS ultima_compra,
  c.created_at,
  c.loja_id,
  c.ativo
FROM clientes c
LEFT JOIN LATERAL (
  SELECT SUM(r.valor_aberto) AS saldo
  FROM contas_receber r
  WHERE r.cliente_id = c.id
    AND r.status = ANY(ARRAY['ABERTO', 'PARCIAL'])
) cr ON true;
