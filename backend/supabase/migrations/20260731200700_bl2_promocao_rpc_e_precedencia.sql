-- Migration 274: BL-2 — RPC de promoção, precedência comercial e autoridade no backend
-- Data: 2026-07-24
-- Referência: docs/BL2_MODELO_FINAL_APROVADO.md
--
-- Escopo desta migration:
--   PARTE A — Nova RPC calcular_promocao_aplicavel: decide a regra vencedora
--             (PRODUTO > CATEGORIA > mais recente). Frontend NUNCA decide promoção;
--             pode chamar esta função só para preview visual, mas o resultado usado
--             na venda é sempre recalculado dentro de finalizar_venda_transacional_canonica_v4.
--   PARTE B — Ajuste do trigger de limite de desconto manual (migration 122): promoção
--             cadastrada é pré-autorizada (GERENTE/DONO/ADMIN via RLS), análoga a ATACADO,
--             e não conta para o teto de desconto manual por item. O teto passa a ser
--             calculado sobre o preço JÁ COM promoção, não sobre o preço de tabela.
--   PARTE C — finalizar_venda_transacional_canonica_v4 (mesma assinatura de 21 args):
--             (1) resolve e revalida a promoção vencedora para itens VAREJO/ATACADO;
--             (2) valida o teto agregado de desconto total da venda (max_desconto_total_percentual);
--             (3) grava snapshot de auditoria de promoção em itens_venda;
--             (4) restaura a captura de custo_unitario_snap/tipo_preco_fonte/regra_aplicada_id
--                 (ver nota de regressão abaixo).
--
-- Nota de regressão pré-existente (achado durante esta migration, fora do escopo
-- original de BL-2, corrigida aqui por tocar o mesmo INSERT INTO itens_venda):
--   A migration 235 adicionou custo_unitario_snap/tipo_preco_fonte/regra_aplicada_id e
--   atualizou o corpo da RPC da época para populá-los. A migration 268 ("single overload")
--   reconstruiu o corpo da função a partir de uma base que NÃO incluía mais essa captura,
--   e a migration 272 (BL-1) herdou esse corpo (comentário "corpo 268") sem restaurá-la.
--   O frontend (caixaVendas.impl.ts) continua enviando esses 3 campos por item desde então,
--   mas a RPC em produção os ignora silenciosamente. Como esta migration já reescreve o
--   mesmo laço de INSERT para os novos campos de promoção, a captura é restaurada aqui.
--   Efeito: aditivo, sem risco — eram colunas nullable e não usadas em nenhum cálculo.
--
-- Nenhuma mudança de assinatura pública: finalizar_venda_transacional_canonica_v4
-- continua com os mesmos 21 argumentos de entrada (promoção é resolvida internamente,
-- não via novo parâmetro do chamador).

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PARTE A: RPC calcular_promocao_aplicavel — leitura pura, autoridade de decisão
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.calcular_promocao_aplicavel(
  p_produto_id uuid,
  p_categoria_id uuid,
  p_quantidade numeric,
  p_data_referencia timestamptz DEFAULT now()
)
RETURNS TABLE(
  regra_id uuid,
  tipo_regra text,
  tipo_desconto text,
  valor_desconto numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  SELECT
    rp.id,
    rp.tipo_regra,
    rp.tipo_desconto,
    rp.valor_desconto
  FROM public.regras_preco rp
  WHERE rp.ativo = true
    AND (rp.data_validade IS NULL OR rp.data_validade > p_data_referencia)
    AND p_quantidade >= rp.quantidade_minima
    AND (rp.quantidade_maxima IS NULL OR p_quantidade <= rp.quantidade_maxima)
    AND (
      (rp.tipo_regra = 'PRODUTO'   AND rp.produto_id   = p_produto_id)
      OR
      (rp.tipo_regra = 'CATEGORIA' AND p_categoria_id IS NOT NULL AND rp.categoria_id = p_categoria_id)
    )
  ORDER BY
    CASE rp.tipo_regra WHEN 'PRODUTO' THEN 0 ELSE 1 END ASC,
    rp.quantidade_minima DESC,
    rp.created_at DESC
  LIMIT 1;
$function$;

COMMENT ON FUNCTION public.calcular_promocao_aplicavel(uuid, uuid, numeric, timestamptz) IS
  'Decide a regra de promoção vencedora (precedência: PRODUTO > CATEGORIA; dentro do '
  'mesmo tipo, maior quantidade_minima vence; tie-break final por created_at DESC). '
  'Leitura pura (STABLE), RLS de regras_preco já permite SELECT a qualquer authenticated. '
  'Autoridade real está em finalizar_venda_transacional_canonica_v4, que SEMPRE recalcula '
  '— esta função pode ser chamada pelo frontend só para preview visual, nunca como decisão final.';

GRANT EXECUTE ON FUNCTION public.calcular_promocao_aplicavel(uuid, uuid, numeric, timestamptz)
  TO authenticated, anon;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PARTE B: Ajuste do trigger de limite de desconto manual (migration 122)
--
-- Promoção cadastrada em regras_preco é pré-autorizada por GERENTE/DONO/ADMIN (RLS de
-- escrita já restringe isso) — tratamento análogo a ATACADO. O teto de
-- max_desconto_manual_item_percentual (padrão 15%) deixa de ser calculado sobre o preço
-- de tabela original e passa a ser calculado sobre o preço JÁ COM a promoção aplicada,
-- protegendo apenas a camada adicional de desconto manual do operador.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.trg_fn_itens_venda_limite_desconto()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limite  numeric(5,2);
  v_pct     numeric(10,4);
  v_base    numeric(12,4);
BEGIN
  -- ATACADO: preço de tabela atacado, desconto pré-autorizado pelo catálogo.
  IF NEW.tipo_preco = 'ATACADO' THEN
    RETURN NEW;
  END IF;

  -- Venda com token de gerente validado nesta transação: isenta todos os itens.
  IF current_setting('session.gerente_token_validado', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- Sem preço original: nada a verificar.
  IF COALESCE(NEW.preco_unitario_original, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  -- BL-2: se há promoção aplicada, a base de comparação do desconto MANUAL
  -- passa a ser o preço JÁ COM a promoção (pré-autorizada, análoga a ATACADO).
  v_base := NEW.preco_unitario_original;
  IF NEW.promocao_regra_id IS NOT NULL THEN
    v_base := NEW.preco_unitario_original
      * (1 - COALESCE(NEW.promocao_desconto_percentual, 0) / 100);
  END IF;

  IF v_base <= 0 THEN
    RETURN NEW;
  END IF;

  -- Sem desconto manual real além da promoção: nada a verificar.
  IF COALESCE(NEW.preco_unitario, v_base) >= v_base THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(max_desconto_manual_item_percentual, 15.00)
  INTO   v_limite
  FROM   public.pdv_config
  WHERE  id = 1;

  v_limite := COALESCE(v_limite, 15.00);

  v_pct := ROUND((v_base - NEW.preco_unitario) / v_base * 100, 4);

  IF v_pct > v_limite THEN
    RAISE EXCEPTION 'DESCONTO_MANUAL_EXCESSIVO'
      USING DETAIL = format(
        'Desconto manual adicional de %s%% no item excede o limite de %s%% '
        '(tipo_preco: %s, base de comparação pós-promoção: %s). '
        'Solicite autorização de gerente para prosseguir.',
        round(v_pct, 2), round(v_limite, 2), NEW.tipo_preco, round(v_base, 4)
      );
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_fn_itens_venda_limite_desconto() IS
  'Trigger BEFORE INSERT/UPDATE em itens_venda: rejeita desconto MANUAL por item acima '
  'do limite em pdv_config.max_desconto_manual_item_percentual (padrão 15%). '
  'Isenta tipo_preco ATACADO e vendas com session.gerente_token_validado = ''true''. '
  'BL-2 (migration 274): quando promocao_regra_id está presente, a base de comparação '
  'passa a ser o preço pós-promoção (a promoção em si é pré-autorizada, não conta '
  'para este teto).';

-- Não é necessário recriar os triggers (trg_itens_venda_limite_desconto_bi/bu):
-- CREATE OR REPLACE FUNCTION já atualiza o corpo executado pelos triggers existentes.

-- ═══════════════════════════════════════════════════════════════════════════════
-- PARTE C: finalizar_venda_transacional_canonica_v4 — resolve/revalida promoção,
-- aplica teto agregado de desconto total, e grava auditoria (mesma assinatura 21 args)
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
      -- Desconto manual: apenas garante que não excede o preço de referência enviado.
      -- Promoção NÃO é resolvida para itens MANUAL nesta migration (escopo: item é OU
      -- auto-precificado com promoção opcional, OU manualmente precificado pelo operador
      -- sob o regime já existente do trigger de limite — ver nota de escopo em
      -- docs/BL2_MODELO_FINAL_APROVADO.md).
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

      -- BL-2: resolver e aplicar a promoção vencedora (se houver) sobre o preço base
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

  -- BL-2: limite final — teto agregado de desconto (promoção + manual + gerente) sobre o total_bruto
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

    -- Restauração de observabilidade visual (migration 235) — ver nota de regressão no topo.
    v_custo_unitario_snap := (v_item->>'custo_unitario_snap')::numeric;
    v_tipo_preco_fonte := v_item->>'tipo_preco_fonte';
    v_regra_aplicada_id := (v_item->>'regra_aplicada_id')::uuid;

    -- BL-2: recompor snapshot de auditoria de promoção (recálculo idempotente e
    -- determinístico dentro da mesma transação — mesma função STABLE do PASSO 1).
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

  -- ✅ DENTRO DA TRANSAÇÃO: Recalcular saldo para validação 2ª linha
  SELECT COALESCE(SUM(vp.valor), 0)
  INTO v_total_pago_atual
  FROM public.vendas_pagamentos vp
  WHERE vp.venda_id = p_venda_id;

  v_saldo_pendente_atual := public.round_abnt(v_total_liquido_final_calc - v_total_pago_atual, 2);

  IF ABS(v_saldo_pendente_atual - v_saldo_pendente) > 0.01 THEN
    RAISE EXCEPTION 'FINALIZAR_VENDA_CANONICA_SALDO_DIVERGENTE';
  END IF;

  -- ✅ PASSO 5 (BL-1): Consumo de token + auditoria de desconto
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

COMMENT ON FUNCTION public.finalizar_venda_transacional_canonica_v4(
  uuid, uuid, uuid, uuid, text, numeric, numeric, numeric,
  jsonb, jsonb, text, numeric, boolean, boolean, text, text, text, text, uuid,
  public.motivo_desconto_enum_tipo, text
) IS
  'Finalização transacional canônica v4. BL-2 (migration 274): resolve e revalida '
  'promoção vencedora (calcular_promocao_aplicavel) para itens VAREJO/ATACADO, aplica '
  'teto agregado de desconto total (pdv_config.max_desconto_total_percentual) e grava '
  'snapshot de auditoria em itens_venda.promocao_*. Assinatura inalterada em relação à '
  'migration 272 (BL-1) — promoção é resolvida internamente, não via novo parâmetro.';

-- Assinatura inalterada: GRANTs já existentes (migration 272) permanecem válidos.
-- Redeclarado aqui de forma idempotente por segurança/documentação.
GRANT EXECUTE ON FUNCTION public.finalizar_venda_transacional_canonica_v4(
  uuid, uuid, uuid, uuid, text, numeric, numeric, numeric,
  jsonb, jsonb, text, numeric, boolean, boolean, text, text, text, text, uuid,
  public.motivo_desconto_enum_tipo, text
) TO authenticated, anon;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PARTE D: Notificação de reload (PostgREST)
-- ═══════════════════════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';

COMMIT;
