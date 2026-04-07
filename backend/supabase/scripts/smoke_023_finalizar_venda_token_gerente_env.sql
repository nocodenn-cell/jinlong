-- Smoke 023 (copy/paste por ambiente) — finalizar_venda_transacional com token de gerente
-- Objetivo: validar cenários token válido / expirado / já usado com execução rápida.
--
-- MODO SEGURO:
-- - DEV/STAGING: executar inteiro (já usa ROLLBACK ao final).
-- - PROD: NÃO executar os blocos de mutação. Em PROD, use apenas verify_p0_producao.sql + evidências de staging.
--
-- =========================
-- PARÂMETROS (edite aqui)
-- =========================
-- AMBIENTE: DEV | STAGING | PROD
-- Recomendado: DEV ou STAGING
--
-- IDs opcionais:
-- - CAIXA_ID_FIXO: deixe NULL para auto-detectar caixa ABERTO do auth.uid()
-- - PRODUTO_ID_FIXO: deixe NULL para auto-detectar produto com estoque >= 10
--
-- Prefixo para tokens de teste (evita colisão)
-- TOKEN_PREFIX: ex. smoke023-dev, smoke023-stg

BEGIN;

DO $$
DECLARE
  -- Ajuste aqui:
  p_ambiente text := 'DEV'; -- DEV | STAGING | PROD
  p_caixa_id_fixo uuid := NULL;
  p_produto_id_fixo uuid := NULL;
  p_token_prefix text := 'smoke023-dev';

  v_uid uuid := auth.uid();
  v_caixa_id uuid;
  v_produto_id uuid;
  v_venda_ok uuid := gen_random_uuid();
  v_venda_exp uuid := gen_random_uuid();
  v_venda_used uuid := gen_random_uuid();
  v_token_ok text;
  v_token_exp text;
  v_token_used text;
BEGIN
  IF upper(p_ambiente) = 'PROD' THEN
    RAISE EXCEPTION 'SMOKE_023_ABORTADO: este script é para DEV/STAGING. Em PROD use validação não-destrutiva.';
  END IF;

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'SMOKE_023: auth.uid() nulo. Execute com sessão autenticada.';
  END IF;

  v_token_ok := p_token_prefix || '-ok';
  v_token_exp := p_token_prefix || '-exp';
  v_token_used := p_token_prefix || '-used';

  IF p_caixa_id_fixo IS NOT NULL THEN
    v_caixa_id := p_caixa_id_fixo;
  ELSE
    SELECT id INTO v_caixa_id
    FROM public.caixas
    WHERE operador_id = v_uid
      AND status = 'ABERTO'
    ORDER BY created_at DESC
    LIMIT 1;
  END IF;

  IF v_caixa_id IS NULL THEN
    RAISE EXCEPTION 'SMOKE_023: nenhum caixa aberto encontrado para operador %', v_uid;
  END IF;

  IF p_produto_id_fixo IS NOT NULL THEN
    v_produto_id := p_produto_id_fixo;
  ELSE
    SELECT e.produto_id INTO v_produto_id
    FROM public.estoque e
    WHERE e.quantidade_atual >= 10
    LIMIT 1;
  END IF;

  IF v_produto_id IS NULL THEN
    RAISE EXCEPTION 'SMOKE_023: sem produto com estoque suficiente (>= 10).';
  END IF;

  DELETE FROM public.tokens_desconto_gerente
  WHERE token IN (v_token_ok, v_token_exp, v_token_used);

  INSERT INTO public.tokens_desconto_gerente (token, expira_em, usado, loja_id, criado_por)
  VALUES
    (v_token_ok, now() + interval '10 minutes', false, upper(p_ambiente), v_uid),
    (v_token_exp, now() - interval '1 minute', false, upper(p_ambiente), v_uid),
    (v_token_used, now() + interval '10 minutes', true, upper(p_ambiente), v_uid);

  -- 1) Token válido: deve concluir, consumir token e registrar desconto
  PERFORM public.finalizar_venda_transacional(
    v_venda_ok,
    v_caixa_id,
    'PIX',
    10.00,
    1.00,
    9.00,
    jsonb_build_array(
      jsonb_build_object(
        'item_id', gen_random_uuid(),
        'produto_id', v_produto_id,
        'quantidade', 1,
        'preco_original', 10.00,
        'preco_unitario', 10.00,
        'tipo_preco', 'VAREJO'
      )
    ),
    v_token_ok,
    10.0
  );

  IF NOT EXISTS (
    SELECT 1
    FROM public.tokens_desconto_gerente
    WHERE token = v_token_ok
      AND usado = true
  ) THEN
    RAISE EXCEPTION 'SMOKE_023: token válido não foi consumido.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.descontos_venda
    WHERE venda_id = v_venda_ok
  ) THEN
    RAISE EXCEPTION 'SMOKE_023: desconto_venda não foi registrado no cenário válido.';
  END IF;

  -- 2) Token expirado: deve falhar
  BEGIN
    PERFORM public.finalizar_venda_transacional(
      v_venda_exp,
      v_caixa_id,
      'PIX',
      10.00,
      1.00,
      9.00,
      jsonb_build_array(
        jsonb_build_object(
          'item_id', gen_random_uuid(),
          'produto_id', v_produto_id,
          'quantidade', 1,
          'preco_original', 10.00,
          'preco_unitario', 10.00,
          'tipo_preco', 'VAREJO'
        )
      ),
      v_token_exp,
      10.0
    );
    RAISE EXCEPTION 'SMOKE_023: cenário token expirado deveria falhar.';
  EXCEPTION WHEN OTHERS THEN
    IF POSITION('FINALIZAR_VENDA_TOKEN_GERENTE_INVALIDO' IN SQLERRM) = 0 THEN
      RAISE EXCEPTION 'SMOKE_023: erro inesperado no cenário expirado: %', SQLERRM;
    END IF;
  END;

  -- 3) Token já usado: deve falhar
  BEGIN
    PERFORM public.finalizar_venda_transacional(
      v_venda_used,
      v_caixa_id,
      'PIX',
      10.00,
      1.00,
      9.00,
      jsonb_build_array(
        jsonb_build_object(
          'item_id', gen_random_uuid(),
          'produto_id', v_produto_id,
          'quantidade', 1,
          'preco_original', 10.00,
          'preco_unitario', 10.00,
          'tipo_preco', 'VAREJO'
        )
      ),
      v_token_used,
      10.0
    );
    RAISE EXCEPTION 'SMOKE_023: cenário token usado deveria falhar.';
  EXCEPTION WHEN OTHERS THEN
    IF POSITION('FINALIZAR_VENDA_TOKEN_GERENTE_INVALIDO' IN SQLERRM) = 0
       AND POSITION('FINALIZAR_VENDA_TOKEN_GERENTE_JA_USADO' IN SQLERRM) = 0 THEN
      RAISE EXCEPTION 'SMOKE_023: erro inesperado no cenário usado: %', SQLERRM;
    END IF;
  END;

  RAISE NOTICE 'SMOKE_023_OK [%]: cenários válido/expirado/usado passaram.', upper(p_ambiente);
END $$;

ROLLBACK;
