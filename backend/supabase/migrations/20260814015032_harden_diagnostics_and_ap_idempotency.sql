-- P1-2: diagnósticos SECURITY DEFINER deixam de furar RLS para `authenticated`.
-- P1-3: a chave física da sangria de AP passa a carregar o escopo da conta.
--
-- ───────────────────────────────────────────────────────────────────────────
-- P1-2 — `verificar_consistencia_venda` e `relatorio_consistencia_vendas`
--
-- Ambas são SECURITY DEFINER com EXECUTE para `authenticated` e sem nenhuma
-- validação de ator, perfil ou loja (grants herdados da migration 244, de
-- 2026-06-21; o `CREATE OR REPLACE` da Fase 1B preservou a ACL).
--
-- Provado:
--   * GERENTE da loja B, que enxerga 0 linhas em `vendas` pela RLS, obteve
--     `total_liquido = 250,00` de uma venda da loja A via
--     `verificar_consistencia_venda(<uuid>)`;
--   * o mesmo ator obteve, via `relatorio_consistencia_vendas`, a contagem
--     agregada das 12 vendas da loja A — sem precisar de UUID algum.
--
-- Nenhuma das duas tem consumidor de produto: a busca em `pdv-importados/`,
-- `dev-tools/` e Edge Functions não retorna caller. São ferramentas de
-- diagnóstico administrativo. Correção mínima e reversível: revogar de
-- `authenticated` e manter apenas o papel técnico.
--
-- Se um consumidor de UI aparecer, a decisão correta NÃO é devolver o grant, e
-- sim validar `auth.uid()`, usuário ativo, perfil e loja dentro da função.
--
-- ───────────────────────────────────────────────────────────────────────────
-- P1-3 — colisão da chave da sangria de AP
--
-- `registrar_pagamento_contas_pagar` derivava `'ap:' || idempotency_key`,
-- perdendo o `conta_id`. A idempotência lógica do AP é `(conta_id, key)`, mas a
-- do movimento físico é `(caixa_id, idempotency_key)` — escopos não equivalentes.
--
-- Provado: duas contas a pagar distintas, ambas com saldo próprio, mesma chave
-- legítima `FECHAMENTO-2026-08-14` e mesmo caixa. O primeiro pagamento passou;
-- o segundo abortou com PAGAMENTO_SANGRIA_CORRELACAO_EXISTENTE. É rejeição de
-- operação legítima (falha fechada), nunca dupla saída de caixa — o UNIQUE de
-- `movimentacao_caixa_id` da Fase 1A já impedia a duplicação.
--
-- Correção: incluir o escopo estável da conta na chave física.
--
-- Compatibilidade com registros existentes: o caminho de replay do AP retorna
-- por `(conta_id, idempotency_key)` em `contas_pagar_pagamentos` ANTES de tocar
-- em movimentações, então pagamentos antigos continuam respondendo replay sem
-- consultar a chave física. A nova derivação vale apenas para pagamentos novos
-- e nenhum backfill é necessário.
--
-- ROLLBACK: restaurar os grants da migration 244 e o corpo de
-- 20260814000154_ap_payments_reconciliation.sql.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- P1-2
-- ═══════════════════════════════════════════════════════════════════════════

-- Os alvos são guardados por `to_regprocedure` porque
-- `relatorio_consistencia_vendas(uuid, timestamptz, timestamptz)` NÃO EXISTE
-- em produção, e `REVOKE EXECUTE ON FUNCTION` não aceita `IF EXISTS`: sem o
-- guard, o REVOKE dessa sobrecarga aborta a migration inteira e o bloco P1-3
-- abaixo (fix da chave de idempotência de AP) nunca chega a rodar.
--
-- A ausência da sobrecarga em produção é drift catalogado em
-- `docs/AUDITORIA_CATALOGO_PROD_VS_REPO_2026-08.md` §3.3 — ela é criada por
-- migrations que estão no ledger de produção e não é removida por nenhuma.
-- O guard não mascara o drift; impede que ele bloqueie esta correção.
DO $$
DECLARE
  alvo   text;
  alvos  text[] := ARRAY[
    'public.verificar_consistencia_venda(uuid)',
    'public.relatorio_consistencia_vendas(uuid, timestamptz, timestamptz)'
  ];
BEGIN
  FOREACH alvo IN ARRAY alvos LOOP
    IF to_regprocedure(alvo) IS NULL THEN
      RAISE NOTICE 'alvo ausente neste banco, ignorado: %', alvo;
      CONTINUE;
    END IF;
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', alvo);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', alvo);
  END LOOP;

  IF to_regprocedure('public.verificar_consistencia_venda(uuid)') IS NOT NULL THEN
    COMMENT ON FUNCTION public.verificar_consistencia_venda(uuid) IS
      'Diagnostico administrativo (service_role): cabecalho x itens e pagamentos + saldo a receber. '
      'Sem guarda interna de loja — por isso NAO e exposta a authenticated.';
  END IF;
END
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- P1-3
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.registrar_pagamento_contas_pagar(
  p_conta_id uuid,
  p_valor numeric,
  p_forma text,
  p_data timestamptz DEFAULT now(),
  p_observacao text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_caixa_id uuid DEFAULT NULL,
  p_origem text DEFAULT 'UI_FINANCEIRO',
  p_autorizacao_token text DEFAULT NULL
)
RETURNS TABLE(
  pagamento_id uuid,
  conta_id uuid,
  valor numeric,
  valor_pago numeric,
  status text,
  caixa_id uuid,
  movimentacao_caixa_id uuid,
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
  v_conta public.contas_pagar%ROWTYPE;
  v_pagamento public.contas_pagar_pagamentos%ROWTYPE;
  v_forma text := upper(btrim(COALESCE(p_forma, '')));
  v_key text := btrim(COALESCE(p_idempotency_key, ''));
  v_origem text := btrim(COALESCE(p_origem, ''));
  v_observacao text := NULLIF(btrim(COALESCE(p_observacao, '')), '');
  v_caixa_id uuid := p_caixa_id;
  v_caixas_elegiveis integer;
  v_mov record;
  v_mov_key text;
  v_novo_pago numeric;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'PAGAMENTO_AUTH'; END IF;

  SELECT u.loja_id INTO v_loja_usuario
  FROM public.usuarios u
  WHERE u.id = v_uid AND u.ativo = true
    AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN');
  IF NOT FOUND THEN RAISE EXCEPTION 'PAGAMENTO_PERFIL'; END IF;

  IF p_valor IS NULL OR p_valor <= 0 OR p_valor <> public.round_abnt(p_valor, 2) THEN
    RAISE EXCEPTION 'PAGAMENTO_VALOR_INVALIDO';
  END IF;
  IF v_key = '' THEN RAISE EXCEPTION 'PAGAMENTO_IDEMPOTENCY_KEY'; END IF;
  IF v_origem = '' THEN RAISE EXCEPTION 'PAGAMENTO_ORIGEM'; END IF;
  IF v_forma NOT IN ('DINHEIRO', 'PIX', 'CARTAO', 'BOLETO', 'TRANSF') THEN
    RAISE EXCEPTION 'PAGAMENTO_FORMA_INVALIDA';
  END IF;

  SELECT * INTO v_conta FROM public.contas_pagar cp
  WHERE cp.id = p_conta_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAGAMENTO_CONTA_NAO_ENCONTRADA'; END IF;

  -- Phase 2B explicitly rejects every cross-store payment, including elevated profiles.
  IF v_conta.loja_id IS DISTINCT FROM v_loja_usuario THEN
    RAISE EXCEPTION 'PAGAMENTO_LOJA';
  END IF;

  SELECT cpp.* INTO v_pagamento
  FROM public.contas_pagar_pagamentos cpp
  WHERE cpp.conta_id = p_conta_id AND cpp.idempotency_key = v_key;

  IF FOUND THEN
    IF v_pagamento.valor <> p_valor
       OR v_pagamento.forma_pagamento <> v_forma
       OR v_pagamento.data_pagamento IS DISTINCT FROM COALESCE(p_data, v_pagamento.data_pagamento)
       OR v_pagamento.observacao IS DISTINCT FROM v_observacao
       OR v_pagamento.origem <> v_origem
       OR (p_caixa_id IS NOT NULL AND v_pagamento.caixa_id IS DISTINCT FROM p_caixa_id) THEN
      RAISE EXCEPTION 'PAGAMENTO_IDEMPOTENCY_PAYLOAD_DIVERGENTE';
    END IF;
    RETURN QUERY SELECT v_pagamento.id, v_pagamento.conta_id, v_pagamento.valor,
      v_conta.valor_pago, v_conta.status, v_pagamento.caixa_id,
      v_pagamento.movimentacao_caixa_id, true;
    RETURN;
  END IF;

  IF v_conta.status IN ('PAGO', 'CANCELADO') THEN RAISE EXCEPTION 'PAGAMENTO_CONTA_ENCERRADA'; END IF;
  IF p_valor > public.round_abnt(v_conta.valor_total - v_conta.valor_pago, 2) THEN
    RAISE EXCEPTION 'PAGAMENTO_EXCEDE_SALDO';
  END IF;

  IF v_forma = 'DINHEIRO' THEN
    IF v_caixa_id IS NULL THEN
      SELECT count(*), min(c.id::text)::uuid INTO v_caixas_elegiveis, v_caixa_id
      FROM public.caixas c
      WHERE c.loja_id = v_conta.loja_id AND c.status = 'ABERTO';
      IF v_caixas_elegiveis = 0 THEN RAISE EXCEPTION 'PAGAMENTO_CAIXA_ABERTO_OBRIGATORIO'; END IF;
      IF v_caixas_elegiveis > 1 THEN RAISE EXCEPTION 'PAGAMENTO_CAIXA_SELECAO_OBRIGATORIA'; END IF;
    END IF;

    PERFORM 1 FROM public.caixas c
    WHERE c.id = v_caixa_id AND c.loja_id = v_conta.loja_id AND c.status = 'ABERTO'
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PAGAMENTO_CAIXA_INVALIDO'; END IF;
  ELSIF v_caixa_id IS NOT NULL THEN
    RAISE EXCEPTION 'PAGAMENTO_CAIXA_APENAS_DINHEIRO';
  END IF;

  INSERT INTO public.contas_pagar_pagamentos(
    conta_id, valor, forma_pagamento, data_pagamento, observacao, usuario_id,
    idempotency_key, origem, loja_id, caixa_id, operacao_tipo
  ) VALUES (
    p_conta_id, p_valor, v_forma, COALESCE(p_data, now()), v_observacao, v_uid,
    v_key, v_origem, v_conta.loja_id, v_caixa_id, 'PAGAMENTO'
  ) RETURNING * INTO v_pagamento;

  IF v_forma = 'DINHEIRO' THEN
    -- P1-3: a chave física carrega o mesmo escopo da chave lógica do AP
    -- (`conta_id`, `idempotency_key`). Sem isso, duas contas distintas com a
    -- mesma chave legítima no mesmo caixa colidiam e a segunda era recusada.
    v_mov_key := 'ap:' || p_conta_id::text || ':' || v_key;
    IF EXISTS (
      SELECT 1 FROM public.movimentacoes_caixa m
      WHERE m.caixa_id = v_caixa_id AND m.idempotency_key = v_mov_key
    ) THEN
      RAISE EXCEPTION 'PAGAMENTO_SANGRIA_CORRELACAO_EXISTENTE';
    END IF;
    SELECT * INTO v_mov FROM public.registrar_movimentacao(
      v_caixa_id, 'sangria', 'dinheiro', p_valor,
      'Pagamento AP ' || p_conta_id::text, 'PAGAMENTO_AP', NULL, NULL,
      v_mov_key, NULL, NULL, NULL, NULL, v_uid, NULL
    );

    IF v_mov.status_movimentacao = 'pendente' THEN
      IF NULLIF(btrim(COALESCE(p_autorizacao_token, '')), '') IS NULL THEN
        RAISE EXCEPTION 'PAGAMENTO_SANGRIA_AUTORIZACAO_OBRIGATORIA';
      END IF;
      PERFORM 1
      FROM public.tokens_desconto_gerente t
      JOIN public.usuarios aprovador ON aprovador.id = t.criado_por
      WHERE t.token = btrim(p_autorizacao_token)
        AND t.usado = false
        AND t.expira_em > now()
        AND t.loja_id = v_conta.loja_id::text
        AND aprovador.ativo = true
        AND aprovador.loja_id = v_conta.loja_id
        AND aprovador.perfil IN ('GERENTE', 'DONO', 'ADMIN')
      FOR UPDATE OF t;
      IF NOT FOUND THEN RAISE EXCEPTION 'PAGAMENTO_SANGRIA_AUTORIZACAO_INVALIDA'; END IF;
      SELECT * INTO v_mov FROM public.aprovar_movimentacao(
        v_mov.movimentacao_id, NULL, NULL, NULL, NULL, NULL, p_autorizacao_token
      );
    END IF;
    IF v_mov.status_movimentacao <> 'aprovado' THEN
      RAISE EXCEPTION 'PAGAMENTO_SANGRIA_NAO_APROVADA';
    END IF;

    UPDATE public.contas_pagar_pagamentos cpp
    SET movimentacao_caixa_id = v_mov.movimentacao_id
    WHERE cpp.id = v_pagamento.id
    RETURNING * INTO v_pagamento;
  END IF;

  v_novo_pago := public.round_abnt(v_conta.valor_pago + p_valor, 2);
  UPDATE public.contas_pagar cp
  SET valor_pago = v_novo_pago,
      status = CASE WHEN v_novo_pago = cp.valor_total THEN 'PAGO' ELSE 'PARCIAL' END
  WHERE cp.id = p_conta_id;

  RETURN QUERY SELECT v_pagamento.id, v_pagamento.conta_id, v_pagamento.valor,
    v_novo_pago, CASE WHEN v_novo_pago = v_conta.valor_total THEN 'PAGO' ELSE 'PARCIAL' END,
    v_pagamento.caixa_id, v_pagamento.movimentacao_caixa_id, false;
END;
$function$;

COMMIT;
