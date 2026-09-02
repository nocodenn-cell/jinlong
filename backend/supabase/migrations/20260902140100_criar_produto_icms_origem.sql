-- Fase C / Onda C2.6 (prontidão Focus NFe) — icms_origem no CREATE de produto.
--
-- `criar_produto_com_estoque_inicial` (20260831110000) faz INSERT INTO
-- produtos com lista explícita de colunas — a coluna nova `icms_origem`
-- (20260902140000_produtos_icms_origem.sql) não é persistida automaticamente
-- só por existir no schema. Esta migration recria a função verbatim,
-- adicionando `icms_origem` à lista de colunas/VALUES, no mesmo padrão de
-- extração de `p_payload` já usado para ncm/cfop_produto/csosn/cest/cst_pis/
-- cst_cofins (NULLIF(BTRIM(...), '') — string vazia vira NULL, sem trim
-- adicional porque os únicos valores válidos são dígitos únicos '0'..'8').
--
-- SEM DEFAULT, SEM INFERÊNCIA: quando o payload não traz `icms_origem` (ou
-- vem vazio), o produto é criado com NULL — nenhuma regra deriva de
-- `origem`/país/canal aqui. O CHECK da migration anterior barra qualquer
-- valor fora de '0'..'8'; o INSERT simplesmente propaga o erro (mesmo
-- comportamento de qualquer outro campo fiscal já existente nesta RPC).
--
-- Nenhuma outra mudança: autenticação, autorização, faixa de atacado,
-- idempotência (p_request_id), estoque inicial — tudo idêntico à versão
-- anterior. Único trecho alterado: a lista de colunas/valores do INSERT.
--
-- ROLLBACK: reaplicar o CREATE OR REPLACE anterior, disponível em
-- 20260831110000_criar_produto_faixa_atacado_atomica.sql.

BEGIN;

CREATE OR REPLACE FUNCTION public.criar_produto_com_estoque_inicial(
  p_payload jsonb,
  p_ator_id uuid,
  p_request_id uuid DEFAULT NULL,
  p_faixa jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
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
  v_req_loja uuid;
  v_qtd_min integer;
  v_preco_faixa numeric;
  v_faixa_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'CRIAR_PRODUTO_AUTH';
  END IF;

  SELECT u.perfil, u.loja_id
    INTO v_perfil, v_loja_id
  FROM public.usuarios u
  WHERE u.id = v_uid;

  IF v_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN') THEN
    RAISE EXCEPTION 'CRIAR_PRODUTO_PERFIL';
  END IF;

  IF v_loja_id IS NULL THEN
    RAISE EXCEPTION 'CRIAR_PRODUTO_LOJA';
  END IF;

  IF p_request_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));

    SELECT r.produto_id, r.loja_id INTO v_existing, v_req_loja
    FROM public.produto_create_requests r
    WHERE r.request_id = p_request_id;

    IF v_existing IS NOT NULL THEN
      IF v_perfil <> 'ADMIN' AND v_req_loja IS DISTINCT FROM v_loja_id THEN
        RAISE EXCEPTION 'CRIAR_PRODUTO_REQUEST_OUTRA_LOJA';
      END IF;

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

  IF p_faixa IS NOT NULL AND p_faixa <> 'null'::jsonb THEN
    v_qtd_min := NULLIF(p_faixa->>'quantidade_minima', '')::integer;
    v_preco_faixa := NULLIF(p_faixa->>'preco_unitario', '')::numeric;

    IF v_qtd_min IS NOT NULL AND v_preco_faixa IS NOT NULL THEN
      IF v_qtd_min <= 0 THEN
        RAISE EXCEPTION 'CRIAR_PRODUTO_FAIXA_QTD_INVALIDA';
      END IF;
      IF v_preco_faixa <= 0 THEN
        RAISE EXCEPTION 'CRIAR_PRODUTO_FAIXA_PRECO_INVALIDO';
      END IF;
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.produtos (
      nome, codigo_barras, codigo_interno, referencia_fornecedor,
      nome_reduzido_pdv, localizacao_prateleira, preco_varejo, preco_atacado,
      preco_custo, permitir_abaixo_custo, quantidade_gatilho_atacado, origem,
      tem_nf, unidade_medida, observacao, categoria_id, marca_id, fornecedor_id,
      ncm, cfop_produto, csosn, cest, cst_pis, cst_cofins, icms_origem, ativo,
      status_publicacao, loja_id,
      criado_por, atualizado_por
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
      -- icms_origem: SEM default, SEM inferência de origem/país/canal — string
      -- vazia vira NULL como qualquer outro campo fiscal opcional acima; o
      -- CHECK chk_produto_icms_origem_valido barra qualquer valor fora de
      -- '0'..'8' (a exceção propaga como erro de banco, sem tratamento
      -- especial nesta RPC).
      NULLIF(BTRIM(COALESCE(p_payload->>'icms_origem', '')), ''),
      v_ativo,
      v_status,
      v_loja_id,
      v_uid,
      v_uid
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

  IF v_qtd_min IS NOT NULL AND v_preco_faixa IS NOT NULL THEN
    INSERT INTO public.precos_atacado (produto_id, quantidade_minima, preco_unitario, loja_id, ativo)
    VALUES (v_produto_id, v_qtd_min, v_preco_faixa, NULL, true)
    RETURNING id INTO v_faixa_id;
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
    'estoque_aplicado', (v_qty > 0 OR v_min > 0),
    'faixa_id', v_faixa_id,
    'faixa_sincronizada', (v_faixa_id IS NOT NULL)
  );
END;
$function$;

COMMENT ON FUNCTION public.criar_produto_com_estoque_inicial(jsonb, uuid, uuid, jsonb) IS
  'Cria produto + estoque inicial (+kardex) + faixa de atacado (se enviada) numa '
  'única transação — sem estado parcial possível. Onda C2.6 (2026-09-02, prontidão '
  'Focus NFe) estende 20260831110000 adicionando icms_origem ao INSERT — sem '
  'default, sem inferência de origem/país/canal.';

REVOKE ALL ON FUNCTION public.criar_produto_com_estoque_inicial(jsonb, uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.criar_produto_com_estoque_inicial(jsonb, uuid, uuid, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.criar_produto_com_estoque_inicial(jsonb, uuid, uuid, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.criar_produto_com_estoque_inicial(jsonb, uuid, uuid, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';

DO $verify$
DECLARE
  v_def text;
BEGIN
  v_def := pg_get_functiondef('public.criar_produto_com_estoque_inicial(jsonb, uuid, uuid, jsonb)'::regprocedure);
  IF position('icms_origem' IN v_def) = 0 THEN
    RAISE EXCEPTION 'CRIAR_PRODUTO_ICMS_ORIGEM_AUSENTE_NA_FUNCAO';
  END IF;
  -- Regressão: assinatura de 4 args continua única (sem overload ambígua reaberta).
  IF (
    SELECT count(*) FROM pg_proc
    WHERE proname = 'criar_produto_com_estoque_inicial' AND pronamespace = 'public'::regnamespace
  ) <> 1 THEN
    RAISE EXCEPTION 'CRIAR_PRODUTO_OVERLOAD_INESPERADA';
  END IF;
END
$verify$;

COMMIT;
