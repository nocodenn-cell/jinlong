-- Backoff de próxima tentativa só no banco: intervalo base * (tentativas após incremento)^2, com teto.
-- Alinha fiscal_marcar_erro e fiscal_marcar_erro_normalizado (ramo retentável).

CREATE OR REPLACE FUNCTION public.fiscal_marcar_erro(
  p_documento_id uuid,
  p_erro text,
  p_transitorio boolean DEFAULT true
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND current_user <> 'postgres' THEN
    RAISE EXCEPTION 'FISCAL_ERRO_FORBIDDEN';
  END IF;

  UPDATE public.documentos_fiscais_pendentes d
  SET
    status = 'ERRO',
    tentativas = d.tentativas + 1,
    ultimo_erro = LEFT(COALESCE(p_erro, 'ERRO_FISCAL_DESCONHECIDO'), 1000),
    fiscal_error_code = LEFT(COALESCE(NULLIF(trim(p_erro), ''), 'ERRO_FISCAL_DESCONHECIDO'), 120),
    fiscal_error_category = CASE
      WHEN p_transitorio THEN 'FALHA_COMUNICACAO_PROVIDER'
      ELSE 'REJEICAO_REGRA_FISCAL'
    END,
    fiscal_action_hint = CASE
      WHEN p_transitorio THEN 'Verificar provider/rede e aguardar nova tentativa automatica.'
      ELSE 'Revisar documento fiscal e reprocessar manualmente.'
    END,
    fiscal_retryable = p_transitorio,
    fiscal_next_step_url = '/gerente/financeiro?tab=fiscal',
    fiscal_error_payload = jsonb_build_object(
      'source', 'legacy_rpc',
      'legacy_error', LEFT(COALESCE(p_erro, 'ERRO_FISCAL_DESCONHECIDO'), 1000)
    ),
    proxima_tentativa_em = CASE
      WHEN p_transitorio THEN
        now() + make_interval(
          secs => LEAST(
            7200,
            GREATEST(
              30,
              (60 * (d.tentativas + 1) * (d.tentativas + 1))::integer
            )
          )
        )
      ELSE NULL
    END,
    updated_at = now()
  WHERE d.id = p_documento_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_DOCUMENTO_NAO_ENCONTRADO';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.fiscal_marcar_erro_normalizado(
  p_documento_id uuid,
  p_erro text,
  p_transitorio boolean DEFAULT true,
  p_error_code text DEFAULT NULL,
  p_error_category text DEFAULT NULL,
  p_action_hint text DEFAULT NULL,
  p_retryable boolean DEFAULT NULL,
  p_next_step_url text DEFAULT NULL,
  p_error_payload jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_categoria text := COALESCE(NULLIF(trim(p_error_category), ''), 'DESCONHECIDO');
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND current_user <> 'postgres' THEN
    RAISE EXCEPTION 'FISCAL_ERRO_FORBIDDEN';
  END IF;

  IF v_categoria NOT IN (
    'DADOS_CADASTRAIS_INVALIDOS',
    'FALHA_COMUNICACAO_PROVIDER',
    'TIMEOUT_RATE_LIMIT',
    'REJEICAO_REGRA_FISCAL',
    'DESCONHECIDO'
  ) THEN
    v_categoria := 'DESCONHECIDO';
  END IF;

  UPDATE public.documentos_fiscais_pendentes d
  SET
    status = 'ERRO',
    tentativas = d.tentativas + 1,
    ultimo_erro = LEFT(COALESCE(p_erro, 'ERRO_FISCAL_DESCONHECIDO'), 1000),
    fiscal_error_code = LEFT(
      COALESCE(NULLIF(trim(p_error_code), ''), NULLIF(trim(p_erro), ''), 'ERRO_FISCAL_DESCONHECIDO'),
      120
    ),
    fiscal_error_category = v_categoria,
    fiscal_action_hint = LEFT(
      COALESCE(
        NULLIF(trim(p_action_hint), ''),
        CASE
          WHEN COALESCE(p_retryable, p_transitorio) THEN 'Tentar novamente apos janela de retentativa.'
          ELSE 'Corrigir dados/regras fiscais e reprocessar manualmente.'
        END
      ),
      300
    ),
    fiscal_retryable = COALESCE(p_retryable, p_transitorio),
    fiscal_next_step_url = LEFT(
      COALESCE(NULLIF(trim(p_next_step_url), ''), '/gerente/financeiro?tab=fiscal'),
      500
    ),
    fiscal_error_payload = COALESCE(
      p_error_payload,
      jsonb_build_object(
        'source', 'fiscal_marcar_erro_normalizado',
        'legacy_error', LEFT(COALESCE(p_erro, 'ERRO_FISCAL_DESCONHECIDO'), 1000)
      )
    ),
    proxima_tentativa_em = CASE
      WHEN COALESCE(p_retryable, p_transitorio) THEN
        now() + make_interval(
          secs => LEAST(
            7200,
            GREATEST(
              30,
              (60 * (d.tentativas + 1) * (d.tentativas + 1))::integer
            )
          )
        )
      ELSE NULL
    END,
    updated_at = now()
  WHERE d.id = p_documento_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_DOCUMENTO_NAO_ENCONTRADO';
  END IF;
END;
$$;
