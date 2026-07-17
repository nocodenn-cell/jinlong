-- 272 — Fase 5, Entrega 2: cancelamento/devolução autorizáveis por token de gerente
-- (mesmo mecanismo já usado para desconto de gerente na finalização — RPC
-- `validar-gerente` / tabela `tokens_desconto_gerente`), permitindo que o
-- OPERADOR do caixa inicie a operação sem precisar estar logado como
-- GERENTE/DONO/ADMIN, desde que um gerente autorize pontualmente com senha.
--
-- Decisão de produto (2026-07-17): Opção B — autorização pontual do gerente.
--   - Operador inicia o cancelamento/devolução a partir do próprio caixa.
--   - Sistema solicita a senha do gerente (mesmo modal já usado no desconto).
--   - O gerente autoriza apenas aquela operação (token de uso único, TTL 5min).
--   - A venda continua sendo operada pelo caixa (não muda de tela).
--   - Auditoria registra operador solicitante + gerente autorizador + motivo + hora.
--
-- Decisão estrutural (mesma sessão): a política de autorização não deve ficar
-- duplicada em cada RPC privilegiada. `autorizar_operacao_privilegiada()` abaixo
-- é a ÚNICA fonte de verdade — valida token OU perfil próprio, consome o token
-- (transacional: se a operação que a chamou falhar depois, o rollback desfaz o
-- consumo também) e devolve quem autorizou. `cancelar_venda_transacional` e
-- `devolver_ou_trocar_venda` chamam essa função em vez de reimplementar a
-- checagem. Futuras operações privilegiadas (sangria, reabertura de caixa,
-- alteração manual de preço etc. — ver roadmap Fase 5) devem reusar a mesma
-- função, não copiar o bloco de autorização.
--
-- Compatibilidade: quem já está logado como GERENTE/DONO/ADMIN continua podendo
-- cancelar/devolver diretamente (sem token), como hoje — o token é uma via
-- adicional, não uma substituição.
--
-- IMPORTANTE: adicionar um parâmetro a uma função SQL cria um novo overload
-- (identidade = nome + tipos dos parâmetros); sem o DROP explícito abaixo, o
-- caller antigo e o novo coexistiriam (mesmo problema que a migration 268
-- corrigiu para a v4 — "single overload"). Removemos a assinatura antiga antes
-- de criar a nova.

-- ─────────────────────────────────────────────────────────────────────────────
-- Auditoria: quem autorizou, e como
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.vendas_canceladas_auditoria
  ADD COLUMN IF NOT EXISTS gerente_autorizador_id uuid REFERENCES public.usuarios (id),
  ADD COLUMN IF NOT EXISTS autorizado_via text NOT NULL DEFAULT 'PERFIL_PROPRIO'
    CHECK (autorizado_via IN ('PERFIL_PROPRIO', 'TOKEN_GERENTE'));

ALTER TABLE public.venda_pos_venda_operacoes
  ADD COLUMN IF NOT EXISTS gerente_autorizador_id uuid REFERENCES public.usuarios (id),
  ADD COLUMN IF NOT EXISTS autorizado_via text NOT NULL DEFAULT 'PERFIL_PROPRIO'
    CHECK (autorizado_via IN ('PERFIL_PROPRIO', 'TOKEN_GERENTE'));

COMMENT ON COLUMN public.vendas_canceladas_auditoria.gerente_autorizador_id IS
  'Gerente que autorizou (via token) ou o próprio operador quando já tinha perfil GERENTE/DONO/ADMIN.';
COMMENT ON COLUMN public.vendas_canceladas_auditoria.autorizado_via IS
  'PERFIL_PROPRIO: quem executou já era GERENTE/DONO/ADMIN. TOKEN_GERENTE: operador comum autorizado por token pontual.';

-- ─────────────────────────────────────────────────────────────────────────────
-- SSoT de autorização para operações privilegiadas (cancelamento, devolução,
-- e futuras: sangria, reabertura de caixa, alteração manual de preço...).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.autorizar_operacao_privilegiada(
  p_uid uuid,
  p_loja_id uuid,
  p_gerente_token text DEFAULT NULL,
  p_perfis_permitidos text[] DEFAULT ARRAY['GERENTE', 'DONO', 'ADMIN']
)
RETURNS TABLE (gerente_autorizador_id uuid, autorizado_via text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text := NULLIF(btrim(p_gerente_token), '');
BEGIN
  IF v_token IS NOT NULL THEN
    PERFORM 1 FROM public.tokens_desconto_gerente t
    WHERE t.token = v_token AND t.usado = false AND t.expira_em > now() FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'OPERACAO_PRIVILEGIADA_TOKEN_GERENTE_INVALIDO';
    END IF;

    -- Consumo transacional: se a operação chamadora falhar depois (RAISE em
    -- qualquer ponto posterior), o rollback desfaz este UPDATE também — o
    -- token volta a ficar disponível, não é "queimado" por uma tentativa que
    -- não completou.
    UPDATE public.tokens_desconto_gerente SET usado = true WHERE token = v_token;

    RETURN QUERY
    SELECT c.gerente_id, 'TOKEN_GERENTE'::text
    FROM public.pdv_config c WHERE c.id = 1;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = p_uid AND u.loja_id = p_loja_id AND u.perfil = ANY(p_perfis_permitidos)
  ) THEN
    RETURN QUERY SELECT p_uid, 'PERFIL_PROPRIO'::text;
    RETURN;
  END IF;

  RAISE EXCEPTION 'OPERACAO_PRIVILEGIADA_SEM_PERMISSAO';
END;
$$;

REVOKE ALL ON FUNCTION public.autorizar_operacao_privilegiada(uuid, uuid, text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.autorizar_operacao_privilegiada(uuid, uuid, text, text[]) TO service_role;

COMMENT ON FUNCTION public.autorizar_operacao_privilegiada IS
  'SSoT de autorização para operações privilegiadas do PDV: perfil próprio (GERENTE/DONO/ADMIN) OU token pontual de gerente (mesmo mecanismo do desconto). Não chamar via PostgREST diretamente — só de dentro de outras SECURITY DEFINER (cancelar_venda_transacional, devolver_ou_trocar_venda, futuras).';

-- ─────────────────────────────────────────────────────────────────────────────
-- cancelar_venda_transacional: novo parâmetro p_gerente_token
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.cancelar_venda_transacional(uuid, text, uuid);

CREATE OR REPLACE FUNCTION public.cancelar_venda_transacional(
  p_venda_id uuid,
  p_motivo text,
  p_operador_id uuid DEFAULT NULL,
  p_gerente_token text DEFAULT NULL
)
RETURNS TABLE (venda_id uuid, status_venda text, valor_estornado numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := COALESCE(auth.uid(), p_operador_id);
  v_motivo text := NULLIF(btrim(p_motivo), '');
  v_venda record;
  v_caixa record;
  v_item record;
  v_valor_estornado numeric(10,2) := 0;
  v_tem_split boolean := false;
  v_forma_auditoria text;
  v_gerente_autorizador_id uuid;
  v_autorizado_via text;
  c_source constant text := 'gerente_panel';
BEGIN
  PERFORM set_config('lock_timeout', '4s', true);
  IF v_uid IS NULL THEN RAISE EXCEPTION 'CANCELAR_VENDA_AUTH'; END IF;
  IF v_motivo IS NULL THEN RAISE EXCEPTION 'CANCELAR_VENDA_MOTIVO_OBRIGATORIO'; END IF;

  SELECT v.* INTO v_venda FROM public.vendas v WHERE v.id = p_venda_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CANCELAR_VENDA_NAO_ENCONTRADA'; END IF;
  IF v_venda.status = 'CANCELADA' THEN RAISE EXCEPTION 'CANCELAR_VENDA_JA_CANCELADA'; END IF;

  SELECT c.* INTO v_caixa FROM public.caixas c WHERE c.id = v_venda.caixa_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'CANCELAR_VENDA_CAIXA_NAO_ENCONTRADO'; END IF;

  SELECT a.gerente_autorizador_id, a.autorizado_via
  INTO v_gerente_autorizador_id, v_autorizado_via
  FROM public.autorizar_operacao_privilegiada(v_uid, v_caixa.loja_id, p_gerente_token) a;

  -- Estorno contas_receber vinculada
  UPDATE public.contas_receber cr
  SET valor_aberto = 0,
    status = 'CANCELADO'
  WHERE cr.venda_id = p_venda_id AND cr.status IN ('ABERTO', 'PARCIAL');

  SELECT EXISTS (SELECT 1 FROM public.vendas_pagamentos vp WHERE vp.venda_id = p_venda_id LIMIT 1) INTO v_tem_split;

  FOR v_item IN SELECT iv.produto_id, iv.quantidade FROM public.itens_venda iv WHERE iv.venda_id = p_venda_id
  LOOP
    PERFORM 1 FROM public.estoque e
    WHERE e.produto_id = v_item.produto_id AND e.loja_id = v_caixa.loja_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'CANCELAR_VENDA_ESTOQUE_NAO_ENCONTRADO'; END IF;

    UPDATE public.estoque e SET quantidade_atual = e.quantidade_atual + v_item.quantidade,
      version = e.version + 1, updated_at = now()
    WHERE e.produto_id = v_item.produto_id AND e.loja_id = v_caixa.loja_id;

    INSERT INTO public.estoque_reposicoes_cancelamento (venda_id, produto_id, quantidade)
    VALUES (p_venda_id, v_item.produto_id, v_item.quantidade)
    ON CONFLICT (venda_id, produto_id) DO NOTHING;
  END LOOP;

  IF v_tem_split THEN
    SELECT COALESCE(SUM(vp.valor) FILTER (WHERE vp.forma_pagamento = 'DINHEIRO'), 0)::numeric(10,2)
    INTO v_valor_estornado FROM public.vendas_pagamentos vp WHERE vp.venda_id = p_venda_id;
    v_valor_estornado := ROUND(v_valor_estornado, 2);

    INSERT INTO public.devolucoes (venda_id, valor, forma_pagamento, motivo, operador_id)
    SELECT p_venda_id, ROUND(SUM(vp.valor), 2), vp.forma_pagamento, v_motivo, v_uid
    FROM public.vendas_pagamentos vp WHERE vp.venda_id = p_venda_id GROUP BY vp.forma_pagamento;

    IF v_valor_estornado > 0 THEN
      UPDATE public.caixas c SET saldo_atual = ROUND(c.saldo_atual - v_valor_estornado, 2)
      WHERE c.id = v_caixa.id AND (c.saldo_atual - v_valor_estornado) >= 0;
      IF NOT FOUND THEN RAISE EXCEPTION 'CANCELAR_VENDA_SALDO_CAIXA_INSUFICIENTE'; END IF;
    END IF;
    v_forma_auditoria := 'SPLIT';
  ELSIF v_venda.forma_pagamento = 'DINHEIRO' THEN
    v_valor_estornado := ROUND(COALESCE(v_venda.total_liquido, 0), 2);
    INSERT INTO public.devolucoes (venda_id, valor, forma_pagamento, motivo, operador_id)
    VALUES (p_venda_id, v_valor_estornado, 'DINHEIRO', v_motivo, v_uid) ON CONFLICT DO NOTHING;
    UPDATE public.caixas c SET saldo_atual = ROUND(c.saldo_atual - v_valor_estornado, 2)
    WHERE c.id = v_caixa.id AND (c.saldo_atual - v_valor_estornado) >= 0;
    IF NOT FOUND THEN RAISE EXCEPTION 'CANCELAR_VENDA_SALDO_CAIXA_INSUFICIENTE'; END IF;
    v_forma_auditoria := v_venda.forma_pagamento;
  ELSE
    INSERT INTO public.devolucoes (venda_id, valor, forma_pagamento, motivo, operador_id)
    VALUES (p_venda_id, ROUND(COALESCE(v_venda.total_liquido, 0), 2), v_venda.forma_pagamento, v_motivo, v_uid);
    v_valor_estornado := 0;
    v_forma_auditoria := v_venda.forma_pagamento;
  END IF;

  UPDATE public.vendas SET status = 'CANCELADA' WHERE id = p_venda_id;

  INSERT INTO public.vendas_canceladas_auditoria (
    venda_id, caixa_id, operador_id, motivo, forma_pagamento, valor_estornado,
    gerente_autorizador_id, autorizado_via
  ) VALUES (
    p_venda_id, v_caixa.id, v_uid, v_motivo, v_forma_auditoria,
    CASE WHEN v_tem_split THEN (
      SELECT COALESCE(SUM(vp.valor) FILTER (WHERE vp.forma_pagamento = 'DINHEIRO'), 0)::numeric(10,2)
      FROM public.vendas_pagamentos vp WHERE vp.venda_id = p_venda_id
    ) WHEN v_venda.forma_pagamento = 'DINHEIRO' THEN ROUND(COALESCE(v_venda.total_liquido, 0), 2)
    ELSE 0::numeric(10,2) END,
    v_gerente_autorizador_id, v_autorizado_via
  ) ON CONFLICT (venda_id) DO NOTHING;

  PERFORM public.registrar_venda_evento(
    'SALE_CANCELLED', p_venda_id, c_source, v_caixa.id, v_venda.operador_id, v_caixa.loja_id,
    public.venda_eventos_items_from_sale(p_venda_id),
    COALESCE(v_venda.total_liquido, 0), v_venda.total_bruto, v_venda.forma_pagamento, true
  );

  RETURN QUERY SELECT p_venda_id, 'CANCELADA'::text, v_valor_estornado;
END;
$$;

REVOKE ALL ON FUNCTION public.cancelar_venda_transacional(uuid, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancelar_venda_transacional(uuid, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancelar_venda_transacional(uuid, text, uuid, text) TO service_role;

COMMENT ON FUNCTION public.cancelar_venda_transacional IS
  'Cancela venda: repõe estoque; devoluções por forma; debita saldo do caixa só em parcelas DINHEIRO; auditoria. Autorização via autorizar_operacao_privilegiada (perfil próprio ou token pontual de gerente).';

-- ─────────────────────────────────────────────────────────────────────────────
-- devolver_ou_trocar_venda: novo parâmetro p_gerente_token
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.devolver_ou_trocar_venda(
  uuid, text, text, text, jsonb, numeric, text, uuid, uuid
);

CREATE OR REPLACE FUNCTION public.devolver_ou_trocar_venda(
  p_venda_id uuid,
  p_idempotency_key text,
  p_motivo text,
  p_tipo text,
  p_itens jsonb,
  p_valor_estorno numeric,
  p_forma_estorno text,
  p_venda_substituta_id uuid DEFAULT NULL,
  p_operador_id uuid DEFAULT NULL,
  p_gerente_token text DEFAULT NULL
)
RETURNS TABLE (
  operacao_id uuid,
  venda_id uuid,
  tipo text,
  valor_estornado numeric,
  valor_caixa_estornado numeric,
  status_venda text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := COALESCE(auth.uid(), p_operador_id);
  v_key text := NULLIF(btrim(p_idempotency_key), '');
  v_motivo text := NULLIF(btrim(p_motivo), '');
  v_tipo text := upper(NULLIF(btrim(p_tipo), ''));
  v_forma text := upper(NULLIF(btrim(p_forma_estorno), ''));
  v_venda record;
  v_caixa record;
  v_existing record;
  v_operacao_id uuid;
  v_item jsonb;
  v_item_venda_id uuid;
  v_produto_id uuid;
  v_qtd numeric(10, 3);
  v_qtd_vendida numeric(10, 3);
  v_qtd_ja_devolvida numeric(10, 3);
  v_preco_unit numeric(10, 2);
  v_subtotal numeric(10, 2);
  v_total_itens numeric(10, 2) := 0;
  v_valor_estorno numeric(10, 2);
  v_valor_caixa numeric(10, 2) := 0;
  v_cr record;
  v_contas_receber_id uuid := NULL;
  v_event_items jsonb := '[]'::jsonb;
  v_gerente_autorizador_id uuid;
  v_autorizado_via text;
  c_source constant text := 'gerente_panel';
BEGIN
  PERFORM set_config('lock_timeout', '4s', true);

  IF v_uid IS NULL THEN RAISE EXCEPTION 'DEVOLVER_VENDA_AUTH'; END IF;
  IF v_key IS NULL THEN RAISE EXCEPTION 'DEVOLVER_VENDA_IDEMPOTENCY_OBRIGATORIA'; END IF;
  IF v_motivo IS NULL THEN RAISE EXCEPTION 'DEVOLVER_VENDA_MOTIVO_OBRIGATORIO'; END IF;
  IF v_tipo NOT IN ('DEVOLUCAO', 'TROCA') THEN RAISE EXCEPTION 'DEVOLVER_VENDA_TIPO_INVALIDO'; END IF;
  IF v_forma NOT IN ('DINHEIRO', 'PIX', 'CARTAO_DEBITO', 'CARTAO_CREDITO', 'CREDITO_CLIENTE') THEN
    RAISE EXCEPTION 'DEVOLVER_VENDA_FORMA_INVALIDA';
  END IF;
  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) <= 0 THEN
    RAISE EXCEPTION 'DEVOLVER_VENDA_ITENS_OBRIGATORIOS';
  END IF;

  -- Idempotência: retorno da operação existente
  SELECT o.* INTO v_existing
  FROM public.venda_pos_venda_operacoes o
  WHERE o.idempotency_key = v_key;

  IF FOUND THEN
    RETURN QUERY
    SELECT v_existing.id, v_existing.venda_id, v_existing.tipo,
      v_existing.valor_estornado, v_existing.valor_caixa_estornado, 'CONCLUIDA'::text;
    RETURN;
  END IF;

  SELECT v.* INTO v_venda FROM public.vendas v WHERE v.id = p_venda_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DEVOLVER_VENDA_NAO_ENCONTRADA'; END IF;
  IF v_venda.status <> 'CONCLUIDA' THEN RAISE EXCEPTION 'DEVOLVER_VENDA_STATUS_INVALIDO'; END IF;

  SELECT c.* INTO v_caixa FROM public.caixas c WHERE c.id = v_venda.caixa_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'DEVOLVER_VENDA_CAIXA_NAO_ENCONTRADO'; END IF;

  SELECT a.gerente_autorizador_id, a.autorizado_via
  INTO v_gerente_autorizador_id, v_autorizado_via
  FROM public.autorizar_operacao_privilegiada(v_uid, v_caixa.loja_id, p_gerente_token) a;

  IF v_tipo = 'TROCA' AND p_venda_substituta_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.vendas vs
      WHERE vs.id = p_venda_substituta_id AND vs.status = 'CONCLUIDA'
    ) THEN
      RAISE EXCEPTION 'DEVOLVER_VENDA_SUBSTITUTA_INVALIDA';
    END IF;
  END IF;

  -- Calcular total dos itens devolvidos
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens)
  LOOP
    v_item_venda_id := (v_item->>'item_venda_id')::uuid;
    v_qtd := (v_item->>'quantidade')::numeric(10, 3);

    IF v_item_venda_id IS NULL OR v_qtd IS NULL OR v_qtd <= 0 THEN
      RAISE EXCEPTION 'DEVOLVER_VENDA_ITEM_INVALIDO';
    END IF;

    SELECT iv.produto_id, iv.quantidade, iv.preco_unitario
    INTO v_produto_id, v_qtd_vendida, v_preco_unit
    FROM public.itens_venda iv
    WHERE iv.id = v_item_venda_id AND iv.venda_id = p_venda_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'DEVOLVER_VENDA_ITEM_NAO_PERTENCE'; END IF;

    v_qtd_ja_devolvida := public.quantidade_devolvida_item_venda(v_item_venda_id);
    IF v_qtd_ja_devolvida + v_qtd > v_qtd_vendida + 0.0005 THEN
      RAISE EXCEPTION 'DEVOLVER_VENDA_QTD_EXCEDE_VENDIDA';
    END IF;

    v_subtotal := public.round_abnt(v_preco_unit * v_qtd, 2);
    v_total_itens := v_total_itens + v_subtotal;
  END LOOP;

  v_total_itens := public.round_abnt(v_total_itens, 2);
  v_valor_estorno := public.round_abnt(COALESCE(p_valor_estorno, v_total_itens), 2);

  IF ABS(v_valor_estorno - v_total_itens) > 0.02 THEN
    RAISE EXCEPTION 'DEVOLVER_VENDA_VALOR_DIVERGENTE';
  END IF;

  IF v_valor_estorno <= 0 THEN RAISE EXCEPTION 'DEVOLVER_VENDA_VALOR_ZERO'; END IF;

  -- Estorno contas_receber
  IF v_forma = 'CREDITO_CLIENTE' THEN
    SELECT cr.* INTO v_cr
    FROM public.contas_receber cr
    WHERE cr.venda_id = p_venda_id AND cr.status IN ('ABERTO', 'PARCIAL')
    FOR UPDATE;

    IF NOT FOUND THEN RAISE EXCEPTION 'DEVOLVER_VENDA_SEM_CONTA_RECEBER'; END IF;
    IF v_cr.valor_aberto < v_valor_estorno - 0.01 THEN
      RAISE EXCEPTION 'DEVOLVER_VENDA_VALOR_EXCEDE_ABERTO';
    END IF;
    v_contas_receber_id := v_cr.id;
  END IF;

  v_operacao_id := gen_random_uuid();

  INSERT INTO public.venda_pos_venda_operacoes (
    id, idempotency_key, venda_id, tipo, motivo,
    valor_estornado, valor_caixa_estornado, forma_estorno,
    operador_id, caixa_id, venda_substituta_id, contas_receber_id,
    gerente_autorizador_id, autorizado_via
  ) VALUES (
    v_operacao_id, v_key, p_venda_id, v_tipo, v_motivo,
    v_valor_estorno, 0, v_forma,
    v_uid, v_caixa.id, p_venda_substituta_id,
    v_contas_receber_id,
    v_gerente_autorizador_id, v_autorizado_via
  );

  -- Processar itens: estoque + linhas de operação
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens)
  LOOP
    v_item_venda_id := (v_item->>'item_venda_id')::uuid;
    v_qtd := (v_item->>'quantidade')::numeric(10, 3);

    SELECT iv.produto_id, iv.preco_unitario
    INTO v_produto_id, v_preco_unit
    FROM public.itens_venda iv
    WHERE iv.id = v_item_venda_id AND iv.venda_id = p_venda_id;

    v_subtotal := public.round_abnt(v_preco_unit * v_qtd, 2);

    PERFORM 1 FROM public.estoque e
    WHERE e.produto_id = v_produto_id AND e.loja_id = v_caixa.loja_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'DEVOLVER_VENDA_ESTOQUE_NAO_ENCONTRADO'; END IF;

    UPDATE public.estoque e
    SET quantidade_atual = e.quantidade_atual + v_qtd,
      version = e.version + 1,
      updated_at = now()
    WHERE e.produto_id = v_produto_id AND e.loja_id = v_caixa.loja_id;

    INSERT INTO public.estoque_reposicoes_devolucao (operacao_id, produto_id, quantidade)
    VALUES (v_operacao_id, v_produto_id, v_qtd);

    INSERT INTO public.venda_pos_venda_itens (
      operacao_id, item_venda_id, produto_id, quantidade, preco_unitario, subtotal
    ) VALUES (
      v_operacao_id, v_item_venda_id, v_produto_id, v_qtd, v_preco_unit, v_subtotal
    );

    v_event_items := v_event_items || jsonb_build_array(
      jsonb_build_object(
        'item_venda_id', v_item_venda_id,
        'produto_id', v_produto_id,
        'quantidade', v_qtd,
        'preco_unitario', v_preco_unit,
        'subtotal', v_subtotal
      )
    );
  END LOOP;

  -- Financeiro: devolucoes + caixa / contas_receber
  IF v_forma = 'CREDITO_CLIENTE' THEN
    UPDATE public.contas_receber cr
    SET valor_aberto = public.round_abnt(cr.valor_aberto - v_valor_estorno, 2),
      status = CASE
        WHEN public.round_abnt(cr.valor_aberto - v_valor_estorno, 2) <= 0.009 THEN 'QUITADO'
        ELSE 'PARCIAL'
      END
    WHERE cr.id = v_cr.id;

    INSERT INTO public.devolucoes (venda_id, valor, forma_pagamento, motivo, operador_id, operacao_id)
    VALUES (p_venda_id, v_valor_estorno, 'PIX', v_motivo, v_uid, v_operacao_id);
  ELSIF v_forma = 'DINHEIRO' THEN
    v_valor_caixa := v_valor_estorno;
    IF v_caixa.status = 'ABERTO' AND v_valor_caixa > 0 THEN
      UPDATE public.caixas c
      SET saldo_atual = public.round_abnt(c.saldo_atual - v_valor_caixa, 2)
      WHERE c.id = v_caixa.id AND (c.saldo_atual - v_valor_caixa) >= 0;
      IF NOT FOUND THEN RAISE EXCEPTION 'DEVOLVER_VENDA_SALDO_CAIXA_INSUFICIENTE'; END IF;
    ELSE
      v_valor_caixa := 0;
    END IF;

    INSERT INTO public.devolucoes (venda_id, valor, forma_pagamento, motivo, operador_id, operacao_id)
    VALUES (p_venda_id, v_valor_estorno, 'DINHEIRO', v_motivo, v_uid, v_operacao_id);
  ELSE
    INSERT INTO public.devolucoes (venda_id, valor, forma_pagamento, motivo, operador_id, operacao_id)
    VALUES (p_venda_id, v_valor_estorno, v_forma, v_motivo, v_uid, v_operacao_id);
  END IF;

  UPDATE public.venda_pos_venda_operacoes
  SET valor_caixa_estornado = v_valor_caixa
  WHERE id = v_operacao_id;

  INSERT INTO public.venda_eventos (
    event_type, sale_id, caixa_id, operador_id, loja_id,
    items, total, total_bruto, forma_pagamento, source, idempotency_key
  ) VALUES (
    'SALE_PARTIAL_RETURN', p_venda_id, v_caixa.id, v_uid, v_caixa.loja_id,
    v_event_items, v_valor_estorno, v_valor_estorno, v_forma, c_source,
    c_source || ':partial_return:' || v_operacao_id::text
  ) ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN QUERY
  SELECT v_operacao_id, p_venda_id, v_tipo, v_valor_estorno, v_valor_caixa, 'CONCLUIDA'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.devolver_ou_trocar_venda(
  uuid, text, text, text, jsonb, numeric, text, uuid, uuid, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.devolver_ou_trocar_venda(
  uuid, text, text, text, jsonb, numeric, text, uuid, uuid, text
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.devolver_ou_trocar_venda(
  uuid, text, text, text, jsonb, numeric, text, uuid, uuid, text
) TO service_role;

COMMENT ON FUNCTION public.devolver_ou_trocar_venda IS
  'Devolução parcial ou troca pós-venda: estoque, devolucoes, caixa/contas_receber, kardex e ledger. Idempotente. Autorização via autorizar_operacao_privilegiada (perfil próprio ou token pontual de gerente).';
