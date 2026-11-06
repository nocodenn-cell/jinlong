-- FASE 3.1 — venda offline de dispositivo com token de desconto de gerente: consumo único do token e
-- gravação da venda na MESMA transação.
--
-- STATUS: PREPARADA, NÃO APLICADA. Não aplicar em produção/homologação sem decisão explícita do dono e
-- sem passar pelo gate de drift (ver docs/ops/DRIFT_MIGRATIONS_MATRIZ_2026-11-05.md).
--
-- Pré-requisitos (devem estar aplicados ANTES desta migration):
--   * 20261028120100_sec_tokens_usuario_inativo_revogacao — colunas revogado_em/revogado_motivo em
--     public.tokens_desconto_gerente e o trigger trg_token_gerente_consumo (confere emissor, aprovador e ator).
--   * 20261028100000 / 20261030100000 — regra de token de dispositivo e loja (já pendentes, mesma cadeia).
--
-- Origem: backend/scripts/fase31-propostas/token_desconto_consumo_unico_offline.sql e
-- backend/scripts/fase31-propostas/registrar_venda_offline_com_token.sql (testes em
-- backend/scripts/fase31-registrar-venda-token.test.sql e backend/scripts/fase31-token-consumo-unico.test.sql).
--
-- Por que existe: consumir o token numa RPC e gravar a venda em outra seriam duas transações. Falha na venda
-- deixaria o token queimado sem venda. Aqui as duas coisas estão numa única função PL/pgSQL: qualquer erro
-- desfaz o consumo junto (fail closed).
--
-- Caller único: backend/supabase/functions/sync-outbox/index.ts (registrado em scripts/rpc-gate-guard.mjs).
-- Esta função NÃO substitui registrar_venda_com_itens(_v2); ela a envolve e continua sendo a única gravação de venda.
--
-- Retry: mesma venda (mesmo venda_id) passa pelo consumo sem efeito e a RPC de venda é idempotente por venda_id.
-- Outra venda com o mesmo token é recusada com TOKEN_GERENTE_JA_USADO.

CREATE TABLE IF NOT EXISTS internal.tokens_desconto_consumo_venda (
  token        text        NOT NULL,
  venda_id     uuid        NOT NULL,
  loja_id      uuid        NOT NULL,
  consumido_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (token, venda_id)
);
REVOKE ALL ON internal.tokens_desconto_consumo_venda FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION internal.consumir_token_desconto_venda(p_token text, p_loja uuid, p_venda uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, internal, pg_temp
AS $$
DECLARE
  t public.tokens_desconto_gerente%ROWTYPE;
BEGIN
  IF p_token IS NULL OR p_loja IS NULL OR p_venda IS NULL THEN
    RAISE EXCEPTION 'TOKEN_GERENTE_PARAMETROS_OBRIGATORIOS';
  END IF;

  -- Bloqueia a linha do token: sessões concorrentes não consomem o mesmo token.
  SELECT * INTO t FROM public.tokens_desconto_gerente WHERE token = p_token FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'TOKEN_GERENTE_INEXISTENTE';
  END IF;
  IF t.revogado_em IS NOT NULL OR t.expira_em <= now() THEN
    RAISE EXCEPTION 'TOKEN_GERENTE_REVOGADO_OU_EXPIRADO';
  END IF;
  IF t.loja_id IS DISTINCT FROM p_loja::text THEN
    RAISE EXCEPTION 'TOKEN_GERENTE_OUTRA_LOJA';
  END IF;

  -- Retry da mesma venda: já consumido por ela, aceita sem efeito.
  IF EXISTS (SELECT 1 FROM internal.tokens_desconto_consumo_venda
              WHERE token = p_token AND venda_id = p_venda) THEN
    RETURN;
  END IF;

  IF t.usado THEN
    RAISE EXCEPTION 'TOKEN_GERENTE_JA_USADO';
  END IF;

  -- O trigger trg_token_gerente_consumo (20261028120100) confere emissor, aprovador e ator no UPDATE.
  UPDATE public.tokens_desconto_gerente SET usado = true WHERE token = p_token;
  INSERT INTO internal.tokens_desconto_consumo_venda (token, venda_id, loja_id)
  VALUES (p_token, p_venda, p_loja);
END $$;

REVOKE ALL ON FUNCTION internal.consumir_token_desconto_venda(text, uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.registrar_venda_offline_com_token(
  p_token                        text,
  p_loja                         uuid,
  p_v2                           boolean,
  p_venda_id                     uuid,
  p_caixa_id                     uuid,
  p_operador_id                  uuid,
  p_forma_pagamento              text,
  p_total_bruto                  numeric,
  p_total_desconto               numeric,
  p_total_liquido                numeric,
  p_itens                        jsonb,
  p_desconto_gerente_percentual  numeric,
  p_desconto_gerente_valor       numeric,
  p_gerente_id                   text,
  p_pagamentos                   jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, internal, pg_temp
AS $$
BEGIN
  -- 1) Consome o token para ESTA venda (ou aceita o retry da mesma venda).
  PERFORM internal.consumir_token_desconto_venda(p_token, p_loja, p_venda_id);

  -- 2) Grava a venda com todas as validações da RPC atual (totais, preços, desconto, pagamentos).
  IF p_v2 THEN
    PERFORM public.registrar_venda_com_itens_v2(
      p_venda_id, p_caixa_id, p_operador_id, p_forma_pagamento, p_total_bruto, p_total_desconto,
      p_total_liquido, p_itens, p_desconto_gerente_percentual, p_desconto_gerente_valor, p_gerente_id, p_pagamentos);
  ELSE
    PERFORM public.registrar_venda_com_itens(
      p_venda_id, p_caixa_id, p_operador_id, p_forma_pagamento, p_total_bruto, p_total_desconto,
      p_total_liquido, p_itens, p_desconto_gerente_percentual, p_desconto_gerente_valor, p_gerente_id, p_pagamentos);
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.registrar_venda_offline_com_token(text, uuid, boolean, uuid, uuid, uuid, text,
  numeric, numeric, numeric, jsonb, numeric, numeric, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_venda_offline_com_token(text, uuid, boolean, uuid, uuid, uuid, text,
  numeric, numeric, numeric, jsonb, numeric, numeric, text, jsonb) TO service_role;
