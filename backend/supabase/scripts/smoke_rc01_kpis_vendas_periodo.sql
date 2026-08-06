-- ============================================================================
-- SMOKE RC-001 — KPI de Vendas reflete o PERÍODO INTEIRO, não a página.
--
-- Contexto: `app/admin/vendas/page.tsx` somava `vendas.reduce(...)` sobre as ~20
-- linhas da página atual, enquanto a action já devolvia `hasMore`. O DONO via um
-- faturamento menor que o real e decidia sobre número falso.
--
-- Correção (2026-08-06): a página passou a consumir `obterKpisVendas` →
-- `kpis_venda_eventos_gerente`, que agrega sobre todo o período filtrado.
--
-- Este script valida a RPC de que a tela agora depende, contra a fonte crua
-- (`venda_eventos`). Somente leitura — nenhuma escrita, seguro em produção.
--
-- Uso:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f smoke_rc01_kpis_vendas_periodo.sql
-- ============================================================================

DO $smoke$
DECLARE
  v_loja_id uuid;
  v_rpc record;
  v_cru record;
  v_inicio timestamptz;
  v_fim timestamptz;
BEGIN
  -- Loja com mais eventos de venda: o cenário mais exigente disponível.
  SELECT loja_id INTO v_loja_id
  FROM public.venda_eventos
  GROUP BY loja_id
  ORDER BY count(*) DESC
  LIMIT 1;

  IF v_loja_id IS NULL THEN
    RAISE NOTICE 'SMOKE_RC01: sem eventos de venda — nada a validar.';
    RETURN;
  END IF;

  -- ==========================================================================
  -- Cenário 1 — período completo (sem filtro): RPC == soma crua.
  -- ==========================================================================
  SELECT * INTO v_rpc
  FROM public.kpis_venda_eventos_gerente(v_loja_id, NULL, NULL, NULL);

  SELECT
    COALESCE(SUM(total) FILTER (WHERE event_type = 'SALE_REGISTERED'), 0)::numeric(10,2) AS faturado,
    COUNT(*) FILTER (WHERE event_type = 'SALE_REGISTERED')                               AS qtd_concluidas,
    COUNT(*) FILTER (WHERE event_type = 'SALE_CANCELLED')                                AS qtd_canceladas,
    COALESCE(SUM(total) FILTER (WHERE event_type = 'SALE_CANCELLED'), 0)::numeric(10,2)  AS valor_canceladas
  INTO v_cru
  FROM public.venda_eventos
  WHERE loja_id = v_loja_id;

  IF v_rpc.faturado IS DISTINCT FROM v_cru.faturado THEN
    RAISE EXCEPTION 'SMOKE_RC01_C1_FATURADO: rpc=% cru=%', v_rpc.faturado, v_cru.faturado;
  END IF;
  IF v_rpc.qtd_concluidas IS DISTINCT FROM v_cru.qtd_concluidas THEN
    RAISE EXCEPTION 'SMOKE_RC01_C1_CONCLUIDAS: rpc=% cru=%', v_rpc.qtd_concluidas, v_cru.qtd_concluidas;
  END IF;
  IF v_rpc.qtd_canceladas IS DISTINCT FROM v_cru.qtd_canceladas THEN
    RAISE EXCEPTION 'SMOKE_RC01_C1_CANCELADAS: rpc=% cru=%', v_rpc.qtd_canceladas, v_cru.qtd_canceladas;
  END IF;
  IF v_rpc.valor_canceladas IS DISTINCT FROM v_cru.valor_canceladas THEN
    RAISE EXCEPTION 'SMOKE_RC01_C1_VALOR_CANCELADAS: rpc=% cru=%', v_rpc.valor_canceladas, v_cru.valor_canceladas;
  END IF;
  RAISE NOTICE 'SMOKE_RC01 C1 OK — periodo completo: faturado=% concluidas=% canceladas=%',
    v_rpc.faturado, v_rpc.qtd_concluidas, v_rpc.qtd_canceladas;

  -- ==========================================================================
  -- Cenário 2 — a agregação supera QUALQUER página (o defeito original).
  -- Se houver mais eventos que o PAGE_SIZE do admin (20), a soma da 1ª página
  -- é necessariamente menor que a do período. É exatamente o que a tela exibia.
  -- ==========================================================================
  IF v_cru.qtd_concluidas > 20 THEN
    DECLARE
      v_faturado_pagina numeric;
    BEGIN
      SELECT COALESCE(SUM(total) FILTER (WHERE event_type = 'SALE_REGISTERED'), 0)::numeric(10,2)
      INTO v_faturado_pagina
      FROM (
        SELECT * FROM public.venda_eventos
        WHERE loja_id = v_loja_id
        ORDER BY occurred_at DESC
        LIMIT 20
      ) pagina;

      IF v_faturado_pagina >= v_rpc.faturado THEN
        RAISE EXCEPTION
          'SMOKE_RC01_C2: pagina (%) deveria ser MENOR que o periodo (%) com % vendas',
          v_faturado_pagina, v_rpc.faturado, v_cru.qtd_concluidas;
      END IF;

      RAISE NOTICE
        'SMOKE_RC01 C2 OK — pagina exibiria % de um total de % (defeito de -%%%)',
        v_faturado_pagina, v_rpc.faturado,
        ROUND((v_rpc.faturado - v_faturado_pagina) / NULLIF(v_rpc.faturado, 0) * 100, 1);
    END;
  ELSE
    RAISE NOTICE 'SMOKE_RC01 C2 pulado — loja tem <= 20 vendas, uma pagina cobre tudo.';
  END IF;

  -- ==========================================================================
  -- Cenário 3 — filtro de período recorta de fato (não ignora os limites).
  -- ==========================================================================
  SELECT MIN(occurred_at), MAX(occurred_at) INTO v_inicio, v_fim
  FROM public.venda_eventos WHERE loja_id = v_loja_id;

  IF v_inicio IS DISTINCT FROM v_fim THEN
    DECLARE
      v_meio timestamptz := v_inicio + (v_fim - v_inicio) / 2;
      v_rpc_parcial record;
      v_cru_parcial record;
    BEGIN
      SELECT * INTO v_rpc_parcial
      FROM public.kpis_venda_eventos_gerente(v_loja_id, v_meio, NULL, NULL);

      SELECT
        COALESCE(SUM(total) FILTER (WHERE event_type = 'SALE_REGISTERED'), 0)::numeric(10,2) AS faturado
      INTO v_cru_parcial
      FROM public.venda_eventos
      WHERE loja_id = v_loja_id AND occurred_at >= v_meio;

      IF v_rpc_parcial.faturado IS DISTINCT FROM v_cru_parcial.faturado THEN
        RAISE EXCEPTION 'SMOKE_RC01_C3_FILTRO: rpc=% cru=%',
          v_rpc_parcial.faturado, v_cru_parcial.faturado;
      END IF;

      IF v_rpc_parcial.faturado > v_rpc.faturado THEN
        RAISE EXCEPTION 'SMOKE_RC01_C3_RECORTE: parcial (%) > total (%)',
          v_rpc_parcial.faturado, v_rpc.faturado;
      END IF;

      RAISE NOTICE 'SMOKE_RC01 C3 OK — filtro de periodo confere: parcial=% total=%',
        v_rpc_parcial.faturado, v_rpc.faturado;
    END;
  ELSE
    RAISE NOTICE 'SMOKE_RC01 C3 pulado — todos os eventos no mesmo instante.';
  END IF;

  -- ==========================================================================
  -- Cenário 4 — cancelada nunca entra no faturado.
  -- ==========================================================================
  IF v_cru.qtd_canceladas > 0 THEN
    IF v_rpc.valor_canceladas <= 0 THEN
      RAISE EXCEPTION 'SMOKE_RC01_C4: ha % canceladas mas valor_canceladas=%',
        v_cru.qtd_canceladas, v_rpc.valor_canceladas;
    END IF;

    DECLARE
      v_soma_tudo numeric;
    BEGIN
      SELECT COALESCE(SUM(total), 0)::numeric(10,2) INTO v_soma_tudo
      FROM public.venda_eventos WHERE loja_id = v_loja_id;

      IF v_rpc.faturado >= v_soma_tudo THEN
        RAISE EXCEPTION
          'SMOKE_RC01_C4_VAZAMENTO: faturado (%) deveria excluir as canceladas de um total bruto de %',
          v_rpc.faturado, v_soma_tudo;
      END IF;
    END;

    RAISE NOTICE 'SMOKE_RC01 C4 OK — % canceladas somam % e ficam fora do faturado',
      v_cru.qtd_canceladas, v_rpc.valor_canceladas;
  ELSE
    RAISE NOTICE 'SMOKE_RC01 C4 pulado — nenhuma venda cancelada nesta loja.';
  END IF;

  RAISE NOTICE 'SMOKE RC-001 — TODOS OS CENARIOS APLICAVEIS PASSARAM';
END
$smoke$;
