-- F-2 (P0): venda offline exige contexto de loja confiável antes de validar preço.
--
-- Problema comprovado na reauditoria adversarial:
--
--   registrar_venda_com_itens(caixa_id => NULL, preco_original => 5000, preco_unitario => 5000)
--   produto de tabela R$ 10,00  ->  ACEITO, R$ 5.000,00 gravado
--
-- Causa raiz: a loja era derivada do caixa e, com `caixa_id` nulo, `v_loja_id`
-- ficava NULL. `internal.validar_precos_venda` só aplica a âncora de catálogo
-- quando `p_loja_id IS NOT NULL`, então o NULL funcionava como sinal de
-- "pular validação" — exatamente o antipadrão que reabria o buraco que a
-- unidade P0-5 alegava ter fechado.
--
-- Alcançável pelo fluxo real: `setCaixaIdFromPayload` no sync-outbox aceita
-- `caixa_id: null` explicitamente e repassa ao RPC.
--
-- Correção mínima: o caixa passa a ser obrigatório e precisa existir. A loja
-- continua vindo da mesma fonte confiável de sempre (`caixas.loja_id`), nunca
-- de campo arbitrário do payload — `p_operador_id` é enviado pelo cliente e não
-- serve como origem de autorização aqui, já que a Edge executa como
-- `service_role` e `auth.uid()` é NULL nesse caminho.
--
-- Por que exigir em vez de derivar de outra fonte:
--   * o escritor online (`finalizar_venda_transacional_canonica_v4`) já exige
--     caixa e falha com FINALIZAR_VENDA_CANONICA_CAIXA_NAO_ENCONTRADO;
--   * `ensureCaixaPdv` no sync-outbox cria a linha de caixa antes de registrar
--     a venda sempre que o payload traz um UUID válido;
--   * não há venda com `caixa_id IS NULL` no banco local, e uma venda em
--     dinheiro sem caixa é irreconciliável por definição — o trigger de
--     crédito do contador não teria em que caixa creditar.
--
-- Falha fechada e detectável: o outbox retém o evento e o erro fica visível,
-- coerente com o trade-off já registrado na migration 20260731201200.
--
-- ROLLBACK: restaurar o corpo de 20260814090345_validate_offline_replay_payload.sql.

-- Parte 2: o item precisa pertencer à loja do contexto.
--
-- `calcular_preco_produto` resolve o produto apenas por `id`
-- (`WHERE p.id = p_produto_id AND p.ativo = true`), sem filtrar loja — só a
-- faixa de atacado é escopada. Com isso, uma venda apontando um caixa da loja B
-- e um produto da loja A passava na âncora de catálogo. Comprovado no gate F-2.
--
-- `produtos.loja_id` é NOT NULL e nenhuma venda existente viola o vínculo
-- (0 linhas em `itens_venda` com produto de loja diferente da do caixa), então
-- a exigência é aditiva e não invalida histórico.

BEGIN;

CREATE OR REPLACE FUNCTION internal.validar_precos_venda(
  p_itens jsonb,
  p_loja_id uuid
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_item jsonb;
  v_produto_id uuid;
  v_orig numeric;
  v_unit numeric;
  v_ref numeric;
  v_calc jsonb;
  v_eps constant numeric := 0.02;
BEGIN
  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' THEN
    RETURN;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens)
  LOOP
    v_produto_id := NULLIF(v_item->>'produto_id', '')::uuid;
    v_orig := (v_item->>'preco_original')::numeric;
    v_unit := (v_item->>'preco_unitario')::numeric;

    IF v_produto_id IS NULL OR v_orig IS NULL OR v_unit IS NULL THEN
      RAISE EXCEPTION 'VENDA_PRECO_ITEM_INVALIDO';
    END IF;

    -- 1) Acréscimo por item: proibido em qualquer tipo de preço.
    IF v_unit > v_orig + v_eps THEN
      RAISE EXCEPTION 'VENDA_PRECO_ACIMA_REFERENCIA:%', v_produto_id;
    END IF;

    -- F-2: o produto tem de pertencer à loja do contexto da venda.
    IF NOT EXISTS (
      SELECT 1 FROM public.produtos p
      WHERE p.id = v_produto_id AND p.loja_id = p_loja_id
    ) THEN
      RAISE EXCEPTION 'VENDA_PRODUTO_FORA_DA_LOJA:%', v_produto_id;
    END IF;

    -- 2) Âncora do bruto no preço de tabela da loja.
    v_calc := public.calcular_preco_produto(v_produto_id, 1, p_loja_id);
    IF v_calc IS NULL OR v_calc->>'preco' IS NULL THEN
      RAISE EXCEPTION 'VENDA_PRECO_NAO_RESOLVIDO:%', v_produto_id;
    END IF;
    v_ref := (v_calc->>'preco')::numeric;
    IF v_orig > v_ref + v_eps THEN
      RAISE EXCEPTION 'VENDA_PRECO_ORIGINAL_ACIMA_TABELA:%', v_produto_id;
    END IF;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION internal.validar_precos_venda(jsonb, uuid) FROM PUBLIC, anon, authenticated;

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
  v_loja_id uuid;
  v_assinatura_persistida text;
  v_assinatura_payload text;
BEGIN
  IF p_venda_id IS NULL THEN
    RAISE EXCEPTION 'ERRO_RPC_VENDA_ID_OBRIGATORIO';
  END IF;

  -- F-2: contexto de loja é pré-requisito da validação de preço, não opcional.
  IF p_caixa_id IS NULL THEN
    RAISE EXCEPTION 'ERRO_RPC_VENDA_CAIXA_OBRIGATORIO';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_venda_id::text));

  SELECT c.loja_id INTO v_loja_id FROM public.caixas c WHERE c.id = p_caixa_id;
  IF v_loja_id IS NULL THEN
    RAISE EXCEPTION 'ERRO_RPC_VENDA_CAIXA_NAO_ENCONTRADO';
  END IF;

  SELECT * INTO v_totais
  FROM internal.calcular_totais_venda(p_itens, p_desconto_gerente_percentual);

  -- A partir daqui `v_loja_id` é sempre confiável, então a âncora de catálogo
  -- roda incondicionalmente.
  PERFORM internal.validar_precos_venda(p_itens, v_loja_id);

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

    SELECT string_agg(assinatura, '|' ORDER BY assinatura) INTO v_assinatura_persistida
    FROM (
      SELECT iv.produto_id::text || ';' || round(iv.quantidade, 3)::text || ';'
             || round(iv.preco_unitario_original, 2)::text || ';'
             || round(iv.preco_unitario, 2)::text AS assinatura
      FROM public.itens_venda iv WHERE iv.venda_id = p_venda_id
    ) AS persistido;

    SELECT string_agg(assinatura, '|' ORDER BY assinatura) INTO v_assinatura_payload
    FROM (
      SELECT (item->>'produto_id') || ';' || round((item->>'quantidade')::numeric, 3)::text || ';'
             || round((item->>'preco_original')::numeric, 2)::text || ';'
             || round((item->>'preco_unitario')::numeric, 2)::text AS assinatura
      FROM jsonb_array_elements(p_itens) AS item
    ) AS enviado;

    IF v_assinatura_persistida IS DISTINCT FROM v_assinatura_payload THEN
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
    CASE
      WHEN calc.tipo = 'ATACADO'
       AND abs((item->>'preco_unitario')::numeric - calc.preco) <= 0.02 THEN 'ATACADO'
      WHEN (item->>'preco_unitario')::numeric < (item->>'preco_original')::numeric THEN 'MANUAL'
      ELSE 'VAREJO'
    END
  FROM jsonb_array_elements(p_itens) AS item
  LEFT JOIN LATERAL (
    SELECT resolvido->>'tipo' AS tipo, (resolvido->>'preco')::numeric AS preco
    FROM public.calcular_preco_produto(
      (item->>'produto_id')::uuid,
      GREATEST(1, FLOOR((item->>'quantidade')::numeric))::integer,
      v_loja_id
    ) AS resolvido
  ) AS calc ON true;

  IF (SELECT count(*) FROM public.itens_venda iv WHERE iv.venda_id = p_venda_id) <> v_item_count THEN
    RAISE EXCEPTION 'ERRO_RPC_VENDA_ITENS_PERSISTIDOS_DIVERGENTES';
  END IF;

  IF v_totais.total_liquido > 0 THEN
    INSERT INTO public.vendas_pagamentos (venda_id, forma_pagamento, valor)
    VALUES (p_venda_id, p_forma_pagamento, v_totais.total_liquido)
    ON CONFLICT (venda_id, forma_pagamento) DO NOTHING;
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
  'Escritor offline: exige caixa valido (contexto de loja), valida totais e precos pelas funcoes canonicas, grava o mesmo fato de pagamento do caminho online e preserva retry sem mutacao.';

COMMIT;
