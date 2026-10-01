-- Onda A (integridade comercial): lista e KPIs de vendas por IDENTIDADE DE VENDA, não por evento.
--
-- Causa-raiz: /admin/vendas lia `listar_venda_eventos_gerente` / `kpis_venda_eventos_gerente`, que operam sobre o
-- ledger `venda_eventos` (append-only: cancelar acrescenta SALE_CANCELLED e mantém SALE_REGISTERED). Uma venda
-- cancelada virava 2 linhas (uma "CONCLUIDA", outra "CANCELADA") e contava como concluída E cancelada; a data de
-- referência era a do EVENTO, divergindo de Relatórios (vendas.data) e do Dashboard (vendas.data).
--
-- Contrato canônico (mesma semântica de relatorio_resumo_executivo_periodo / relatorio_vendas_por_dia_periodo):
--   identidade = vendas.id · estado = vendas.status · data = vendas.data · loja = caixas.loja_id (vendas não tem loja_id)
--   vendas_registradas = count(vendas) · vendas_concluidas/faturado = status CONCLUIDA
--   vendas_canceladas/valor_cancelado = status CANCELADA (cancelada NÃO entra em faturado nem em receita líquida)
--   devolucoes = devolucoes.valor com operacao_id IS NOT NULL (devolução pós-venda efetiva) de venda CONCLUIDA.
--     A linha que cancelar_venda_transacional grava em `devolucoes` tem operacao_id NULL e pertence a venda
--     CANCELADA: fica fora, logo não há contagem em dobro com o cancelamento.
--   receita_liquida = faturado - devolucoes · ticket_medio = faturado / vendas_concluidas (0 se zero; sem arredondar)
--   taxa_cancelamento = vendas_canceladas / vendas_registradas (fração 0..1; 0 se zero). Percentual é só apresentação.
--
-- Não altera as RPCs de eventos (continuam como histórico/auditoria e são usadas por dev-tools).
-- Padrão C1 (20260930090000): SECURITY DEFINER + identidade (service_role OU gerencial da loja pedida) + grants explícitos.
-- Idempotente (CREATE OR REPLACE + REVOKE/GRANT).

CREATE OR REPLACE FUNCTION public.listar_vendas_gerente(
  p_loja_id uuid,
  p_inicio timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_fim timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_status text[] DEFAULT NULL::text[],
  p_formas_pagamento text[] DEFAULT NULL::text[],
  p_offset integer DEFAULT 0,
  p_limit integer DEFAULT 21
)
RETURNS TABLE(
  venda_id uuid,
  status text,
  data timestamp with time zone,
  total_liquido numeric,
  total_bruto numeric,
  forma_pagamento text,
  caixa_id uuid,
  operador_id uuid,
  qtd_itens_total numeric,
  qtd_itens_distintos integer,
  primeiro_produto text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    v.id AS venda_id,
    v.status,
    v.data,
    v.total_liquido,
    v.total_bruto,
    v.forma_pagamento,
    v.caixa_id,
    v.operador_id,
    COALESCE(it.qtd_total, 0) AS qtd_itens_total,
    COALESCE(it.qtd_distintos, 0) AS qtd_itens_distintos,
    it.primeiro_produto
  FROM public.vendas v
  INNER JOIN public.caixas c ON c.id = v.caixa_id
  LEFT JOIN LATERAL (
    SELECT
      SUM(iv.quantidade)::numeric AS qtd_total,
      COUNT(*)::integer AS qtd_distintos,
      (
        SELECT p.nome
        FROM public.itens_venda iv2
        INNER JOIN public.produtos p ON p.id = iv2.produto_id
        WHERE iv2.venda_id = v.id
        ORDER BY iv2.id
        LIMIT 1
      ) AS primeiro_produto
    FROM public.itens_venda iv
    WHERE iv.venda_id = v.id
  ) it ON true
  WHERE c.loja_id = p_loja_id
    AND (auth.role() = 'service_role' OR public.auth_usuario_gerencial_loja(p_loja_id))
    AND (p_inicio IS NULL OR v.data >= p_inicio)
    AND (p_fim IS NULL OR v.data <= p_fim)
    AND (p_status IS NULL OR v.status = ANY(p_status))
    AND (p_formas_pagamento IS NULL OR v.forma_pagamento = ANY(p_formas_pagamento))
  ORDER BY v.data DESC, v.id DESC
  OFFSET GREATEST(p_offset, 0)
  LIMIT GREATEST(p_limit, 1);
$function$;

CREATE OR REPLACE FUNCTION public.kpis_vendas_gerente(
  p_loja_id uuid,
  p_inicio timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_fim timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_formas_pagamento text[] DEFAULT NULL::text[]
)
RETURNS TABLE(
  vendas_registradas bigint,
  vendas_concluidas bigint,
  faturado numeric,
  vendas_canceladas bigint,
  valor_cancelado numeric,
  devolucoes numeric,
  receita_liquida numeric,
  ticket_medio numeric,
  taxa_cancelamento numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT v.id, v.status, v.total_liquido
    FROM public.vendas v
    INNER JOIN public.caixas c ON c.id = v.caixa_id
    WHERE c.loja_id = p_loja_id
      AND (auth.role() = 'service_role' OR public.auth_usuario_gerencial_loja(p_loja_id))
      AND (p_inicio IS NULL OR v.data >= p_inicio)
      AND (p_fim IS NULL OR v.data <= p_fim)
      AND (p_formas_pagamento IS NULL OR v.forma_pagamento = ANY(p_formas_pagamento))
  ),
  agg AS (
    SELECT
      COUNT(*)::bigint AS registradas,
      COUNT(*) FILTER (WHERE b.status = 'CONCLUIDA')::bigint AS concluidas,
      COALESCE(SUM(b.total_liquido) FILTER (WHERE b.status = 'CONCLUIDA'), 0)::numeric(14,2) AS faturado,
      COUNT(*) FILTER (WHERE b.status = 'CANCELADA')::bigint AS canceladas,
      COALESCE(SUM(b.total_liquido) FILTER (WHERE b.status = 'CANCELADA'), 0)::numeric(14,2) AS cancelado
    FROM base b
  ),
  dev AS (
    SELECT COALESCE(SUM(d.valor), 0)::numeric(14,2) AS devolvido
    FROM public.devolucoes d
    INNER JOIN base b ON b.id = d.venda_id
    WHERE b.status = 'CONCLUIDA'
      AND d.operacao_id IS NOT NULL
  )
  SELECT
    a.registradas,
    a.concluidas,
    a.faturado,
    a.canceladas,
    a.cancelado,
    dv.devolvido,
    (a.faturado - dv.devolvido)::numeric(14,2),
    CASE WHEN a.concluidas > 0 THEN a.faturado / a.concluidas ELSE 0::numeric END,
    CASE WHEN a.registradas > 0 THEN ROUND(a.canceladas::numeric / a.registradas, 4) ELSE 0::numeric END
  FROM agg a
  CROSS JOIN dev dv;
$function$;

REVOKE ALL ON FUNCTION public.listar_vendas_gerente(uuid, timestamptz, timestamptz, text[], text[], integer, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listar_vendas_gerente(uuid, timestamptz, timestamptz, text[], text[], integer, integer)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.kpis_vendas_gerente(uuid, timestamptz, timestamptz, text[])
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kpis_vendas_gerente(uuid, timestamptz, timestamptz, text[])
  TO authenticated, service_role;

COMMENT ON FUNCTION public.listar_vendas_gerente(uuid, timestamptz, timestamptz, text[], text[], integer, integer) IS
  'Onda A: uma linha por vendas.id, com estado atual (vendas.status). Gerencial da loja ou service_role. O ledger venda_eventos continua só como histórico.';
COMMENT ON FUNCTION public.kpis_vendas_gerente(uuid, timestamptz, timestamptz, text[]) IS
  'Onda A: métricas canônicas por venda (registradas, concluídas, faturado, canceladas, devoluções pós-venda, receita líquida, ticket, taxa de cancelamento como fração). Mesma semântica de Relatórios.';
