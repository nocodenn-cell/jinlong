-- Smoke test da migration 20260927140000_t8_kpis_e_lista_vendas_sem_duplicar_cancelada.sql
-- Executar em ambiente DEV/STAGING no SQL Editor (papel com permissão de
-- escrita direta em venda_eventos, ex. service_role/postgres).
--
-- 100% autocontido: insere eventos sintéticos com gen_random_uuid() e roda
-- tudo dentro de uma transação que nunca comita (ROLLBACK no final).
--
-- Cenário (ver relatório T8, auditoria Jinlong 2026-09-27): 1 venda
-- concluída de R$ 372,80 + 1 venda registrada por R$ 1.900,00 e depois
-- cancelada. Esperado: faturado = 372,80 (não 2.272,80), qtd_concluidas = 1,
-- lista tem 2 linhas (1 por venda, não 3).

BEGIN;

DO $$
DECLARE
  v_loja_id uuid := gen_random_uuid();
  v_caixa_id uuid := gen_random_uuid();
  v_operador_id uuid := gen_random_uuid();
  v_venda_ok uuid := gen_random_uuid();
  v_venda_cancelada uuid := gen_random_uuid();
  v_kpi record;
  v_qtd_linhas int;
BEGIN
  INSERT INTO public.venda_eventos (event_type, sale_id, caixa_id, operador_id, loja_id, total, total_bruto, forma_pagamento, occurred_at, source, idempotency_key)
  VALUES ('SALE_REGISTERED', v_venda_ok, v_caixa_id, v_operador_id, v_loja_id, 372.80, 372.80, 'PIX', now() - interval '2 hours', 'web_caixa', 'smoke-t8-1');

  INSERT INTO public.venda_eventos (event_type, sale_id, caixa_id, operador_id, loja_id, total, total_bruto, forma_pagamento, occurred_at, source, idempotency_key)
  VALUES ('SALE_REGISTERED', v_venda_cancelada, v_caixa_id, v_operador_id, v_loja_id, 1900.00, 1900.00, 'DINHEIRO', now() - interval '1 hour', 'web_caixa', 'smoke-t8-2');
  INSERT INTO public.venda_eventos (event_type, sale_id, caixa_id, operador_id, loja_id, total, total_bruto, forma_pagamento, occurred_at, source, idempotency_key)
  VALUES ('SALE_CANCELLED', v_venda_cancelada, v_caixa_id, v_operador_id, v_loja_id, 1900.00, 1900.00, 'DINHEIRO', now() - interval '30 minutes', 'gerente_panel', 'smoke-t8-3');

  SELECT * INTO v_kpi FROM public.kpis_venda_eventos_gerente(v_loja_id, NULL, NULL, NULL);

  IF v_kpi.faturado <> 372.80 THEN
    RAISE EXCEPTION 'SMOKE_T8 FALHOU: faturado = %, esperado 372.80 (venda cancelada não deve entrar)', v_kpi.faturado;
  END IF;
  IF v_kpi.qtd_concluidas <> 1 THEN
    RAISE EXCEPTION 'SMOKE_T8 FALHOU: qtd_concluidas = %, esperado 1', v_kpi.qtd_concluidas;
  END IF;
  IF v_kpi.qtd_canceladas <> 1 OR v_kpi.valor_canceladas <> 1900.00 THEN
    RAISE EXCEPTION 'SMOKE_T8 FALHOU: qtd_canceladas=%/valor_canceladas=%, esperado 1/1900.00', v_kpi.qtd_canceladas, v_kpi.valor_canceladas;
  END IF;

  SELECT count(*) INTO v_qtd_linhas
  FROM public.listar_venda_eventos_gerente(v_loja_id, NULL, NULL, ARRAY['SALE_REGISTERED','SALE_CANCELLED'], NULL, 0, 20);
  IF v_qtd_linhas <> 2 THEN
    RAISE EXCEPTION 'SMOKE_T8 FALHOU: lista devolveu % linha(s), esperado 2 (1 por venda)', v_qtd_linhas;
  END IF;

  -- Filtro "Concluída" não deve incluir a venda cancelada.
  SELECT count(*) INTO v_qtd_linhas
  FROM public.listar_venda_eventos_gerente(v_loja_id, NULL, NULL, ARRAY['SALE_REGISTERED'], NULL, 0, 20);
  IF v_qtd_linhas <> 1 THEN
    RAISE EXCEPTION 'SMOKE_T8 FALHOU: filtro Concluída devolveu % linha(s), esperado 1', v_qtd_linhas;
  END IF;

  RAISE NOTICE 'SMOKE_T8_OK: faturado=372.80, qtd_concluidas=1, lista=2 linhas, filtro Concluída exclui cancelada.';
END $$;

ROLLBACK;
