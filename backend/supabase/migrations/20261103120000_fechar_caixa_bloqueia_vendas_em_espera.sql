-- ============================================================================
-- PDV-100.1 · D-06 — fechamento de caixa com venda em espera.
--
-- PROBLEMA (reproduzido na validação PDV-100, 2026-11-03): `fechar_caixa_atomico`
-- só bloqueava movimentações pendentes. Uma venda em espera (EM_ESPERA) ou retomada
-- e não concluída (RETOMADA) sobrevivia ao fechamento, ficando presa a um caixa FECHADO.
--
-- REGRA: não fecha o caixa enquanto houver venda em espera ou retomada desse caixa.
-- O operador deve concluir ou descartar as vendas pendentes antes de fechar.
-- Vendas CONVERTIDA e DESCARTADA não bloqueiam.
--
-- Mudança única: nova checagem após FECHAR_CAIXA_MOVIMENTACOES_PENDENTES. O corpo
-- restante é idêntico ao da versão anterior (copiado da definição vigente).
-- ============================================================================

CREATE OR REPLACE FUNCTION internal.fechar_caixa_atomico(p_operador_id uuid, p_valor_contado numeric, p_motivo text DEFAULT ''::text)
 RETURNS TABLE(o_caixa_id uuid, o_valor_sistema numeric, o_valor_contado numeric, o_diferenca numeric, o_ja_fechado boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_caixa_id uuid;
  v_valor_sistema numeric(10,2);
  v_diferenca numeric(10,2);
  v_motivo text;
  v_fechado record;
  v_valor_contado_novo numeric(10,2);
  c_limite CONSTANT numeric := 5.00;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'FECHAR_CAIXA_SESSAO_EXPIRADA';
  END IF;
  IF v_uid <> p_operador_id THEN
    RAISE EXCEPTION 'FECHAR_CAIXA_SEM_PERMISSAO';
  END IF;

  v_motivo := TRIM(COALESCE(p_motivo, ''));

  SELECT c.id INTO v_caixa_id
  FROM public.caixas c
  WHERE c.operador_id = p_operador_id AND c.status = 'ABERTO'
  ORDER BY c.data_abertura DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    SELECT c.id, c.valor_fechamento, c.fechamento_diferenca, c.data_fechamento
    INTO v_fechado
    FROM public.caixas c
    WHERE c.operador_id = p_operador_id AND c.status = 'FECHADO'
    ORDER BY c.data_fechamento DESC NULLS LAST, c.data_abertura DESC
    LIMIT 1;

    IF FOUND AND v_fechado.data_fechamento IS NOT NULL
       AND v_fechado.data_fechamento >= (now() - interval '24 hours') THEN
      v_valor_contado_novo := ROUND(p_valor_contado, 2);
      IF v_fechado.valor_fechamento IS NOT NULL
         AND v_fechado.valor_fechamento IS DISTINCT FROM v_valor_contado_novo THEN
        RAISE EXCEPTION 'FECHAR_CAIXA_REPETICAO_VALOR_DIVERGENTE'
          USING DETAIL = format('valor_fechamento_persistido=%s valor_contado_nova_chamada=%s',
            v_fechado.valor_fechamento, v_valor_contado_novo);
      END IF;

      RETURN QUERY SELECT
        v_fechado.id,
        ROUND(COALESCE(v_fechado.valor_fechamento, 0) - COALESCE(v_fechado.fechamento_diferenca, 0), 2)::numeric(10,2),
        COALESCE(v_fechado.valor_fechamento, v_valor_contado_novo),
        COALESCE(v_fechado.fechamento_diferenca, 0::numeric(10,2)),
        true;
      RETURN;
    END IF;

    RAISE EXCEPTION 'FECHAR_CAIXA_CAIXA_NAO_ENCONTRADO';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.movimentacoes_caixa m
    WHERE m.caixa_id = v_caixa_id AND m.status = 'pendente' AND m.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'FECHAR_CAIXA_MOVIMENTACOES_PENDENTES';
  END IF;

  -- D-06: venda em espera ou retomada (não concluída) impede o fechamento.
  IF EXISTS (
    SELECT 1 FROM public.vendas_em_espera e
    WHERE e.caixa_id = v_caixa_id AND e.status IN ('EM_ESPERA', 'RETOMADA')
  ) THEN
    RAISE EXCEPTION 'FECHAR_CAIXA_VENDAS_EM_ESPERA';
  END IF;

  v_valor_sistema := public.calcular_valor_sistema_dinheiro_caixa(v_caixa_id);
  v_diferenca := ROUND(p_valor_contado - v_valor_sistema, 2);

  IF ABS(v_diferenca) > c_limite AND LENGTH(v_motivo) < 5 THEN
    RAISE EXCEPTION 'FECHAR_CAIXA_DIVERGENCIA_SEM_MOTIVO' USING DETAIL = v_diferenca::text;
  END IF;

  UPDATE public.caixas SET
    status = 'FECHADO',
    data_fechamento = now(),
    valor_fechamento = ROUND(p_valor_contado, 2),
    fechamento_diferenca = v_diferenca,
    fechamento_observacao = NULLIF(v_motivo, '')
  WHERE id = v_caixa_id;

  -- Snapshot por forma no mesmo TX (idempotente em retry via UNIQUE + DO NOTHING).
  PERFORM internal.persistir_fechamento_formas(
    v_caixa_id, p_valor_contado, v_diferenca, v_uid
  );

  RETURN QUERY SELECT v_caixa_id, v_valor_sistema, ROUND(p_valor_contado, 2)::numeric(10,2), v_diferenca, false;
END;
$function$;
