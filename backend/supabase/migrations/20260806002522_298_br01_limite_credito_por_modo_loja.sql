-- Backport Fase 1 (Git-only) from supabase_migrations.schema_migrations.statements
-- version: 20260806002522
-- name: 298_br01_limite_credito_por_modo_loja
-- source: production read-only export (schema_migrations)
-- Applied in production: yes (do NOT re-run on production).

-- ============================================================================
-- 298 — Pacote 5: fecha BR-01 (limite de crédito parametrizável por loja,
-- ADR-003/RN-032).
--
-- Problema: `clientes.limite_credito` existe desde a migration 035 e é
-- exibido em tela/relatório, mas nenhuma RPC jamais o compara com o saldo
-- devedor real do cliente. Venda fiado foi removida (246/283), mas
-- `contas_receber`/`liquidacoes_receber` seguem ativos — venda com
-- pagamento parcial ainda gera crédito a receber, e esse crédito não é
-- confrontado com limite algum. Achado original: BR-01
-- (docs/auditoria/tickets_P1_regras_negocio.md).
--
-- Decisão de arquitetura (ADR-003, já aprovada, não reinterpretada aqui):
--   - Limite é o VALOR (`clientes.limite_credito`); o MODO é da LOJA, não do
--     cliente nem da venda — vive em `pdv_config.modo_limite_credito`.
--   - Três modos: AVISO (permite, registra) | BLOQUEIO (recusa) |
--     AUTORIZACAO_GERENTE (reutiliza o mecanismo existente de token de
--     gerente — `tokens_desconto_gerente` — não cria um segundo).
--   - Sem modo configurado, padrão é AVISO — "o mais conservador
--     operacionalmente e o que preserva o comportamento atual" (texto da
--     ADR). Isso é o que torna esta migration segura de aplicar em produção
--     com cliente real: toda loja sem `modo_limite_credito` explícito
--     continua vendendo exatamente como hoje, só passa a registrar.
--
-- Autoridade única (Cap. 2 da arquitetura): `finalizar_venda_transacional_
-- canonica_v4` é o único lugar onde a venda fecha — o enforcement tem que
-- viver aqui, não numa RPC de pré-checagem separada (isso seria
-- consultivo, não autoritativo — mesma classe de defeito já fechada em
-- SSOT-01/TB-01). O gate entra imediatamente antes de `INSERT INTO
-- contas_receber`, no PASSO 6 já existente — é o único ponto onde a
-- exposição de crédito do cliente cresce.
--
-- Verificado em produção antes de escrever esta migration (pg_get_functiondef,
-- não o arquivo de migration mais recente que toca a v4 — lição do FLX-05):
-- corpo atual tem 20 parâmetros, PASSO 6 cria contas_receber com
-- `ON CONFLICT (venda_id) ... DO UPDATE`, status inicial sempre 'ABERTO'.
-- Único novo parâmetro (`p_limite_credito_gerente_token`) é opcional com
-- default NULL — assinatura antiga continua compilando para qualquer
-- chamador que não o informe.
--
-- Não mexe em: `finalizar_venda_transacional_canonica_v4` fora do bloco de
-- limite de crédito (nenhuma outra linha do corpo mudou); fluxo de
-- pagamento/desconto/promoção/fiscal (fora de escopo de BR-01).
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. pdv_config ganha o modo de crédito — por loja, não por cliente/venda.
-- ============================================================================

ALTER TABLE public.pdv_config
  ADD COLUMN modo_limite_credito text NOT NULL DEFAULT 'AVISO';

ALTER TABLE public.pdv_config
  ADD CONSTRAINT chk_pdv_config_modo_limite_credito
  CHECK (modo_limite_credito IN ('AVISO', 'BLOQUEIO', 'AUTORIZACAO_GERENTE'));

COMMENT ON COLUMN public.pdv_config.modo_limite_credito IS
  'BR-01/ADR-003 (2026-08-05). Modo de enforcement do limite de crédito do cliente na venda: AVISO (permite, registra) | BLOQUEIO (recusa) | AUTORIZACAO_GERENTE (exige token de gerente, mesmo mecanismo do desconto). Default AVISO por decisão normativa da ADR-003 — preserva o comportamento anterior à correção.';

-- ============================================================================
-- 2. finalizar_venda_transacional_canonica_v4 — novo parâmetro opcional +
--    gate de limite de crédito antes de criar contas_receber. Todo o resto
--    do corpo é idêntico ao vigente em produção.
--
-- ARMADILHA CONFIRMADA EM ROLLBACK antes de escrever esta versão final:
-- `CREATE OR REPLACE` com um parâmetro trailing NOVO (mesmo com DEFAULT) não
-- substitui a função — Postgres identifica função por nome+TIPOS dos
-- parâmetros, não por nome+defaults. Sem o DROP explícito abaixo, ficam DOIS
-- overloads (21 args vigente + 22 args novo) e qualquer chamada nomeada que
-- não desambigue os dois quebra com "is not unique". Mesma classe de
-- armadilha que o FLX-04 já documentou para `receber_ordem_compra`.
-- ============================================================================

DROP FUNCTION public.finalizar_venda_transacional_canonica_v4(
  uuid, uuid, uuid, uuid, text, numeric, numeric, numeric, jsonb, jsonb, text, numeric,
  boolean, boolean, text, text, text, text, uuid, motivo_desconto_enum_tipo, text
);

CREATE FUNCTION public.finalizar_venda_transacional_canonica_v4(
  p_venda_id uuid,
  p_caixa_id uuid,
  p_operador_id uuid,
  p_loja_id uuid,
  p_forma_pagamento text DEFAULT 'DINHEIRO'::text,
  p_total_bruto numeric DEFAULT NULL::numeric,
  p_total_desconto numeric DEFAULT NULL::numeric,
  p_total_liquido numeric DEFAULT NULL::numeric,
  p_pagamentos jsonb DEFAULT NULL::jsonb,
  p_itens jsonb DEFAULT '[]'::jsonb,
  p_desconto_gerente_token text DEFAULT NULL::text,
  p_desconto_gerente_percentual numeric DEFAULT NULL::numeric,
  p_strict_manager_discount_auth boolean DEFAULT false,
  p_fiscal_auto_enqueue boolean DEFAULT false,
  p_ip_address text DEFAULT NULL::text,
  p_user_agent text DEFAULT NULL::text,
  p_device_id text DEFAULT NULL::text,
  p_terminal_id text DEFAULT NULL::text,
  p_cliente_id uuid DEFAULT NULL::uuid,
  p_motivo_desconto motivo_desconto_enum_tipo DEFAULT 'NAO_ESPECIFICADO'::motivo_desconto_enum_tipo,
  p_motivo_descricao text DEFAULT NULL::text,
  p_limite_credito_gerente_token text DEFAULT NULL::text
)
RETURNS TABLE(venda_id uuid, status text, mensagem text, dados_fiscais jsonb, itens_atualizados jsonb, estoque_baixado jsonb, event_id uuid, contas_receber_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_uid uuid := COALESCE(auth.uid(), p_operador_id);
  v_item jsonb; v_item_id uuid; v_produto_id uuid; v_quantidade numeric;
  v_preco_original numeric; v_preco_unitario numeric; v_desconto_unitario numeric;
  v_tipo_preco text; v_q_int integer; v_calc jsonb; v_preco_esperado numeric;
  v_tipo_esperado text; v_rpc_row record;
  v_total_bruto_calc numeric := 0; v_total_liquido_base_calc numeric := 0;
  v_total_desconto_base_calc numeric := 0; v_total_desconto_final_calc numeric := 0;
  v_total_liquido_final_calc numeric := 0; v_desconto_gerente_valor numeric := 0;
  v_max_desconto_gerente numeric := 0; v_cfg_gerente_id text := NULL;
  v_has_gerente_desconto boolean := false;
  v_pag jsonb; v_pag_forma text; v_pag_valor numeric; v_pag_total numeric := 0;
  v_eps constant numeric := 0.02;
  v_doc_id uuid; v_payload jsonb; v_row_doc jsonb; v_event_id uuid;
  v_fiscal jsonb;
  c_source constant text := 'web_caixa';
  v_saldo_pendente numeric := 0;
  v_saldo_pendente_atual numeric := 0;
  v_total_pago_atual numeric := 0;
  v_contas_receber_id uuid;
  -- BL-2: resolução/revalidação de promoção (PARTE C)
  v_categoria_id uuid;
  v_promo_regra_id uuid;
  v_promo_tipo_desconto text;
  v_promo_valor numeric;
  v_preco_pos_promo numeric;
  v_promo_pct_snapshot numeric;
  v_promo_nome text;
  -- BL-2: teto agregado de desconto total da venda
  v_max_desconto_total numeric := 60.00;
  v_pct_desconto_total numeric;
  -- Restauração de observabilidade visual (migration 235, perdida em 268/272 — ver nota no topo)
  v_custo_unitario_snap numeric;
  v_tipo_preco_fonte text;
  v_regra_aplicada_id uuid;
  -- BR-01/ADR-003: limite de crédito por modo da loja
  v_saldo_devedor_cliente numeric := 0;
  v_limite_credito_cliente numeric := 0;
  v_modo_credito text := 'AVISO';
  v_aviso_limite_credito text := NULL;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_OPERADOR_OBRIGATORIO';
  END IF;

  IF upper(COALESCE(p_forma_pagamento, '')) = 'FIADO' THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_FIADO_DESABILITADO';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_venda_id::text));

  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) <= 0 THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_ITENS_INVALIDOS';
  END IF;

  IF EXISTS (SELECT 1 FROM public.vendas v WHERE v.id = p_venda_id AND v.status = 'CONCLUIDA') THEN
    SELECT jsonb_build_object('documento_fiscal_id', d.id, 'status', d.status, 'tipo_doc', d.tipo_doc)
    INTO v_row_doc FROM public.documentos_fiscais_pendentes d
    WHERE d.venda_id = p_venda_id AND d.status <> 'CANCELADO' AND d.deleted_at IS NULL
    ORDER BY d.created_at DESC LIMIT 1;
    v_event_id := public.ensure_venda_evento_registrado(p_venda_id, c_source);
    RETURN QUERY SELECT p_venda_id, 'CONCLUIDA'::text, NULL::text, v_row_doc, NULL::jsonb, NULL::jsonb, v_event_id, NULL::uuid;
    RETURN;
  END IF;

  v_has_gerente_desconto := COALESCE(p_desconto_gerente_percentual, 0) > 0;
  IF p_strict_manager_discount_auth AND v_has_gerente_desconto AND p_desconto_gerente_token IS NULL THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_GERENTE_TOKEN_OBRIGATORIO';
  END IF;
  IF p_desconto_gerente_token IS NOT NULL AND COALESCE(p_desconto_gerente_percentual, 0) <= 0 THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_GERENTE_PERCENTUAL_INVALIDO';
  END IF;

  SELECT max_desconto_gerente_percentual, gerente_id, COALESCE(max_desconto_total_percentual, 60.00)
  INTO v_max_desconto_gerente, v_cfg_gerente_id, v_max_desconto_total FROM public.pdv_config WHERE id = 1;

  IF p_desconto_gerente_token IS NOT NULL THEN
    IF p_desconto_gerente_percentual <= 0 OR p_desconto_gerente_percentual > COALESCE(v_max_desconto_gerente, 0) THEN
      RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_DESCONTO_GERENTE_LIMITE';
    END IF;
    PERFORM 1 FROM public.tokens_desconto_gerente t
    WHERE t.token = p_desconto_gerente_token AND t.usado = false AND t.expira_em > now() FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_TOKEN_GERENTE_INVALIDO'; END IF;
  ELSIF p_strict_manager_discount_auth AND v_has_gerente_desconto THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_GERENTE_TOKEN_OBRIGATORIO';
  END IF;

  -- PASSO 1: validação de preço autoritativo no servidor + cálculo de totais (sem escrita)
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens)
  LOOP
    v_produto_id := (v_item->>'produto_id')::uuid;
    v_quantidade := (v_item->>'quantidade')::numeric;
    v_preco_original := (v_item->>'preco_original')::numeric;
    v_preco_unitario := (v_item->>'preco_unitario')::numeric;
    v_tipo_preco := COALESCE(v_item->>'tipo_preco', 'VAREJO');
    IF v_produto_id IS NULL OR v_quantidade IS NULL OR v_quantidade <= 0 THEN
      RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_ITEM_INVALIDO';
    END IF;
    IF v_preco_original IS NULL OR v_preco_original < 0 OR v_preco_unitario IS NULL OR v_preco_unitario < 0 THEN
      RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_PRECO_INVALIDO';
    END IF;
    IF v_tipo_preco = 'MANUAL' THEN
      IF v_preco_unitario > v_preco_original + v_eps THEN
        RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_PRECO_ACIMA_REFERENCIA';
      END IF;
    ELSE
      v_q_int := GREATEST(1, FLOOR(COALESCE(v_quantidade, 0)))::integer;
      v_calc := public.calcular_preco_produto(v_produto_id, v_q_int, p_loja_id);
      IF v_calc IS NULL OR v_calc->>'erro' IS NOT NULL OR v_calc->>'preco' IS NULL THEN
        RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_PRECO_NAO_VALIDADO:%', v_produto_id;
      END IF;
      v_preco_esperado := (v_calc->>'preco')::numeric;
      v_tipo_esperado := COALESCE(v_calc->>'tipo', 'VAREJO');
      IF v_tipo_esperado IS DISTINCT FROM v_tipo_preco THEN
        RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_TIPO_PRECO_DIVERGENTE:%', v_produto_id;
      END IF;

      SELECT categoria_id INTO v_categoria_id FROM public.produtos WHERE id = v_produto_id;
      SELECT regra_id, tipo_desconto, valor_desconto
      INTO v_promo_regra_id, v_promo_tipo_desconto, v_promo_valor
      FROM public.calcular_promocao_aplicavel(v_produto_id, v_categoria_id, v_quantidade);

      IF v_promo_regra_id IS NOT NULL THEN
        IF v_promo_tipo_desconto = 'PERCENTUAL' THEN
          v_preco_pos_promo := v_preco_esperado * (1 - v_promo_valor / 100);
        ELSE
          v_preco_pos_promo := GREATEST(0, v_preco_esperado - v_promo_valor);
        END IF;
        v_preco_esperado := v_preco_pos_promo;
      END IF;

      IF ABS(v_preco_esperado - v_preco_unitario) > v_eps THEN
        RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_PRECO_DIVERGENTE:%', v_produto_id;
      END IF;
    END IF;
    v_total_bruto_calc := v_total_bruto_calc + (v_preco_original * v_quantidade);
    v_total_liquido_base_calc := v_total_liquido_base_calc + (v_preco_unitario * v_quantidade);
  END LOOP;

  v_total_bruto_calc := public.round_abnt(v_total_bruto_calc, 2);
  v_total_liquido_base_calc := public.round_abnt(v_total_liquido_base_calc, 2);
  v_total_desconto_base_calc := public.round_abnt(v_total_bruto_calc - v_total_liquido_base_calc, 2);
  IF p_desconto_gerente_token IS NOT NULL THEN
    v_desconto_gerente_valor := public.round_abnt((v_total_liquido_base_calc * p_desconto_gerente_percentual) / 100, 2);
  END IF;
  v_total_desconto_final_calc := public.round_abnt(v_total_desconto_base_calc + v_desconto_gerente_valor, 2);
  v_total_liquido_final_calc := public.round_abnt(v_total_bruto_calc - v_total_desconto_final_calc, 2);

  IF v_total_bruto_calc > 0 THEN
    v_pct_desconto_total := public.round_abnt(v_total_desconto_final_calc / v_total_bruto_calc * 100, 4);
    IF v_pct_desconto_total > v_max_desconto_total THEN
      RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_DESCONTO_TOTAL_EXCEDE_LIMITE:%', v_pct_desconto_total;
    END IF;
  END IF;

  IF p_pagamentos IS NULL THEN
    v_pag_total := v_total_liquido_final_calc;
  ELSE
    IF jsonb_typeof(p_pagamentos) <> 'array' OR jsonb_array_length(p_pagamentos) <= 0 THEN
      RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_PAGAMENTOS_INVALIDOS';
    END IF;
    FOR v_pag IN SELECT value FROM jsonb_array_elements(p_pagamentos)
    LOOP
      v_pag_forma := upper(COALESCE(v_pag->>'forma_pagamento', ''));
      v_pag_valor := public.round_abnt(COALESCE((v_pag->>'valor')::numeric, 0), 2);
      IF v_pag_forma NOT IN ('DINHEIRO', 'PIX', 'CARTAO_DEBITO', 'CARTAO_CREDITO') THEN
        RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_FORMA_PAGAMENTO_INVALIDA';
      END IF;
      IF v_pag_valor <= 0 THEN RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_VALOR_PAGAMENTO_INVALIDO'; END IF;
      v_pag_total := public.round_abnt(v_pag_total + v_pag_valor, 2);
    END LOOP;
  END IF;

  IF v_pag_total > v_total_liquido_final_calc + 0.01 THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_PAGAMENTOS_EXCEDEM_TOTAL';
  END IF;
  IF v_pag_total <= 0.009 THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_PAGAMENTO_ZERO';
  END IF;

  IF p_total_bruto IS NOT NULL AND p_total_desconto IS NOT NULL AND p_total_liquido IS NOT NULL
     AND (ABS(v_total_bruto_calc - p_total_bruto) > 0.02
       OR ABS(v_total_desconto_final_calc - p_total_desconto) > 0.02
       OR ABS(v_total_liquido_final_calc - p_total_liquido) > 0.02) THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_TOTAIS_DIVERGENTES';
  END IF;

  v_saldo_pendente := public.round_abnt(v_total_liquido_final_calc - v_pag_total, 2);

  IF v_saldo_pendente > 0.009 AND p_cliente_id IS NULL THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_SALDO_PENDENTE_EXIGE_CLIENTE';
  END IF;

  IF v_saldo_pendente > 0.009 THEN
    PERFORM 1 FROM public.clientes c
    WHERE c.id = p_cliente_id AND c.loja_id = p_loja_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_CLIENTE_LOJA_INVALIDO';
    END IF;
  END IF;

  -- PASSO 2: header da venda ANTES da baixa de estoque
  INSERT INTO public.vendas (
    id, caixa_id, operador_id, total_bruto, total_desconto, total_liquido, forma_pagamento, status, cliente_id
  ) VALUES (
    p_venda_id, p_caixa_id, v_uid, v_total_bruto_calc, v_total_desconto_final_calc,
    v_total_liquido_final_calc, p_forma_pagamento, 'CONCLUIDA', p_cliente_id
  ) ON CONFLICT (id) DO NOTHING;

  -- PASSO 3: itens + baixa de estoque
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens)
  LOOP
    v_item_id := COALESCE((v_item->>'item_id')::uuid, gen_random_uuid());
    v_produto_id := (v_item->>'produto_id')::uuid;
    v_quantidade := (v_item->>'quantidade')::numeric;
    v_preco_original := (v_item->>'preco_original')::numeric;
    v_preco_unitario := (v_item->>'preco_unitario')::numeric;
    v_tipo_preco := COALESCE(v_item->>'tipo_preco', 'VAREJO');
    v_desconto_unitario := GREATEST(0, v_preco_original - v_preco_unitario);

    v_custo_unitario_snap := (v_item->>'custo_unitario_snap')::numeric;
    v_tipo_preco_fonte := v_item->>'tipo_preco_fonte';
    v_regra_aplicada_id := (v_item->>'regra_aplicada_id')::uuid;

    v_promo_regra_id := NULL;
    v_promo_pct_snapshot := NULL;
    v_promo_nome := NULL;

    IF v_tipo_preco IN ('VAREJO', 'ATACADO') THEN
      SELECT categoria_id INTO v_categoria_id FROM public.produtos WHERE id = v_produto_id;
      SELECT regra_id, tipo_desconto, valor_desconto
      INTO v_promo_regra_id, v_promo_tipo_desconto, v_promo_valor
      FROM public.calcular_promocao_aplicavel(v_produto_id, v_categoria_id, v_quantidade);

      IF v_promo_regra_id IS NOT NULL THEN
        IF v_promo_tipo_desconto = 'PERCENTUAL' THEN
          v_promo_pct_snapshot := v_promo_valor;
        ELSIF v_preco_original > 0 THEN
          v_promo_pct_snapshot := ROUND(LEAST(100, GREATEST(0, v_promo_valor / v_preco_original * 100)), 4);
        ELSE
          v_promo_pct_snapshot := 0;
        END IF;
        SELECT nome INTO v_promo_nome FROM public.regras_preco WHERE id = v_promo_regra_id;
      END IF;
    END IF;

    INSERT INTO public.itens_venda (
      id, venda_id, produto_id, quantidade, preco_unitario_original, preco_unitario, desconto_unitario, tipo_preco,
      custo_unitario_snap, tipo_preco_fonte, regra_aplicada_id,
      promocao_regra_id, promocao_desconto_percentual, promocao_nome_snapshot
    ) VALUES (
      v_item_id, p_venda_id, v_produto_id, v_quantidade, v_preco_original, v_preco_unitario, v_desconto_unitario, v_tipo_preco,
      v_custo_unitario_snap, v_tipo_preco_fonte, v_regra_aplicada_id,
      v_promo_regra_id, v_promo_pct_snapshot, v_promo_nome
    ) ON CONFLICT (id) DO NOTHING;

    SELECT * INTO v_rpc_row
    FROM public.decrementar_estoque_seguro(v_produto_id, v_quantidade, p_venda_id)
    LIMIT 1;
    IF v_rpc_row IS NULL OR v_rpc_row.sucesso IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_ESTOQUE:%', COALESCE(v_rpc_row.mensagem, 'DESCONHECIDO');
    END IF;
  END LOOP;

  -- PASSO 4: registrar pagamentos no banco (split payment)
  IF p_pagamentos IS NULL THEN
    INSERT INTO public.vendas_pagamentos (venda_id, forma_pagamento, valor)
    VALUES (p_venda_id, p_forma_pagamento, v_total_liquido_final_calc)
    ON CONFLICT (venda_id, forma_pagamento) DO NOTHING;
  ELSE
    FOR v_pag IN SELECT value FROM jsonb_array_elements(p_pagamentos)
    LOOP
      v_pag_forma := upper(COALESCE(v_pag->>'forma_pagamento', ''));
      v_pag_valor := public.round_abnt(COALESCE((v_pag->>'valor')::numeric, 0), 2);

      INSERT INTO public.vendas_pagamentos (venda_id, forma_pagamento, valor)
      VALUES (p_venda_id, v_pag_forma, v_pag_valor)
      ON CONFLICT (venda_id, forma_pagamento) DO UPDATE SET valor = vendas_pagamentos.valor + EXCLUDED.valor;
    END LOOP;
  END IF;

  SELECT COALESCE(SUM(vp.valor), 0)
  INTO v_total_pago_atual
  FROM public.vendas_pagamentos vp
  WHERE vp.venda_id = p_venda_id;

  v_saldo_pendente_atual := public.round_abnt(v_total_liquido_final_calc - v_total_pago_atual, 2);

  IF ABS(v_saldo_pendente_atual - v_saldo_pendente) > 0.01 THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_SALDO_DIVERGENTE';
  END IF;

  -- PASSO 5 (BL-1): Consumo de token + auditoria de desconto
  IF p_desconto_gerente_token IS NOT NULL THEN
    UPDATE public.tokens_desconto_gerente
    SET usado = true
    WHERE token = p_desconto_gerente_token AND usado = false;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_TOKEN_GERENTE_JA_USADO';
    END IF;

    INSERT INTO public.descontos_venda (
      venda_id, gerente_id, desconto_percentual, desconto_valor, operador_id,
      aplicado_em, motivo_desconto, motivo_descricao_livre
    ) VALUES (
      p_venda_id, COALESCE(v_cfg_gerente_id, v_uid::text), p_desconto_gerente_percentual,
      v_desconto_gerente_valor, v_uid, now(), p_motivo_desconto, p_motivo_descricao
    )
    ON CONFLICT (venda_id) DO UPDATE SET
      gerente_id = EXCLUDED.gerente_id,
      desconto_percentual = EXCLUDED.desconto_percentual,
      desconto_valor = EXCLUDED.desconto_valor,
      operador_id = EXCLUDED.operador_id,
      aplicado_em = EXCLUDED.aplicado_em,
      motivo_desconto = EXCLUDED.motivo_desconto,
      motivo_descricao_livre = EXCLUDED.motivo_descricao_livre;
  END IF;

  -- PASSO 6: Criar contas_receber se há saldo pendente (Fase 5b, com idempotência)
  IF v_saldo_pendente_atual > 0.009 THEN
    IF NOT EXISTS (SELECT 1 FROM public.clientes c
                   WHERE c.id = p_cliente_id AND c.loja_id = p_loja_id) THEN
      RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_CLIENTE_LOJA_INVALIDO_TX';
    END IF;

    -- BR-01/ADR-003: limite de crédito, por modo da loja. Único ponto onde a
    -- exposição de crédito do cliente cresce — gate entra antes do INSERT.
    SELECT COALESCE(c.limite_credito, 0) INTO v_limite_credito_cliente
      FROM public.clientes c WHERE c.id = p_cliente_id;

    SELECT COALESCE(SUM(cr.valor_aberto), 0) INTO v_saldo_devedor_cliente
      FROM public.contas_receber cr
      WHERE cr.cliente_id = p_cliente_id AND cr.status IN ('ABERTO', 'PARCIAL');

    v_saldo_devedor_cliente := public.round_abnt(v_saldo_devedor_cliente + v_saldo_pendente_atual, 2);

    IF v_saldo_devedor_cliente > v_limite_credito_cliente THEN
      SELECT pc.modo_limite_credito INTO v_modo_credito
        FROM public.pdv_config pc WHERE pc.loja_id = p_loja_id;
      v_modo_credito := COALESCE(v_modo_credito, 'AVISO');

      IF v_modo_credito = 'BLOQUEIO' THEN
        RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_LIMITE_CREDITO_EXCEDIDO:%/%', v_saldo_devedor_cliente, v_limite_credito_cliente;
      ELSIF v_modo_credito = 'AUTORIZACAO_GERENTE' THEN
        IF p_limite_credito_gerente_token IS NULL THEN
          RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_LIMITE_CREDITO_TOKEN_OBRIGATORIO';
        END IF;
        PERFORM 1 FROM public.tokens_desconto_gerente t
        WHERE t.token = p_limite_credito_gerente_token AND t.usado = false AND t.expira_em > now() FOR UPDATE;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_LIMITE_CREDITO_TOKEN_INVALIDO';
        END IF;
        UPDATE public.tokens_desconto_gerente
          SET usado = true
          WHERE token = p_limite_credito_gerente_token AND usado = false;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_LIMITE_CREDITO_TOKEN_JA_USADO';
        END IF;
      ELSE
        -- AVISO (default): permite, registra na mensagem de retorno. App hoje
        -- só lê `mensagem` quando status <> 'CONCLUIDA' (ver
        -- caixaVendas.impl.ts:345-346) — não quebra o caminho de sucesso
        -- existente; fica disponível para telemetria/UI futura sem exigir
        -- mudança de contrato agora.
        v_aviso_limite_credito := format(
          'Limite de crédito excedido: saldo %s após esta venda, limite %s.',
          v_saldo_devedor_cliente::text, v_limite_credito_cliente::text
        );
      END IF;
    END IF;

    INSERT INTO public.contas_receber (
      id, cliente_id, venda_id, loja_id,
      valor_total, valor_aberto, status, created_at
    ) VALUES (
      gen_random_uuid(), p_cliente_id, p_venda_id, p_loja_id,
      v_total_liquido_final_calc, v_saldo_pendente_atual, 'ABERTO', now()
    )
    ON CONFLICT (venda_id) WHERE (venda_id IS NOT NULL) DO UPDATE SET
      valor_total = EXCLUDED.valor_total,
      valor_aberto = EXCLUDED.valor_aberto
    RETURNING id INTO v_contas_receber_id;
  END IF;

  -- PASSO 8: Event audit trail
  v_event_id := public.ensure_venda_evento_registrado(p_venda_id, c_source);

  -- PASSO 9: Fiscal enqueue (desacoplado, falha não derruba venda)
  IF p_fiscal_auto_enqueue THEN
    BEGIN
      INSERT INTO public.documentos_fiscais_pendentes (venda_id, tipo_doc, status)
      VALUES (p_venda_id, 'NFC_E_STUB', 'PENDENTE');
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Fiscal enqueue falhou para venda %: %', p_venda_id, SQLERRM;
    END;
  END IF;

  SELECT jsonb_build_object('documento_fiscal_id', d.id, 'status', d.status, 'tipo_doc', d.tipo_doc)
  INTO v_row_doc FROM public.documentos_fiscais_pendentes d
  WHERE d.venda_id = p_venda_id AND d.status <> 'CANCELADO' AND d.deleted_at IS NULL
  ORDER BY d.created_at DESC LIMIT 1;

  RETURN QUERY SELECT
    p_venda_id, 'CONCLUIDA'::text, v_aviso_limite_credito,
    v_row_doc, NULL::jsonb, NULL::jsonb,
    v_event_id, v_contas_receber_id;
END;
$function$;

COMMENT ON FUNCTION public.finalizar_venda_transacional_canonica_v4 IS
  'BR-01 (2026-08-05): limite de crédito do cliente (ADR-003) verificado antes de criar contas_receber, modo (AVISO/BLOQUEIO/AUTORIZACAO_GERENTE) lido de pdv_config.modo_limite_credito por loja. Resto do corpo inalterado.';

-- CREATE (não OR REPLACE, ver DROP acima) não herda grants do overload
-- antigo — precisam ser re-declarados explicitamente.
GRANT EXECUTE ON FUNCTION public.finalizar_venda_transacional_canonica_v4(
  uuid, uuid, uuid, uuid, text, numeric, numeric, numeric, jsonb, jsonb, text, numeric,
  boolean, boolean, text, text, text, text, uuid, motivo_desconto_enum_tipo, text, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalizar_venda_transacional_canonica_v4(
  uuid, uuid, uuid, uuid, text, numeric, numeric, numeric, jsonb, jsonb, text, numeric,
  boolean, boolean, text, text, text, text, uuid, motivo_desconto_enum_tipo, text, text
) TO service_role;

-- ============================================================================
-- VERIFICAÇÃO DE EFEITO — dentro da transação.
-- ============================================================================

DO $verify$
DECLARE
  v_def text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_pdv_config_modo_limite_credito'
  ) THEN
    RAISE EXCEPTION 'MIG298_CHECK_MODO_AUSENTE';
  END IF;

  v_def := pg_get_functiondef('public.finalizar_venda_transacional_canonica_v4(
    uuid, uuid, uuid, uuid, text, numeric, numeric, numeric, jsonb, jsonb, text, numeric,
    boolean, boolean, text, text, text, text, uuid, motivo_desconto_enum_tipo, text, text
  )'::regprocedure);

  IF position('modo_limite_credito' IN v_def) = 0 THEN
    RAISE EXCEPTION 'MIG298_GATE_AUSENTE';
  END IF;
  IF position('FINALIZAR_VENDA_CANONICA_LIMITE_CREDITO_EXCEDIDO' IN v_def) = 0 THEN
    RAISE EXCEPTION 'MIG298_BLOQUEIO_AUSENTE';
  END IF;
  IF position('p_limite_credito_gerente_token' IN v_def) = 0 THEN
    RAISE EXCEPTION 'MIG298_TOKEN_PARAM_AUSENTE';
  END IF;

  RAISE NOTICE '298 OK — BR-01 verificado no efeito (coluna, gate, RPC)';
END
$verify$;

COMMIT;
