-- Extrato seguro da migration obsoleta 20261006120000 (quarentena):
-- apenas o rename financeiro_comando → financeiro_comando_v1 e o wrapper
-- que adiciona INATIVAR_CONTA / VINCULAR_FORMA_PAGAMENTO.
-- NÃO reintroduz financeiro_capturar_venda nem o patch de painel da 120000.
-- Necessário para alinhar schema local a database.types.ts após a quarentena.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'financeiro_comando_v1'
  ) AND EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'financeiro_comando'
  ) THEN
    ALTER FUNCTION public.financeiro_comando(text, jsonb, uuid)
      RENAME TO financeiro_comando_v1;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.financeiro_comando(
  p_tipo text,
  p_dados jsonb,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  l uuid;
  u uuid := auth.uid();
  cmd public.financeiro_comandos%ROWTYPE;
  c public.contas_financeiras%ROWTYPE;
  v_id uuid;
  resultado jsonb;
BEGIN
  IF p_tipo NOT IN ('INATIVAR_CONTA', 'VINCULAR_FORMA_PAGAMENTO') THEN
    RETURN public.financeiro_comando_v1(p_tipo, p_dados, p_request_id);
  END IF;
  IF p_request_id IS NULL OR p_dados IS NULL OR jsonb_typeof(p_dados) <> 'object' THEN
    RAISE EXCEPTION 'Comando financeiro inválido.';
  END IF;
  l := internal.financeiro_loja();
  PERFORM pg_advisory_xact_lock(hashtextextended(l::text, 0));
  SELECT * INTO cmd FROM public.financeiro_comandos WHERE id = p_request_id;
  IF FOUND THEN
    IF cmd.loja_id <> l OR cmd.usuario_id <> u OR cmd.tipo <> p_tipo OR cmd.dados <> p_dados THEN
      RAISE EXCEPTION 'Repetição com dados diferentes.';
    END IF;
    RETURN cmd.resultado;
  END IF;
  IF nullif(p_dados->>'conta_id', '') IS NOT NULL THEN
    SELECT * INTO c FROM public.contas_financeiras
    WHERE id = (p_dados->>'conta_id')::uuid AND loja_id = l AND ativo
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Conta financeira inválida para esta loja.';
    END IF;
  END IF;
  CASE p_tipo
  WHEN 'INATIVAR_CONTA' THEN
    IF c.id IS NULL THEN
      RAISE EXCEPTION 'Conta financeira inválida para esta loja.';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.formas_pagamento fp
      WHERE fp.conta_financeira_id = c.id AND fp.ativo
    ) THEN
      RAISE EXCEPTION 'Desvincule as formas de pagamento ativas antes de inativar a conta.';
    END IF;
    UPDATE public.contas_financeiras SET ativo = false WHERE id = c.id
    RETURNING id INTO v_id;
  WHEN 'VINCULAR_FORMA_PAGAMENTO' THEN
    IF length(btrim(coalesce(p_dados->>'codigo', ''))) < 2 THEN
      RAISE EXCEPTION 'Forma de pagamento obrigatória.';
    END IF;
    IF nullif(p_dados->>'conta_id', '') IS NOT NULL THEN
      IF c.id IS NULL THEN
        RAISE EXCEPTION 'Conta financeira inválida para esta loja.';
      END IF;
      IF (p_dados->>'codigo') = 'DINHEIRO' AND c.tipo = 'BANCO' THEN
        RAISE EXCEPTION 'Dinheiro deve apontar para conta tipo caixa/reserva, nao banco.';
      END IF;
      IF (p_dados->>'codigo') IN ('PIX', 'CARTAO_DEBITO', 'CARTAO_CREDITO')
         AND c.tipo <> 'BANCO' THEN
        RAISE EXCEPTION 'PIX e cartao devem apontar para conta bancaria.';
      END IF;
    END IF;
    UPDATE public.formas_pagamento
      SET conta_financeira_id = nullif(p_dados->>'conta_id', '')::uuid,
          updated_at = now()
    WHERE loja_id = l
      AND codigo = upper(btrim(p_dados->>'codigo'))
      AND ativo
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Forma de pagamento nao encontrada nesta loja.';
    END IF;
  END CASE;
  resultado := jsonb_build_object('id', v_id, 'ok', true);
  INSERT INTO public.financeiro_comandos
  VALUES (p_request_id, l, u, p_tipo, p_dados, resultado, now());
  RETURN resultado;
END;
$$;

REVOKE ALL ON FUNCTION public.financeiro_comando_v1(text, jsonb, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.financeiro_comando(text, jsonb, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.financeiro_comando(text, jsonb, uuid)
  TO authenticated;
