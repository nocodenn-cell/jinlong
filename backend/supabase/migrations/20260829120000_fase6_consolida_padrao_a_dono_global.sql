-- ============================================================================
-- Fase 6 do plano de remediação Jīn Lóng — PR2: consolida DONO no mesmo
-- escopo de ADMIN (Padrão A), fechando a inconsistência documentada no Mapa
-- Operacional de Usabilidade e decidida explicitamente pelo dono do produto
-- em 2026-08-29.
--
-- CONTEXTO — a decisão de produto que faltava:
-- O banco tinha (e em parte ainda tem, ver escopo abaixo) dois padrões
-- conflitantes de "quem é global" vs "quem é restrito à própria loja":
--
--   Padrão A — DONO+ADMIN globais, só GERENTE restrito:
--     descontos_venda (20260811110000), vinculos_fornecedor_produto,
--     transferir_estoque_seguro/transferir_estoque_entre_lojas/
--     confirmar_remessa_entrada (20260828140000, Fase 3).
--
--   Padrão B — só ADMIN global, GERENTE E DONO restritos:
--     atualizar_produto_com_faixa_atacado (20260816143000, comentário
--     explícito "ADMIN é global; demais perfis só mexem na própria loja" —
--     decisão deliberada na época, não descuido), ajustar_estoque_manual
--     (20260805151822).
--
-- Decisão: Padrão A é o canônico daqui pra frente. Esta migration converge
-- as duas funções do Padrão B para o Padrão A. Nenhuma outra parte do corpo
-- muda — só a condição de autorização.
--
-- ESCOPO DELIBERADAMENTE MENOR do que "toda inconsistência do Mapa":
--
--   NÃO tocado — criar_produto_com_estoque_inicial e
--   criar_confirmar_remessa_entrada: nenhuma das duas aceita um p_loja_id
--   de destino diferente da loja do próprio ator (a loja é sempre derivada
--   de usuarios.loja_id de quem chama) — não há uma comparação
--   ator-vs-alvo para relaxar, então não são uma instância do Padrão B.
--   Fazer DONO/ADMIN criar produto ou confirmar remessa EM OUTRA loja
--   exigiria um parâmetro novo de loja de destino — mudança de superfície
--   de API, não de autorização, fora do escopo desta PR.
--
--   NÃO tocado — categorias/marcas: não têm coluna loja_id (são
--   deliberadamente compartilhadas entre todas as lojas do tenant, sem
--   conceito de "loja dona"). Não são uma instância do Padrão C no mesmo
--   sentido de precos_atacado — não há loja para escopar. Se o negócio
--   decidir que só DONO/ADMIN devem poder editar taxonomia compartilhada,
--   isso é uma decisão de produto separada, não uma correção de bug.
--
--   NÃO tocado (revertido durante a revisão desta PR) — RLS de
--   precos_atacado. A versão inicial desta migration tentava fechar o
--   Padrão C aqui, mas `precosAtacadoActions.ts:13` documenta, explícito:
--   "Faixas são sempre globais (loja_id = NULL): este app opera com uma
--   loja". `criarFaixaAtacado` SEMPRE grava loja_id=NULL — não existe hoje
--   nenhum caminho de UI que crie uma faixa loja-escopada. Restringir
--   GERENTE a não escrever linha global quebraria o único fluxo que existe
--   (o campo simples de atacado no cadastro E o editor de múltiplas
--   faixas, ambos usados por GERENTE hoje) sem nenhum substituto — não é
--   fechar um gap, é quebrar a funcionalidade. Além disso,
--   `atualizar_produto_com_faixa_atacado` (SECURITY DEFINER) grava
--   precos_atacado por fora de qualquer RLS de tabela, então uma correção
--   só de RLS nem fecharia o caminho principal. Se/quando o negócio
--   precisar de preço de atacado por loja de verdade, isso é uma
--   FUNCIONALIDADE nova (UI + RPC), não um endurecimento de RLS — decisão
--   de produto separada, documentada aqui para não se perder.
--
-- Idempotente: ALTER POLICY e CREATE OR REPLACE FUNCTION.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. ajustar_estoque_manual — GERENTE restrito à própria loja; DONO/ADMIN
--    passam a poder ajustar estoque de qualquer loja, como ADMIN já podia
--    em outras RPCs. Único ponto de mudança: linha do guard de loja.
-- ============================================================================

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
  v_ativo boolean;
  v_atual numeric;
  v_delta numeric;
  v_tipo_codigo text;
  v_observacao text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AJUSTE_ESTOQUE_AUTH';
  END IF;

  SELECT u.perfil, u.loja_id, u.ativo
    INTO v_perfil, v_loja_usuario, v_ativo
  FROM public.usuarios u
  WHERE u.id = v_uid;

  -- SSOT-01: autorização deriva do papel no servidor, nunca de string enviada pelo
  -- cliente. A exceção anterior liberava OPERADOR quando `p_observacao` casava um
  -- literal mágico — e ambos os parâmetros são escolhidos por quem chama.
  IF v_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN') THEN
    RAISE EXCEPTION 'AJUSTE_ESTOQUE_PERFIL';
  END IF;

  -- Padrão A (Fase 6, 2026-08-29): só GERENTE é restrito à própria loja.
  -- DONO e ADMIN ajustam estoque de qualquer loja, igual a transferências e
  -- remessas (Fase 3). Antes desta migration, o guard bloqueava os três
  -- perfis igualmente — mais restritivo que qualquer outra RPC de estoque.
  --
  -- `OR NOT v_ativo`: achado de revisão — sem isto, um DONO/ADMIN
  -- desativado (usuarios.ativo=false) mas com token ainda válido passaria
  -- a ter alcance global em vez de continuar restrito à própria loja como
  -- ficava antes desta migration. Uma conta desativada nunca deve GANHAR
  -- alcance maior do que tinha.
  IF (v_perfil = 'GERENTE' OR NOT COALESCE(v_ativo, false))
     AND v_loja_usuario IS DISTINCT FROM p_loja_id THEN
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
  'Ajuste manual de estoque. GERENTE/DONO/ADMIN apenas — autorização deriva do papel no servidor, nunca de parâmetro do cliente (SSOT-01). Padrão A (2026-08-29): só GERENTE restrito à própria loja.';

REVOKE ALL ON FUNCTION public.ajustar_estoque_manual(uuid, uuid, numeric, numeric, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ajustar_estoque_manual(uuid, uuid, numeric, numeric, text, text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.ajustar_estoque_manual(uuid, uuid, numeric, numeric, text, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ajustar_estoque_manual(uuid, uuid, numeric, numeric, text, text, uuid) TO service_role;

-- ============================================================================
-- 2. atualizar_produto_com_faixa_atacado — mesma convergência. O comentário
--    original ("ADMIN é global; demais perfis só mexem na própria loja")
--    documentava uma decisão real da época (2026-08-16) — não um bug de
--    distração. A decisão de produto de 2026-08-29 a substitui: DONO junta
--    ADMIN no escopo global.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.atualizar_produto_com_faixa_atacado(
  p_produto_id uuid,
  p_payload jsonb,
  p_ator_id uuid DEFAULT NULL,
  p_faixa jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := COALESCE(auth.uid(), p_ator_id);
  v_perfil text;
  v_loja_ator uuid;
  v_ativo boolean;
  v_loja_produto uuid;
  v_qtd_min integer;
  v_preco_faixa numeric;
  v_faixa_id uuid;
  v_gatilho_anterior integer;
  v_desativadas integer := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'ATUALIZAR_PRODUTO_AUTH';
  END IF;

  SELECT u.perfil, u.loja_id, u.ativo INTO v_perfil, v_loja_ator, v_ativo
  FROM public.usuarios u WHERE u.id = v_uid;

  IF v_perfil IS NULL OR v_perfil NOT IN ('GERENTE', 'DONO', 'ADMIN') THEN
    RAISE EXCEPTION 'ATUALIZAR_PRODUTO_PERFIL';
  END IF;

  -- Gatilho ANTES do update: identifica qual faixa ativa é a derivada do
  -- catálogo, para poder trocá-la/removê-la depois. Precisa ser lido aqui,
  -- antes do UPDATE sobrescrever o valor.
  --
  -- FOR UPDATE é obrigatório, não otimização: sem o lock, duas edições
  -- simultâneas do MESMO produto leem ambas o gatilho antigo (ex.: 10), cada
  -- uma faz upsert do seu par novo (20 e 30) e cada uma desativa apenas a
  -- faixa 10 — resultado: o produto fica com um gatilho só, mas DUAS faixas
  -- derivadas ativas, exatamente a divergência que esta RPC existe para
  -- impedir. Com o lock, a segunda transação espera a primeira commitar e
  -- então lê o gatilho JÁ atualizado, desativando a faixa correta.
  -- Achado em auditoria de 2026-08-16; coberto por teste concorrente real em
  -- `backend/scripts/rls-produtos-tenant-rest-smoke.mjs`.
  SELECT p.loja_id, p.quantidade_gatilho_atacado
    INTO v_loja_produto, v_gatilho_anterior
  FROM public.produtos p WHERE p.id = p_produto_id
  FOR UPDATE;

  IF v_loja_produto IS NULL THEN
    RAISE EXCEPTION 'ATUALIZAR_PRODUTO_NAO_ENCONTRADO';
  END IF;

  -- Padrão A (Fase 6, 2026-08-29): DONO junta ADMIN no escopo global; só
  -- GERENTE fica restrito à própria loja. Substitui a decisão de
  -- 2026-08-16 ("ADMIN é global; demais perfis só mexem na própria loja"),
  -- agora superada pela consolidação de padrão em todo o sistema. Mesma
  -- mensagem de "não encontrado" para produto de outra loja — não confirma
  -- existência de produto fora do escopo do chamador.
  --
  -- `OR NOT v_ativo`: achado de revisão — sem isto, um DONO/ADMIN
  -- desativado (usuarios.ativo=false) mas com token ainda válido passaria
  -- a ter alcance global em vez de continuar restrito à própria loja como
  -- ficava antes desta migration. Uma conta desativada nunca deve GANHAR
  -- alcance maior do que tinha.
  IF (v_perfil = 'GERENTE' OR NOT COALESCE(v_ativo, false))
     AND (v_loja_ator IS NULL OR v_loja_ator <> v_loja_produto) THEN
    RAISE EXCEPTION 'ATUALIZAR_PRODUTO_NAO_ENCONTRADO';
  END IF;

  -- Ator para a trigger de histórico de preços (a RPC é SECURITY DEFINER e
  -- pode rodar sem auth.uid()). SET LOCAL: expira ao fim desta transação.
  PERFORM set_config('app.ator_id', v_uid::text, true);

  BEGIN
    UPDATE public.produtos SET
      nome = CASE WHEN p_payload ? 'nome' THEN NULLIF(BTRIM(p_payload->>'nome'), '') ELSE nome END,
      codigo_barras = CASE WHEN p_payload ? 'codigo_barras' THEN NULLIF(BTRIM(COALESCE(p_payload->>'codigo_barras','')), '') ELSE codigo_barras END,
      codigo_interno = CASE WHEN p_payload ? 'codigo_interno' THEN NULLIF(BTRIM(COALESCE(p_payload->>'codigo_interno','')), '') ELSE codigo_interno END,
      referencia_fornecedor = CASE WHEN p_payload ? 'referencia_fornecedor' THEN NULLIF(BTRIM(COALESCE(p_payload->>'referencia_fornecedor','')), '') ELSE referencia_fornecedor END,
      nome_reduzido_pdv = CASE WHEN p_payload ? 'nome_reduzido_pdv' THEN NULLIF(BTRIM(COALESCE(p_payload->>'nome_reduzido_pdv','')), '') ELSE nome_reduzido_pdv END,
      localizacao_prateleira = CASE WHEN p_payload ? 'localizacao_prateleira' THEN NULLIF(BTRIM(COALESCE(p_payload->>'localizacao_prateleira','')), '') ELSE localizacao_prateleira END,
      preco_varejo = CASE WHEN p_payload ? 'preco_varejo' THEN (p_payload->>'preco_varejo')::numeric ELSE preco_varejo END,
      preco_atacado = CASE WHEN p_payload ? 'preco_atacado' THEN NULLIF(p_payload->>'preco_atacado','')::numeric ELSE preco_atacado END,
      preco_custo = CASE WHEN p_payload ? 'preco_custo' THEN NULLIF(p_payload->>'preco_custo','')::numeric ELSE preco_custo END,
      permitir_abaixo_custo = CASE WHEN p_payload ? 'permitir_abaixo_custo' THEN (p_payload->>'permitir_abaixo_custo')::boolean ELSE permitir_abaixo_custo END,
      quantidade_gatilho_atacado = CASE WHEN p_payload ? 'quantidade_gatilho_atacado' THEN NULLIF(p_payload->>'quantidade_gatilho_atacado','')::integer ELSE quantidade_gatilho_atacado END,
      origem = CASE WHEN p_payload ? 'origem' THEN p_payload->>'origem' ELSE origem END,
      tem_nf = CASE WHEN p_payload ? 'tem_nf' THEN (p_payload->>'tem_nf')::boolean ELSE tem_nf END,
      unidade_medida = CASE WHEN p_payload ? 'unidade_medida' THEN COALESCE(NULLIF(BTRIM(p_payload->>'unidade_medida'), ''), 'UN') ELSE unidade_medida END,
      observacao = CASE WHEN p_payload ? 'observacao' THEN NULLIF(BTRIM(COALESCE(p_payload->>'observacao','')), '') ELSE observacao END,
      categoria_id = CASE WHEN p_payload ? 'categoria_id' THEN NULLIF(p_payload->>'categoria_id','')::uuid ELSE categoria_id END,
      marca_id = CASE WHEN p_payload ? 'marca_id' THEN NULLIF(p_payload->>'marca_id','')::uuid ELSE marca_id END,
      fornecedor_id = CASE WHEN p_payload ? 'fornecedor_id' THEN NULLIF(p_payload->>'fornecedor_id','')::uuid ELSE fornecedor_id END,
      ncm = CASE WHEN p_payload ? 'ncm' THEN NULLIF(BTRIM(COALESCE(p_payload->>'ncm','')), '') ELSE ncm END,
      cfop_produto = CASE WHEN p_payload ? 'cfop_produto' THEN NULLIF(BTRIM(COALESCE(p_payload->>'cfop_produto','')), '') ELSE cfop_produto END,
      csosn = CASE WHEN p_payload ? 'csosn' THEN NULLIF(BTRIM(COALESCE(p_payload->>'csosn','')), '') ELSE csosn END,
      cest = CASE WHEN p_payload ? 'cest' THEN NULLIF(BTRIM(COALESCE(p_payload->>'cest','')), '') ELSE cest END,
      cst_pis = CASE WHEN p_payload ? 'cst_pis' THEN NULLIF(BTRIM(COALESCE(p_payload->>'cst_pis','')), '') ELSE cst_pis END,
      cst_cofins = CASE WHEN p_payload ? 'cst_cofins' THEN NULLIF(BTRIM(COALESCE(p_payload->>'cst_cofins','')), '') ELSE cst_cofins END,
      status_publicacao = CASE WHEN p_payload ? 'status_publicacao' THEN p_payload->>'status_publicacao' ELSE status_publicacao END,
      ativo = CASE WHEN p_payload ? 'ativo' THEN (p_payload->>'ativo')::boolean ELSE ativo END,
      atualizado_por = v_uid
    WHERE id = p_produto_id;
  EXCEPTION
    WHEN unique_violation THEN
      IF SQLERRM ILIKE '%produtos_codigo_barras_loja_unique%' THEN
        RAISE EXCEPTION 'ATUALIZAR_PRODUTO_CODIGO_BARRAS_DUPLICADO';
      END IF;
      RAISE;
  END;

  -- ───────────────────────────────────────────────────────────────────────
  -- Faixa de atacado, na MESMA transação.
  -- ───────────────────────────────────────────────────────────────────────
  --
  -- QUAL FAIXA É "DO CATÁLOGO" (definição formal, adotada em 2026-08-16):
  -- o par (`produtos.quantidade_gatilho_atacado`, `produtos.preco_atacado`)
  -- corresponde a EXATAMENTE UMA faixa global ativa — aquela cuja
  -- `quantidade_minima` é igual ao gatilho do catálogo. Qualquer outra faixa
  -- ativa é considerada manual e NÃO é tocada aqui.
  IF p_faixa IS NOT NULL AND p_faixa <> 'null'::jsonb THEN
    v_qtd_min := NULLIF(p_faixa->>'quantidade_minima','')::integer;
    v_preco_faixa := NULLIF(p_faixa->>'preco_unitario','')::numeric;

    IF v_qtd_min IS NOT NULL AND v_preco_faixa IS NOT NULL THEN
      IF v_qtd_min <= 0 THEN
        RAISE EXCEPTION 'ATUALIZAR_PRODUTO_FAIXA_QTD_INVALIDA';
      END IF;
      IF v_preco_faixa <= 0 THEN
        RAISE EXCEPTION 'ATUALIZAR_PRODUTO_FAIXA_PRECO_INVALIDO';
      END IF;

      -- Upsert atômico sobre o índice único parcial
      -- `precos_atacado_global_prod_min (produto_id, quantidade_minima)
      --  WHERE loja_id IS NULL AND ativo = true`. Substitui o
      -- SELECT-então-INSERT/UPDATE da camada de aplicação: duas requisições
      -- concorrentes convergem em vez de uma receber unique_violation.
      INSERT INTO public.precos_atacado (produto_id, quantidade_minima, preco_unitario, loja_id, ativo)
      VALUES (p_produto_id, v_qtd_min, v_preco_faixa, NULL, true)
      ON CONFLICT (produto_id, quantidade_minima) WHERE loja_id IS NULL AND ativo = true
      DO UPDATE SET preco_unitario = EXCLUDED.preco_unitario
      RETURNING id INTO v_faixa_id;

      -- Troca de gatilho (ex.: 10 → 20): desativa a faixa derivada anterior.
      -- Só a que casava com o gatilho antigo — faixas manuais em outras
      -- quantidades permanecem ativas.
      IF v_gatilho_anterior IS NOT NULL
         AND v_gatilho_anterior > 0
         AND v_gatilho_anterior <> v_qtd_min THEN
        UPDATE public.precos_atacado
           SET ativo = false
         WHERE produto_id = p_produto_id
           AND loja_id IS NULL
           AND ativo = true
           AND quantidade_minima = v_gatilho_anterior;
        GET DIAGNOSTICS v_desativadas = ROW_COUNT;
      END IF;
    END IF;

  ELSIF p_payload ? 'preco_atacado' OR p_payload ? 'quantidade_gatilho_atacado' THEN
    -- Remoção: o catálogo mexeu em preço/gatilho de atacado e o resultado é
    -- "sem faixa" (a aplicação manda p_faixa = null). A faixa derivada
    -- anterior precisa ser desativada, senão o produto continua vendendo com
    -- preço de atacado que o catálogo já não declara.
    IF v_gatilho_anterior IS NOT NULL AND v_gatilho_anterior > 0 THEN
      UPDATE public.precos_atacado
         SET ativo = false
       WHERE produto_id = p_produto_id
         AND loja_id IS NULL
         AND ativo = true
         AND quantidade_minima = v_gatilho_anterior;
      GET DIAGNOSTICS v_desativadas = ROW_COUNT;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'produto_id', p_produto_id,
    'faixa_id', v_faixa_id,
    'faixa_sincronizada', (v_faixa_id IS NOT NULL),
    'faixas_desativadas', v_desativadas
  );
END;
$$;

COMMENT ON FUNCTION public.atualizar_produto_com_faixa_atacado(uuid, jsonb, uuid, jsonb) IS
  'Atualiza produto e sincroniza a faixa de atacado correspondente na mesma transação. '
  'Impede o estado parcial em que produtos.preco_atacado diverge de precos_atacado. '
  'Padrão A (2026-08-29): DONO junta ADMIN no escopo global; só GERENTE restrito à própria loja.';

REVOKE EXECUTE ON FUNCTION public.atualizar_produto_com_faixa_atacado(uuid, jsonb, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atualizar_produto_com_faixa_atacado(uuid, jsonb, uuid, jsonb) TO authenticated, service_role;

-- ============================================================================
-- VERIFICAÇÃO DE EFEITO — dentro da transação.
-- ============================================================================

DO $verify$
DECLARE
  v_def text;
BEGIN
  v_def := pg_get_functiondef('public.ajustar_estoque_manual(uuid,uuid,numeric,numeric,text,text,uuid)'::regprocedure);
  IF position('v_perfil = ''GERENTE'' OR NOT COALESCE(v_ativo, false)' IN v_def) = 0 THEN
    RAISE EXCEPTION 'FASE6_AJUSTE_ESTOQUE_GUARD_AUSENTE';
  END IF;

  v_def := pg_get_functiondef('public.atualizar_produto_com_faixa_atacado(uuid,jsonb,uuid,jsonb)'::regprocedure);
  IF position('v_perfil = ''GERENTE'' OR NOT COALESCE(v_ativo, false)' IN v_def) = 0 THEN
    RAISE EXCEPTION 'FASE6_ATUALIZAR_PRODUTO_GUARD_AUSENTE';
  END IF;

  RAISE NOTICE 'fase6_consolida_padrao_a_dono_global OK — ajustar_estoque_manual e atualizar_produto_com_faixa_atacado só restringem GERENTE (ou conta desativada); precos_atacado deliberadamente fora de escopo (ver cabeçalho).';
END
$verify$;

COMMIT;
