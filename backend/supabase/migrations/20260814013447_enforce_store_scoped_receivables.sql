-- P0-4: AR deixa de aceitar liquidação cross-loja de ADMIN.
--
-- Problema comprovado: `registrar_liquidacao_receber` trazia a exceção
--
--     IF v_perfil <> 'ADMIN' AND v_loja_titulo <> v_loja_usuario THEN ...
--
-- Executado: um ADMIN lotado na Filial liquidou R$30,00 de um título da Matriz
-- e creditou o caixa da Matriz. GERENTE e DONO no mesmo cenário eram rejeitados
-- com LIQUIDACAO_LOJA_DIVERGENTE — só o ADMIN passava.
--
-- Três evidências de que ADMIN global não é a política pretendida:
--   1. `docs/AUTHORIZATION_MATRIX.md`: "GERENTE e ADMIN podem operar dados
--      gerenciais apenas na loja";
--   2. a Fase 2B (`registrar_pagamento_contas_pagar`) já rejeita todo pagamento
--      cross-loja, "including elevated profiles";
--   3. `calcular_valor_sistema_dinheiro_caixa` NEGA a leitura do caixa para esse
--      mesmo ADMIN — o sistema escrevia num caixa que ele considera inacessível
--      para aquele ator.
--
-- Correção mínima: aplicar a mesma-loja a todos os atores, com a forma idêntica
-- à do AP (`IS DISTINCT FROM`), tornando 2A e 2B estruturalmente iguais.
-- `v_perfil` deixa de ser necessária: o filtro de perfil já acontece no SELECT
-- de autorização. RBAC não é redesenhado.
--
-- ROLLBACK: restaurar o corpo de 20260813234233_ar_receipts_reconciliation.sql.

BEGIN;

CREATE OR REPLACE FUNCTION public.registrar_liquidacao_receber(
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

  SELECT u.loja_id
  INTO v_loja_usuario
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

  -- P0-4: nenhum perfil liquida título de outra loja. Mesma regra do AP.
  IF v_loja_titulo IS DISTINCT FROM v_loja_usuario THEN
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
) IS 'SSOT AR: fato realizado + saldo do titulo + contador fisico somente para DINHEIRO, atomicos, idempotentes e restritos a loja do ator.';

COMMIT;
