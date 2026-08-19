-- Produto + faixa de atacado em UMA transação, e autor explícito no histórico
-- de preços quando a alteração vem de contexto privilegiado.
--
-- PROBLEMA 1 (estado parcial): a edição de produto salvava em duas operações
-- independentes — primeiro `UPDATE produtos` (server action), depois a
-- sincronização da faixa em `precos_atacado` (outra action, orquestrada pelo
-- componente React). Se a segunda falhasse, o fluxo ainda reportava sucesso do
-- produto: `produtos.preco_atacado` ficava com o valor novo e `precos_atacado`
-- com o antigo — preço de catálogo divergente do preço que a RPC
-- `calcular_preco_produto` efetivamente aplica na venda. As constraints únicas
-- impedem faixa DUPLICADA, mas não impedem esse estado parcial.
--
-- PROBLEMA 2 (upsert não atômico): a sincronização fazia SELECT e então
-- decidia INSERT ou UPDATE. Duas requisições concorrentes podiam ambas observar
-- ausência; a constraint parcial salva a integridade, mas o segundo gravador
-- recebia erro cru de unique violation em vez de convergir.
--
-- PROBLEMA 3 (autoria em alteração privilegiada): a trigger de histórico de
-- preços grava `auth.uid()`. Em execução privilegiada (service_role, RPC, job)
-- `auth.uid()` é NULL e o evento fica sem autor — histórico real, atribuição
-- perdida.
--
-- SOLUÇÃO: uma RPC que aplica o payload do produto e faz o upsert da faixa na
-- mesma transação, e um canal explícito de ator (`app.ator_id`) que a trigger
-- de histórico lê como fallback de `auth.uid()`.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Ator explícito para alterações privilegiadas
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `current_setting('app.ator_id', true)` devolve NULL quando não definido (o
-- segundo argumento suprime o erro). Precedência: sessão real primeiro — um
-- ator informado por parâmetro nunca sobrepõe a identidade autenticada, só
-- preenche quando não há nenhuma. Definido com SET LOCAL, portanto some no fim
-- da transação e não vaza para outra requisição do mesmo pool.

CREATE OR REPLACE FUNCTION public.registrar_historico_preco_produto()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.preco_varejo  IS DISTINCT FROM OLD.preco_varejo
     OR NEW.preco_atacado IS DISTINCT FROM OLD.preco_atacado
     OR NEW.preco_custo   IS DISTINCT FROM OLD.preco_custo THEN
    INSERT INTO public.historico_precos_produto (
      produto_id,
      preco_varejo_anterior, preco_varejo_novo,
      preco_atacado_anterior, preco_atacado_novo,
      preco_custo_anterior, preco_custo_novo,
      alterado_por
    ) VALUES (
      NEW.id,
      OLD.preco_varejo, NEW.preco_varejo,
      OLD.preco_atacado, NEW.preco_atacado,
      OLD.preco_custo, NEW.preco_custo,
      COALESCE(
        auth.uid(),
        NULLIF(current_setting('app.ator_id', true), '')::uuid
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. RPC transacional: produto + faixa de atacado
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Contrato: recebe o mesmo payload de colunas que a camada de aplicação já
-- montava para o `UPDATE produtos` direto (`ProdutoUpdatePayload`), mais uma
-- faixa opcional. Chaves ausentes no jsonb preservam o valor atual — por isso
-- `p_payload ? 'chave'` em vez de COALESCE, que não distinguiria "ausente" de
-- "explicitamente NULL".
--
-- Autorização: a própria RPC revalida perfil e loja. Não confia em `p_loja_id`
-- vindo do chamador — compara com a loja do ator e com a loja do produto.

-- `p_ator_id` tem DEFAULT NULL de propósito: o chamador normal é o client de
-- SESSÃO, que já carrega `auth.uid()` — informar o ator é redundante ali. O
-- parâmetro existe só para chamadas privilegiadas (service_role), onde não há
-- sessão. Sem o default, o gerador de tipos do Supabase o marca como
-- obrigatório e não-nulo, divergindo do uso real (a aplicação passa null).
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

  SELECT u.perfil, u.loja_id INTO v_perfil, v_loja_ator
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

  -- Tenant: ADMIN é global; demais perfis só mexem na própria loja. Mesma
  -- mensagem de "não encontrado" para produto de outra loja — não confirma
  -- existência de produto fora do escopo do chamador.
  IF v_perfil <> 'ADMIN' AND (v_loja_ator IS NULL OR v_loja_ator <> v_loja_produto) THEN
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
  --
  -- Sem essa definição, a versão anterior desta RPC gravava o par novo mas
  -- deixava o antigo ativo: mudar o gatilho de 10 para 20 criava a faixa 20 e
  -- mantinha a 10 valendo, e remover preço/gatilho não desativava nada. Como
  -- `calcular_preco_produto` escolhe a faixa aplicável pela quantidade da
  -- venda, a faixa órfã continuava podendo prevalecer — ou seja, o catálogo e
  -- o preço efetivo seguiam sem fonte única de verdade, que é justamente o que
  -- esta RPC existe para garantir. Achado em auditoria de 2026-08-16.

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
    --
    -- O `ELSIF` é deliberado: um update que NÃO toca em atacado (mudar só o
    -- nome, p.ex.) manda p_faixa = null também, e nesse caso nada deve ser
    -- desativado. Por isso a condição exige que uma das duas chaves de atacado
    -- esteja presente no payload.
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
  'Impede o estado parcial em que produtos.preco_atacado diverge de precos_atacado.';

REVOKE EXECUTE ON FUNCTION public.atualizar_produto_com_faixa_atacado(uuid, jsonb, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atualizar_produto_com_faixa_atacado(uuid, jsonb, uuid, jsonb) TO authenticated, service_role;
