-- Backport Fase 1 (Git-only) from supabase_migrations.schema_migrations.statements
-- version: 20260806002925
-- name: 299_tb07_pagamento_contas_pagar_limite_saldo
-- source: production read-only export (schema_migrations)
-- Applied in production: yes (do NOT re-run on production).

-- ============================================================================
-- 299 — Pacote 5: fecha TB-07 (registrar_pagamento_contas_pagar aceita
-- pagamento acima do saldo devedor).
--
-- Problema: `registrar_pagamento_contas_pagar` e `registrar_liquidacao_receber`
-- são simétricas em auth/perfil/loja/valor/forma — mas só a segunda tem a
-- guarda de excesso (`LIQUIDACAO_EXCEDE_ABERTO`). A primeira soma
-- `v_novo_pago := v_conta.valor_pago + p_valor` sem checar se ultrapassa
-- `valor_total`. Nem a CHECK do banco impede: `contas_pagar` tem
-- `valor_total > 0` e `valor_pago >= 0`, mas nada como `valor_pago <=
-- valor_total`. Achado original: TB-07 (docs/auditoria/v3/03_financeiro.md).
--
-- Verificado em produção antes de escrever (pg_get_functiondef, não o
-- histórico de migrations): corpo atual confirma exatamente o defeito
-- descrito — assinatura de 5 args, sem alteração de assinatura nesta
-- correção (CREATE OR REPLACE é seguro aqui, sem a armadilha de overload da
-- migration 298 — mesmo número e tipos de parâmetros).
--
-- Correção: guarda simétrica à de `registrar_liquidacao_receber` + CHECK na
-- tabela como rede de segurança (defesa em profundidade — mesmo padrão do
-- 297 para configuracoes_gerais.chave).
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. CHECK na tabela — rede de segurança, vale para qualquer escritor.
--    Tabela vazia em produção (0 linhas) — sem necessidade de NOT VALID.
-- ============================================================================

ALTER TABLE public.contas_pagar
  ADD CONSTRAINT chk_contas_pagar_valor_pago_nao_excede_total
  CHECK (valor_pago <= valor_total);

COMMENT ON CONSTRAINT chk_contas_pagar_valor_pago_nao_excede_total ON public.contas_pagar IS
  'TB-07 (2026-08-05). Rede de segurança — a guarda principal fica em registrar_pagamento_contas_pagar.';

-- ============================================================================
-- 2. registrar_pagamento_contas_pagar — guarda simétrica à de
--    registrar_liquidacao_receber, mesma assinatura (sem overload novo).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.registrar_pagamento_contas_pagar(
  p_conta_id uuid,
  p_valor numeric,
  p_forma text,
  p_data timestamp with time zone DEFAULT now(),
  p_observacao text DEFAULT NULL::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid         uuid := auth.uid();
  v_perfil      text;
  v_loja_usuario uuid;
  v_conta       record;
  v_novo_pago   numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'PAGAMENTO_AUTH';
  END IF;

  SELECT u.perfil, u.loja_id INTO v_perfil, v_loja_usuario
    FROM public.usuarios u WHERE u.id = v_uid;

  IF v_perfil IS NULL OR v_perfil NOT IN ('GERENTE','DONO','ADMIN') THEN
    RAISE EXCEPTION 'PAGAMENTO_PERFIL';
  END IF;

  SELECT id, loja_id, valor_total, valor_pago, status
    INTO v_conta
    FROM public.contas_pagar
   WHERE id = p_conta_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PAGAMENTO_CONTA_NAO_ENCONTRADA';
  END IF;

  IF v_perfil = 'GERENTE' AND v_loja_usuario IS DISTINCT FROM v_conta.loja_id THEN
    RAISE EXCEPTION 'PAGAMENTO_LOJA';
  END IF;

  IF v_conta.status IN ('PAGO','CANCELADO') THEN
    RAISE EXCEPTION 'PAGAMENTO_CONTA_ENCERRADA';
  END IF;

  IF p_valor IS NULL OR p_valor <= 0 THEN
    RAISE EXCEPTION 'PAGAMENTO_VALOR_INVALIDO';
  END IF;

  -- TB-07: simétrico a registrar_liquidacao_receber (LIQUIDACAO_EXCEDE_ABERTO).
  IF p_valor > (v_conta.valor_total - v_conta.valor_pago) THEN
    RAISE EXCEPTION 'PAGAMENTO_EXCEDE_SALDO';
  END IF;

  IF p_forma IS NULL OR p_forma NOT IN ('DINHEIRO','PIX','CARTAO','BOLETO','TRANSF') THEN
    RAISE EXCEPTION 'PAGAMENTO_FORMA_INVALIDA';
  END IF;

  INSERT INTO public.contas_pagar_pagamentos (
    conta_id, valor, forma_pagamento, data_pagamento, observacao, usuario_id
  ) VALUES (
    p_conta_id, p_valor, p_forma, COALESCE(p_data, now()), p_observacao, v_uid
  );

  v_novo_pago := v_conta.valor_pago + p_valor;

  UPDATE public.contas_pagar
     SET valor_pago = v_novo_pago,
         status = CASE
                    WHEN v_novo_pago >= valor_total THEN 'PAGO'
                    ELSE 'PARCIAL'
                  END
   WHERE id = p_conta_id;
END;
$function$;

COMMENT ON FUNCTION public.registrar_pagamento_contas_pagar IS
  'TB-07 (2026-08-05). Recusa pagamento que exceda o saldo devedor (PAGAMENTO_EXCEDE_SALDO) — simétrico a registrar_liquidacao_receber.';

-- ============================================================================
-- VERIFICAÇÃO DE EFEITO
-- ============================================================================

DO $verify$
DECLARE
  v_def text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_contas_pagar_valor_pago_nao_excede_total'
  ) THEN
    RAISE EXCEPTION 'MIG299_CHECK_AUSENTE';
  END IF;

  v_def := pg_get_functiondef('public.registrar_pagamento_contas_pagar(uuid, numeric, text, timestamptz, text)'::regprocedure);
  IF position('PAGAMENTO_EXCEDE_SALDO' IN v_def) = 0 THEN
    RAISE EXCEPTION 'MIG299_GUARDA_AUSENTE';
  END IF;

  RAISE NOTICE '299 OK — TB-07 verificado no efeito (CHECK + guarda na RPC)';
END
$verify$;

COMMIT;
