-- P0-5: invariante de preço compartilhada pelos dois escritores de venda.
--
-- Problema comprovado: `registrar_venda_com_itens` (offline/sync-outbox) não
-- validava preço contra o catálogo. Produto de referência R$89,90 foi gravado a
-- R$5.000,00, com `tipo_preco='VAREJO'` e sem anomalia no diagnóstico.
--
-- A leitura do código mostrou um segundo buraco, este também no caminho ONLINE:
-- a v4 ancora `preco_unitario` ao catálogo apenas nos ramos VAREJO/ATACADO. No
-- ramo `tipo_preco='MANUAL'` ela só verifica `preco_unitario <= preco_original`,
-- e **nenhum** dos dois escritores jamais ancorou `preco_original` ao preço de
-- tabela. Um item MANUAL com original=unitário=5000 passa igualmente online.
-- `trg_fn_itens_venda_limite_desconto` não cobre isso: retorna cedo sempre que
-- `preco_unitario >= base`, ou seja, só fiscaliza desconto, nunca acréscimo.
--
-- Correção mínima: uma única função canônica em `internal`, chamada pelos dois
-- escritores, com as duas regras que faltavam nos dois lados:
--
--   1. `preco_unitario <= preco_original`  — acréscimo por item é proibido.
--      Generaliza para todo item a regra que a v4 já enunciava só no ramo MANUAL
--      e fecha o acréscimo compensado (10->11 + 10->9), que produzia cabeçalho
--      idêntico ao de uma venda honesta.
--   2. `preco_original <= preço de tabela`  — âncora do bruto no catálogo, via
--      `calcular_preco_produto(produto, 1, loja)`, que é o resolvedor canônico
--      já existente. Quantidade 1 devolve a referência de varejo, sem disparar
--      faixa de atacado.
--
-- Não é uma segunda regra de preço: a validação de `tipo_preco`, faixa de
-- atacado e promoção continua exclusivamente na v4 (migration 300), inalterada.
-- Esta função acrescenta a âncora que faltava, uma vez, para os dois caminhos.
--
-- LIMITE CONHECIDO E DOCUMENTADO: o payload offline normalizado pelo
-- sync-outbox (`parseSingleVendaItem`) transporta apenas
-- {produto_id, quantidade, preco_original, preco_unitario} — não há `tipo_preco`
-- nem `promocao_regra_id`. Por isso o offline NÃO pode reproduzir a validação de
-- tipo/faixa/promoção da v4. Paridade total exige ampliar o contrato da Edge, o
-- que é uma unidade separada. As duas regras acima são tipo-independentes e
-- valem integralmente nos dois escritores.
--
-- ROLLBACK:
--   DROP FUNCTION internal.validar_precos_venda(jsonb, uuid);
--   e restaurar os corpos anteriores dos dois escritores.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- Validador canônico
-- ═══════════════════════════════════════════════════════════════════════════

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
  -- mesma tolerância da v4 (migration 300)
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

    -- 2) Âncora do bruto no preço de tabela da loja.
    --    Só é aplicável quando a loja é conhecida; ver LIMITE CONHECIDO acima.
    IF p_loja_id IS NOT NULL THEN
      v_calc := public.calcular_preco_produto(v_produto_id, 1, p_loja_id);
      IF v_calc IS NULL OR v_calc->>'preco' IS NULL THEN
        RAISE EXCEPTION 'VENDA_PRECO_NAO_RESOLVIDO:%', v_produto_id;
      END IF;
      v_ref := (v_calc->>'preco')::numeric;
      IF v_orig > v_ref + v_eps THEN
        RAISE EXCEPTION 'VENDA_PRECO_ORIGINAL_ACIMA_TABELA:%', v_produto_id;
      END IF;
    END IF;
  END LOOP;
END;
$function$;

COMMENT ON FUNCTION internal.validar_precos_venda(jsonb, uuid) IS
  'Invariante de preco compartilhada online/offline: proibe acrescimo por item e ancora o bruto no preco de tabela.';

REVOKE ALL ON FUNCTION internal.validar_precos_venda(jsonb, uuid) FROM PUBLIC, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Escritor OFFLINE passa a validar preço
-- ═══════════════════════════════════════════════════════════════════════════

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
BEGIN
  IF p_venda_id IS NULL THEN
    RAISE EXCEPTION 'ERRO_RPC_VENDA_ID_OBRIGATORIO';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_venda_id::text));

  SELECT * INTO v_totais
  FROM internal.calcular_totais_venda(p_itens, p_desconto_gerente_percentual);

  -- P0-5: mesma invariante de preco do caminho online. A loja vem do caixa da
  -- venda; quando o payload nao traz caixa, so a regra de acrescimo se aplica.
  SELECT c.loja_id INTO v_loja_id FROM public.caixas c WHERE c.id = p_caixa_id;
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
  'Escritor offline: totais e precos validados no PostgreSQL pelas mesmas funcoes canonicas do caminho online, com o mesmo fato de pagamento e retry sem mutacao.';

-- ═══════════════════════════════════════════════════════════════════════════
-- Escritor ONLINE passa a validar a âncora de tabela
-- ═══════════════════════════════════════════════════════════════════════════
-- O wrapper `finalizar_venda_transacional_canonica_v4` é o único ponto com
-- EXECUTE para `authenticated` (`_unscoped` só tem grant para postgres), logo é
-- o lugar correto para a guarda, sem tocar o CORE TRANSACIONAL congelado.

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

  -- P0-5: mesma invariante de preco do escritor offline.
  PERFORM internal.validar_precos_venda(p_itens, p_loja_id);

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

COMMIT;
