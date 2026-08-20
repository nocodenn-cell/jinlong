-- Phase 1B: one monetary invariant for the two controlled sale writers.
-- No historical repair is performed by this migration.

BEGIN;

CREATE OR REPLACE FUNCTION internal.calcular_totais_venda(
  p_itens jsonb,
  p_desconto_global_percentual numeric DEFAULT NULL
)
RETURNS TABLE(
  total_bruto numeric,
  total_desconto_itens numeric,
  desconto_global_valor numeric,
  total_desconto numeric,
  total_liquido numeric
)
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_item jsonb;
  v_quantidade numeric;
  v_preco_original numeric;
  v_preco_unitario numeric;
  v_bruto numeric := 0;
  v_liquido_itens numeric := 0;
  v_desconto_itens numeric := 0;
  v_desconto_global numeric := 0;
  v_desconto_total numeric := 0;
  v_liquido numeric := 0;
BEGIN
  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'VENDA_TOTAIS_ITENS_INVALIDOS';
  END IF;

  IF p_desconto_global_percentual IS NOT NULL
     AND (p_desconto_global_percentual <= 0 OR p_desconto_global_percentual > 100) THEN
    RAISE EXCEPTION 'VENDA_TOTAIS_DESCONTO_GLOBAL_INVALIDO';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens)
  LOOP
    v_quantidade := (v_item->>'quantidade')::numeric;
    v_preco_original := (v_item->>'preco_original')::numeric;
    v_preco_unitario := (v_item->>'preco_unitario')::numeric;

    IF v_quantidade IS NULL OR v_quantidade <= 0
       OR v_quantidade <> round(v_quantidade, 3) THEN
      RAISE EXCEPTION 'VENDA_TOTAIS_QUANTIDADE_INVALIDA';
    END IF;
    IF v_preco_original IS NULL OR v_preco_original < 0
       OR v_preco_original <> public.round_abnt(v_preco_original, 2)
       OR v_preco_unitario IS NULL OR v_preco_unitario < 0
       OR v_preco_unitario <> public.round_abnt(v_preco_unitario, 2) THEN
      RAISE EXCEPTION 'VENDA_TOTAIS_PRECO_INVALIDO';
    END IF;

    v_bruto := v_bruto + (v_preco_original * v_quantidade);
    v_liquido_itens := v_liquido_itens + (v_preco_unitario * v_quantidade);
  END LOOP;

  v_bruto := public.round_abnt(v_bruto, 2);
  v_liquido_itens := public.round_abnt(v_liquido_itens, 2);
  v_desconto_itens := public.round_abnt(v_bruto - v_liquido_itens, 2);
  v_desconto_global := CASE
    WHEN p_desconto_global_percentual IS NULL THEN 0
    ELSE public.round_abnt(v_liquido_itens * p_desconto_global_percentual / 100, 2)
  END;
  v_desconto_total := public.round_abnt(v_desconto_itens + v_desconto_global, 2);
  v_liquido := public.round_abnt(v_bruto - v_desconto_total, 2);

  IF v_desconto_total < 0 OR v_liquido < 0 THEN
    RAISE EXCEPTION 'VENDA_TOTAIS_RESULTADO_INVALIDO';
  END IF;

  RETURN QUERY SELECT
    v_bruto, v_desconto_itens, v_desconto_global, v_desconto_total, v_liquido;
END;
$function$;

REVOKE ALL ON FUNCTION internal.calcular_totais_venda(jsonb, numeric) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.registrar_venda_com_itens(
  p_venda_id uuid,
  p_caixa_id uuid,
  p_operador_id uuid,
  p_forma_pagamento text,
  p_total_bruto numeric,
  p_total_desconto numeric,
  p_total_liquido numeric,
  p_itens jsonb,
  p_desconto_gerente_percentual numeric DEFAULT NULL,
  p_desconto_gerente_valor numeric DEFAULT NULL,
  p_gerente_id text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_item_count integer;
  v_totais record;
  v_existente record;
BEGIN
  IF p_venda_id IS NULL THEN
    RAISE EXCEPTION 'ERRO_RPC_VENDA_ID_OBRIGATORIO';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_venda_id::text));

  SELECT * INTO v_totais
  FROM internal.calcular_totais_venda(p_itens, p_desconto_gerente_percentual);

  IF p_total_bruto IS NULL OR p_total_desconto IS NULL OR p_total_liquido IS NULL
     OR p_total_bruto <> public.round_abnt(p_total_bruto, 2)
     OR p_total_desconto <> public.round_abnt(p_total_desconto, 2)
     OR p_total_liquido <> public.round_abnt(p_total_liquido, 2)
     OR p_total_bruto <> v_totais.total_bruto
     OR p_total_desconto <> v_totais.total_desconto
     OR p_total_liquido <> v_totais.total_liquido THEN
    RAISE EXCEPTION 'ERRO_RPC_TOTAIS_DIVERGENTES';
  END IF;

  IF (p_desconto_gerente_percentual IS NULL) <> (p_desconto_gerente_valor IS NULL)
     OR COALESCE(p_desconto_gerente_valor, 0) <> v_totais.desconto_global_valor THEN
    RAISE EXCEPTION 'ERRO_RPC_DESCONTO_GERENTE_DIVERGENTE';
  END IF;

  SELECT v.total_bruto, v.total_desconto, v.total_liquido
  INTO v_existente
  FROM public.vendas v
  WHERE v.id = p_venda_id;

  IF FOUND THEN
    IF v_existente.total_bruto <> v_totais.total_bruto
       OR v_existente.total_desconto <> v_totais.total_desconto
       OR v_existente.total_liquido <> v_totais.total_liquido THEN
      RAISE EXCEPTION 'ERRO_RPC_RETRY_PAYLOAD_DIVERGENTE';
    END IF;
    RETURN;
  END IF;

  v_item_count := jsonb_array_length(p_itens);

  INSERT INTO public.vendas (
    id, caixa_id, operador_id, total_bruto, total_desconto,
    total_liquido, forma_pagamento, status
  ) VALUES (
    p_venda_id, p_caixa_id, p_operador_id, v_totais.total_bruto,
    v_totais.total_desconto, v_totais.total_liquido, p_forma_pagamento, 'CONCLUIDA'
  );

  INSERT INTO public.itens_venda (
    id, venda_id, produto_id, quantidade, preco_unitario_original,
    preco_unitario, desconto_unitario, tipo_preco
  )
  SELECT
    (item->>'item_id')::uuid,
    p_venda_id,
    (item->>'produto_id')::uuid,
    (item->>'quantidade')::numeric,
    (item->>'preco_original')::numeric,
    (item->>'preco_unitario')::numeric,
    GREATEST(0, (item->>'preco_original')::numeric - (item->>'preco_unitario')::numeric),
    CASE WHEN (item->>'preco_unitario')::numeric < (item->>'preco_original')::numeric
      THEN 'ATACADO' ELSE 'VAREJO' END
  FROM jsonb_array_elements(p_itens) AS item;

  IF (SELECT count(*) FROM public.itens_venda iv WHERE iv.venda_id = p_venda_id) <> v_item_count THEN
    RAISE EXCEPTION 'ERRO_RPC_VENDA_ITENS_PERSISTIDOS_DIVERGENTES';
  END IF;

  IF p_desconto_gerente_percentual IS NOT NULL THEN
    INSERT INTO public.descontos_venda (
      venda_id, gerente_id, desconto_percentual, desconto_valor
    ) VALUES (
      p_venda_id, p_gerente_id, p_desconto_gerente_percentual, v_totais.desconto_global_valor
    )
    ON CONFLICT (venda_id) DO NOTHING;
  END IF;
END;
$function$;

COMMENT ON FUNCTION public.registrar_venda_com_itens IS
  'Escritor offline: totaliza no PostgreSQL, rejeita divergencia de um centavo e preserva retry sem mutacao.';

REVOKE ALL ON FUNCTION public.registrar_venda_com_itens(
  uuid, uuid, uuid, text, numeric, numeric, numeric, jsonb, numeric, numeric, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_venda_com_itens(
  uuid, uuid, uuid, text, numeric, numeric, numeric, jsonb, numeric, numeric, text
) TO service_role;

CREATE OR REPLACE FUNCTION public.finalizar_venda_transacional_canonica_v4(
  p_venda_id uuid, p_caixa_id uuid, p_operador_id uuid, p_loja_id uuid,
  p_forma_pagamento text DEFAULT 'DINHEIRO',
  p_total_bruto numeric DEFAULT NULL, p_total_desconto numeric DEFAULT NULL,
  p_total_liquido numeric DEFAULT NULL, p_pagamentos jsonb DEFAULT NULL,
  p_itens jsonb DEFAULT '[]', p_desconto_gerente_token text DEFAULT NULL,
  p_desconto_gerente_percentual numeric DEFAULT NULL,
  p_strict_manager_discount_auth boolean DEFAULT false,
  p_fiscal_auto_enqueue boolean DEFAULT false, p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL, p_device_id text DEFAULT NULL,
  p_terminal_id text DEFAULT NULL, p_cliente_id uuid DEFAULT NULL,
  p_motivo_desconto motivo_desconto_enum_tipo DEFAULT 'NAO_ESPECIFICADO',
  p_motivo_descricao text DEFAULT NULL,
  p_limite_credito_gerente_token text DEFAULT NULL
)
RETURNS TABLE(venda_id uuid, status text, mensagem text, dados_fiscais jsonb,
  itens_atualizados jsonb, estoque_baixado jsonb, event_id uuid, contas_receber_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_auth_uid uuid := auth.uid();
  v_uid uuid := COALESCE(v_auth_uid, p_operador_id);
  v_usuario_loja_id uuid;
  v_caixa_loja_id uuid;
  v_caixa_operador_id uuid;
  v_caixa_status text;
  v_totais record;
  v_pag jsonb;
  v_pag_total numeric := 0;
  v_pag_valor numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_AUTH'; END IF;
  IF v_auth_uid IS NOT NULL AND p_operador_id IS DISTINCT FROM v_auth_uid THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_OPERADOR_INVALIDO';
  END IF;

  SELECT u.loja_id INTO v_usuario_loja_id FROM public.usuarios u
  WHERE u.id = v_uid AND COALESCE(u.ativo, true) = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_USUARIO_INVALIDO'; END IF;
  IF v_usuario_loja_id IS DISTINCT FROM p_loja_id THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_LOJA_INVALIDA';
  END IF;

  SELECT c.loja_id, c.operador_id, c.status
  INTO v_caixa_loja_id, v_caixa_operador_id, v_caixa_status
  FROM public.caixas c WHERE c.id = p_caixa_id FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_CAIXA_NAO_ENCONTRADO'; END IF;
  IF v_caixa_loja_id IS DISTINCT FROM p_loja_id THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_CAIXA_LOJA_INVALIDA';
  END IF;
  IF v_caixa_operador_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_CAIXA_OPERADOR_INVALIDO';
  END IF;
  IF v_caixa_status IS DISTINCT FROM 'ABERTO' THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_CAIXA_FECHADO';
  END IF;

  SELECT * INTO v_totais FROM internal.calcular_totais_venda(
    p_itens,
    CASE WHEN p_desconto_gerente_token IS NULL THEN NULL ELSE p_desconto_gerente_percentual END
  );

  IF p_total_bruto IS NULL OR p_total_desconto IS NULL OR p_total_liquido IS NULL
     OR p_total_bruto <> public.round_abnt(p_total_bruto, 2)
     OR p_total_desconto <> public.round_abnt(p_total_desconto, 2)
     OR p_total_liquido <> public.round_abnt(p_total_liquido, 2)
     OR p_total_bruto <> v_totais.total_bruto
     OR p_total_desconto <> v_totais.total_desconto
     OR p_total_liquido <> v_totais.total_liquido THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_TOTAIS_DIVERGENTES';
  END IF;

  IF p_pagamentos IS NOT NULL THEN
    IF jsonb_typeof(p_pagamentos) <> 'array' OR jsonb_array_length(p_pagamentos) = 0 THEN
      RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_PAGAMENTOS_INVALIDOS';
    END IF;
    FOR v_pag IN SELECT value FROM jsonb_array_elements(p_pagamentos)
    LOOP
      v_pag_valor := (v_pag->>'valor')::numeric;
      IF v_pag_valor IS NULL OR v_pag_valor <= 0
         OR v_pag_valor <> public.round_abnt(v_pag_valor, 2) THEN
        RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_VALOR_PAGAMENTO_INVALIDO';
      END IF;
      v_pag_total := v_pag_total + v_pag_valor;
    END LOOP;
    v_pag_total := public.round_abnt(v_pag_total, 2);
    IF v_pag_total > v_totais.total_liquido THEN
      RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_PAGAMENTOS_EXCEDEM_TOTAL';
    END IF;
  END IF;

  RETURN QUERY SELECT * FROM public.finalizar_venda_transacional_canonica_v4_unscoped(
    p_venda_id, p_caixa_id, p_operador_id, p_loja_id, p_forma_pagamento,
    p_total_bruto, p_total_desconto, p_total_liquido, p_pagamentos, p_itens,
    p_desconto_gerente_token, p_desconto_gerente_percentual,
    p_strict_manager_discount_auth, p_fiscal_auto_enqueue, p_ip_address,
    p_user_agent, p_device_id, p_terminal_id, p_cliente_id,
    p_motivo_desconto, p_motivo_descricao, p_limite_credito_gerente_token
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.finalizar_venda_transacional_canonica_v4(
  uuid, uuid, uuid, uuid, text, numeric, numeric, numeric, jsonb, jsonb, text,
  numeric, boolean, boolean, text, text, text, text, uuid,
  motivo_desconto_enum_tipo, text, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalizar_venda_transacional_canonica_v4(
  uuid, uuid, uuid, uuid, text, numeric, numeric, numeric, jsonb, jsonb, text,
  numeric, boolean, boolean, text, text, text, text, uuid,
  motivo_desconto_enum_tipo, text, text
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.verificar_consistencia_venda(p_venda_id uuid)
RETURNS TABLE(venda_id uuid, status_venda text, consistente boolean,
  anomalias text[], item_count bigint, evento_count bigint,
  pagamento_count bigint, pagamentos_total numeric, total_liquido numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_venda record;
  v_item_count bigint;
  v_evento_count bigint;
  v_pag_count bigint;
  v_pag_total numeric;
  v_saldo_aberto numeric := 0;
  v_totais record;
  v_itens jsonb;
  v_desconto_pct numeric;
  v_anomalias text[] := ARRAY[]::text[];
BEGIN
  SELECT v.id, v.status, v.total_bruto, v.total_desconto, v.total_liquido
  INTO v_venda FROM public.vendas v WHERE v.id = p_venda_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT p_venda_id, 'NAO_ENCONTRADA'::text, false,
      ARRAY['venda_nao_encontrada']::text[], 0::bigint, 0::bigint, 0::bigint,
      NULL::numeric, NULL::numeric;
    RETURN;
  END IF;
  IF v_venda.status <> 'CONCLUIDA' THEN
    RETURN QUERY SELECT p_venda_id, v_venda.status::text, true, ARRAY[]::text[],
      0::bigint, 0::bigint, 0::bigint, NULL::numeric, v_venda.total_liquido;
    RETURN;
  END IF;

  SELECT count(*), jsonb_agg(jsonb_build_object(
    'quantidade', iv.quantidade, 'preco_original', iv.preco_unitario_original,
    'preco_unitario', iv.preco_unitario))
  INTO v_item_count, v_itens FROM public.itens_venda iv WHERE iv.venda_id = p_venda_id;
  SELECT dv.desconto_percentual INTO v_desconto_pct
  FROM public.descontos_venda dv WHERE dv.venda_id = p_venda_id;
  SELECT count(*) INTO v_evento_count FROM public.venda_eventos ve
  WHERE ve.sale_id = p_venda_id AND ve.event_type = 'SALE_REGISTERED';
  SELECT count(*), COALESCE(sum(vp.valor), 0) INTO v_pag_count, v_pag_total
  FROM public.vendas_pagamentos vp WHERE vp.venda_id = p_venda_id;
  SELECT COALESCE(sum(cr.valor_aberto), 0) INTO v_saldo_aberto
  FROM public.contas_receber cr
  WHERE cr.venda_id = p_venda_id AND cr.status IN ('ABERTO', 'PARCIAL');

  IF v_item_count = 0 THEN
    v_anomalias := array_append(v_anomalias, 'sem_itens');
  ELSE
    SELECT * INTO v_totais FROM internal.calcular_totais_venda(v_itens, v_desconto_pct);
    IF v_venda.total_bruto <> v_totais.total_bruto
       OR v_venda.total_desconto <> v_totais.total_desconto
       OR v_venda.total_liquido <> v_totais.total_liquido THEN
      v_anomalias := array_append(v_anomalias, 'cabecalho_itens_divergentes');
    END IF;
  END IF;
  IF v_venda.total_liquido <> v_venda.total_bruto - v_venda.total_desconto THEN
    v_anomalias := array_append(v_anomalias, 'identidade_cabecalho_divergente');
  END IF;
  IF v_evento_count = 0 THEN v_anomalias := array_append(v_anomalias, 'sem_evento_ledger'); END IF;
  IF v_evento_count > 1 THEN v_anomalias := array_append(v_anomalias, 'evento_duplicado'); END IF;
  IF v_pag_count = 0 THEN v_anomalias := array_append(v_anomalias, 'sem_pagamento'); END IF;
  IF public.round_abnt(COALESCE(v_pag_total, 0) + v_saldo_aberto, 2) <> v_venda.total_liquido THEN
    v_anomalias := array_append(v_anomalias, 'pagamentos_saldo_divergentes');
  END IF;

  RETURN QUERY SELECT p_venda_id, v_venda.status::text,
    cardinality(v_anomalias) = 0, v_anomalias, v_item_count, v_evento_count,
    v_pag_count, v_pag_total, v_venda.total_liquido;
END;
$function$;

COMMENT ON FUNCTION public.verificar_consistencia_venda(uuid) IS
  'Diagnostico read-only: cabecalho x itens e pagamentos + saldo a receber, com igualdade em centavos.';

COMMIT;
