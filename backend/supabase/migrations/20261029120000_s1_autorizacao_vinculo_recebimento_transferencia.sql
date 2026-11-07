-- ============================================================================
-- S1 — Autorização por vínculo (usuario_vinculos) nas operações de recebimento
-- e transferência, com seleção explícita de loja na remessa.
--
-- ANTES: o GERENTE era autorizado por `usuarios.loja_id` (loja legada única).
--   Gerente de rede com vínculo em várias lojas só operava na loja legada.
-- AGORA: GERENTE autorizado por `fp_usuario_pode_loja` (vínculo ativo, mesma
--   empresa, nega por padrão). DONO/ADMIN: regras anteriores preservadas.
--
-- Escopo (somente):
--   1. internal.receber_ordem_compra        — guarda GERENTE por vínculo.
--   2. internal.confirmar_remessa_entrada   — guarda GERENTE por vínculo.
--   3. internal.confirmar_importacao_nfe    — guarda GERENTE por vínculo.
--   4. internal.transferir_estoque_seguro   — guarda GERENTE por vínculo; o caminho
--      novo (fora da loja legada) NÃO abre transferência entre CNPJs distintos.
--   5. criar_confirmar_remessa_entrada      — novo parâmetro p_loja_id (DEFAULT NULL).
--      NULL ⇒ loja legada (compatível com loja única). Loja explícita exige vínculo,
--      loja ativa; OC e produtos continuam validados contra a loja escolhida.
--
-- Não altera regras fiscais, grants (além de recriar os da remessa), policies nem dados.
-- Itens 1–4: substituição textual exata do trecho de guarda, com asserção (falha ⇒ aborta).
-- Rollback: backend/supabase/rollback/20261029120000_s1_autorizacao_vinculo_recebimento_transferencia.rollback.sql
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1–4. Guardas GERENTE por vínculo (substituição exata, 1 ocorrência cada)
-- ---------------------------------------------------------------------------
DO $s1$
DECLARE
  r record;
  v_def text;
  v_novo text;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('internal.receber_ordem_compra(uuid,jsonb,text,text)',
       $a$v_perfil = 'GERENTE' AND v_loja_usuario IS DISTINCT FROM v_oc.loja_id$a$,
       $b$v_perfil = 'GERENTE' AND NOT public.fp_usuario_pode_loja(v_uid, v_oc.loja_id, ARRAY['GERENTE'])$b$),
      ('internal.confirmar_remessa_entrada(uuid)',
       $a$v_perfil = 'GERENTE' AND v_loja_usuario IS DISTINCT FROM v_loja_remessa$a$,
       $b$v_perfil = 'GERENTE' AND NOT public.fp_usuario_pode_loja(v_uid, v_loja_remessa, ARRAY['GERENTE'])$b$),
      ('internal.confirmar_importacao_nfe(uuid)',
       $a$v_perfil = 'GERENTE' AND v_loja_usuario IS DISTINCT FROM v_imp.loja_id$a$,
       $b$v_perfil = 'GERENTE' AND NOT public.fp_usuario_pode_loja(v_uid, v_imp.loja_id, ARRAY['GERENTE'])$b$),
      ('internal.transferir_estoque_seguro(uuid,uuid,uuid,numeric,text,text,numeric)',
       $a$  IF v_perfil = 'GERENTE' AND v_loja_usuario NOT IN (p_loja_origem, p_loja_destino) THEN
    RAISE EXCEPTION 'TRANSFERENCIA_LOJA_INVALIDA';
  END IF;$a$,
       $b$  IF v_perfil = 'GERENTE' AND NOT (
       public.fp_usuario_pode_loja(v_uid, p_loja_origem, ARRAY['GERENTE'])
    OR public.fp_usuario_pode_loja(v_uid, p_loja_destino, ARRAY['GERENTE'])) THEN
    RAISE EXCEPTION 'TRANSFERENCIA_LOJA_INVALIDA';
  END IF;

  -- S1: autorização por vínculo fora da loja legada não abre transferência entre
  -- CNPJs distintos (sem fluxo fiscal validado). Caminho legado inalterado.
  IF v_perfil = 'GERENTE'
     AND (v_loja_usuario IS NULL OR v_loja_usuario NOT IN (p_loja_origem, p_loja_destino))
     AND (SELECT count(DISTINCT coalesce(l.cnpj, '')) FROM public.lojas l
           WHERE l.id IN (p_loja_origem, p_loja_destino)) > 1 THEN
    RAISE EXCEPTION 'TRANSFERENCIA_CNPJ_DISTINTO_SEM_FLUXO_FISCAL';
  END IF;$b$)
    ) AS t(fn, antigo, novo)
  LOOP
    v_def := pg_get_functiondef(r.fn::regprocedure);
    IF (length(v_def) - length(replace(v_def, r.antigo, ''))) / length(r.antigo) <> 1 THEN
      RAISE EXCEPTION 'S1: trecho de guarda não encontrado exatamente 1 vez em %', r.fn;
    END IF;
    v_novo := replace(v_def, r.antigo, r.novo);
    EXECUTE v_novo;
  END LOOP;
END
$s1$;

-- ---------------------------------------------------------------------------
-- 5. Remessa com loja explícita (assinatura nova; a antiga é removida para
--    evitar ambiguidade de overload — o app chama por parâmetros nomeados).
-- ---------------------------------------------------------------------------
DROP FUNCTION public.criar_confirmar_remessa_entrada(text, text, jsonb, text, uuid);
DROP FUNCTION internal.criar_confirmar_remessa_entrada(text, text, jsonb, text, uuid);

CREATE FUNCTION internal.criar_confirmar_remessa_entrada(
  p_origem text, p_observacao text, p_itens jsonb, p_idempotency_key text,
  p_ordem_compra_id uuid DEFAULT NULL::uuid, p_loja_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_perfil text;
  v_loja_legada uuid;
  v_loja uuid;
  v_remessa uuid;
  v_existente uuid;
  v_existente_hash text;
  v_item jsonb;
  v_produto uuid;
  v_esperada numeric;
  v_conferida numeric;
  v_observacao_norm text;
  v_itens_canon jsonb;
  v_payload_hash text;
  v_oc record;
  v_mov uuid;
  v_obs_mov text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'REMESSA_AUTH'; END IF;

  SELECT u.perfil, u.loja_id INTO v_perfil, v_loja_legada
  FROM public.usuarios u
  WHERE u.id = v_uid AND u.ativo;
  IF v_perfil IS NULL OR v_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN') THEN
    RAISE EXCEPTION 'REMESSA_PERFIL';
  END IF;

  -- S1: loja explícita; NULL ⇒ loja legada (compatível com loja única).
  v_loja := COALESCE(p_loja_id, v_loja_legada);
  IF v_loja IS NULL THEN RAISE EXCEPTION 'REMESSA_PERFIL'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.lojas l WHERE l.id = v_loja AND l.ativo) THEN
    RAISE EXCEPTION 'REMESSA_LOJA_INVALIDA';
  END IF;
  -- Nega por padrão: vínculo ativo na loja (mesma empresa). ADMIN legado: só a loja legada.
  IF NOT (public.fp_usuario_pode_loja(v_uid, v_loja, ARRAY['GERENTE', 'DONO'])
          OR (v_perfil = 'ADMIN' AND v_loja = v_loja_legada)) THEN
    RAISE EXCEPTION 'REMESSA_LOJA_INVALIDA';
  END IF;

  p_origem := NULLIF(btrim(COALESCE(p_origem, '')), '');
  p_idempotency_key := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
  IF p_origem IS NULL THEN RAISE EXCEPTION 'REMESSA_ORIGEM'; END IF;
  IF p_idempotency_key IS NULL THEN RAISE EXCEPTION 'REMESSA_IDEMPOTENCY_KEY'; END IF;

  v_observacao_norm := NULLIF(btrim(COALESCE(p_observacao, '')), '');

  IF p_itens IS NOT NULL AND jsonb_typeof(p_itens) = 'array' THEN
    SELECT jsonb_agg(
      jsonb_build_object(
        'produto_id', COALESCE(elem->>'produto_id', ''),
        'quantidade_esperada', COALESCE(elem->>'quantidade_esperada', ''),
        'quantidade_conferida', COALESCE(elem->>'quantidade_conferida', '')
      ) ORDER BY elem->>'produto_id'
    )
    INTO v_itens_canon
    FROM jsonb_array_elements(p_itens) elem;
  END IF;

  -- Sem pedido: fórmula idêntica à anterior. Com pedido: o id entra no hash.
  -- A loja não entra no hash: a chave de idempotência já é escopada por loja.
  v_payload_hash := md5(
    (jsonb_build_object(
      'origem', COALESCE(p_origem, ''),
      'observacao', COALESCE(v_observacao_norm, ''),
      'itens', COALESCE(v_itens_canon, '[]'::jsonb)
    ) || CASE WHEN p_ordem_compra_id IS NULL
              THEN '{}'::jsonb
              ELSE jsonb_build_object('ordem_compra_id', p_ordem_compra_id) END)::text
  );

  SELECT r.id, r.payload_hash INTO v_existente, v_existente_hash
  FROM public.remessas r
  WHERE r.loja_id = v_loja AND r.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existente_hash IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION 'REMESSA_IDEMPOTENCY_PAYLOAD_DIVERGENTE';
    END IF;
    RETURN v_existente;
  END IF;

  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'REMESSA_ITENS_VAZIOS';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens)
  LOOP
    BEGIN
      v_produto := NULLIF(btrim(COALESCE(v_item->>'produto_id', '')), '')::uuid;
      v_esperada := NULLIF(v_item->>'quantidade_esperada', '')::numeric;
      v_conferida := NULLIF(v_item->>'quantidade_conferida', '')::numeric;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'REMESSA_ITEM_INVALIDO';
    END;

    IF v_produto IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.produtos p
      WHERE p.id = v_produto AND p.loja_id = v_loja
        AND p.status_publicacao IS DISTINCT FROM 'INATIVO'
    ) THEN
      RAISE EXCEPTION 'REMESSA_ITEM_INVALIDO';
    END IF;
    IF v_esperada IS NULL OR v_conferida IS NULL
       OR v_esperada <= 0 OR v_conferida <= 0
       OR v_esperada = 'NaN'::numeric OR v_conferida = 'NaN'::numeric
       OR v_esperada = 'Infinity'::numeric OR v_conferida = 'Infinity'::numeric
    THEN
      RAISE EXCEPTION 'REMESSA_QTD_POSITIVA';
    END IF;
  END LOOP;

  -- Pedido informado: valida e TRAVA antes de qualquer efeito de estoque.
  IF p_ordem_compra_id IS NOT NULL THEN
    SELECT oc.id, oc.loja_id, oc.status INTO v_oc
      FROM public.ordens_compra oc WHERE oc.id = p_ordem_compra_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'OC_NAO_ENCONTRADA'; END IF;
    IF v_oc.loja_id IS DISTINCT FROM v_loja THEN RAISE EXCEPTION 'OC_LOJA'; END IF;
    IF v_oc.status NOT IN ('CONFIRMADA', 'EM_TRANSITO') THEN RAISE EXCEPTION 'OC_STATUS_INVALIDO'; END IF;
  END IF;

  INSERT INTO public.remessas(
    loja_id, origem_descricao, status, observacao, created_by, idempotency_key, payload_hash,
    origem_tipo, origem_ref
  ) VALUES (
    v_loja, p_origem, 'EM_CONFERENCIA', v_observacao_norm,
    v_uid, p_idempotency_key, v_payload_hash,
    CASE WHEN p_ordem_compra_id IS NULL THEN 'SEM_DOCUMENTO' ELSE 'ORDEM_COMPRA' END,
    p_ordem_compra_id::text
  ) RETURNING id INTO v_remessa;

  v_obs_mov := v_observacao_norm;
  IF p_ordem_compra_id IS NOT NULL THEN
    v_obs_mov := concat_ws(' · ', v_observacao_norm, format('OC %s', p_ordem_compra_id::text));
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens)
  LOOP
    v_produto := (v_item->>'produto_id')::uuid;
    v_esperada := (v_item->>'quantidade_esperada')::numeric;
    v_conferida := (v_item->>'quantidade_conferida')::numeric;

    INSERT INTO public.remessa_itens(
      remessa_id, produto_id, quantidade_esperada, quantidade_conferida
    ) VALUES (
      v_remessa, v_produto, v_esperada, v_conferida
    );

    INSERT INTO public.estoque(loja_id, produto_id, quantidade_atual, estoque_minimo)
    VALUES (v_loja, v_produto, v_conferida, 0)
    ON CONFLICT (loja_id, produto_id) DO UPDATE
      SET quantidade_atual = public.estoque.quantidade_atual + EXCLUDED.quantidade_atual,
          version = public.estoque.version + 1,
          updated_at = now();

    INSERT INTO public.movimentos_estoque_log(
      loja_id, produto_id, tipo_codigo, quantidade_delta, remessa_id, usuario_id, observacao
    ) VALUES (
      v_loja, v_produto, 'ENTRADA_REMessa_LOJA', v_conferida, v_remessa, v_uid,
      v_obs_mov
    ) RETURNING id INTO v_mov;

    IF p_ordem_compra_id IS NOT NULL THEN
      PERFORM public._oc_abater_por_produto(
        p_ordem_compra_id, v_loja, v_uid, 'REMESSA', v_remessa, v_remessa, NULL,
        v_produto, v_conferida, v_esperada, v_mov, v_observacao_norm, true
      );
    END IF;
  END LOOP;

  IF p_ordem_compra_id IS NOT NULL THEN
    PERFORM public._oc_atualizar_estado(p_ordem_compra_id);
  END IF;

  UPDATE public.remessas
  SET status = 'CONCLUIDA', finalized_at = now(),
      conferido_por = v_uid, conferido_em = now()
  WHERE id = v_remessa;

  RETURN v_remessa;
EXCEPTION WHEN unique_violation THEN
  SELECT r.id, r.payload_hash INTO v_existente, v_existente_hash
  FROM public.remessas r
  WHERE r.loja_id = v_loja AND r.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_existente_hash IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION 'REMESSA_IDEMPOTENCY_PAYLOAD_DIVERGENTE';
    END IF;
    RETURN v_existente;
  END IF;
  RAISE;
END;
$function$;

CREATE FUNCTION public.criar_confirmar_remessa_entrada(
  p_origem text, p_observacao text, p_itens jsonb, p_idempotency_key text,
  p_ordem_compra_id uuid DEFAULT NULL::uuid, p_loja_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$SELECT public.fp_assert_loja(p_loja_id, false, 'criar_confirmar_remessa_entrada.p_loja_id');
SELECT public.fp_assert_loja(public.fp_loja_de('ordem_compra', p_ordem_compra_id), false, 'criar_confirmar_remessa_entrada.p_ordem_compra_id');
SELECT internal.criar_confirmar_remessa_entrada(p_origem => p_origem, p_observacao => p_observacao, p_itens => p_itens, p_idempotency_key => p_idempotency_key, p_ordem_compra_id => p_ordem_compra_id, p_loja_id => p_loja_id);$function$;

-- Grants iguais aos anteriores (public: authenticated + service_role; internal: service_role).
REVOKE ALL ON FUNCTION internal.criar_confirmar_remessa_entrada(text, text, jsonb, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION internal.criar_confirmar_remessa_entrada(text, text, jsonb, text, uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.criar_confirmar_remessa_entrada(text, text, jsonb, text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.criar_confirmar_remessa_entrada(text, text, jsonb, text, uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.criar_confirmar_remessa_entrada(text, text, jsonb, text, uuid, uuid) IS
  'S1: entrada sem documento (remessa). p_loja_id explícita (NULL = loja legada). Autorização por '
  'vínculo (fp_usuario_pode_loja); OC e produtos validados contra a loja escolhida.';

-- ---------------------------------------------------------------------------
-- Provas estruturais
-- ---------------------------------------------------------------------------
DO $prova$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'internal.receber_ordem_compra(uuid,jsonb,text,text)',
    'internal.confirmar_remessa_entrada(uuid)',
    'internal.confirmar_importacao_nfe(uuid)',
    'internal.transferir_estoque_seguro(uuid,uuid,uuid,numeric,text,text,numeric)',
    'internal.criar_confirmar_remessa_entrada(text,text,jsonb,text,uuid,uuid)'
  ] LOOP
    IF position('fp_usuario_pode_loja' IN pg_get_functiondef(f::regprocedure)) = 0 THEN
      RAISE EXCEPTION 'S1 PROVA FAIL: % sem fp_usuario_pode_loja', f;
    END IF;
  END LOOP;
  IF has_function_privilege('anon', 'public.criar_confirmar_remessa_entrada(text,text,jsonb,text,uuid,uuid)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.criar_confirmar_remessa_entrada(text,text,jsonb,text,uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'internal.criar_confirmar_remessa_entrada(text,text,jsonb,text,uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'S1 PROVA FAIL: grants da remessa';
  END IF;
  RAISE NOTICE 'S1 PROVA ESTRUTURAL OK';
END
$prova$;

NOTIFY pgrst, 'reload schema';
COMMIT;
