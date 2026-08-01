-- Onda A — detector de divergência entre saldo de estoque e ledger de movimentos.
--
-- Contexto: `estoque.quantidade_atual` é a fonte de verdade do saldo;
-- `movimentos_estoque_log` deveria explicá-lo. Medição de 31/07/2026: 22 de 110
-- linhas não fechavam. Esta view não corrige nada — ela torna a lacuna visível e
-- impede que cresça sem ninguém perceber.
--
-- Semântica: ausência de movimento conta como soma ZERO, não como divergência.
-- Uma linha de estoque zerada e sem movimento está correta (soma vazia = 0), e é
-- o caso da maioria dos produtos recém-cadastrados sem saldo inicial.
--
-- Aditivo e reversível: só cria view. Nenhuma tabela, coluna ou função alterada.

CREATE OR REPLACE VIEW public.v_estoque_ledger_divergencia
WITH (security_invoker = true) AS
SELECT
  e.loja_id,
  e.produto_id,
  p.nome                                        AS produto_nome,
  p.codigo_barras,
  e.quantidade_atual                            AS saldo_estoque,
  COALESCE(l.soma_delta, 0)                     AS soma_movimentos,
  e.quantidade_atual - COALESCE(l.soma_delta, 0) AS divergencia,
  COALESCE(l.qtd_movimentos, 0)                 AS qtd_movimentos,
  l.ultimo_movimento_em
FROM public.estoque e
JOIN public.produtos p
  ON p.id = e.produto_id
LEFT JOIN (
  SELECT
    produto_id,
    loja_id,
    SUM(quantidade_delta) AS soma_delta,
    COUNT(*)              AS qtd_movimentos,
    MAX(created_at)       AS ultimo_movimento_em
  FROM public.movimentos_estoque_log
  GROUP BY produto_id, loja_id
) l
  ON l.produto_id = e.produto_id
 AND l.loja_id    = e.loja_id
WHERE e.quantidade_atual <> COALESCE(l.soma_delta, 0);

COMMENT ON VIEW public.v_estoque_ledger_divergencia IS
  'Onda A — linhas de estoque cujo saldo não é explicado pela soma de movimentos_estoque_log. '
  'Ausência de movimento conta como soma zero. Vazia = ledger fecha. '
  'security_invoker: herda a RLS de estoque/produtos do usuário que consulta.';

-- Leitura pela mesma superfície das demais views de auditoria.
GRANT SELECT ON public.v_estoque_ledger_divergencia TO authenticated;
GRANT SELECT ON public.v_estoque_ledger_divergencia TO service_role;
