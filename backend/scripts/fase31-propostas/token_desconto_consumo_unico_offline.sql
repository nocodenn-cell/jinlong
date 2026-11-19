-- PROPOSTA FASE 3.1 — consumo único do token de desconto em venda offline.
--
-- NÃO É MIGRATION. Não copiar para backend/supabase/migrations sem decisão: qualquer arquivo ali entra no PR
-- e é publicado automaticamente em produção ao mergear. Testado em transação (ver
-- backend/scripts/fase31-token-consumo-unico.test.sql).
--
-- Regra: um token de desconto de gerente autoriza UMA venda. Repetição da MESMA venda (retry do sync-outbox)
-- é aceita sem efeito; outra venda com o mesmo token é recusada. Revogado, expirado, de outra loja ou inexistente
-- é recusado. Tudo na mesma transação do consumo.
--
-- Integração pendente (decisão de engenharia): chamar esta função dentro de registrar_venda_com_itens(_v2),
-- antes de gravar a venda e na mesma transação. Enquanto não integrada, o sync-outbox deve chamar a função
-- antes da RPC de venda e tratar a falha dela como recusa.

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

  -- Bloqueia a linha do token: duas sessões concorrentes não consomem o mesmo token.
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

  -- O trigger tg_token_gerente_consumo (20261028120100) confere emissor, aprovador e ator no UPDATE.
  UPDATE public.tokens_desconto_gerente SET usado = true WHERE token = p_token;
  INSERT INTO internal.tokens_desconto_consumo_venda (token, venda_id, loja_id)
  VALUES (p_token, p_venda, p_loja);
END $$;

REVOKE ALL ON FUNCTION internal.consumir_token_desconto_venda(text, uuid, uuid) FROM PUBLIC, anon, authenticated;
