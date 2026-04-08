-- ==========================================================
-- SMOKE FISCAL EMISSAO REAL (ESTADO + RETENTATIVA + IDP)
-- Uso: SQL Editor (homologacao)
-- ==========================================================

DO $$
DECLARE
  v_venda_id uuid;
  v_doc_id uuid;
  v_status text;
  v_tentativas int;
  v_proxima timestamptz;
BEGIN
  -- 1) Precisa existir ao menos uma venda para vincular o documento fiscal.
  SELECT v.id INTO v_venda_id
  FROM public.vendas v
  ORDER BY v.data DESC NULLS LAST
  LIMIT 1;

  IF v_venda_id IS NULL THEN
    RAISE EXCEPTION 'SMOKE_FAIL: nenhuma venda encontrada para teste fiscal.';
  END IF;

  -- 2) Garante documento fiscal unico por (venda_id, tipo_doc).
  INSERT INTO public.documentos_fiscais_pendentes (
    venda_id, tipo_doc, status, payload, ultimo_erro
  )
  VALUES (
    v_venda_id,
    'NFCE',
    'PENDENTE',
    jsonb_build_object('origem', 'smoke_fiscal'),
    NULL
  )
  ON CONFLICT (venda_id, tipo_doc) WHERE status <> 'CANCELADO'
  DO UPDATE SET
    status = 'PENDENTE',
    tentativas = 0,
    proxima_tentativa_em = now(),
    ultimo_erro = NULL,
    updated_at = now();

  SELECT d.id INTO v_doc_id
  FROM public.documentos_fiscais_pendentes d
  WHERE d.venda_id = v_venda_id
    AND d.tipo_doc = 'NFCE'
    AND d.status <> 'CANCELADO'
  ORDER BY d.created_at DESC
  LIMIT 1;

  IF v_doc_id IS NULL THEN
    RAISE EXCEPTION 'SMOKE_FAIL: documento fiscal nao encontrado apos upsert.';
  END IF;

  -- 3) Simula erro transitorio para validar retentativa/backoff.
  PERFORM public.fiscal_marcar_erro(v_doc_id, 'SMOKE_ERRO_TRANSITORIO', true);

  SELECT status, tentativas, proxima_tentativa_em
  INTO v_status, v_tentativas, v_proxima
  FROM public.documentos_fiscais_pendentes
  WHERE id = v_doc_id;

  IF v_status <> 'ERRO' THEN
    RAISE EXCEPTION 'SMOKE_FAIL: status apos fiscal_marcar_erro deveria ser ERRO. atual=%', v_status;
  END IF;
  IF COALESCE(v_tentativas, 0) < 1 THEN
    RAISE EXCEPTION 'SMOKE_FAIL: tentativas nao incrementou.';
  END IF;
  IF v_proxima IS NULL THEN
    RAISE EXCEPTION 'SMOKE_FAIL: proxima_tentativa_em deveria estar preenchida para erro transitorio.';
  END IF;

  -- 4) Reprocesso manual (fluxo gerente).
  PERFORM public.fiscal_reprocessar_documento(v_doc_id);

  SELECT status INTO v_status
  FROM public.documentos_fiscais_pendentes
  WHERE id = v_doc_id;

  IF v_status <> 'PENDENTE' THEN
    RAISE EXCEPTION 'SMOKE_FAIL: status apos fiscal_reprocessar_documento deveria ser PENDENTE. atual=%', v_status;
  END IF;

  -- 5) Marca emitido (simulacao do worker/provedor).
  PERFORM public.fiscal_marcar_emitido(
    v_doc_id,
    'CHAVE-SMOKE-123',
    'PROTO-SMOKE-123',
    'SMOKE_PROVIDER',
    jsonb_build_object('ok', true, 'source', 'smoke_sql')
  );

  SELECT status INTO v_status
  FROM public.documentos_fiscais_pendentes
  WHERE id = v_doc_id;

  IF v_status <> 'EMITIDO' THEN
    RAISE EXCEPTION 'SMOKE_FAIL: status final deveria ser EMITIDO. atual=%', v_status;
  END IF;

  RAISE NOTICE '=========================================';
  RAISE NOTICE 'SMOKE_OK: fiscal state-machine validada';
  RAISE NOTICE 'Venda: %', v_venda_id;
  RAISE NOTICE 'Documento: %', v_doc_id;
  RAISE NOTICE '=========================================';
END $$;
