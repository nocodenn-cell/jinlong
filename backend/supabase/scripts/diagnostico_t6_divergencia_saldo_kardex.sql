-- T6 (auditoria Jinlong 2026-09-27) — DIAGNÓSTICO, sem correção automática.
--
-- Lista, por produto/loja, a divergência entre o saldo real
-- (estoque.quantidade_atual) e a soma dos movimentos no kardex
-- (v_kardex_unificado, já corrigido pelo T5 — 20260927130000) e uma
-- classificação da causa provável.
--
-- Só leitura: nenhum INSERT/UPDATE/DELETE. Rodar no SQL Editor de
-- DEV/STAGING/produção com um papel de leitura (RLS: como este script não
-- passa por sessão de usuário, rode com service_role/postgres para ver
-- todas as lojas, ou restrinja com "AND e.loja_id = '<uuid>'" abaixo).
--
-- IMPORTANTE (regra do plano): não lançar ajuste nenhum a partir deste
-- relatório sem aprovação manual, por produto. Este script não decide nada
-- — só aponta onde olhar.
--
-- Causas prováveis que este script consegue distinguir:
--   SALDO_SEM_MOVIMENTO_INICIAL — produto tem saldo mas nenhum movimento no
--     kardex (import/seed que setou quantidade_atual direto, sem log).
--   DIVERGENCIA_POS_MOVIMENTOS  — há movimentos, mas a soma não bate com o
--     saldo. A coluna `cancelamentos_com_par_duplicado` sinaliza vendas
--     canceladas ANTES do T5 (20260927130000) cujo par duplicado
--     (ENTRADA_DEVOLUCAO_CLIENTE + ENTRADA_CANCELAMENTO_VENDA para o mesmo
--     evento) pode ter sido usado, antes da correção, para calcular um
--     ajuste manual errado — é pista, não confirmação: o kardex em si já
--     está corrigido (é uma VIEW, recalcula ao vivo), então essas vendas
--     canceladas já NÃO duplicam mais na soma abaixo. Se ainda assim há
--     divergência, a causa é outra (ajuste manual anterior, dado de
--     antes do kardex existir, etc.) — precisa de investigação caso a caso.

WITH kardex_soma AS (
  SELECT
    k.loja_id,
    k.produto_id,
    SUM(k.quantidade_delta) AS soma_kardex,
    COUNT(*) AS qtd_movimentos,
    MIN(k.ocorrido_em) AS primeiro_movimento,
    MAX(k.ocorrido_em) AS ultimo_movimento
  FROM public.v_kardex_unificado k
  GROUP BY k.loja_id, k.produto_id
),
cancelamentos_suspeitos AS (
  -- Vendas canceladas com o par que a view já corrige (T5), mas que podem
  -- ter alimentado um ajuste manual feito enquanto o bug ainda existia.
  SELECT
    erc.produto_id,
    v.caixa_id,
    c.loja_id,
    COUNT(*) AS qtd
  FROM public.estoque_reposicoes_cancelamento erc
  JOIN public.vendas v ON v.id = erc.venda_id
  JOIN public.caixas c ON c.id = v.caixa_id
  JOIN public.movimentos_estoque_log mel
    ON mel.venda_id = erc.venda_id
   AND mel.produto_id = erc.produto_id
   AND mel.tipo_codigo = 'ENTRADA_DEVOLUCAO_CLIENTE'
  GROUP BY erc.produto_id, v.caixa_id, c.loja_id
),
divergencias AS (
  SELECT
    e.loja_id,
    e.produto_id,
    p.nome AS produto_nome,
    e.quantidade_atual AS saldo_atual,
    COALESCE(k.soma_kardex, 0) AS soma_kardex,
    ROUND(e.quantidade_atual - COALESCE(k.soma_kardex, 0), 3) AS divergencia,
    COALESCE(k.qtd_movimentos, 0) AS qtd_movimentos_kardex,
    k.primeiro_movimento,
    k.ultimo_movimento,
    COALESCE(cs.qtd, 0) AS cancelamentos_com_par_duplicado
  FROM public.estoque e
  JOIN public.produtos p ON p.id = e.produto_id
  LEFT JOIN kardex_soma k ON k.loja_id = e.loja_id AND k.produto_id = e.produto_id
  LEFT JOIN (
    SELECT loja_id, produto_id, SUM(qtd) AS qtd FROM cancelamentos_suspeitos GROUP BY loja_id, produto_id
  ) cs ON cs.loja_id = e.loja_id AND cs.produto_id = e.produto_id
)
SELECT
  loja_id,
  produto_id,
  produto_nome,
  saldo_atual,
  soma_kardex,
  divergencia,
  qtd_movimentos_kardex,
  cancelamentos_com_par_duplicado,
  primeiro_movimento,
  ultimo_movimento,
  CASE
    WHEN qtd_movimentos_kardex = 0 AND saldo_atual <> 0 THEN 'SALDO_SEM_MOVIMENTO_INICIAL'
    ELSE 'DIVERGENCIA_POS_MOVIMENTOS'
  END AS causa_provavel
FROM divergencias
WHERE divergencia <> 0
ORDER BY ABS(divergencia) DESC;
