-- ROLLBACK da migration 20260918100000 (OC recebimento parcial) — projeto jinlong (kbabmewnahysfvlybiak)
-- Definicoes ANTERIORES de producao, capturadas por SELECT em 2026-10-02 antes da aplicacao.
-- Hashes capturados em producao (md5 do corpo normalizado / md5 da definicao completa):
--   receber_ordem_compra(uuid)                      fd40bff55215 / b48df12bc6d37842e29212605266a129
--   criar_confirmar_remessa_entrada(4 args)         29f2a68f2686 / dd539ce67f3bc836b816dc161dd05014
--   confirmar_importacao_nfe(uuid)                  ff845f1bd31f / f0ebb275bfbd8a4323be1946fa452f29
-- ACL anterior das 3: {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- Colunas e tabela novas (aditivas, vazias) PODEM FICAR. Este script restaura o estado de ANTES (lista de Compras
-- continuaria quebrada). NAO EXECUTAR sem autorizacao.

BEGIN;

DROP TRIGGER IF EXISTS trg_oc_guarda_status ON public.ordens_compra;
DROP TRIGGER IF EXISTS trg_oci_guarda_recebido ON public.ordens_compra_itens;
DROP TRIGGER IF EXISTS trg_oc_recebimentos_imutavel ON public.ordens_compra_recebimentos;

DROP FUNCTION IF EXISTS public.receber_ordem_compra(uuid, jsonb, text, text);
DROP FUNCTION IF EXISTS public.criar_confirmar_remessa_entrada(text, text, jsonb, text, uuid);
DROP FUNCTION IF EXISTS public.encerrar_ordem_compra_com_falta(uuid, text);
DROP FUNCTION IF EXISTS public.vincular_importacao_nfe_ordem_compra(uuid, uuid);
DROP FUNCTION IF EXISTS public._oc_creditar_item(uuid, uuid, uuid, uuid, numeric, text, uuid, uuid, uuid, uuid, numeric, text, text, text);
DROP FUNCTION IF EXISTS public._oc_abater_por_produto(uuid, uuid, uuid, text, uuid, uuid, uuid, uuid, numeric, numeric, uuid, text, boolean);
DROP FUNCTION IF EXISTS public._oc_atualizar_estado(uuid);
DROP FUNCTION IF EXISTS public._oc_resumo_json(uuid);
DROP FUNCTION IF EXISTS public.trg_oc_recebimentos_imutavel();
DROP FUNCTION IF EXISTS public.trg_oc_guarda_status();
DROP FUNCTION IF EXISTS public.trg_oci_guarda_recebido();

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

CREATE OR REPLACE FUNCTION public.criar_confirmar_remessa_entrada(
  p_origem text,
  p_observacao text,
  p_itens jsonb,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
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
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'REMESSA_AUTH'; END IF;

  SELECT u.loja_id INTO v_loja
  FROM public.usuarios u
  WHERE u.id = v_uid AND u.ativo AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN');
  IF NOT FOUND OR v_loja IS NULL THEN RAISE EXCEPTION 'REMESSA_PERFIL'; END IF;

  p_origem := NULLIF(btrim(COALESCE(p_origem, '')), '');
  p_idempotency_key := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
  IF p_origem IS NULL THEN RAISE EXCEPTION 'REMESSA_ORIGEM'; END IF;
  IF p_idempotency_key IS NULL THEN RAISE EXCEPTION 'REMESSA_IDEMPOTENCY_KEY'; END IF;

  v_observacao_norm := NULLIF(btrim(COALESCE(p_observacao, '')), '');

  -- Canonicaliza os itens por produto_id (extração como texto — best-effort,
  -- não exige o payload já validado; itens malformados só produzem um hash
  -- diferente, o que é o comportamento desejado). Achado de code review
  -- (#339, P2): guarda de tipo ANTES de expandir — `jsonb_array_elements`
  -- lança erro nativo do Postgres (não a exceção limpa REMESSA_ITENS_VAZIOS)
  -- se `p_itens` não for array; isso quebraria o contrato de erro estabelecido
  -- da RPC antes mesmo de chegar no guard explícito mais abaixo.
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

  -- Achado de code review (#339, P2): concatenação com delimitador '~' é
  -- ambígua quando origem/observação (texto livre, sem restrição de forma)
  -- contêm o próprio delimitador — origem='a~b', observacao='c' e origem='a',
  -- observacao='b~c' produziam o mesmo hash. jsonb_build_object serializa
  -- cada campo como string JSON propriamente escapada — o texto de um campo
  -- não pode mais "vazar" para o campo vizinho na representação final.
  v_payload_hash := md5(
    jsonb_build_object(
      'origem', COALESCE(p_origem, ''),
      'observacao', COALESCE(v_observacao_norm, ''),
      'itens', COALESCE(v_itens_canon, '[]'::jsonb)
    )::text
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

  INSERT INTO public.remessas(
    loja_id, origem_descricao, status, observacao, created_by, idempotency_key, payload_hash
  ) VALUES (
    v_loja, p_origem, 'EM_CONFERENCIA', v_observacao_norm,
    v_uid, p_idempotency_key, v_payload_hash
  ) RETURNING id INTO v_remessa;

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
      v_observacao_norm
    );
  END LOOP;

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

CREATE OR REPLACE FUNCTION public.confirmar_importacao_nfe(p_importacao_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_perfil       text;
  v_loja_usuario uuid;
  v_imp          record;
  v_it           record;
  v_dup          record;
  v_pendentes    int;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'IMPORT_NFE_AUTH';
  END IF;

  SELECT u.perfil, u.loja_id INTO v_perfil, v_loja_usuario
    FROM public.usuarios u WHERE u.id = v_uid;

  IF v_perfil IS NULL OR v_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN') THEN
    RAISE EXCEPTION 'IMPORT_NFE_PERFIL';
  END IF;

  SELECT id, loja_id, fornecedor_id, numero_nf, status INTO v_imp
    FROM public.importacoes_nfe
   WHERE id = p_importacao_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'IMPORT_NFE_NAO_ENCONTRADA';
  END IF;

  IF v_perfil = 'GERENTE' AND v_loja_usuario IS DISTINCT FROM v_imp.loja_id THEN
    RAISE EXCEPTION 'IMPORT_NFE_LOJA';
  END IF;

  IF v_imp.status <> 'EM_CONFERENCIA' THEN
    RAISE EXCEPTION 'IMPORT_NFE_STATUS_INVALIDO';
  END IF;

  SELECT count(*) INTO v_pendentes
    FROM public.importacoes_nfe_itens
   WHERE importacao_nfe_id = p_importacao_id AND status_conferencia = 'EM_CONFERENCIA';

  IF v_pendentes > 0 THEN
    RAISE EXCEPTION 'IMPORT_NFE_CONFERENCIA_PENDENTE';
  END IF;

  FOR v_it IN
    SELECT produto_id, quantidade_conferida, custo_unitario, atualizar_custo, status_conferencia
      FROM public.importacoes_nfe_itens
     WHERE importacao_nfe_id = p_importacao_id
  LOOP
    IF v_it.quantidade_conferida IS NOT NULL AND v_it.quantidade_conferida > 0 THEN
      INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual, estoque_minimo, version)
      VALUES (v_it.produto_id, v_imp.loja_id, v_it.quantidade_conferida, 0, 1)
      ON CONFLICT (loja_id, produto_id) DO UPDATE
        SET quantidade_atual = public.estoque.quantidade_atual + EXCLUDED.quantidade_atual,
            version          = public.estoque.version + 1,
            updated_at       = now();

      INSERT INTO public.movimentos_estoque_log (
        loja_id, produto_id, tipo_codigo, quantidade_delta, usuario_id, observacao
      ) VALUES (
        v_imp.loja_id,
        v_it.produto_id,
        'ENTRADA_NFE',
        v_it.quantidade_conferida,
        v_uid,
        format('Importação NF-e %s (conferido%s)', p_importacao_id::text,
               CASE WHEN v_it.status_conferencia = 'DIVERGENTE' THEN ', divergente da nota' ELSE '' END)
      );
    END IF;

    IF v_it.atualizar_custo AND v_it.custo_unitario > 0 THEN
      -- Predicado alinhado a trg_fn_produtos_margem (125): IS NOT TRUE trata
      -- preco_varejo NULL como o trigger (IF NULL não levanta). Sem isto o
      -- UPDATE aborta a transação e o estoque conferido nunca entra.
      UPDATE public.produtos p
         SET preco_custo = v_it.custo_unitario,
             updated_at  = now()
       WHERE p.id = v_it.produto_id
         AND (
           p.permitir_abaixo_custo
           OR (
             (p.preco_varejo < v_it.custo_unitario) IS NOT TRUE
             AND (p.preco_atacado IS NULL OR p.preco_atacado >= v_it.custo_unitario)
           )
         );
    END IF;
  END LOOP;

  FOR v_dup IN
    SELECT numero_duplicata, data_vencimento, valor
      FROM public.importacoes_nfe_duplicatas
     WHERE importacao_nfe_id = p_importacao_id
  LOOP
    INSERT INTO public.contas_pagar (
      nfe_importacao_id, fornecedor_id, loja_id, nfe_numero, vencimento, valor_total, status
    ) VALUES (
      p_importacao_id, v_imp.fornecedor_id, v_imp.loja_id, v_dup.numero_duplicata,
      v_dup.data_vencimento, v_dup.valor, 'PENDENTE'
    );
  END LOOP;

  UPDATE public.importacoes_nfe
     SET status = 'CONCLUIDA'
   WHERE id = p_importacao_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.receber_ordem_compra(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.criar_confirmar_remessa_entrada(text, text, jsonb, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.confirmar_importacao_nfe(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.receber_ordem_compra(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.criar_confirmar_remessa_entrada(text, text, jsonb, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.confirmar_importacao_nfe(uuid) FROM PUBLIC, anon;

NOTIFY pgrst, 'reload schema';

COMMIT;
