-- Backport Fase 1 (Git-only) from supabase_migrations.schema_migrations.statements
-- version: 20260805151822
-- name: 289_hardening_autorizacao_rpcs_p0
-- source: production read-only export (schema_migrations)
-- Applied in production: yes (do NOT re-run on production).

-- 289 — Pacote 1 / Bloco A: SEC-01, SEC-02, SSOT-01, TB-01.
-- Canônico: backend/supabase/migrations/289_hardening_autorizacao_rpcs_p0.sql

DO $sec01$
BEGIN
  IF to_regprocedure('public.baixar_estoque_venda(uuid,jsonb)') IS NULL THEN
    RAISE NOTICE 'SEC-01: baixar_estoque_venda não existe neste banco — nada a revogar';
  ELSE
    REVOKE ALL ON FUNCTION public.baixar_estoque_venda(uuid, jsonb) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.baixar_estoque_venda(uuid, jsonb) FROM anon;
    REVOKE ALL ON FUNCTION public.baixar_estoque_venda(uuid, jsonb) FROM authenticated;
    GRANT EXECUTE ON FUNCTION public.baixar_estoque_venda(uuid, jsonb) TO service_role;

    COMMENT ON FUNCTION public.baixar_estoque_venda(uuid, jsonb) IS
      'DEPRECADA (SEC-01, 2026-08-05). Sem migration de origem e sem chamador no repositório. Baixa estoque sem kardex — não usar. Candidata a DROP após evidência de zero invocação. Caminho canônico: decrementar_estoque_seguro.';
  END IF;
END
$sec01$;

CREATE OR REPLACE FUNCTION public.criar_produto_com_estoque_inicial(
  p_payload jsonb,
  p_ator_id uuid,
  p_request_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := COALESCE(auth.uid(), p_ator_id);
  v_perfil text;
  v_loja_id uuid;
  v_produto_id uuid;
  v_nome text;
  v_codigo_barras text;
  v_preco_varejo numeric;
  v_origem text;
  v_tem_nf boolean;
  v_ativo boolean;
  v_status text;
  v_qty numeric;
  v_min numeric;
  v_existing uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'CRIAR_PRODUTO_AUTH';
  END IF;

  SELECT u.perfil, u.loja_id
    INTO v_perfil, v_loja_id
  FROM public.usuarios u
  WHERE u.id = v_uid;

  -- Cadastro de produto pertence ao módulo Produtos (/admin/catalogo). O PDV não cadastra.
  -- Decisão de 2026-07-30 (.cursor/rules/entity-ssot.mdc) — RN-019.
  IF v_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN') THEN
    RAISE EXCEPTION 'CRIAR_PRODUTO_PERFIL';
  END IF;

  IF v_loja_id IS NULL THEN
    RAISE EXCEPTION 'CRIAR_PRODUTO_LOJA';
  END IF;

  IF p_request_id IS NOT NULL THEN
    SELECT r.produto_id INTO v_existing
    FROM public.produto_create_requests r
    WHERE r.request_id = p_request_id;

    IF v_existing IS NOT NULL THEN
      RETURN jsonb_build_object(
        'produto_id', v_existing,
        'replayed', true,
        'loja_id', v_loja_id
      );
    END IF;
  END IF;

  v_nome := NULLIF(BTRIM(COALESCE(p_payload->>'nome', '')), '');
  IF v_nome IS NULL OR char_length(v_nome) < 2 THEN
    RAISE EXCEPTION 'CRIAR_PRODUTO_NOME';
  END IF;

  v_codigo_barras := NULLIF(BTRIM(COALESCE(p_payload->>'codigo_barras', '')), '');
  v_preco_varejo := COALESCE((p_payload->>'preco_varejo')::numeric, 0);
  IF v_preco_varejo < 0 THEN
    RAISE EXCEPTION 'CRIAR_PRODUTO_PRECO';
  END IF;

  v_origem := COALESCE(p_payload->>'origem', 'china_manual');
  IF v_origem NOT IN ('china_manual', 'brasil_nf', 'brasil_sem_nf') THEN
    RAISE EXCEPTION 'CRIAR_PRODUTO_ORIGEM';
  END IF;

  v_tem_nf := COALESCE((p_payload->>'tem_nf')::boolean, false);
  v_ativo := COALESCE((p_payload->>'ativo')::boolean, true);
  v_status := COALESCE(NULLIF(BTRIM(p_payload->>'status_publicacao'), ''), 'PUBLICADO');
  IF v_status NOT IN ('DRAFT', 'PUBLICADO', 'INATIVO') THEN
    RAISE EXCEPTION 'CRIAR_PRODUTO_STATUS';
  END IF;

  v_qty := COALESCE((p_payload->>'estoque_inicial_quantidade')::numeric, 0);
  v_min := COALESCE((p_payload->>'estoque_inicial_minimo')::numeric, 0);
  IF v_qty < 0 OR v_min < 0 THEN
    RAISE EXCEPTION 'CRIAR_PRODUTO_ESTOQUE_INVALIDO';
  END IF;

  BEGIN
    INSERT INTO public.produtos (
      nome, codigo_barras, codigo_interno, referencia_fornecedor,
      nome_reduzido_pdv, localizacao_prateleira, preco_varejo, preco_atacado,
      preco_custo, permitir_abaixo_custo, quantidade_gatilho_atacado, origem,
      tem_nf, unidade_medida, observacao, categoria_id, marca_id, fornecedor_id,
      ncm, cfop_produto, csosn, cest, cst_pis, cst_cofins, ativo,
      status_publicacao, loja_id
    ) VALUES (
      v_nome,
      v_codigo_barras,
      NULLIF(BTRIM(COALESCE(p_payload->>'codigo_interno', '')), ''),
      NULLIF(BTRIM(COALESCE(p_payload->>'referencia_fornecedor', '')), ''),
      NULLIF(BTRIM(COALESCE(p_payload->>'nome_reduzido_pdv', '')), ''),
      NULLIF(BTRIM(COALESCE(p_payload->>'localizacao_prateleira', '')), ''),
      v_preco_varejo,
      CASE
        WHEN p_payload ? 'preco_atacado' AND NULLIF(p_payload->>'preco_atacado', '') IS NOT NULL
        THEN (p_payload->>'preco_atacado')::numeric ELSE NULL
      END,
      CASE
        WHEN p_payload ? 'preco_custo' AND NULLIF(p_payload->>'preco_custo', '') IS NOT NULL
        THEN (p_payload->>'preco_custo')::numeric ELSE NULL
      END,
      COALESCE((p_payload->>'permitir_abaixo_custo')::boolean, false),
      CASE
        WHEN p_payload ? 'quantidade_gatilho_atacado'
          AND NULLIF(p_payload->>'quantidade_gatilho_atacado', '') IS NOT NULL
        THEN (p_payload->>'quantidade_gatilho_atacado')::integer ELSE NULL
      END,
      v_origem,
      v_tem_nf,
      COALESCE(NULLIF(BTRIM(p_payload->>'unidade_medida'), ''), 'UN'),
      NULLIF(BTRIM(COALESCE(p_payload->>'observacao', '')), ''),
      NULLIF(p_payload->>'categoria_id', '')::uuid,
      NULLIF(p_payload->>'marca_id', '')::uuid,
      NULLIF(p_payload->>'fornecedor_id', '')::uuid,
      NULLIF(BTRIM(COALESCE(p_payload->>'ncm', '')), ''),
      NULLIF(BTRIM(COALESCE(p_payload->>'cfop_produto', '')), ''),
      NULLIF(BTRIM(COALESCE(p_payload->>'csosn', '')), ''),
      NULLIF(BTRIM(COALESCE(p_payload->>'cest', '')), ''),
      NULLIF(BTRIM(COALESCE(p_payload->>'cst_pis', '')), ''),
      NULLIF(BTRIM(COALESCE(p_payload->>'cst_cofins', '')), ''),
      v_ativo,
      v_status,
      v_loja_id
    )
    RETURNING id INTO v_produto_id;
  EXCEPTION
    WHEN unique_violation THEN
      IF SQLERRM ILIKE '%produtos_codigo_barras_loja_unique%' THEN
        RAISE EXCEPTION 'CRIAR_PRODUTO_CODIGO_BARRAS_DUPLICADO';
      END IF;
      RAISE;
  END;

  INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual, estoque_minimo)
  VALUES (v_produto_id, v_loja_id, 0, 0);

  IF v_qty > 0 OR v_min > 0 THEN
    PERFORM public.ajustar_estoque_manual(
      v_produto_id, v_loja_id, v_qty, v_min,
      'ACERTO_INVENTARIO', 'Estoque inicial no cadastro de produto', v_uid
    );
  END IF;

  IF p_request_id IS NOT NULL THEN
    INSERT INTO public.produto_create_requests (request_id, produto_id, loja_id, ator_id)
    VALUES (p_request_id, v_produto_id, v_loja_id, v_uid)
    ON CONFLICT (request_id) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'produto_id', v_produto_id,
    'replayed', false,
    'loja_id', v_loja_id,
    'estoque_aplicado', (v_qty > 0 OR v_min > 0)
  );
END;
$$;

COMMENT ON FUNCTION public.criar_produto_com_estoque_inicial(jsonb, uuid, uuid) IS
  'Cria produto + estoque inicial na mesma transação. GERENTE+ apenas — o PDV não cadastra produto (RN-019).';

REVOKE ALL ON FUNCTION public.criar_produto_com_estoque_inicial(jsonb, uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.criar_produto_com_estoque_inicial(jsonb, uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.criar_produto_com_estoque_inicial(jsonb, uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.criar_produto_com_estoque_inicial(jsonb, uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.ajustar_estoque_manual(
  p_produto_id uuid,
  p_loja_id uuid,
  p_quantidade_atual numeric,
  p_estoque_minimo numeric,
  p_motivo_codigo text,
  p_observacao text DEFAULT NULL,
  p_ator_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := COALESCE(auth.uid(), p_ator_id);
  v_perfil text;
  v_loja_usuario uuid;
  v_atual numeric;
  v_delta numeric;
  v_tipo_codigo text;
  v_observacao text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AJUSTE_ESTOQUE_AUTH';
  END IF;

  SELECT u.perfil, u.loja_id
    INTO v_perfil, v_loja_usuario
  FROM public.usuarios u
  WHERE u.id = v_uid;

  -- SSOT-01: autorização deriva do papel no servidor, nunca de string enviada pelo
  -- cliente. A exceção anterior liberava OPERADOR quando `p_observacao` casava um
  -- literal mágico — e ambos os parâmetros são escolhidos por quem chama.
  IF v_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN') THEN
    RAISE EXCEPTION 'AJUSTE_ESTOQUE_PERFIL';
  END IF;

  IF v_loja_usuario IS DISTINCT FROM p_loja_id THEN
    RAISE EXCEPTION 'AJUSTE_ESTOQUE_LOJA_INVALIDA';
  END IF;

  IF p_quantidade_atual IS NULL OR p_quantidade_atual < 0 THEN
    RAISE EXCEPTION 'AJUSTE_ESTOQUE_QTD_INVALIDA';
  END IF;

  IF p_estoque_minimo IS NULL OR p_estoque_minimo < 0 THEN
    RAISE EXCEPTION 'AJUSTE_ESTOQUE_MIN_INVALIDO';
  END IF;

  IF p_motivo_codigo NOT IN ('COMPRA', 'PERDA', 'QUEBRA', 'ACERTO_INVENTARIO', 'OUTRO') THEN
    RAISE EXCEPTION 'AJUSTE_ESTOQUE_MOTIVO_INVALIDO';
  END IF;

  IF p_motivo_codigo = 'OUTRO' AND COALESCE(BTRIM(p_observacao), '') = '' THEN
    RAISE EXCEPTION 'AJUSTE_ESTOQUE_OBSERVACAO_OBRIGATORIA';
  END IF;

  SELECT e.quantidade_atual
    INTO v_atual
  FROM public.estoque e
  WHERE e.loja_id = p_loja_id
    AND e.produto_id = p_produto_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'AJUSTE_ESTOQUE_LINHA_NAO_ENCONTRADA';
  END IF;

  v_delta := p_quantidade_atual - v_atual;

  UPDATE public.estoque e
  SET
    quantidade_atual = p_quantidade_atual,
    estoque_minimo = p_estoque_minimo,
    version = e.version + 1,
    updated_at = NOW()
  WHERE e.loja_id = p_loja_id
    AND e.produto_id = p_produto_id;

  IF v_delta <> 0 THEN
    IF v_delta > 0 THEN
      v_tipo_codigo := 'ENTRADA_AJUSTE';
    ELSIF p_motivo_codigo IN ('PERDA', 'QUEBRA') THEN
      v_tipo_codigo := 'SAIDA_AVARIA';
    ELSE
      v_tipo_codigo := 'SAIDA_AJUSTE';
    END IF;

    v_observacao := CONCAT(
      'motivo=', p_motivo_codigo,
      CASE
        WHEN COALESCE(BTRIM(p_observacao), '') = '' THEN ''
        ELSE ' | obs=' || BTRIM(p_observacao)
      END
    );

    INSERT INTO public.movimentos_estoque_log (
      loja_id,
      produto_id,
      tipo_codigo,
      quantidade_delta,
      remessa_id,
      usuario_id,
      observacao
    ) VALUES (
      p_loja_id,
      p_produto_id,
      v_tipo_codigo,
      v_delta,
      NULL,
      v_uid,
      v_observacao
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION public.ajustar_estoque_manual(uuid, uuid, numeric, numeric, text, text, uuid) IS
  'Ajuste manual de estoque. GERENTE/DONO/ADMIN apenas — autorização deriva do papel no servidor, nunca de parâmetro do cliente (SSOT-01).';

REVOKE ALL ON FUNCTION public.ajustar_estoque_manual(uuid, uuid, numeric, numeric, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ajustar_estoque_manual(uuid, uuid, numeric, numeric, text, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.ajustar_estoque_manual(uuid, uuid, numeric, numeric, text, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ajustar_estoque_manual(uuid, uuid, numeric, numeric, text, text, uuid) TO service_role;

DO $verify$
DECLARE
  v_def text;
BEGIN
  v_def := pg_get_functiondef('public.criar_produto_com_estoque_inicial(jsonb,uuid,uuid)'::regprocedure);
  IF position('''OPERADOR''' IN v_def) > 0 THEN
    RAISE EXCEPTION 'MIG289_SEC02_OPERADOR_REMANESCENTE';
  END IF;

  v_def := pg_get_functiondef('public.ajustar_estoque_manual(uuid,uuid,numeric,numeric,text,text,uuid)'::regprocedure);
  IF position('Estoque inicial no cadastro de produto' IN v_def) > 0 THEN
    RAISE EXCEPTION 'MIG289_SSOT01_STRING_MAGICA_REMANESCENTE';
  END IF;
  IF position('''OPERADOR''' IN v_def) > 0 THEN
    RAISE EXCEPTION 'MIG289_SSOT01_OPERADOR_REMANESCENTE';
  END IF;

  IF to_regprocedure('public.baixar_estoque_venda(uuid,jsonb)') IS NOT NULL THEN
    IF has_function_privilege('anon', 'public.baixar_estoque_venda(uuid,jsonb)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.baixar_estoque_venda(uuid,jsonb)', 'EXECUTE') THEN
      RAISE EXCEPTION 'MIG289_SEC01_GRANT_REMANESCENTE';
    END IF;
  END IF;

  IF has_function_privilege('anon', 'public.criar_produto_com_estoque_inicial(jsonb,uuid,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.criar_produto_com_estoque_inicial(jsonb,uuid,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'MIG289_CRIAR_PRODUTO_GRANT_CLIENTE';
  END IF;

  IF has_function_privilege('anon', 'public.ajustar_estoque_manual(uuid,uuid,numeric,numeric,text,text,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.ajustar_estoque_manual(uuid,uuid,numeric,numeric,text,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'MIG289_AJUSTAR_GRANT_CLIENTE';
  END IF;

  RAISE NOTICE '289 OK — SEC-01, SEC-02, SSOT-01 e TB-01 verificados no efeito';
END
$verify$;
