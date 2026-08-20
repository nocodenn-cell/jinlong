-- Phase 2A: AR receipts become an atomic, idempotent realized-finance fact.
-- Cash receipts affect the physical drawer counter and expected-cash formula;
-- non-cash receipts never touch the drawer. No historical repair is performed.

BEGIN;

DROP FUNCTION IF EXISTS public.registrar_liquidacao_receber(uuid, numeric, text, text);
DROP FUNCTION IF EXISTS public.registrar_liquidacao_receber(uuid, numeric, text, text, text, uuid, text);

CREATE FUNCTION public.registrar_liquidacao_receber(
  p_titulo_id uuid,
  p_valor numeric,
  p_forma_pagamento text,
  p_observacao text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_caixa_id uuid DEFAULT NULL,
  p_origem text DEFAULT 'UI_FINANCEIRO'
)
RETURNS TABLE(
  liquidacao_id uuid,
  titulo_id uuid,
  valor numeric,
  valor_aberto numeric,
  status text,
  caixa_id uuid,
  idempotent_replay boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_uid uuid := auth.uid();
  v_perfil text;
  v_loja_usuario uuid;
  v_loja_titulo uuid;
  v_aberto numeric;
  v_status text;
  v_forma text := upper(btrim(COALESCE(p_forma_pagamento, '')));
  v_key text := btrim(COALESCE(p_idempotency_key, ''));
  v_origem text := btrim(COALESCE(p_origem, ''));
  v_observacao text := NULLIF(btrim(COALESCE(p_observacao, '')), '');
  v_caixa_id uuid := p_caixa_id;
  v_caixas_elegiveis integer;
  v_liquidacao public.liquidacoes_receber%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'LIQUIDACAO_AUTH'; END IF;

  SELECT u.perfil, u.loja_id
  INTO v_perfil, v_loja_usuario
  FROM public.usuarios u
  WHERE u.id = v_uid
    AND u.ativo = true
    AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN');
  IF NOT FOUND THEN RAISE EXCEPTION 'LIQUIDACAO_PERFIL'; END IF;

  IF p_valor IS NULL OR p_valor <= 0
     OR p_valor <> public.round_abnt(p_valor, 2) THEN
    RAISE EXCEPTION 'LIQUIDACAO_VALOR';
  END IF;
  IF v_key = '' THEN RAISE EXCEPTION 'LIQUIDACAO_IDEMPOTENCY_KEY'; END IF;
  IF v_origem = '' THEN RAISE EXCEPTION 'LIQUIDACAO_ORIGEM'; END IF;
  IF v_forma NOT IN ('DINHEIRO', 'PIX', 'CARTAO_DEBITO', 'CARTAO_CREDITO', 'OUTROS') THEN
    RAISE EXCEPTION 'LIQUIDACAO_FORMA_PAGAMENTO';
  END IF;

  SELECT cr.valor_aberto, cr.loja_id, cr.status
  INTO v_aberto, v_loja_titulo, v_status
  FROM public.contas_receber cr
  WHERE cr.id = p_titulo_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'LIQUIDACAO_TITULO'; END IF;

  IF v_perfil <> 'ADMIN' AND v_loja_titulo <> v_loja_usuario THEN
    RAISE EXCEPTION 'LIQUIDACAO_LOJA_DIVERGENTE';
  END IF;

  SELECT lr.* INTO v_liquidacao
  FROM public.liquidacoes_receber lr
  WHERE lr.titulo_id = p_titulo_id AND lr.idempotency_key = v_key;

  IF FOUND THEN
    IF v_liquidacao.valor <> p_valor
       OR v_liquidacao.forma_pagamento <> v_forma
       OR v_liquidacao.origem <> v_origem
       OR v_liquidacao.observacao IS DISTINCT FROM v_observacao
       OR (p_caixa_id IS NOT NULL AND v_liquidacao.caixa_id IS DISTINCT FROM p_caixa_id) THEN
      RAISE EXCEPTION 'LIQUIDACAO_IDEMPOTENCY_PAYLOAD_DIVERGENTE';
    END IF;

    RETURN QUERY SELECT
      v_liquidacao.id, v_liquidacao.titulo_id, v_liquidacao.valor,
      v_aberto, v_status, v_liquidacao.caixa_id, true;
    RETURN;
  END IF;

  IF p_valor > v_aberto THEN RAISE EXCEPTION 'LIQUIDACAO_EXCEDE_ABERTO'; END IF;

  IF v_forma = 'DINHEIRO' THEN
    IF v_caixa_id IS NULL THEN
      SELECT count(*), min(c.id::text)::uuid
      INTO v_caixas_elegiveis, v_caixa_id
      FROM public.caixas c
      WHERE c.loja_id = v_loja_titulo AND c.status = 'ABERTO';

      IF v_caixas_elegiveis = 0 THEN RAISE EXCEPTION 'LIQUIDACAO_CAIXA_ABERTO_OBRIGATORIO'; END IF;
      IF v_caixas_elegiveis > 1 THEN RAISE EXCEPTION 'LIQUIDACAO_CAIXA_SELECAO_OBRIGATORIA'; END IF;
    END IF;

    PERFORM 1 FROM public.caixas c
    WHERE c.id = v_caixa_id
      AND c.loja_id = v_loja_titulo
      AND c.status = 'ABERTO'
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'LIQUIDACAO_CAIXA_INVALIDO'; END IF;
  ELSIF v_caixa_id IS NOT NULL THEN
    RAISE EXCEPTION 'LIQUIDACAO_CAIXA_APENAS_DINHEIRO';
  END IF;

  INSERT INTO public.liquidacoes_receber (
    titulo_id, valor, forma_pagamento, observacao, created_by,
    idempotency_key, origem, loja_id, caixa_id, operacao_tipo
  ) VALUES (
    p_titulo_id, p_valor, v_forma, v_observacao, v_uid,
    v_key, v_origem, v_loja_titulo, v_caixa_id, 'RECEBIMENTO'
  ) RETURNING * INTO v_liquidacao;

  v_aberto := public.round_abnt(v_aberto - p_valor, 2);
  v_status := CASE WHEN v_aberto = 0 THEN 'QUITADO' ELSE 'PARCIAL' END;

  UPDATE public.contas_receber cr
  SET valor_aberto = v_aberto, status = v_status
  WHERE cr.id = p_titulo_id;

  IF v_forma = 'DINHEIRO' THEN
    UPDATE public.caixas c
    SET saldo_atual = public.round_abnt(COALESCE(c.saldo_atual, 0) + p_valor, 2)
    WHERE c.id = v_caixa_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'LIQUIDACAO_CAIXA_ATUALIZACAO'; END IF;
  END IF;

  RETURN QUERY SELECT
    v_liquidacao.id, v_liquidacao.titulo_id, v_liquidacao.valor,
    v_aberto, v_status, v_liquidacao.caixa_id, false;
END;
$function$;

COMMENT ON FUNCTION public.registrar_liquidacao_receber(
  uuid, numeric, text, text, text, uuid, text
) IS 'SSOT AR: fato realizado + saldo do titulo + contador fisico somente para DINHEIRO, atomicos e idempotentes.';

REVOKE ALL ON FUNCTION public.registrar_liquidacao_receber(
  uuid, numeric, text, text, text, uuid, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_liquidacao_receber(
  uuid, numeric, text, text, text, uuid, text
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.calcular_valor_sistema_dinheiro_caixa(p_caixa_id uuid)
RETURNS numeric(10,2)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result numeric(10,2);
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.caixas c
      JOIN public.usuarios u ON u.id = auth.uid()
      WHERE c.id = p_caixa_id AND c.loja_id = u.loja_id
        AND (c.operador_id = auth.uid() OR u.perfil IN ('GERENTE', 'DONO', 'ADMIN'))
    ) THEN
      RAISE EXCEPTION 'Acesso negado ao caixa informado.' USING ERRCODE = '42501';
    END IF;
  END IF;

  WITH vendas_din_split AS (
    SELECT COALESCE(sum(vp.valor), 0)::numeric(10,2) AS t
    FROM public.vendas_pagamentos vp JOIN public.vendas v ON v.id = vp.venda_id
    WHERE v.caixa_id = p_caixa_id AND v.status = 'CONCLUIDA' AND vp.forma_pagamento = 'DINHEIRO'
  ), vendas_din_legado AS (
    SELECT COALESCE(sum(v.total_liquido), 0)::numeric(10,2) AS t
    FROM public.vendas v
    WHERE v.caixa_id = p_caixa_id AND v.forma_pagamento = 'DINHEIRO' AND v.status = 'CONCLUIDA'
      AND NOT EXISTS (SELECT 1 FROM public.vendas_pagamentos vp WHERE vp.venda_id = v.id)
  ), vendas_din AS (
    SELECT public.round_abnt((SELECT t FROM vendas_din_split) + (SELECT t FROM vendas_din_legado), 2) AS t
  ), ar_din AS (
    SELECT COALESCE(sum(CASE
      WHEN lr.operacao_tipo = 'ESTORNO' THEN -lr.valor
      ELSE lr.valor END), 0)::numeric(10,2) AS t
    FROM public.liquidacoes_receber lr
    WHERE lr.caixa_id = p_caixa_id AND lr.forma_pagamento = 'DINHEIRO'
      AND COALESCE(lr.operacao_tipo, 'RECEBIMENTO') IN ('RECEBIMENTO', 'ESTORNO')
  ), mov_legado AS (
    SELECT
      COALESCE(sum(CASE WHEN m.tipo = 'SUPRIMENTO' THEN m.valor ELSE 0 END), 0)::numeric(10,2) AS sup,
      COALESCE(sum(CASE WHEN m.tipo = 'SANGRIA' THEN m.valor ELSE 0 END), 0)::numeric(10,2) AS sang
    FROM public.movimentos_caixa m
    WHERE m.caixa_id = p_caixa_id AND m.tipo IN ('SUPRIMENTO', 'SANGRIA')
  ), mov_tx AS (
    SELECT COALESCE(sum(CASE
      WHEN m.tipo = 'suprimento' AND m.forma_pagamento = 'dinheiro' THEN m.valor
      WHEN m.tipo = 'sangria' THEN -m.valor
      WHEN m.tipo = 'estorno' AND orig.tipo = 'sangria' THEN m.valor
      WHEN m.tipo = 'estorno' AND orig.tipo = 'suprimento' AND orig.forma_pagamento = 'dinheiro' THEN -m.valor
      ELSE 0 END), 0)::numeric(10,2) AS t
    FROM public.movimentacoes_caixa m
    LEFT JOIN public.movimentacoes_caixa orig ON orig.id = m.movimentacao_origem_id
    WHERE m.caixa_id = p_caixa_id AND m.status = 'aprovado' AND m.deleted_at IS NULL
  ), dev_din AS (
    SELECT COALESCE(sum(d.valor), 0)::numeric(10,2) AS t
    FROM public.devolucoes d JOIN public.vendas v ON v.id = d.venda_id
    WHERE v.caixa_id = p_caixa_id AND v.status = 'CONCLUIDA' AND d.forma_pagamento = 'DINHEIRO'
  ), abertura AS (
    SELECT COALESCE(c.valor_inicial, 0)::numeric(10,2) AS t
    FROM public.caixas c WHERE c.id = p_caixa_id
  )
  SELECT public.round_abnt(
    COALESCE((SELECT t FROM abertura), 0)
    + (SELECT t FROM vendas_din)
    + (SELECT t FROM ar_din)
    + (SELECT sup FROM mov_legado) - (SELECT sang FROM mov_legado)
    + (SELECT t FROM mov_tx) - (SELECT t FROM dev_din), 2
  )::numeric(10,2) INTO v_result;

  RETURN v_result;
END;
$function$;

COMMENT ON FUNCTION public.calcular_valor_sistema_dinheiro_caixa(uuid) IS
  'E(c): abertura + vendas dinheiro + AR dinheiro + suprimentos - sangrias - devolucoes. AR nao usa movimentacoes_caixa.';

COMMIT;
