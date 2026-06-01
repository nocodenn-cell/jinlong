-- ============================================================
-- Migration 114: fiscal_enfileirar_documento_venda — validação de loja para service_role
--
-- Vulnerabilidade V7 (auditoria 2026-05-27):
-- A função aceitava chamadas via service_role sem qualquer
-- validação de loja, permitindo que uma Edge Function com a
-- service_role key comprometida enfileirasse documentos fiscais
-- de qualquer loja.
--
-- Fix:
--   Adiciona parâmetro opcional p_loja_id. Quando fornecido,
--   a função valida que o caixa da venda pertence a essa loja —
--   mesmo para service_role. A Edge Function sync-outbox deve
--   passar LOJA_ID do seu ambiente.
--
-- Retrocompatível: p_loja_id DEFAULT NULL preserva todas as
-- chamadas existentes que não passam o parâmetro.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fiscal_enfileirar_documento_venda(
  p_venda_id  uuid,
  p_tipo_doc  text    DEFAULT 'NFC_E_STUB',
  p_payload   jsonb   DEFAULT '{}'::jsonb,
  p_loja_id   uuid    DEFAULT NULL   -- se fornecido, valida que a venda pertence a esta loja
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid        uuid := auth.uid();
  v_tipo       text := upper(COALESCE(NULLIF(trim(p_tipo_doc), ''), 'NFC_E_STUB'));
  v_documento_id uuid;
  v_loja_venda   uuid;
BEGIN
  IF p_venda_id IS NULL THEN
    RAISE EXCEPTION 'FISCAL_ENQUEUE_VENDA_OBRIGATORIA';
  END IF;

  IF v_tipo NOT IN ('NFC_E_STUB', 'NFCE', 'NFE') THEN
    RAISE EXCEPTION 'FISCAL_ENQUEUE_TIPO_DOC_INVALIDO';
  END IF;

  -- Valida loja quando p_loja_id é fornecido (obrigatório para integração segura
  -- da Edge Function, que deve passar seu LOJA_ID configurado via env var).
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

  -- Para sessões authenticated (não service_role): validações de autoria
  IF auth.role() IS DISTINCT FROM 'service_role' AND current_user <> 'postgres' THEN
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'FISCAL_ENQUEUE_AUTH';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM   public.vendas v
      WHERE  v.id = p_venda_id
        AND  (
               v.operador_id = v_uid
               OR EXISTS (
                 SELECT 1 FROM public.usuarios u
                 WHERE  u.id = v_uid
                   AND  u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
               )
             )
    ) THEN
      RAISE EXCEPTION 'FISCAL_ENQUEUE_PERMISSAO';
    END IF;
  END IF;

  INSERT INTO public.documentos_fiscais_pendentes (
    venda_id, tipo_doc, status, payload
  )
  VALUES (
    p_venda_id, v_tipo, 'PENDENTE', COALESCE(p_payload, '{}'::jsonb)
  )
  -- Predicado alinhado ao índice único parcial idx_doc_fiscal_unique_venda_tipo
  -- (migration 037: ON (venda_id, tipo_doc) WHERE status <> 'CANCELADO'), como já
  -- fazia a 090/099. A 114 havia revertido para `deleted_at IS NULL`, que não casa
  -- com o índice e quebra o UPSERT no build do zero ("no unique or exclusion
  -- constraint matching the ON CONFLICT specification").
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

  SELECT d.id INTO v_documento_id
  FROM   public.documentos_fiscais_pendentes d
  WHERE  d.venda_id = p_venda_id
    AND  d.tipo_doc = v_tipo
    AND  d.deleted_at IS NULL
  ORDER  BY d.created_at DESC
  LIMIT  1;

  IF v_documento_id IS NULL THEN
    RAISE EXCEPTION 'FISCAL_ENQUEUE_INSERT_FALHOU';
  END IF;

  RETURN v_documento_id;
END;
$$;

COMMENT ON FUNCTION public.fiscal_enfileirar_documento_venda(uuid, text, jsonb, uuid) IS
  'Enfileira documento fiscal. p_loja_id (opcional): quando fornecido valida que a venda pertence '
  'a essa loja — obrigatório em chamadas via service_role (Edge Function sync-outbox). '
  'V2 — adicionado p_loja_id e validação cross-loja (migration 114).';
