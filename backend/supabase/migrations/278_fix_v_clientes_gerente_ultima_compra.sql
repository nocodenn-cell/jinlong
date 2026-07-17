-- v_clientes_gerente.ultima_compra estava hardcoded NULL::timestamptz desde a
-- migration 244 (com um comentário no repo em app/gerente/clientes/actions.ts
-- dizendo "até a Fase 7 (vendas ainda não possui cliente_id)"). Esse comentário
-- está desatualizado: vendas.cliente_id já existe em produção (capturado como
-- migration 273, com índice parcial idx_vendas_cliente_id já presente). Esta
-- migration corrige a view para computar a última compra de verdade, sem
-- alterar nenhuma outra coluna.
--
-- Aplicada em produção (jinlong) em 2026-07-17, validada com smoke
-- comportamental em transação com ROLLBACK: confirma que a view escolhe a
-- venda CONCLUIDA mais recente (não a mais antiga) e que saldo_crediario
-- continua correto (sem regressão).
CREATE OR REPLACE VIEW public.v_clientes_gerente
WITH (security_invoker = true)
AS
SELECT c.id, c.nome, c.tipo, c.documento, c.email, c.telefone, c.endereco,
  c.limite_credito,
  COALESCE(cr.saldo, 0::numeric) AS saldo_crediario,
  uc.ultima_compra,
  c.created_at, c.loja_id, c.ativo
FROM clientes c
LEFT JOIN LATERAL (
  SELECT sum(r.valor_aberto) AS saldo
  FROM contas_receber r
  WHERE r.cliente_id = c.id AND r.status = ANY (ARRAY['ABERTO'::text, 'PARCIAL'::text])
) cr ON true
LEFT JOIN LATERAL (
  SELECT max(v.data) AS ultima_compra
  FROM vendas v
  WHERE v.cliente_id = c.id AND v.status = 'CONCLUIDA'
) uc ON true;
