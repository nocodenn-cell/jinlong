-- ============================================================
-- ROLLBACK — `fiscal_enfileirar_documento_venda`, estado de PRODUÇÃO
--            imediatamente antes da Fase 1B (`20260819220100`)
--
-- Projeto: jinlong (`kbabmewnahysfvlybiak`), capturado em 2026-08-19.
--
-- Estado registrado:
--   sobrecarga presente  : 3 args (p_venda_id, p_tipo_doc, p_payload)
--   sobrecarga ausente   : 4 args (com p_loja_id)
--   md5 da definição     : 954b441b291de316d2c36d42f6252307  (3077 bytes)
--   ACL                  : postgres=X/postgres,
--                          authenticated=X/postgres,
--                          service_role=X/postgres
--
-- Este é um retrato de DEFINIÇÃO e PRIVILÉGIO, não de dado.
--
-- ⚠️ NOTA IMPORTANTE SOBRE ESTE CORPO
--
-- O corpo abaixo é o que estava em PRODUÇÃO, e ele é mais POBRE que o da
-- migration `099` do repositório. Faltam duas coisas que a `099` tem:
--
--   - bloqueio de venda `SEM_NF` (`FISCAL_ENQUEUE_VENDA_SEM_NF`);
--   - escopo de loja na checagem de permissão
--     (`u.loja_id = v.loja_id` para perfil GERENTE).
--
-- Ele TEM a trilha `REENFILEIRADO` em `documentos_fiscais_eventos`, que por
-- sua vez falta na `114`. Reverter para este corpo, portanto, é voltar a um
-- estado conhecido — não a um estado bom. Use apenas como parada de
-- emergência, e reaplique a `20260819220100` assim que a causa for entendida.
--
-- COMO REVERTER
--   1. executar este arquivo (recria a sobrecarga de 3 args);
--   2. remover a de 4 args:
--        DROP FUNCTION IF EXISTS
--          public.fiscal_enfileirar_documento_venda(uuid, text, jsonb, uuid);
--   3. conferir o md5:
--        SELECT md5(pg_get_functiondef(oid)) FROM pg_proc
--        WHERE proname = 'fiscal_enfileirar_documento_venda';
--      deve devolver 954b441b291de316d2c36d42f6252307
--
--   A ordem importa: recriar ANTES de remover, para não haver instante em que
--   nenhuma sobrecarga responda.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fiscal_enfileirar_documento_venda(
  p_venda_id uuid,
  p_tipo_doc text DEFAULT 'NFC_E_STUB'::text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  IF auth.role() IS DISTINCT FROM 'service_role' AND current_user <> 'postgres' THEN
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
            SELECT 1 FROM public.usuarios u
            WHERE u.id = v_uid AND u.perfil = ANY(v_admin_profiles)
          )
        )
    ) THEN
      RAISE EXCEPTION 'FISCAL_ENQUEUE_PERMISSAO';
    END IF;
  END IF;

  SELECT d.status INTO v_prev_status
  FROM public.documentos_fiscais_pendentes d
  WHERE d.venda_id = p_venda_id AND d.tipo_doc = v_tipo
  ORDER BY d.created_at DESC
  LIMIT 1;

  INSERT INTO public.documentos_fiscais_pendentes (venda_id, tipo_doc, status, payload)
  VALUES (p_venda_id, v_tipo, 'PENDENTE', COALESCE(p_payload, '{}'::jsonb))
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

  SELECT d.id, d.status INTO v_documento_id, v_new_status
  FROM public.documentos_fiscais_pendentes d
  WHERE d.venda_id = p_venda_id AND d.tipo_doc = v_tipo AND d.status <> 'CANCELADO'
  ORDER BY d.created_at DESC
  LIMIT 1;

  IF v_documento_id IS NULL THEN
    RAISE EXCEPTION 'FISCAL_ENQUEUE_INSERT_FALHOU';
  END IF;

  IF v_prev_status IN ('ERRO', 'CANCELADO') AND v_new_status = 'PENDENTE' THEN
    INSERT INTO public.documentos_fiscais_eventos (
      documento_id, evento_tipo, status_antes, status_depois,
      actor_user_id, actor_role, origem_acao, payload
    )
    VALUES (
      v_documento_id, 'REENFILEIRADO', v_prev_status, v_new_status,
      v_uid, current_setting('request.jwt.claim.role', true),
      'RPC_FISCAL_ENFILEIRAR_DOCUMENTO_VENDA',
      jsonb_build_object('venda_id', p_venda_id, 'tipo_doc', v_tipo)
    );
  END IF;

  RETURN v_documento_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.fiscal_enfileirar_documento_venda(uuid, text, jsonb)
  FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.fiscal_enfileirar_documento_venda(uuid, text, jsonb)
  TO authenticated, service_role;
