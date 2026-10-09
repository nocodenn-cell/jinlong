-- Fiscal: fecha bypass de autorização nas RPCs expostas a authenticated.
--
-- PROBLEMA (reproduzido em Postgres isolado, dono da função = postgres, sessão
-- simulando PostgREST: session_user = authenticator, SET ROLE authenticated):
--
--   Dentro de SECURITY DEFINER, current_user é o DONO da função, não quem chamou.
--   O predicado `current_user <> 'postgres'` fica sempre falso quando o dono é
--   postgres (como nas migrations deste repositório). A checagem de perfil nunca
--   roda.
--
--   Com GRANT EXECUTE para authenticated, um OPERADOR da loja A:
--     * fiscal_reprocessar_documento — tira o documento da loja B da DLQ e
--       volta o status para PENDENTE (dispara nova tentativa de emissão);
--     * fiscal_enfileirar_documento_venda — enfileira NFC-e de venda da loja B;
--     * fiscal_registrar_evento_enqueue_erro — grava evento na trilha da loja B.
--   fiscal_cancelar_documento não usa esse predicado, mas também não olha a loja:
--   GERENTE/DONO da loja A cancela documento da loja B, furando a RLS
--   doc_fiscal_pendentes_* (ADMIN global; GERENTE/DONO só a loja do caixa).
--
--   O predicado de loja de fiscal_enfileirar ainda lia vendas.loja_id, coluna que
--   não existe (a loja está em caixas). Com a guarda morta isso não aparecia;
--   ao ligar a guarda, a coluna quebraria o enqueue legítimo.
--
-- CORREÇÃO (menor que fecha o bypass, sem mudar assinatura):
--   * internal.fiscal_sessao_privilegiada() olha session_user (postgres /
--     supabase_admin) ou auth.role() = service_role. session_user não muda
--     dentro de SECURITY DEFINER.
--   * Reprocesso e cancelamento: GERENTE/DONO só na loja do caixa da venda;
--     ADMIN global. Igual à RLS da fila fiscal.
--   * Enfileirar e evento de erro: operador da própria venda, GERENTE da loja
--     do caixa, DONO/ADMIN globais — a regra que o corpo já declarava, agora
--     efetiva e com loja vinda de caixas.
--   service_role e a sessão de migration continuam podendo chamar (worker,
--     sync-outbox, smoke).
--
-- ROLLBACK: restaurar os corpos anteriores via git show desta migration^
--   (fiscal_reprocessar_documento, fiscal_cancelar_documento,
--   fiscal_enfileirar_documento_venda, fiscal_registrar_evento_enqueue_erro)
--   e DROP FUNCTION internal.fiscal_sessao_privilegiada().

CREATE SCHEMA IF NOT EXISTS internal;

CREATE OR REPLACE FUNCTION internal.fiscal_sessao_privilegiada()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT session_user IN ('postgres', 'supabase_admin')
      OR coalesce(auth.role(), '') = 'service_role';
$$;

REVOKE ALL ON FUNCTION internal.fiscal_sessao_privilegiada() FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fiscal_reprocessar_documento(p_documento_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_old_status text;
  v_prev_ultimo text;
  v_prev_fiscal_code text;
  v_prev_fiscal_cat text;
  v_estava_na_dlq boolean := false;
  v_loja uuid;
BEGIN
  IF NOT internal.fiscal_sessao_privilegiada() THEN
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'FISCAL_REPROCESSO_AUTH';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = v_uid
        AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
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

  SELECT c.loja_id INTO v_loja
  FROM public.documentos_fiscais_pendentes d
  JOIN public.vendas v ON v.id = d.venda_id
  JOIN public.caixas c ON c.id = v.caixa_id
  WHERE d.id = p_documento_id;

  IF NOT internal.fiscal_sessao_privilegiada() THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = v_uid
        AND (
          u.perfil = 'ADMIN'
          OR (u.perfil IN ('GERENTE', 'DONO') AND u.loja_id = v_loja)
        )
    ) THEN
      RAISE EXCEPTION 'FISCAL_REPROCESSO_LOJA' USING ERRCODE = '42501';
    END IF;
  END IF;

  DELETE FROM public.documentos_fiscais_dlq WHERE documento_id = p_documento_id;
  v_estava_na_dlq := FOUND;

  UPDATE public.documentos_fiscais_pendentes
  SET
    status = 'PENDENTE',
    tentativas = CASE WHEN v_estava_na_dlq THEN 0 ELSE tentativas END,
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
      'fiscal_error_category_prev', v_prev_fiscal_cat,
      'resgatado_da_dlq', v_estava_na_dlq
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_reprocessar_documento(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_reprocessar_documento(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.fiscal_reprocessar_documento(uuid) IS
  'Reprocessa documento ERRO/PENDENTE. authenticated: GERENTE/DONO só da loja do caixa; ADMIN global. service_role e sessão de manutenção passam.';

CREATE OR REPLACE FUNCTION public.fiscal_cancelar_documento(
  p_documento_id uuid,
  p_justificativa text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_status text;
  v_loja uuid;
  v_just text := trim(COALESCE(p_justificativa, ''));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'FISCAL_CANCELAR_AUTH_REQUIRED' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = v_uid AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
  ) THEN
    RAISE EXCEPTION 'FISCAL_CANCELAR_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  IF char_length(v_just) < 15 THEN
    RAISE EXCEPTION 'FISCAL_CANCELAR_JUSTIFICATIVA_CURTA'
      USING HINT = 'Justificativa mínima de 15 caracteres (espelha regra Focus/SEFAZ).';
  END IF;

  SELECT status INTO v_status
  FROM public.documentos_fiscais_pendentes
  WHERE id = p_documento_id
    AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_DOCUMENTO_NAO_ENCONTRADO';
  END IF;

  SELECT c.loja_id INTO v_loja
  FROM public.documentos_fiscais_pendentes d
  JOIN public.vendas v ON v.id = d.venda_id
  JOIN public.caixas c ON c.id = v.caixa_id
  WHERE d.id = p_documento_id;

  IF NOT EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE u.id = v_uid
      AND (
        u.perfil = 'ADMIN'
        OR (u.perfil IN ('GERENTE', 'DONO') AND u.loja_id = v_loja)
      )
  ) THEN
    RAISE EXCEPTION 'FISCAL_CANCELAR_LOJA' USING ERRCODE = '42501';
  END IF;

  IF v_status = 'CANCELADO' THEN
    RETURN;
  END IF;

  IF v_status NOT IN ('EMITIDO', 'EM_PROCESSAMENTO', 'ERRO', 'PENDENTE') THEN
    RAISE EXCEPTION 'FISCAL_CANCELAR_STATUS_INVALIDO:%', v_status;
  END IF;

  UPDATE public.documentos_fiscais_pendentes
  SET
    status = 'CANCELADO',
    ultimo_erro = v_just,
    fiscal_error_code = 'CANCELAMENTO_EXPLICITO',
    fiscal_error_category = 'CANCELAMENTO',
    fiscal_action_hint = 'Cancelamento fiscal explícito (independente do ciclo da venda).',
    fiscal_retryable = false,
    fiscal_next_step_url = '/admin/financeiro?tab=fiscal',
    fiscal_error_payload = jsonb_build_object(
      'origem', 'fiscal_cancelar_documento',
      'ator_id', v_uid,
      'justificativa', v_just,
      'status_anterior', v_status
    ),
    proxima_tentativa_em = NULL,
    updated_at = now()
  WHERE id = p_documento_id;
END;
$$;

COMMENT ON FUNCTION public.fiscal_cancelar_documento(uuid, text) IS
  'Cancelamento explícito do documento. GERENTE/DONO só da loja do caixa; ADMIN global. Exige sessão de usuário.';

REVOKE ALL ON FUNCTION public.fiscal_cancelar_documento(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_cancelar_documento(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fiscal_enfileirar_documento_venda(
  p_venda_id  uuid,
  p_tipo_doc  text    DEFAULT 'NFC_E_STUB',
  p_payload   jsonb   DEFAULT '{}'::jsonb,
  p_loja_id   uuid    DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_profiles TEXT[] := ARRAY['GERENTE', 'DONO', 'ADMIN'];
  v_uid            uuid := auth.uid();
  v_tipo           text := upper(COALESCE(NULLIF(trim(p_tipo_doc), ''), 'NFC_E_STUB'));
  v_documento_id   uuid;
  v_prev_status    text;
  v_new_status     text;
  v_tipo_venda     text;
  v_loja_venda     uuid;
BEGIN
  IF p_venda_id IS NULL THEN
    RAISE EXCEPTION 'FISCAL_ENQUEUE_VENDA_OBRIGATORIA';
  END IF;

  IF v_tipo NOT IN ('NFC_E_STUB', 'NFCE', 'NFE') THEN
    RAISE EXCEPTION 'FISCAL_ENQUEUE_TIPO_DOC_INVALIDO';
  END IF;

  IF p_loja_id IS NOT NULL THEN
    SELECT cx.loja_id INTO v_loja_venda
    FROM   public.vendas v
    INNER  JOIN public.caixas cx ON cx.id = v.caixa_id
    WHERE  v.id = p_venda_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'FISCAL_ENQUEUE_VENDA_NAO_ENCONTRADA';
    END IF;

    IF v_loja_venda IS DISTINCT FROM p_loja_id THEN
      RAISE EXCEPTION 'FISCAL_ENQUEUE_LOJA_DIVERGENTE';
    END IF;
  END IF;

  IF NOT internal.fiscal_sessao_privilegiada() THEN
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
              AND (
                u.perfil IN ('DONO', 'ADMIN')
                OR u.loja_id = (
                  SELECT c.loja_id FROM public.caixas c WHERE c.id = v.caixa_id
                )
              )
          )
        )
    ) THEN
      RAISE EXCEPTION 'FISCAL_ENQUEUE_PERMISSAO';
    END IF;
  END IF;

  SELECT v.tipo_venda INTO v_tipo_venda
  FROM public.vendas v
  WHERE v.id = p_venda_id
  LIMIT 1;

  IF v_tipo_venda IS NULL THEN
    RAISE EXCEPTION 'FISCAL_ENQUEUE_VENDA_NAO_ENCONTRADA';
  END IF;

  IF v_tipo_venda = 'SEM_NF' THEN
    RAISE EXCEPTION 'FISCAL_ENQUEUE_VENDA_SEM_NF';
  END IF;

  SELECT d.status
  INTO   v_prev_status
  FROM   public.documentos_fiscais_pendentes d
  WHERE  d.venda_id = p_venda_id
    AND  d.tipo_doc = v_tipo
  ORDER  BY d.created_at DESC
  LIMIT  1;

  INSERT INTO public.documentos_fiscais_pendentes (
    venda_id, tipo_doc, status, payload
  )
  VALUES (
    p_venda_id, v_tipo, 'PENDENTE', COALESCE(p_payload, '{}'::jsonb)
  )
  ON CONFLICT (venda_id, tipo_doc) WHERE status <> 'CANCELADO'
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
  INTO   v_documento_id, v_new_status
  FROM   public.documentos_fiscais_pendentes d
  WHERE  d.venda_id = p_venda_id
    AND  d.tipo_doc = v_tipo
    AND  d.status <> 'CANCELADO'
  ORDER  BY d.created_at DESC
  LIMIT  1;

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
    )
    VALUES (
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

REVOKE ALL ON FUNCTION public.fiscal_enfileirar_documento_venda(uuid, text, jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_enfileirar_documento_venda(uuid, text, jsonb, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.fiscal_enfileirar_documento_venda(uuid, text, jsonb, uuid) IS
  'Enfileira documento fiscal. authenticated: operador da venda, GERENTE da loja do caixa, DONO/ADMIN. p_loja_id, se informado, tem de bater com a loja do caixa. Loja da venda = caixas.loja_id.';

CREATE OR REPLACE FUNCTION public.fiscal_registrar_evento_enqueue_erro(
  p_venda_id uuid,
  p_tipo_doc text,
  p_erro_mensagem text,
  p_detalhe jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc_id uuid;
  v_status text;
  v_tipo text := upper(COALESCE(NULLIF(trim(p_tipo_doc), ''), 'NFC_E_STUB'));
BEGIN
  IF p_venda_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT internal.fiscal_sessao_privilegiada() THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'FISCAL_ENQUEUE_ERRO_EVENTO_AUTH';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.vendas v
      JOIN public.caixas c ON c.id = v.caixa_id
      JOIN public.usuarios u ON u.id = auth.uid()
      WHERE v.id = p_venda_id
        AND (
          v.operador_id = auth.uid()
          OR u.perfil IN ('DONO', 'ADMIN')
          OR (u.perfil = 'GERENTE' AND u.loja_id = c.loja_id)
        )
    ) THEN
      RAISE EXCEPTION 'FISCAL_ENQUEUE_ERRO_EVENTO_AUTH' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT d.id, d.status
  INTO v_doc_id, v_status
  FROM public.documentos_fiscais_pendentes d
  WHERE d.venda_id = p_venda_id
    AND d.tipo_doc = v_tipo
    AND d.status <> 'CANCELADO'
    AND d.deleted_at IS NULL
  ORDER BY d.created_at DESC
  LIMIT 1;

  IF v_doc_id IS NULL THEN
    RETURN;
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
  )
  VALUES (
    v_doc_id,
    'ERRO_ENQUEUE',
    v_status,
    v_status,
    auth.uid(),
    current_setting('request.jwt.claim.role', true),
    'caixa_web_enqueue',
    jsonb_build_object(
      'erro', LEFT(COALESCE(p_erro_mensagem, ''), 2000)
    ) || COALESCE(p_detalhe, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_registrar_evento_enqueue_erro(uuid, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_registrar_evento_enqueue_erro(uuid, text, text, jsonb) TO authenticated, service_role;

DO $verify$
DECLARE
  v_reproc text := pg_get_functiondef('public.fiscal_reprocessar_documento(uuid)'::regprocedure);
  v_enq text := pg_get_functiondef('public.fiscal_enfileirar_documento_venda(uuid, text, jsonb, uuid)'::regprocedure);
  v_can text := pg_get_functiondef('public.fiscal_cancelar_documento(uuid, text)'::regprocedure);
  v_evt text := pg_get_functiondef('public.fiscal_registrar_evento_enqueue_erro(uuid, text, text, jsonb)'::regprocedure);
BEGIN
  IF position('current_user <> ''postgres''' IN v_reproc) > 0
     OR position('current_user <> ''postgres''' IN v_enq) > 0
     OR position('current_user <> ''postgres''' IN v_evt) > 0 THEN
    RAISE EXCEPTION 'FISCAL_AUTHZ_GUARD_MORTO';
  END IF;
  IF position('FISCAL_REPROCESSO_LOJA' IN v_reproc) = 0 THEN
    RAISE EXCEPTION 'FISCAL_REPROCESSO_SEM_LOJA';
  END IF;
  IF position('FISCAL_CANCELAR_LOJA' IN v_can) = 0 THEN
    RAISE EXCEPTION 'FISCAL_CANCELAR_SEM_LOJA';
  END IF;
  IF position('v.loja_id' IN v_enq) > 0 THEN
    RAISE EXCEPTION 'FISCAL_ENQUEUE_LOJA_INEXISTENTE';
  END IF;
END
$verify$;

NOTIFY pgrst, 'reload schema';
