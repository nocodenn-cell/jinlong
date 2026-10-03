-- PADRÃO DE SEGURANÇA: a execução é transacional e termina em ROLLBACK.
-- Para persistir deliberadamente, substitua o ROLLBACK final por COMMIT.

BEGIN;

-- Smoke: migration 069 — RPC fiscal_enfileirar_documento_venda com auth.role() = service_role.
-- SQL puro. Sem Edge, APIs externas ou Focus. Rodar no SQL Editor (homologação / local pós-migrations).
-- Pré-requisitos: migration 069 aplicada; ≥1 linha em public.vendas.

DO $$
DECLARE
  v_def text;
  v_venda_id uuid;
  v_doc_id uuid;
  v_origem constant text := 'smoke_069_service_role';
BEGIN
  RAISE NOTICE 'Passo 1: ler definição de public.fiscal_enfileirar_documento_venda …';

  BEGIN
    v_def := pg_get_functiondef(
      'public.fiscal_enfileirar_documento_venda(uuid,text,jsonb)'::regprocedure
    );
  EXCEPTION
    WHEN undefined_object THEN
      RAISE NOTICE 'Falha — função não encontrada (assinatura uuid,text,jsonb).';
      RAISE EXCEPTION 'SMOKE_069_FAIL: função ausente ou assinatura diferente.';
  END;

  IF v_def IS NULL OR length(trim(v_def)) = 0 THEN
    RAISE NOTICE 'Falha — pg_get_functiondef vazio.';
    RAISE EXCEPTION 'SMOKE_069_FAIL: definição vazia.';
  END IF;

  IF position('auth.role()' in lower(v_def)) = 0 OR position('service_role' in lower(v_def)) = 0 THEN
    RAISE NOTICE 'Falha — definição sem auth.role() ou service_role (migration 069?).';
    RAISE EXCEPTION 'SMOKE_069_FAIL: definição não reflete bypass service_role.';
  END IF;

  RAISE NOTICE 'Passo 1 OK — definição contém auth.role() e service_role.';

  RAISE NOTICE 'Passo 2: obter uma venda (LIMIT 1) …';
  SELECT v.id INTO v_venda_id FROM public.vendas v LIMIT 1;

  IF v_venda_id IS NULL THEN
    RAISE NOTICE 'Falha — tabela vendas sem linhas.';
    RAISE EXCEPTION 'SMOKE_069_FAIL: nenhuma venda.';
  END IF;

  RAISE NOTICE 'Passo 2 OK — venda_id=%', v_venda_id;

  -- JWT: no Postgres padrão não existe SET LOCAL auth.jwt.claim.*; no Supabase use request.jwt.claim.role.
  RAISE NOTICE 'Passo 3: simular JWT role=service_role (set_config) …';
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);

  RAISE NOTICE 'Passo 4: chamar fiscal_enfileirar_documento_venda …';
  v_doc_id := public.fiscal_enfileirar_documento_venda(
    v_venda_id,
    'NFC_E_STUB',
    jsonb_build_object('origem', v_origem, 'teste', true)
  );

  IF v_doc_id IS NULL THEN
    RAISE NOTICE 'Falha — RPC retornou NULL.';
    RAISE EXCEPTION 'SMOKE_069_FAIL: retorno null.';
  END IF;

  RAISE NOTICE 'Passo 4 OK — documento_id=%', v_doc_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.documentos_fiscais_pendentes d
    WHERE d.id = v_doc_id
      AND d.venda_id = v_venda_id
      AND d.status = 'PENDENTE'
      AND d.tipo_doc = 'NFC_E_STUB'
      AND d.payload->>'origem' = v_origem
  ) THEN
    RAISE NOTICE 'Falha — linha esperada não encontrada ou status ≠ PENDENTE.';
    RAISE EXCEPTION 'SMOKE_069_FAIL: validação da linha inserida.';
  END IF;

  RAISE NOTICE 'Passo 5 OK — linha PENDENTE confirmada.';

  DELETE FROM public.documentos_fiscais_pendentes WHERE id = v_doc_id;
  RAISE NOTICE 'Passo 6 OK — linha de teste removida. Migration 069 / smoke OK.';
END $;

ROLLBACK;
