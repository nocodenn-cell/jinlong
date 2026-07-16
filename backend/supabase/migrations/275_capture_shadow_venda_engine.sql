-- ============================================================
-- Migration 275 — CAPTURE de reconciliação (P0.1, 2ª varredura)
-- Versiona a ferramenta de dry-run/shadow-test da RPC v4, aplicada em
-- produção sem migration correspondente. Captura fiel de 2026-07-16.
-- Idempotente. Depende de finalizar_venda_transacional_canonica_v4 (268).
-- RLS desabilitado (sem policy — só acessível via service_role/SECURITY
-- DEFINER, como já está em produção).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.venda_engine_shadow_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  engine text NOT NULL DEFAULT 'v4_dryrun',
  shadow_venda_id uuid,
  ok boolean NOT NULL,
  erro text,
  consistencia jsonb NOT NULL DEFAULT '{}'::jsonb,
  resultado jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT venda_engine_shadow_runs_pkey PRIMARY KEY (id)
);
-- RLS não habilitado em produção para esta tabela (uso interno/diagnóstico).

CREATE OR REPLACE FUNCTION public.shadow_validar_venda_engine_v4(p_payload jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_caixa_id uuid := (p_payload->>'caixa_id')::uuid;
  v_operador_id uuid := (p_payload->>'operador_id')::uuid;
  v_loja_id uuid := (p_payload->>'loja_id')::uuid;
  v_forma text := COALESCE(p_payload->>'forma_pagamento', 'DINHEIRO');
  v_itens jsonb := COALESCE(p_payload->'itens', '[]'::jsonb);
  v_pagamentos jsonb := p_payload->'pagamentos';
  v_tb numeric := NULLIF(p_payload->>'total_bruto','')::numeric;
  v_td numeric := NULLIF(p_payload->>'total_desconto','')::numeric;
  v_tl numeric := NULLIF(p_payload->>'total_liquido','')::numeric;
  v_token text := NULLIF(p_payload->>'desconto_gerente_token','');
  v_pct numeric := NULLIF(p_payload->>'desconto_gerente_percentual','')::numeric;

  v_shadow_venda uuid := gen_random_uuid();
  v_qty_esperada numeric := 0;
  v_estoque_antes numeric := 0;
  v_estoque_depois numeric := 0;
  v_itens_count integer := 0;
  v_pag_sum numeric := 0;
  v_venda_total_liq numeric := 0;
  v_evento_ok boolean := false;

  v_ok boolean := false;
  v_erro text := NULL;
  v_chk jsonb;
  v_res jsonb;
BEGIN
  -- Soma de quantidades esperadas a baixar.
  SELECT COALESCE(SUM((it->>'quantidade')::numeric),0) INTO v_qty_esperada
  FROM jsonb_array_elements(v_itens) it;

  -- Baseline de estoque dos produtos da venda nesta loja.
  SELECT COALESCE(SUM(e.quantidade_atual),0) INTO v_estoque_antes
  FROM public.estoque e
  WHERE e.loja_id = v_loja_id
    AND e.produto_id IN (SELECT (it->>'produto_id')::uuid FROM jsonb_array_elements(v_itens) it);

  BEGIN
    -- Executa a engine real (sem fiscal) num escopo que será revertido.
    PERFORM public.finalizar_venda_transacional_canonica_v4(
      v_shadow_venda, v_caixa_id, v_operador_id, v_loja_id, v_forma,
      v_tb, v_td, v_tl, v_pagamentos, v_itens, v_token, v_pct, false, false,
      NULL, NULL, NULL, 'shadow'
    );

    -- Captura de estado DENTRO da subtransação (variáveis sobrevivem ao rollback).
    SELECT COALESCE(SUM(e.quantidade_atual),0) INTO v_estoque_depois
    FROM public.estoque e
    WHERE e.loja_id = v_loja_id
      AND e.produto_id IN (SELECT (it->>'produto_id')::uuid FROM jsonb_array_elements(v_itens) it);

    SELECT COUNT(*) INTO v_itens_count FROM public.itens_venda WHERE venda_id = v_shadow_venda;
    SELECT COALESCE(SUM(valor),0) INTO v_pag_sum FROM public.vendas_pagamentos WHERE venda_id = v_shadow_venda;
    SELECT COALESCE(total_liquido,0) INTO v_venda_total_liq FROM public.vendas WHERE id = v_shadow_venda;
    SELECT EXISTS(SELECT 1 FROM public.venda_eventos WHERE sale_id = v_shadow_venda AND event_type='SALE_REGISTERED') INTO v_evento_ok;

    v_ok := true;
    -- Força rollback da subtransação: dry-run não persiste a venda.
    RAISE EXCEPTION 'SHADOW_ROLLBACK_OK';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM = 'SHADOW_ROLLBACK_OK' THEN
        v_ok := true;  -- engine executou; estado capturado.
      ELSE
        v_ok := false;
        v_erro := SQLERRM;
      END IF;
  END;

  v_chk := jsonb_build_object(
    'itens_ok', (v_ok AND v_itens_count = jsonb_array_length(v_itens)),
    'itens_esperados', jsonb_array_length(v_itens),
    'itens_gravados', v_itens_count,
    'estoque_ok', (v_ok AND ABS((v_estoque_antes - v_estoque_depois) - v_qty_esperada) <= 0.0001),
    'estoque_baixa_esperada', v_qty_esperada,
    'estoque_baixa_real', (v_estoque_antes - v_estoque_depois),
    'pagamento_ok', (v_ok AND ABS(v_pag_sum - v_venda_total_liq) <= 0.01),
    'pagamento_soma', v_pag_sum,
    'venda_total_liquido', v_venda_total_liq,
    'evento_ledger_ok', v_evento_ok
  );

  v_res := jsonb_build_object(
    'ok', v_ok,
    'erro', v_erro,
    'engine', 'v4',
    'shadow_venda_id', v_shadow_venda,
    'consistencia', v_chk,
    'persistido', false
  );

  INSERT INTO public.venda_engine_shadow_runs (engine, shadow_venda_id, ok, erro, consistencia, resultado)
  VALUES ('v4_dryrun', v_shadow_venda, v_ok, v_erro, v_chk, v_res);

  RETURN v_res;
END;
$function$;
