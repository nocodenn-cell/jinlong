-- PR C: timeline e rastreabilidade fiscal (eventos auditáveis por documento).

ALTER TABLE public.documentos_fiscais_pendentes
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE TABLE IF NOT EXISTS public.documentos_fiscais_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  documento_id uuid NOT NULL REFERENCES public.documentos_fiscais_pendentes(id) ON DELETE CASCADE,
  evento_tipo text NOT NULL,
  status_antes text,
  status_depois text,
  actor_user_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  actor_role text,
  origem_acao text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT documentos_fiscais_eventos_tipo_check CHECK (
    evento_tipo IN (
      'ENFILEIRADO',
      'REENFILEIRADO',
      'CLAIM',
      'ERRO',
      'EMITIDO',
      'REPROCESSO_MANUAL',
      'CANCELADO'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_doc_fiscal_eventos_doc_created
  ON public.documentos_fiscais_eventos (documento_id, created_at ASC);

ALTER TABLE public.documentos_fiscais_eventos ENABLE ROW LEVEL SECURITY;

-- Constantes de perfis administrativos
DO $$
DECLARE
  v_admin_profiles TEXT[] := ARRAY['GERENTE', 'DONO', 'ADMIN'];
BEGIN
  -- Policy para gerentes
  DROP POLICY IF EXISTS "doc_fiscal_eventos_gerente_select" ON public.documentos_fiscais_eventos;
  CREATE POLICY "doc_fiscal_eventos_gerente_select"
    ON public.documentos_fiscais_eventos FOR SELECT TO authenticated
    USING (
      EXISTS (
        SELECT 1 FROM public.usuarios u
        WHERE u.id = auth.uid() AND u.perfil = ANY(v_admin_profiles)
      )
    );
END $$;

-- ---------------------------------------------------------------------------
-- Triggers: INSERT (enfileiramento) + UPDATE (claim / erro / emitido / cancelado)
-- Pula ERRO -> PENDENTE (tratado por RPC reprocesso ou reenfileiramento explícito).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.tg_documentos_fiscais_eventos_ai()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.documentos_fiscais_eventos (
    documento_id,
    evento_tipo,
    status_antes,
    status_depois,
    actor_user_id,
    actor_role,
    origem_acao,
    payload
  ) VALUES (
    NEW.id,
    'ENFILEIRADO',
    NULL,
    NEW.status,
    auth.uid(),
    current_setting('request.jwt.claim.role', true),
    'INSERT_DIRETO_OU_RPC',
    jsonb_build_object(
      'tipo_doc', NEW.tipo_doc,
      'venda_id', NEW.venda_id,
      'payload', COALESCE(NEW.payload, '{}'::jsonb)
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_documentos_fiscais_eventos_ai ON public.documentos_fiscais_pendentes;
CREATE TRIGGER tr_documentos_fiscais_eventos_ai
  AFTER INSERT ON public.documentos_fiscais_pendentes
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_documentos_fiscais_eventos_ai();

CREATE OR REPLACE FUNCTION public.tg_documentos_fiscais_eventos_au()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload jsonb;
BEGIN
  IF OLD.status = 'ERRO' AND NEW.status = 'PENDENTE' THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    IF NEW.status = 'ERRO'
      AND (
        NEW.ultimo_erro IS DISTINCT FROM OLD.ultimo_erro
        OR NEW.fiscal_error_code IS DISTINCT FROM OLD.fiscal_error_code
      ) THEN
      v_payload := jsonb_build_object(
        'ultimo_erro', NEW.ultimo_erro,
        'ultimo_erro_anterior', OLD.ultimo_erro,
        'fiscal_error_code', NEW.fiscal_error_code,
        'fiscal_error_code_anterior', OLD.fiscal_error_code,
        'fiscal_error_category', NEW.fiscal_error_category,
        'fiscal_error_category_anterior', OLD.fiscal_error_category,
        'tentativas', NEW.tentativas,
        'proxima_tentativa_em', NEW.proxima_tentativa_em,
        'ultima_tentativa_em', NEW.ultima_tentativa_em
      );
      INSERT INTO public.documentos_fiscais_eventos (
        documento_id,
        evento_tipo,
        status_antes,
        status_depois,
        actor_user_id,
        actor_role,
        origem_acao,
        payload
      ) VALUES (
        NEW.id,
        'ERRO',
        OLD.status,
        NEW.status,
        auth.uid(),
        current_setting('request.jwt.claim.role', true),
        'ATUALIZACAO_ERRO_SEM_MUDANCA_STATUS',
        COALESCE(v_payload, '{}'::jsonb)
      );
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status = 'EM_PROCESSAMENTO'
    AND OLD.status IS DISTINCT FROM 'EM_PROCESSAMENTO'
    AND OLD.status IN ('PENDENTE', 'ERRO') THEN
    INSERT INTO public.documentos_fiscais_eventos (
      documento_id,
      evento_tipo,
      status_antes,
      status_depois,
      actor_user_id,
      actor_role,
      origem_acao,
      payload
    ) VALUES (
      NEW.id,
      'CLAIM',
      OLD.status,
      NEW.status,
      auth.uid(),
      current_setting('request.jwt.claim.role', true),
      'FISCAL_CLAIM_WORKER',
      jsonb_build_object(
        'ultima_tentativa_em', NEW.ultima_tentativa_em,
        'tentativas', NEW.tentativas
      )
    );
    RETURN NEW;
  END IF;

  IF NEW.status = 'ERRO' AND OLD.status IS DISTINCT FROM 'ERRO' THEN
    v_payload := jsonb_build_object(
      'ultimo_erro', NEW.ultimo_erro,
      'ultimo_erro_anterior', OLD.ultimo_erro,
      'fiscal_error_code', NEW.fiscal_error_code,
      'fiscal_error_code_anterior', OLD.fiscal_error_code,
      'fiscal_error_category', NEW.fiscal_error_category,
      'fiscal_error_category_anterior', OLD.fiscal_error_category,
      'tentativas', NEW.tentativas,
      'proxima_tentativa_em', NEW.proxima_tentativa_em,
      'ultima_tentativa_em', NEW.ultima_tentativa_em
    );
    INSERT INTO public.documentos_fiscais_eventos (
      documento_id,
      evento_tipo,
      status_antes,
      status_depois,
      actor_user_id,
      actor_role,
      origem_acao,
      payload
    ) VALUES (
      NEW.id,
      'ERRO',
      OLD.status,
      NEW.status,
      auth.uid(),
      current_setting('request.jwt.claim.role', true),
      'ATUALIZACAO_STATUS_ERRO',
      COALESCE(v_payload, '{}'::jsonb)
    );
    RETURN NEW;
  END IF;

  IF NEW.status = 'EMITIDO' AND OLD.status IS DISTINCT FROM 'EMITIDO' THEN
    INSERT INTO public.documentos_fiscais_eventos (
      documento_id,
      evento_tipo,
      status_antes,
      status_depois,
      actor_user_id,
      actor_role,
      origem_acao,
      payload
    ) VALUES (
      NEW.id,
      'EMITIDO',
      OLD.status,
      NEW.status,
      auth.uid(),
      current_setting('request.jwt.claim.role', true),
      'ATUALIZACAO_STATUS_EMITIDO',
      jsonb_build_object(
        'chave_fiscal', NEW.chave_fiscal,
        'protocolo', NEW.protocolo,
        'provider_ref', NEW.provider_ref,
        'processado_em', NEW.processado_em
      )
    );
    RETURN NEW;
  END IF;

  IF NEW.status = 'CANCELADO' AND OLD.status IS DISTINCT FROM 'CANCELADO' THEN
    INSERT INTO public.documentos_fiscais_eventos (
      documento_id,
      evento_tipo,
      status_antes,
      status_depois,
      actor_user_id,
      actor_role,
      origem_acao,
      payload
    ) VALUES (
      NEW.id,
      'CANCELADO',
      OLD.status,
      NEW.status,
      auth.uid(),
      current_setting('request.jwt.claim.role', true),
      'ATUALIZACAO_STATUS_CANCELADO',
      '{}'::jsonb
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_documentos_fiscais_eventos_au ON public.documentos_fiscais_pendentes;
CREATE TRIGGER tr_documentos_fiscais_eventos_au
  AFTER UPDATE ON public.documentos_fiscais_pendentes
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_documentos_fiscais_eventos_au();

-- ---------------------------------------------------------------------------
-- Reprocesso manual: evento explícito (não depende do trigger ERRO->PENDENTE).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fiscal_reprocessar_documento(
  p_documento_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_profiles TEXT[] := ARRAY['GERENTE', 'DONO', 'ADMIN'];
  v_uid uuid := auth.uid();
  v_old_status text;
  v_prev_ultimo text;
  v_prev_fiscal_code text;
  v_prev_fiscal_cat text;
BEGIN
  IF current_user <> 'postgres' THEN
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'FISCAL_REPROCESSO_AUTH';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = v_uid
        AND u.perfil = ANY(v_admin_profiles)
    ) THEN
      RAISE EXCEPTION 'FISCAL_REPROCESSO_PERFIL';
    END IF;
  END IF;

  SELECT d.status, d.ultimo_erro, d.fiscal_error_code, d.fiscal_error_category
  INTO v_old_status, v_prev_ultimo, v_prev_fiscal_code, v_prev_fiscal_cat
  FROM public.documentos_fiscais_pendentes d
  WHERE d.id = p_documento_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_DOCUMENTO_NAO_ENCONTRADO';
  END IF;

  UPDATE public.documentos_fiscais_pendentes
  SET
    status = 'PENDENTE',
    proxima_tentativa_em = now(),
    ultimo_erro = NULL,
    fiscal_error_code = NULL,
    fiscal_error_category = NULL,
    fiscal_action_hint = NULL,
    fiscal_retryable = NULL,
    fiscal_next_step_url = NULL,
    fiscal_error_payload = NULL,
    updated_at = now()
  WHERE id = p_documento_id
    AND status IN ('ERRO', 'PENDENTE');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_REPROCESSO_STATUS_INVALIDO';
  END IF;

  INSERT INTO public.documentos_fiscais_eventos (
    documento_id,
    evento_tipo,
    status_antes,
    status_depois,
    actor_user_id,
    actor_role,
    origem_acao,
    payload
  ) VALUES (
    p_documento_id,
    'REPROCESSO_MANUAL',
    v_old_status,
    'PENDENTE',
    v_uid,
    current_setting('request.jwt.claim.role', true),
    'RPC_FISCAL_REPROCESSAR_DOCUMENTO',
    jsonb_build_object(
      'ultimo_erro_prev', v_prev_ultimo,
      'fiscal_error_code_prev', v_prev_fiscal_code,
      'fiscal_error_category_prev', v_prev_fiscal_cat
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Reenfileiramento via RPC (ERRO/CANCELADO -> PENDENTE): evento explícito.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fiscal_enfileirar_documento_venda(
  p_venda_id uuid,
  p_tipo_doc text DEFAULT 'NFC_E_STUB',
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_profiles TEXT[] := ARRAY['GERENTE', 'DONO', 'ADMIN'];
  v_uid uuid := auth.uid();
  v_tipo text := upper(COALESCE(NULLIF(trim(p_tipo_doc), ''), 'NFC_E_STUB'));
  v_documento_id uuid;
  v_prev_status text;
  v_new_status text;
BEGIN
  IF p_venda_id IS NULL THEN
    RAISE EXCEPTION 'FISCAL_ENQUEUE_VENDA_OBRIGATORIA';
  END IF;

  IF v_tipo NOT IN ('NFC_E_STUB', 'NFCE', 'NFE') THEN
    RAISE EXCEPTION 'FISCAL_ENQUEUE_TIPO_DOC_INVALIDO';
  END IF;

  IF current_user <> 'postgres' THEN
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'FISCAL_ENQUEUE_AUTH';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.vendas v
      WHERE v.id = p_venda_id
        AND (
          v.operador_id = v_uid
          OR EXISTS (
            SELECT 1
            FROM public.usuarios u
            WHERE u.id = v_uid
              AND u.perfil = ANY(v_admin_profiles)
          )
        )
    ) THEN
      RAISE EXCEPTION 'FISCAL_ENQUEUE_PERMISSAO';
    END IF;
  END IF;

  SELECT d.status
  INTO v_prev_status
  FROM public.documentos_fiscais_pendentes d
  WHERE d.venda_id = p_venda_id
    AND d.tipo_doc = v_tipo
  ORDER BY d.created_at DESC
  LIMIT 1;

  INSERT INTO public.documentos_fiscais_pendentes (
    venda_id,
    tipo_doc,
    status,
    payload
  )
  VALUES (
    p_venda_id,
    v_tipo,
    'PENDENTE',
    COALESCE(p_payload, '{}'::jsonb)
  )
  ON CONFLICT (venda_id, tipo_doc) WHERE deleted_at IS NULL
  DO UPDATE SET
    payload = COALESCE(EXCLUDED.payload, public.documentos_fiscais_pendentes.payload),
    status = CASE
      WHEN public.documentos_fiscais_pendentes.status IN ('ERRO', 'CANCELADO') THEN 'PENDENTE'
      ELSE public.documentos_fiscais_pendentes.status
    END,
    proxima_tentativa_em = CASE
      WHEN public.documentos_fiscais_pendentes.status IN ('ERRO', 'CANCELADO') THEN now()
      ELSE public.documentos_fiscais_pendentes.proxima_tentativa_em
    END,
    updated_at = now();

  SELECT d.id, d.status
  INTO v_documento_id, v_new_status
  FROM public.documentos_fiscais_pendentes d
  WHERE d.venda_id = p_venda_id
    AND d.tipo_doc = v_tipo
    AND d.deleted_at IS NULL
  ORDER BY d.created_at DESC
  LIMIT 1;

  IF v_documento_id IS NULL THEN
    RAISE EXCEPTION 'FISCAL_ENQUEUE_INSERT_FALHOU';
  END IF;

  IF v_prev_status IN ('ERRO', 'CANCELADO') AND v_new_status = 'PENDENTE' THEN
    INSERT INTO public.documentos_fiscais_eventos (
      documento_id,
      evento_tipo,
      status_antes,
      status_depois,
      actor_user_id,
      actor_role,
      origem_acao,
      payload
    ) VALUES (
      v_documento_id,
      'REENFILEIRADO',
      v_prev_status,
      v_new_status,
      v_uid,
      current_setting('request.jwt.claim.role', true),
      'RPC_FISCAL_ENFILEIRAR_DOCUMENTO_VENDA',
      jsonb_build_object('venda_id', p_venda_id, 'tipo_doc', v_tipo)
    );
  END IF;

  RETURN v_documento_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_enfileirar_documento_venda(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fiscal_enfileirar_documento_venda(uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fiscal_enfileirar_documento_venda(uuid, text, jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- View de consistência (auditoria): documento em ERRO sem evento ERRO mais recente.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.v_fiscal_doc_status_event_mismatch
WITH (security_invoker = true) AS
SELECT
  d.id AS documento_id,
  d.status AS status_atual,
  d.ultimo_erro,
  le.evento_tipo AS ultimo_evento_tipo,
  le.created_at AS ultimo_evento_em
FROM public.documentos_fiscais_pendentes d
LEFT JOIN LATERAL (
  SELECT e.evento_tipo, e.created_at
  FROM public.documentos_fiscais_eventos e
  WHERE e.documento_id = d.id
  ORDER BY e.created_at DESC, e.id DESC
  LIMIT 1
) le ON true
WHERE d.status = 'ERRO'
  AND le.evento_tipo IS DISTINCT FROM 'ERRO';

REVOKE ALL ON TABLE public.v_fiscal_doc_status_event_mismatch FROM PUBLIC;
GRANT SELECT ON TABLE public.v_fiscal_doc_status_event_mismatch TO authenticated;

REVOKE ALL ON FUNCTION public.fiscal_reprocessar_documento(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fiscal_reprocessar_documento(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fiscal_reprocessar_documento(uuid) TO service_role;
