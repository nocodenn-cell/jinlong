-- Migration: BL-1 — Reconciliação da RPC finalizar_venda_transacional_canonica_v4
-- Data: 2026-07-24
-- Escopo: Restaura PASSO 5 (consumo de token + auditoria), adiciona motivo (MVF #2), fecha gap colunas auditoria
-- Baseada no estado real do banco jinlong (descontos_venda: 4 colunas; v4: corpo 268 de 19 args)
-- Idempotente, timestamped, contra estado REAL não histórico

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PARTE A: Schema de auditoria de descontos (ADD IF NOT EXISTS)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Criar ENUM motivo_desconto_enum_tipo se não existir
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'motivo_desconto_enum_tipo' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')) THEN
    CREATE TYPE public.motivo_desconto_enum_tipo AS ENUM (
      'NAO_ESPECIFICADO',
      'ERRO_DIGITACAO',
      'NEGOCIACAO',
      'CLIENTE_PREFERENCIAL',
      'DANO_PRODUTO',
      'AUTORIZACAO_COMERCIAL',
      'OUTROS'
    );
  END IF;
END $$;

-- Adicionar colunas a descontos_venda (todas ADD IF NOT EXISTS)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'descontos_venda' AND column_name = 'operador_id'
  ) THEN
    ALTER TABLE public.descontos_venda
    ADD COLUMN operador_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'descontos_venda' AND column_name = 'aplicado_em'
  ) THEN
    ALTER TABLE public.descontos_venda
    ADD COLUMN aplicado_em timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'descontos_venda' AND column_name = 'motivo_desconto'
  ) THEN
    ALTER TABLE public.descontos_venda
    ADD COLUMN motivo_desconto public.motivo_desconto_enum_tipo NOT NULL DEFAULT 'NAO_ESPECIFICADO';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'descontos_venda' AND column_name = 'motivo_descricao_livre'
  ) THEN
    ALTER TABLE public.descontos_venda
    ADD COLUMN motivo_descricao_livre text;
  END IF;
END $$;

-- CHECK constraint: OUTROS requer descrição
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'check_motivo_descricao' AND connamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  ) THEN
    ALTER TABLE public.descontos_venda ADD CONSTRAINT check_motivo_descricao CHECK (
      CASE WHEN motivo_desconto = 'OUTROS'
        THEN motivo_descricao_livre IS NOT NULL AND length(trim(COALESCE(motivo_descricao_livre, ''))) > 0
        ELSE true  -- outros motivos não exigem descrição
      END
    );
  END IF;
END $$;

-- Índice por motivo para queries de auditoria
CREATE INDEX IF NOT EXISTS idx_descontos_venda_motivo ON public.descontos_venda(motivo_desconto);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PARTE B: RPC v4 — DROP do overload de 19 args + CREATE com 21 args
-- ═══════════════════════════════════════════════════════════════════════════════

-- DROP FUNCTION pré-existente (19 args)
DROP FUNCTION IF EXISTS public.finalizar_venda_transacional_canonica_v4(
  uuid, uuid, uuid, uuid, text, numeric, numeric, numeric,
  jsonb, jsonb, text, numeric, boolean, boolean, text, text, text, text, uuid
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PARTE C: CREATE com 21 args (corpo 268 + PASSO 5 restaurado + motivo)
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.finalizar_venda_transacional_canonica_v4(
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
  p_motivo_desconto public.motivo_desconto_enum_tipo DEFAULT 'NAO_ESPECIFICADO'::public.motivo_desconto_enum_tipo,
  p_motivo_descricao text DEFAULT NULL::text
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

  SELECT max_desconto_gerente_percentual, gerente_id
  INTO v_max_desconto_gerente, v_cfg_gerente_id FROM public.pdv_config WHERE id = 1;

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
    IF v_tipo_preco IN ('MANUAL', 'PROMOCAO') THEN
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

    INSERT INTO public.itens_venda (
      id, venda_id, produto_id, quantidade, preco_unitario_original, preco_unitario, desconto_unitario, tipo_preco
    ) VALUES (v_item_id, p_venda_id, v_produto_id, v_quantidade, v_preco_original, v_preco_unitario, v_desconto_unitario, v_tipo_preco)
    ON CONFLICT (id) DO NOTHING;

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

  -- ✅ DENTRO DA TRANSAÇÃO: Recalcular saldo para validação 2ª linha
  SELECT COALESCE(SUM(vp.valor), 0)
  INTO v_total_pago_atual
  FROM public.vendas_pagamentos vp
  WHERE vp.venda_id = p_venda_id;

  v_saldo_pendente_atual := public.round_abnt(v_total_liquido_final_calc - v_total_pago_atual, 2);

  IF ABS(v_saldo_pendente_atual - v_saldo_pendente) > 0.01 THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_SALDO_DIVERGENTE';
  END IF;

  -- ✅ PASSO 5 (RESTAURADO): Consumo de token + auditoria de desconto
  IF p_desconto_gerente_token IS NOT NULL THEN
    -- (A) Consumir o token (marcar como usado)
    UPDATE public.tokens_desconto_gerente
    SET usado = true
    WHERE token = p_desconto_gerente_token AND usado = false;
    
    IF NOT FOUND THEN
      RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_TOKEN_GERENTE_JA_USADO';
    END IF;

    -- (B) Registrar auditoria de desconto com motivo
    INSERT INTO public.descontos_venda (
      venda_id,
      gerente_id,
      desconto_percentual,
      desconto_valor,
      operador_id,
      aplicado_em,
      motivo_desconto,
      motivo_descricao_livre
    ) VALUES (
      p_venda_id,
      COALESCE(v_cfg_gerente_id, v_uid::text),
      p_desconto_gerente_percentual,
      v_desconto_gerente_valor,
      v_uid,
      now(),
      p_motivo_desconto,
      p_motivo_descricao
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

  -- PASSO 7: Trigger ensina venda_finance_context
  -- [já feito via trigger em migration 252]

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

  -- ✅ RETORNO com contas_receber_id (Fase 5b)
  RETURN QUERY SELECT
    p_venda_id, 'CONCLUIDA'::text, NULL::text,
    v_row_doc, NULL::jsonb, NULL::jsonb,
    v_event_id, v_contas_receber_id;
END;
$function$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PARTE D: Grants para nova assinatura (idênticos aos do corpo 268)
-- ═══════════════════════════════════════════════════════════════════════════════

GRANT EXECUTE ON FUNCTION public.finalizar_venda_transacional_canonica_v4(
  uuid, uuid, uuid, uuid, text, numeric, numeric, numeric,
  jsonb, jsonb, text, numeric, boolean, boolean, text, text, text, text, uuid,
  public.motivo_desconto_enum_tipo, text
) TO authenticated, anon;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PARTE E: Notificação de reload (PostgREST)
-- ═══════════════════════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';

COMMIT;
