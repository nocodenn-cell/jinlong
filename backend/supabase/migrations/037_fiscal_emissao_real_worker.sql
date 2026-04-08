-- Fase 2 (real): emissão fiscal com idempotência, retentativa e worker.

ALTER TABLE public.documentos_fiscais_pendentes
  DROP CONSTRAINT IF EXISTS documentos_fiscais_pendentes_status_check;

ALTER TABLE public.documentos_fiscais_pendentes
  ADD CONSTRAINT documentos_fiscais_pendentes_status_check
  CHECK (status IN ('PENDENTE', 'EM_PROCESSAMENTO', 'EMITIDO', 'ERRO', 'CANCELADO'));

ALTER TABLE public.documentos_fiscais_pendentes
  ADD COLUMN IF NOT EXISTS tentativas integer NOT NULL DEFAULT 0 CHECK (tentativas >= 0),
  ADD COLUMN IF NOT EXISTS proxima_tentativa_em timestamptz,
  ADD COLUMN IF NOT EXISTS ultima_tentativa_em timestamptz,
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS provider_ref text,
  ADD COLUMN IF NOT EXISTS chave_fiscal text,
  ADD COLUMN IF NOT EXISTS protocolo text,
  ADD COLUMN IF NOT EXISTS processado_em timestamptz;

UPDATE public.documentos_fiscais_pendentes
SET provider = COALESCE(provider, 'NFE_PROVIDER_HTTP')
WHERE provider IS NULL;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY venda_id, tipo_doc
      ORDER BY created_at DESC, id DESC
    ) AS rn
  FROM public.documentos_fiscais_pendentes
)
DELETE FROM public.documentos_fiscais_pendentes d
USING ranked r
WHERE d.id = r.id
  AND r.rn > 1
  AND d.status <> 'EMITIDO';

CREATE UNIQUE INDEX IF NOT EXISTS idx_doc_fiscal_unique_venda_tipo
  ON public.documentos_fiscais_pendentes (venda_id, tipo_doc)
  WHERE status <> 'CANCELADO';

CREATE INDEX IF NOT EXISTS idx_doc_fiscal_fila
  ON public.documentos_fiscais_pendentes (status, COALESCE(proxima_tentativa_em, created_at), created_at)
  WHERE status IN ('PENDENTE', 'ERRO');

CREATE OR REPLACE FUNCTION public.fiscal_claim_documentos(
  p_limit integer DEFAULT 20
)
RETURNS SETOF public.documentos_fiscais_pendentes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 20), 100));
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND current_user <> 'postgres' THEN
    RAISE EXCEPTION 'FISCAL_CLAIM_FORBIDDEN';
  END IF;

  RETURN QUERY
  WITH claimed AS (
    UPDATE public.documentos_fiscais_pendentes d
    SET
      status = 'EM_PROCESSAMENTO',
      ultima_tentativa_em = now(),
      updated_at = now()
    WHERE d.id IN (
      SELECT q.id
      FROM public.documentos_fiscais_pendentes q
      WHERE q.status IN ('PENDENTE', 'ERRO')
        AND (
          q.proxima_tentativa_em IS NULL OR q.proxima_tentativa_em <= now()
        )
      ORDER BY q.created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT v_limit
    )
    RETURNING d.*
  )
  SELECT * FROM claimed;
END;
$$;

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

CREATE OR REPLACE FUNCTION public.fiscal_reprocessar_documento(
  p_documento_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF current_user <> 'postgres' THEN
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'FISCAL_REPROCESSO_AUTH';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = v_uid
        AND u.perfil IN ('GERENTE', 'DONO')
    ) THEN
      RAISE EXCEPTION 'FISCAL_REPROCESSO_PERFIL';
    END IF;
  END IF;

  UPDATE public.documentos_fiscais_pendentes
  SET
    status = 'PENDENTE',
    proxima_tentativa_em = now(),
    ultimo_erro = NULL,
    updated_at = now()
  WHERE id = p_documento_id
    AND status IN ('ERRO', 'PENDENTE');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_REPROCESSO_STATUS_INVALIDO';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_claim_documentos(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fiscal_marcar_emitido(uuid, text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fiscal_marcar_erro(uuid, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fiscal_reprocessar_documento(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.fiscal_claim_documentos(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.fiscal_marcar_emitido(uuid, text, text, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.fiscal_marcar_erro(uuid, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.fiscal_reprocessar_documento(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fiscal_reprocessar_documento(uuid) TO service_role;
