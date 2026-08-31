-- ============================================================
-- Onda 2 · Bloco 4 — CREATE de produto + faixa de atacado atômicos
-- ============================================================
--
-- FLUXO ATUAL (antes desta migration), reconstruído por leitura de código:
--   FORM (ProdutoFormModal.tsx)
--     → ACTION (app/admin/produtos/actions.ts → productWriter.ts)
--       → RPC criar_produto_com_estoque_inicial (20260816141000)
--           INSERT produtos (inclui preco_atacado/quantidade_gatilho_atacado
--             como colunas de CATÁLOGO — hoje só "sugestão de cadastro",
--             a RPC de preço na venda (calcular_preco_produto, D0) não lê
--             mais essas colunas em runtime)
--           INSERT estoque + ajustar_estoque_manual (mesma transação)
--         ← retorna produto_id
--       → (SEGUNDA chamada, transação SEPARADA) ProdutoFormModal.tsx:479
--         sincronizarFaixaAtacado(produtoId, precoAtacado, gatilho)
--           → listarFaixasAtacado / criarFaixaAtacado (precosAtacadoActions.ts)
--             INSERT precos_atacado — É ESSA TABELA que calcular_preco_produto
--             consulta de verdade na venda.
--
-- FRONTEIRA TRANSACIONAL QUEBRADA: entre o retorno da RPC de criação e a
-- chamada de `criarFaixaAtacado`. O comentário já existente em
-- `productUpdater.ts:216-241` (para o UPDATE) documenta o cenário real de
-- produção que motivou consertar isso: produto criado com gatilho X, faixa
-- correspondente nunca chegou a existir (rede caiu / processo derrubado /
-- RLS rejeitou a 2ª chamada) — o motor de preço da venda (`calcular_preco_produto`)
-- não encontra tier em `precos_atacado`, cai pro preço de varejo, e o produto
-- vende sem o desconto de atacado que o cadastro "prometia".
--
-- CENÁRIO DE FALHA DEMONSTRADO (produto criado + atacado falha):
--   1. RPC 270 roda e COMMITA — produto existe, com preco_atacado=150 e
--      quantidade_gatilho_atacado=10 gravados em `produtos` (colunas de
--      catálogo, sempre gravadas independente da faixa).
--   2. Requisição de `criarFaixaAtacado` falha (rede, RLS, timeout).
--   3. Estado residual: produto "parece" ter atacado configurado (os campos
--      do formulário mostram 150/10 ao reabrir), mas NENHUMA linha existe em
--      `precos_atacado` — a venda de 10+ unidades cobra preço de varejo
--      cheio, silenciosamente, sem qualquer erro visível pro operador.
--
-- POR QUE NÃO É NOVA ARQUITETURA: `atualizar_produto_com_faixa_atacado`
-- (20260829120000) já resolve exatamente este problema para EDIÇÃO — recebe
-- `p_faixa jsonb` e faz o upsert em `precos_atacado` na MESMA transação do
-- UPDATE de produtos. Esta migration replica o mesmo padrão pro CREATE: novo
-- parâmetro `p_faixa`, mesma validação, mesma tabela, mesma trigger de
-- margem (`trg_fn_precos_atacado_margem`, migration 124) — sem trigger nova,
-- sem tabela nova, sem RPC nova. Diferença estrutural única: CREATE não tem
-- "faixa derivada anterior" pra desativar (produto não existia antes), então
-- a lógica de troca-de-gatilho do UPDATE não se aplica aqui — é um INSERT
-- simples, mais simples que o caso do UPDATE.
--
-- CONTRATO TRANSACIONAL NOVO:
--   SUCESSO → produto + estoque/kardex + faixa de atacado (se enviada)
--             COMMITAM juntos, uma única chamada RPC.
--   FALHA   → qualquer etapa obrigatória (nome/preço inválido, faixa
--             inválida, margem negativa sem override) aborta a função
--             inteira — ROLLBACK automático do Postgres desfaz TUDO,
--             inclusive o INSERT em produtos que já tinha rodado.
--             Não pode existir "produto criado, faixa não" como resultado
--             desta RPC.
--
-- PRESERVADO (nada disto muda): autenticação (auth.uid()/p_ator_id),
-- autorização (perfil GERENTE/DONO/ADMIN, RN-019 — PDV não cadastra),
-- escopo de loja (v_loja_id do usuário autenticado), todas as validações
-- de campo já existentes, estoque inicial (ajustar_estoque_manual, mesma
-- transação de antes), regras financeiras (trigger de margem em produtos
-- CONTINUA valendo; a nova trigger de margem em precos_atacado passa a
-- valer também pro create, igual já valia pro update), autoria
-- (criado_por/atualizado_por), idempotência existente (p_request_id +
-- advisory lock), comportamento PT/ZH (mensagens de erro mapeadas na borda,
-- não aqui), e os contratos já usados pelo formulário (mesmos nomes de
-- parâmetro/retorno, só ADITIVOS).
--
-- NÃO ALTERADO: a decisão produto↔loja/tenant continua fora de escopo —
-- a faixa criada aqui é sempre `loja_id = NULL` (global), exatamente como o
-- UPDATE já fazia.
--
-- ⚠️ Preparada e testada (mock) na branch da Onda 2. Testes com PostgreSQL
-- real (rollback de verdade) NÃO EXECUTADOS neste ambiente — Docker
-- indisponível no sandbox. Ver backend/scripts/onda2-bloco4-rollback.sql
-- (script pronto pra rodar contra um Postgres real antes de aplicar em
-- produção).

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

  -- Cadastro de produto pertence ao módulo Produtos (/admin/catalogo). O PDV não cadastra.
  -- Decisão de 2026-07-30 (.cursor/rules/entity-ssot.mdc) — RN-019.
  IF v_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN') THEN
    RAISE EXCEPTION 'CRIAR_PRODUTO_PERFIL';
  END IF;

  IF v_loja_id IS NULL THEN
    RAISE EXCEPTION 'CRIAR_PRODUTO_LOJA';
  END IF;

  IF p_request_id IS NOT NULL THEN
    -- Serializa chamadas concorrentes com o MESMO request_id. Sem isto, duas
    -- requisições simultâneas passam as duas pelo SELECT abaixo (nenhuma vê a
    -- linha da outra, ainda não commitada), criam DOIS produtos, e só uma vence
    -- o ON CONFLICT DO NOTHING do registro do request — deixando um produto
    -- órfão, duplicado e fora da idempotência. O lock é de transação: a
    -- segunda chamada espera a primeira commitar e então enxerga o request já
    -- registrado, retornando replayed=true como deveria.
    -- Achado em auditoria de 2026-08-16.
    PERFORM pg_advisory_xact_lock(hashtextextended(p_request_id::text, 0));

    SELECT r.produto_id, r.loja_id INTO v_existing, v_req_loja
    FROM public.produto_create_requests r
    WHERE r.request_id = p_request_id;

    IF v_existing IS NOT NULL THEN
      -- Escopo de tenant no replay: um request_id é um identificador que o
      -- cliente escolhe. Reutilizado (por acidente ou de propósito) por alguém
      -- de OUTRA loja, a versão anterior devolvia o produto_id alheio — um
      -- oráculo cross-tenant. ADMIN é global, como nas demais regras.
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

  -- Faixa de atacado: valida ANTES de qualquer INSERT — se a faixa enviada é
  -- inválida, a função aborta aqui, produto nunca chega a ser criado (Caso B
  -- do teste de rollback: nenhum estado parcial, nem no cliente nem no banco).
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

  -- ───────────────────────────────────────────────────────────────────────
  -- Faixa de atacado, na MESMA transação (Onda 2 · Bloco 4).
  -- Produto é novo: não existe "faixa derivada anterior" pra desativar —
  -- diferente do UPDATE, aqui é sempre um INSERT simples. Mesma trigger de
  -- margem de precos_atacado (migration 124) se aplica automaticamente.
  -- ───────────────────────────────────────────────────────────────────────
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
  'única transação — sem estado parcial possível. Onda 2 · Bloco 4 estende a versão '
  'anterior (20260816141000) adicionando p_faixa, mesmo padrão de '
  'atualizar_produto_com_faixa_atacado (20260829120000) para o caminho de edição.';

-- ─────────────────────────────────────────────────────────────────────────
-- Achado em teste com Postgres real (não previsto na versão original desta
-- migration): `CREATE OR REPLACE FUNCTION` com uma assinatura DIFERENTE
-- (4 args em vez de 3) cria uma sobrecarga NOVA — não substitui a antiga.
-- Isso quebra duas coisas ao mesmo tempo, ambas já resolvidas antes neste
-- mesmo repositório para `fiscal_enfileirar_documento_venda`
-- (20260819220100_fase1b_fiscal_enfileirar_assinatura_unica.sql — mesmo
-- diagnóstico, mesmo fix, reaplicado aqui):
--
--   1. SUPERFÍCIE DE PERMISSÃO REABERTA: a sobrecarga de 3 args foi trancada
--      em `20260805151822_289_hardening_autorizacao_rpcs_p0.sql` (REVOKE ALL
--      FROM PUBLIC/anon/authenticated, GRANT só a service_role). A sobrecarga
--      NOVA de 4 args é um objeto pg_proc distinto — nasce com EXECUTE aberto
--      pra PUBLIC (comportamento padrão do Postgres), sem herdar nada da
--      antiga. Sem o REVOKE/GRANT abaixo, este RPC — que só deve ser chamado
--      via service_role (`createAdminClient()`, nunca client-side) — voltaria
--      a ser executável por `anon`/`authenticated`, desfazendo silenciosamente
--      o hardening P0 da migration 289.
--
--   2. AMBIGUIDADE DE CHAMADA: com as duas sobrecargas presentes, uma chamada
--      com só 3 argumentos (posicional ou nomeada, sem `p_faixa`) fica
--      ambígua — Postgres não sabe se é a de 3 args ou a de 4 usando o
--      default. Confirmado com `psql` real:
--      `ERROR: function ... is not unique`. O único chamador desta RPC no
--      app (`criarProdutoComEstoqueInicialRpc.ts`) sempre passa `p_faixa`
--      nomeado (mesmo que `null`), o que resolve sem ambiguidade — mas o
--      fallback de 3 argumentos que o próprio app usa quando detecta banco
--      sem esta migration (`rpcCriarProdutoFaixaAusente`) só é seguro
--      enquanto SÓ a sobrecarga antiga existir. Uma vez esta migration
--      aplicada, as duas overloads não podem coexistir sem ambiguidade real.
--
-- Fix: reafirma a superfície de permissão na sobrecarga nova (idêntica à que
-- a 289 já aplicava) e remove a sobrecarga de 3 args — ela não tem mais
-- nenhum consumidor (grep confirma: só `criarProdutoComEstoqueInicialRpc.ts`
-- chama esta função, e sempre com `p_faixa`).
REVOKE ALL ON FUNCTION public.criar_produto_com_estoque_inicial(jsonb, uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.criar_produto_com_estoque_inicial(jsonb, uuid, uuid, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.criar_produto_com_estoque_inicial(jsonb, uuid, uuid, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.criar_produto_com_estoque_inicial(jsonb, uuid, uuid, jsonb) TO service_role;

DO $$
BEGIN
  IF to_regprocedure('public.criar_produto_com_estoque_inicial(jsonb, uuid, uuid)') IS NOT NULL THEN
    EXECUTE 'DROP FUNCTION public.criar_produto_com_estoque_inicial(jsonb, uuid, uuid)';
    RAISE NOTICE 'BLOCO4: sobrecarga legada de 3 args removida — ambiguidade fechada, permissão consolidada numa função só.';
  ELSE
    RAISE NOTICE 'BLOCO4: sobrecarga de 3 args ausente — nada a remover.';
  END IF;
END;
$$;
