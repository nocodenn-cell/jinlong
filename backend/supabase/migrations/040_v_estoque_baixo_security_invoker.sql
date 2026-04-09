-- Supabase Performance Advisor: views sem security_invoker rodam com privilégios do dono (definer),
-- o que pode contornar RLS das tabelas base. Com security_invoker = true, a view respeita RLS
-- do usuário da sessão (authenticated), alinhado à regra de negócio multi-loja.

DROP VIEW IF EXISTS public.v_estoque_baixo;

CREATE VIEW public.v_estoque_baixo
WITH (security_invoker = true)
AS
SELECT
  p.id,
  p.nome,
  p.codigo_barras,
  p.origem,
  l.id AS loja_id,
  l.nome AS loja_nome,
  e.quantidade_atual,
  e.estoque_minimo,
  (e.estoque_minimo - e.quantidade_atual) AS deficit
FROM public.produtos p
  JOIN public.estoque e ON e.produto_id = p.id
  JOIN public.lojas l ON l.id = e.loja_id
WHERE p.ativo = true
  AND e.quantidade_atual <= e.estoque_minimo
ORDER BY deficit DESC;

COMMENT ON VIEW public.v_estoque_baixo IS
  'Produtos com estoque abaixo do mínimo, por loja (RLS do invoker nas tabelas base).';
