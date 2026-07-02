-- BACKPORT (fase R1, 2026-07-02): conteúdo extraído de
-- supabase_migrations.schema_migrations.statements do projeto de produção
-- (jinlong). Esta migration foi aplicada em produção sem arquivo no repo.

-- Repara drift: 090 consta como aplicada mas a função fiscal_registrar_evento_enqueue_erro
-- estava ausente em pg_proc e o CHECK não permitia 'ERRO_ENQUEUE'. Restaura ambos (idempotente).

ALTER TABLE public.documentos_fiscais_eventos
  DROP CONSTRAINT IF EXISTS documentos_fiscais_eventos_tipo_check;

ALTER TABLE public.documentos_fiscais_eventos
  ADD CONSTRAINT documentos_fiscais_eventos_tipo_check
  CHECK (
    evento_tipo IN (
      'ENFILEIRADO','REENFILEIRADO','CLAIM','ERRO','ERRO_ENQUEUE',
      'EMITIDO','REPROCESSO_MANUAL','CANCELADO'
    )
  );

CREATE OR REPLACE FUNCTION public.fiscal_registrar_evento_enqueue_erro(
  p_venda_id uuid,
  p_tipo_doc text,
  p_erro_mensagem text,
  p_detalhe jsonb DEFAULT '{}'::jsonb
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_doc_id uuid;
  v_status text;
  v_tipo text := upper(COALESCE(NULLIF(trim(p_tipo_doc), ''), 'NFC_E_STUB'));
BEGIN
  IF p_venda_id IS NULL THEN RETURN; END IF;

  IF auth.uid() IS NULL
     AND auth.role() IS DISTINCT FROM 'service_role'
     AND current_user <> 'postgres' THEN
    RAISE EXCEPTION 'FISCAL_ENQUEUE_ERRO_EVENTO_AUTH';
  END IF;

  SELECT d.id, d.status INTO v_doc_id, v_status
  FROM public.documentos_fiscais_pendentes d
  WHERE d.venda_id = p_venda_id
    AND d.tipo_doc = v_tipo
    AND d.status <> 'CANCELADO'
    AND d.deleted_at IS NULL
  ORDER BY d.created_at DESC LIMIT 1;

  IF v_doc_id IS NULL THEN RETURN; END IF;

  INSERT INTO public.documentos_fiscais_eventos (
    documento_id, evento_tipo, status_antes, status_depois,
    actor_user_id, actor_role, origem_acao, payload
  )
  VALUES (
    v_doc_id, 'ERRO_ENQUEUE', v_status, v_status,
    auth.uid(), current_setting('request.jwt.claim.role', true), 'caixa_web_enqueue',
    jsonb_build_object('erro', LEFT(COALESCE(p_erro_mensagem, ''), 2000)) || COALESCE(p_detalhe, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_registrar_evento_enqueue_erro(uuid, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fiscal_registrar_evento_enqueue_erro(uuid, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fiscal_registrar_evento_enqueue_erro(uuid, text, text, jsonb) TO service_role;
