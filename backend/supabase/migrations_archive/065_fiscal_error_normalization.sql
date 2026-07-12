-- PR A: normalizacao canonica de erros fiscais no backend.
-- Mantem compatibilidade com `ultimo_erro` e fluxo atual.

ALTER TABLE public.documentos_fiscais_pendentes
  ADD COLUMN IF NOT EXISTS fiscal_error_code text,
  ADD COLUMN IF NOT EXISTS fiscal_error_category text,
  ADD COLUMN IF NOT EXISTS fiscal_action_hint text,
  ADD COLUMN IF NOT EXISTS fiscal_retryable boolean,
  ADD COLUMN IF NOT EXISTS fiscal_next_step_url text,
  ADD COLUMN IF NOT EXISTS fiscal_error_payload jsonb;

ALTER TABLE public.documentos_fiscais_pendentes
  DROP CONSTRAINT IF EXISTS documentos_fiscais_pendentes_error_category_check;

ALTER TABLE public.documentos_fiscais_pendentes
  ADD CONSTRAINT documentos_fiscais_pendentes_error_category_check
  CHECK (
    fiscal_error_category IS NULL
    OR fiscal_error_category IN (
      'DADOS_CADASTRAIS_INVALIDOS',
      'FALHA_COMUNICACAO_PROVIDER',
      'TIMEOUT_RATE_LIMIT',
      'REJEICAO_REGRA_FISCAL',
      'DESCONHECIDO'
    )
  );

CREATE INDEX IF NOT EXISTS idx_doc_fiscal_error_category
  ON public.documentos_fiscais_pendentes (fiscal_error_category)
  WHERE fiscal_error_category IS NOT NULL;

CREATE OR REPLACE FUNCTION public.fiscal_marcar_emitido(
  p_documento_id uuid,
  p_chave_fiscal text,
  p_protocolo text,
  p_provider_ref text DEFAULT NULL,
  p_payload jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND current_user <> 'postgres' THEN
    RAISE EXCEPTION 'FISCAL_EMITIDO_FORBIDDEN';
  END IF;

  UPDATE public.documentos_fiscais_pendentes
  SET
    status = 'EMITIDO',
    chave_fiscal = p_chave_fiscal,
    protocolo = p_protocolo,
    provider_ref = p_provider_ref,
    payload = COALESCE(p_payload, payload),
    ultimo_erro = NULL,
    fiscal_error_code = NULL,
    fiscal_error_category = NULL,
    fiscal_action_hint = NULL,
    fiscal_retryable = NULL,
    fiscal_next_step_url = NULL,
    fiscal_error_payload = NULL,
    proxima_tentativa_em = NULL,
    processado_em = now(),
    updated_at = now()
  WHERE id = p_documento_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_DOCUMENTO_NAO_ENCONTRADO';
  END IF;
END;
$$;

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
      WHEN p_transitorio THEN now() + make_interval(
        secs => LEAST(
          3600,
          60 * CAST(power(2::numeric, LEAST(d.tentativas, 6)) AS integer)
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
      WHEN COALESCE(p_retryable, p_transitorio) THEN now() + make_interval(
        secs => LEAST(
          3600,
          60 * CAST(power(2::numeric, LEAST(d.tentativas, 6)) AS integer)
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

REVOKE ALL ON FUNCTION public.fiscal_marcar_erro_normalizado(
  uuid,
  text,
  boolean,
  text,
  text,
  text,
  boolean,
  text,
  jsonb
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.fiscal_marcar_erro_normalizado(
  uuid,
  text,
  boolean,
  text,
  text,
  text,
  boolean,
  text,
  jsonb
) TO service_role;
