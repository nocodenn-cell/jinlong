-- Reconciliacao Frontend <-> Backend do bloco de comissoes (pos DB-05 A-F).
--
-- NAO faz parte da sequencia certificada DB-05A..F e NAO altera nenhum artefato
-- criado por ela (comissoes_vendedores, comissoes_ajustes, comissoes_pagamentos,
-- comissoes_itens, liquidar_comissoes, processar_ajuste_comissao_venda,
-- calcular_comissao_venda, os triggers de apuracao/cancelamento/pos-venda, os
-- FKs RESTRICT e os gatilhos de imutabilidade de E -- nenhum desses e tocado
-- aqui). O que muda sao DUAS funcoes de RELATORIO pre-existentes, anteriores a
-- DB-05 (parte de 260/261_comissoes_regras_funcionario / vendedores_regra):
--
--   public.resumo_comissoes_por_operador
--   public.detalhe_comissoes_operador
--
-- Achado (dívida de reconciliacao, nao um bug em DB-05): essas duas funcoes
-- somavam `comissoes_vendedores.valor_comissao` BRUTO diretamente, sem nunca
-- ler `comissoes_ajustes` ou `comissoes_pagamentos`. A UI (`/gerente/comissoes`,
-- `/admin/comissoes`) exibia esse bruto como se fosse "pago"/"pendente" liquido
-- -- o financeiro certificado em E existe no banco, mas a tela nunca o lia.
--
-- Correcao: as duas funcoes passam a projetar/agregar as views ja certificadas
-- de DB-05E (`comissoes_reconstrucao_auditoria`, `comissoes_ajustes_auditoria`).
-- Nenhuma formula nova. Nenhum calculo financeiro este arquivo introduz --
-- apenas JOIN, GROUP BY e jsonb_agg sobre o que ja esta calculado e certificado.
--
-- ROLLBACK: restaurar as duas funcoes do estado anterior a esta migration
-- (ver `20260711020053_261_comissoes_vendedores_regra_e_congelamento.sql` para
-- a definicao original de resumo_comissoes_por_operador/detalhe_comissoes_operador).

BEGIN;

-- ===========================================================================
-- 1) resumo_comissoes_por_operador -- KPIs por operador, semantica explicita
-- ===========================================================================
--   total_comissao_bruta   = soma do fato original congelado (comissoes_vendedores,
--                             via valor_original de comissoes_reconstrucao_auditoria)
--   total_ajustes           = soma dos ajustes lancados (cancelamento/devolucao/troca)
--   total_liquido_pago      = soma do que REALMENTE saiu (valor_pago, de
--                             comissoes_pagamentos, via a mesma view)
--   total_saldo_residual    = soma do saldo economico atual (saldo_final): o que
--                             ainda falta compensar/pagar, incluindo debito de
--                             ajuste chegado DEPOIS de uma comissao ja paga.

DROP FUNCTION IF EXISTS public.resumo_comissoes_por_operador(uuid, date, date, text);

CREATE FUNCTION public.resumo_comissoes_por_operador(
  p_loja_id uuid,
  p_de date DEFAULT NULL,
  p_ate date DEFAULT NULL,
  p_status text DEFAULT 'todos'
)
RETURNS TABLE(
  operador_id uuid,
  operador_nome text,
  total_vendas bigint,
  total_comissao_bruta numeric,
  total_ajustes numeric,
  total_liquido_pago numeric,
  total_saldo_residual numeric
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT
    cv.operador_id,
    u.nome AS operador_nome,
    COUNT(*) AS total_vendas,
    COALESCE(SUM(r.valor_original), 0)::numeric(14,2) AS total_comissao_bruta,
    COALESCE(SUM(r.valor_ajustado), 0)::numeric(14,2) AS total_ajustes,
    COALESCE(SUM(r.valor_pago), 0)::numeric(14,2) AS total_liquido_pago,
    COALESCE(SUM(r.saldo_final), 0)::numeric(14,2) AS total_saldo_residual
  FROM public.comissoes_vendedores cv
  JOIN public.usuarios u ON u.id = cv.operador_id
  JOIN public.comissoes_reconstrucao_auditoria r ON r.comissao_id = cv.id
  WHERE cv.loja_id = p_loja_id
    AND (p_de  IS NULL OR cv.created_at::date >= p_de)
    AND (p_ate IS NULL OR cv.created_at::date <= p_ate)
    AND (p_status = 'todos' OR cv.status = p_status)
  GROUP BY cv.operador_id, u.nome
  ORDER BY total_saldo_residual DESC, u.nome;
$function$;

COMMENT ON FUNCTION public.resumo_comissoes_por_operador(uuid, date, date, text) IS
  'KPIs por operador com semantica liquida explicita: bruto apurado, ajustes lancados, liquido realmente pago (comissoes_pagamentos) e saldo residual (comissoes_ajustes ainda nao compensados + comissoes pendentes). Fonte: comissoes_reconstrucao_auditoria (DB-05E), sem formula nova.';

REVOKE ALL ON FUNCTION public.resumo_comissoes_por_operador(uuid, date, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resumo_comissoes_por_operador(uuid, date, date, text) TO authenticated;

-- ===========================================================================
-- 2) detalhe_comissoes_operador -- por comissao, com ajustes aninhados
-- ===========================================================================
--   Cada linha e uma comissao original (fato congelado). O campo `ajustes` traz
--   o array de eventos que a afetaram (CANCELAMENTO/DEVOLUCAO/TROCA), cada um
--   com ator, origem e quanto ja foi consumido por pagamento -- tudo vindo de
--   comissoes_ajustes_auditoria (DB-05E), sem recalcular nada no frontend.

DROP FUNCTION IF EXISTS public.detalhe_comissoes_operador(uuid, uuid, date, date);

CREATE FUNCTION public.detalhe_comissoes_operador(
  p_loja_id uuid,
  p_operador_id uuid,
  p_de date DEFAULT NULL,
  p_ate date DEFAULT NULL
)
RETURNS TABLE(
  comissao_id uuid,
  venda_id uuid,
  base_calculo numeric,
  status text,
  created_at timestamptz,
  valor_original numeric,
  valor_ajustado numeric,
  valor_compensado numeric,
  valor_liquido_apurado numeric,
  valor_pago numeric,
  pagamento_id uuid,
  pago_em timestamptz,
  saldo_final numeric,
  ajustes jsonb
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT
    cv.id AS comissao_id,
    cv.venda_id,
    cv.base_calculo,
    cv.status,
    cv.created_at,
    r.valor_original,
    r.valor_ajustado,
    r.valor_compensado,
    r.valor_liquido_apurado,
    r.valor_pago,
    r.pagamento_id,
    r.pago_em,
    r.saldo_final,
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'ajuste_id', a.ajuste_id,
          'tipo', a.tipo,
          'valor', a.valor,
          'ator_id', a.ator_id,
          'origem_tipo', a.origem_tipo,
          'origem_ocorrida_em', a.origem_ocorrida_em,
          'venda_substituta_id', a.venda_substituta_id,
          'created_at', a.created_at,
          'valor_consumido', a.valor_consumido,
          'valor_pendente', a.valor_pendente
        ) ORDER BY a.created_at
      )
      FROM public.comissoes_ajustes_auditoria a
      WHERE a.comissao_id = cv.id
    ), '[]'::jsonb) AS ajustes
  FROM public.comissoes_vendedores cv
  JOIN public.comissoes_reconstrucao_auditoria r ON r.comissao_id = cv.id
  WHERE cv.loja_id = p_loja_id
    AND cv.operador_id = p_operador_id
    AND (p_de  IS NULL OR cv.created_at::date >= p_de)
    AND (p_ate IS NULL OR cv.created_at::date <= p_ate)
  ORDER BY cv.created_at DESC;
$function$;

COMMENT ON FUNCTION public.detalhe_comissoes_operador(uuid, uuid, date, date) IS
  'Detalhe por comissao (fato original congelado) com o array de ajustes que a afetaram (tipo real CANCELAMENTO/DEVOLUCAO/TROCA, ator, origem, consumo por pagamento). Fonte: comissoes_reconstrucao_auditoria + comissoes_ajustes_auditoria (DB-05E), sem formula nova.';

REVOKE ALL ON FUNCTION public.detalhe_comissoes_operador(uuid, uuid, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.detalhe_comissoes_operador(uuid, uuid, date, date) TO authenticated;

COMMIT;
