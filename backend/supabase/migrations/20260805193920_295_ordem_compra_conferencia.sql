-- Backport Fase 1 (Git-only) from supabase_migrations.schema_migrations.statements
-- version: 20260805193920
-- name: 295_ordem_compra_conferencia
-- source: production read-only export (schema_migrations)
-- Applied in production: yes (do NOT re-run on production).

BEGIN;

ALTER TABLE public.ordens_compra_itens
  ADD COLUMN quantidade_conferida numeric(10,3),
  ADD COLUMN divergencia_obs text,
  ADD COLUMN status_conferencia text NOT NULL DEFAULT 'EM_CONFERENCIA',
  ADD COLUMN conferido_por uuid REFERENCES public.usuarios(id),
  ADD COLUMN conferido_em timestamptz;

ALTER TABLE public.ordens_compra_itens
  ADD CONSTRAINT ordens_compra_itens_status_conferencia_check
    CHECK (status_conferencia IN ('EM_CONFERENCIA', 'CONFERIDO', 'DIVERGENTE'));

COMMENT ON COLUMN public.ordens_compra_itens.status_conferencia IS
  'FLX-04 (2026-08-05). EM_CONFERENCIA=aguardando contagem; CONFERIDO=bate com o esperado; DIVERGENTE=contagem diferente do esperado (ainda assim aceito, com motivo).';
COMMENT ON COLUMN public.ordens_compra_itens.conferido_por IS
  'FLX-04: quem registrou a conferência. NULL enquanto EM_CONFERENCIA.';
COMMENT ON COLUMN public.ordens_compra_itens.conferido_em IS
  'FLX-04: quando a conferência foi registrada. NULL enquanto EM_CONFERENCIA.';

CREATE FUNCTION public.registrar_conferencia_ordem_compra(p_oc_id uuid, p_itens jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_perfil       text;
  v_loja_usuario uuid;
  v_oc           record;
  el             jsonb;
  v_item_id      uuid;
  v_qtd_conf     numeric;
  v_qtd_esperada numeric;
  v_div_obs      text;
  v_status       text;
  v_conferidos   int := 0;
  v_divergentes  int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'OC_AUTH';
  END IF;

  SELECT u.perfil, u.loja_id INTO v_perfil, v_loja_usuario
    FROM public.usuarios u WHERE u.id = v_uid;

  IF v_perfil IS NULL OR v_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN') THEN
    RAISE EXCEPTION 'OC_PERFIL';
  END IF;

  SELECT id, loja_id, status INTO v_oc
    FROM public.ordens_compra
   WHERE id = p_oc_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OC_NAO_ENCONTRADA';
  END IF;

  IF v_perfil = 'GERENTE' AND v_loja_usuario IS DISTINCT FROM v_oc.loja_id THEN
    RAISE EXCEPTION 'OC_LOJA';
  END IF;

  IF v_oc.status <> 'EM_TRANSITO' THEN
    RAISE EXCEPTION 'OC_STATUS_INVALIDO';
  END IF;

  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'OC_ITENS_INVALIDOS';
  END IF;

  FOR el IN SELECT value FROM jsonb_array_elements(p_itens) AS t(value)
  LOOP
    v_item_id  := (el->>'item_id')::uuid;
    v_qtd_conf := (el->>'quantidade_conferida')::numeric;
    v_div_obs  := NULLIF(trim(COALESCE(el->>'divergencia_obs', '')), '');

    IF v_qtd_conf IS NULL OR v_qtd_conf < 0 THEN
      RAISE EXCEPTION 'OC_CONFERENCIA_QTD_INVALIDA';
    END IF;

    SELECT quantidade INTO v_qtd_esperada
      FROM public.ordens_compra_itens
     WHERE id = v_item_id AND ordem_id = p_oc_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'OC_ITEM_NAO_ENCONTRADO';
    END IF;

    v_status := CASE WHEN v_qtd_conf = v_qtd_esperada THEN 'CONFERIDO' ELSE 'DIVERGENTE' END;
    IF v_status = 'CONFERIDO' THEN v_conferidos := v_conferidos + 1;
    ELSE v_divergentes := v_divergentes + 1; END IF;

    UPDATE public.ordens_compra_itens
       SET quantidade_conferida = v_qtd_conf,
           divergencia_obs      = v_div_obs,
           status_conferencia   = v_status,
           conferido_por        = v_uid,
           conferido_em         = now()
     WHERE id = v_item_id AND ordem_id = p_oc_id;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true, 'oc_id', p_oc_id,
    'itens_conferidos', v_conferidos, 'itens_divergentes', v_divergentes
  );
END;
$$;

COMMENT ON FUNCTION public.registrar_conferencia_ordem_compra(uuid, jsonb) IS
  'FLX-04 (2026-08-05). Registra contagem física por item de OC, com auditoria. Não move estoque — pré-requisito de receber_ordem_compra.';

REVOKE ALL ON FUNCTION public.registrar_conferencia_ordem_compra(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.registrar_conferencia_ordem_compra(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.registrar_conferencia_ordem_compra(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_conferencia_ordem_compra(uuid, jsonb) TO service_role;

DROP FUNCTION public.receber_ordem_compra(uuid, jsonb);

CREATE FUNCTION public.receber_ordem_compra(p_oc_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_perfil       text;
  v_loja_usuario uuid;
  v_oc           record;
  v_it           record;
  v_pendentes    int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'OC_AUTH';
  END IF;

  SELECT u.perfil, u.loja_id INTO v_perfil, v_loja_usuario
    FROM public.usuarios u WHERE u.id = v_uid;

  IF v_perfil IS NULL OR v_perfil NOT IN ('GERENTE','DONO','ADMIN') THEN
    RAISE EXCEPTION 'OC_PERFIL';
  END IF;

  SELECT id, loja_id, status INTO v_oc
    FROM public.ordens_compra
   WHERE id = p_oc_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OC_NAO_ENCONTRADA';
  END IF;

  IF v_perfil = 'GERENTE' AND v_loja_usuario IS DISTINCT FROM v_oc.loja_id THEN
    RAISE EXCEPTION 'OC_LOJA';
  END IF;

  IF v_oc.status <> 'EM_TRANSITO' THEN
    RAISE EXCEPTION 'OC_STATUS_INVALIDO';
  END IF;

  SELECT count(*) INTO v_pendentes
    FROM public.ordens_compra_itens
   WHERE ordem_id = p_oc_id AND status_conferencia = 'EM_CONFERENCIA';

  IF v_pendentes > 0 THEN
    RAISE EXCEPTION 'OC_CONFERENCIA_PENDENTE';
  END IF;

  FOR v_it IN
    SELECT id, produto_id, quantidade_conferida
      FROM public.ordens_compra_itens
     WHERE ordem_id = p_oc_id
  LOOP
    IF v_it.produto_id IS NOT NULL AND v_it.quantidade_conferida > 0 THEN
      INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual, estoque_minimo, version)
      VALUES (v_it.produto_id, v_oc.loja_id, v_it.quantidade_conferida, 0, 1)
      ON CONFLICT (loja_id, produto_id) DO UPDATE
        SET quantidade_atual = public.estoque.quantidade_atual + EXCLUDED.quantidade_atual,
            version          = public.estoque.version + 1,
            updated_at       = now();

      INSERT INTO public.movimentos_estoque_log (
        loja_id, produto_id, tipo_codigo, quantidade_delta, usuario_id, observacao
      ) VALUES (
        v_oc.loja_id,
        v_it.produto_id,
        'ENTRADA_OC',
        v_it.quantidade_conferida,
        v_uid,
        format('Recebimento OC %s (conferido)', p_oc_id::text)
      );
    END IF;

    UPDATE public.ordens_compra_itens
       SET quantidade_recebida = COALESCE(quantidade_conferida, 0)
     WHERE id = v_it.id;
  END LOOP;

  UPDATE public.ordens_compra
     SET status = 'RECEBIDA'
   WHERE id = p_oc_id;
END;
$$;

COMMENT ON FUNCTION public.receber_ordem_compra(uuid) IS
  'FLX-04 (2026-08-05). Credita estoque só com base em quantidade_conferida (gravada por registrar_conferencia_ordem_compra) — nunca de parâmetro do cliente. Exige todos os itens conferidos.';

REVOKE ALL ON FUNCTION public.receber_ordem_compra(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.receber_ordem_compra(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.receber_ordem_compra(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.receber_ordem_compra(uuid) TO service_role;

DO $verify$
DECLARE
  v_def text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='ordens_compra_itens' AND column_name='status_conferencia'
  ) THEN
    RAISE EXCEPTION 'MIG295_COLUNAS_AUSENTES';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname='ordens_compra_itens_status_conferencia_check'
  ) THEN
    RAISE EXCEPTION 'MIG295_CHECK_AUSENTE';
  END IF;

  IF to_regprocedure('public.receber_ordem_compra(uuid,jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'MIG295_OVERLOAD_ANTIGO_REMANESCENTE';
  END IF;

  IF to_regprocedure('public.receber_ordem_compra(uuid)') IS NULL THEN
    RAISE EXCEPTION 'MIG295_RPC_RECEBER_AUSENTE';
  END IF;

  IF to_regprocedure('public.registrar_conferencia_ordem_compra(uuid,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'MIG295_RPC_CONFERENCIA_AUSENTE';
  END IF;

  v_def := pg_get_functiondef('public.receber_ordem_compra(uuid)'::regprocedure);
  IF position('OC_CONFERENCIA_PENDENTE' IN v_def) = 0 THEN
    RAISE EXCEPTION 'MIG295_GATE_CONFERENCIA_AUSENTE';
  END IF;
  IF position('jsonb_array_elements' IN v_def) > 0 THEN
    RAISE EXCEPTION 'MIG295_AINDA_ITERA_PAYLOAD_CLIENTE';
  END IF;
  IF position('quantidade_conferida' IN v_def) = 0 THEN
    RAISE EXCEPTION 'MIG295_NAO_USA_QUANTIDADE_CONFERIDA';
  END IF;

  IF has_function_privilege('anon', 'public.receber_ordem_compra(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.registrar_conferencia_ordem_compra(uuid,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'MIG295_GRANT_ANON_INDEVIDO';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.receber_ordem_compra(uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.registrar_conferencia_ordem_compra(uuid,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'MIG295_GRANT_AUTHENTICATED_AUSENTE';
  END IF;

  IF EXISTS (SELECT 1 FROM public.ordens_compra_itens WHERE quantidade_recebida <> 0 AND status_conferencia = 'EM_CONFERENCIA') THEN
    RAISE EXCEPTION 'MIG295_INCONSISTENCIA_QTD_SEM_CONFERENCIA';
  END IF;

  RAISE NOTICE '295 OK — FLX-04 verificado no efeito (colunas, RPCs, gate, grants)';
END
$verify$;

COMMIT;