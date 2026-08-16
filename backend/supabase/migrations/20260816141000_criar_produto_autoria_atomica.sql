-- Autoria de criação preenchida DENTRO da transação da RPC.
--
-- PROBLEMA: `criar_produto_com_estoque_inicial` roda como service_role, então
-- `auth.uid()` é NULL no contexto e a trigger BEFORE INSERT não tinha ator para
-- gravar. A camada de aplicação compensava com um UPDATE de acompanhamento
-- logo após o create (`app/admin/produtos/productWriter.ts`). Consequência: a
-- criação do produto e o registro de quem criou não eram atômicos — uma falha
-- entre a RPC e o follow-up (rede, processo derrubado, RLS) deixava o produto
-- criado com `criado_por` NULL, sem trilha.
--
-- SOLUÇÃO: a RPC já recebe `p_ator_id` explicitamente e já o valida (perfil e
-- loja) antes de inserir — logo já sabe o autor no momento do INSERT. Passa a
-- gravar `criado_por`/`atualizado_por` na própria instrução, dentro da mesma
-- transação do produto + estoque + kardex. O follow-up da aplicação deixa de
-- ser o caminho da autoria e vira apenas rede de segurança para produtos
-- criados antes desta migration (o UPDATE tem guarda `criado_por IS NULL`).
--
-- Único delta em relação à versão vigente (289): duas colunas no INSERT.
-- Restante idêntico, para manter o hardening de autorização já auditado.
--
-- Interação com as triggers de autoria: `registrar_criado_por_produto` só
-- escreve quando `NEW.criado_por IS NULL`, então o valor explícito daqui vence
-- e as triggers seguem cobrindo os inserts feitos pelo client de sessão.

CREATE OR REPLACE FUNCTION public.criar_produto_com_estoque_inicial(
  p_payload jsonb,
  p_ator_id uuid,
  p_request_id uuid DEFAULT NULL
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
      v_ativo,
      v_status,
      v_loja_id,
      -- Autoria na mesma transação: sem follow-up, sem janela de falha.
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
$function$;
