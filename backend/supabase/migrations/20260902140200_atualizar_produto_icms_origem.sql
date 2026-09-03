-- Fase C / Onda C2.6 (prontidão Focus NFe) — icms_origem no UPDATE de produto.
--
-- Simétrico à migration anterior (20260902140100), para o caminho de edição:
-- `atualizar_produto_com_faixa_atacado` (20260829120000) faz UPDATE public.produtos
-- SET com CASE WHEN p_payload ? '<campo>' explícito por coluna — a coluna nova
-- `icms_origem` precisa do mesmo tratamento, senão a edição de um produto via
-- este RPC nunca grava o campo mesmo que o formulário envie.
--
-- Mesmo padrão de csosn/cst_pis/cst_cofins: só altera quando a chave está
-- presente no payload (permite omitir o campo sem apagar o valor existente);
-- string vazia vira NULL (permite limpar deliberadamente); nenhuma inferência
-- de origem/país/canal. CHECK chk_produto_icms_origem_valido barra valor fora
-- de '0'..'8' (propaga como erro de banco, mesmo comportamento de qualquer
-- outro campo fiscal já existente nesta RPC).
--
-- Nenhuma outra mudança: autenticação, autorização (Padrão A — DONO+ADMIN
-- global, GERENTE só própria loja), faixa de atacado, lock FOR UPDATE — tudo
-- idêntico à versão anterior. Único trecho alterado: uma linha no SET.
--
-- ROLLBACK: reaplicar o CREATE OR REPLACE anterior, disponível em
-- 20260829120000_fase6_consolida_padrao_a_dono_global.sql (linhas 219-405).

BEGIN;

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

  SELECT p.loja_id, p.quantidade_gatilho_atacado
    INTO v_loja_produto, v_gatilho_anterior
  FROM public.produtos p WHERE p.id = p_produto_id
  FOR UPDATE;

  IF v_loja_produto IS NULL THEN
    RAISE EXCEPTION 'ATUALIZAR_PRODUTO_NAO_ENCONTRADO';
  END IF;

  IF (v_perfil = 'GERENTE' OR NOT COALESCE(v_ativo, false))
     AND (v_loja_ator IS NULL OR v_loja_ator <> v_loja_produto) THEN
    RAISE EXCEPTION 'ATUALIZAR_PRODUTO_NAO_ENCONTRADO';
  END IF;

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
      -- icms_origem: mesmo padrão de cst_pis/cst_cofins acima — só altera se a
      -- chave veio no payload; vazio vira NULL (limpeza deliberada); sem
      -- inferência automática. CHECK barra valor fora de '0'..'8'.
      icms_origem = CASE WHEN p_payload ? 'icms_origem' THEN NULLIF(BTRIM(COALESCE(p_payload->>'icms_origem','')), '') ELSE icms_origem END,
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

      INSERT INTO public.precos_atacado (produto_id, quantidade_minima, preco_unitario, loja_id, ativo)
      VALUES (p_produto_id, v_qtd_min, v_preco_faixa, NULL, true)
      ON CONFLICT (produto_id, quantidade_minima) WHERE loja_id IS NULL AND ativo = true
      DO UPDATE SET preco_unitario = EXCLUDED.preco_unitario
      RETURNING id INTO v_faixa_id;

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
  'Padrão A (2026-08-29): DONO junta ADMIN no escopo global; só GERENTE restrito à própria loja. '
  'Onda C2.6 (2026-09-02, prontidão Focus NFe): SET de icms_origem adicionado, sem default, sem inferência.';

REVOKE EXECUTE ON FUNCTION public.atualizar_produto_com_faixa_atacado(uuid, jsonb, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.atualizar_produto_com_faixa_atacado(uuid, jsonb, uuid, jsonb) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

DO $verify$
DECLARE
  v_def text;
BEGIN
  v_def := pg_get_functiondef('public.atualizar_produto_com_faixa_atacado(uuid, jsonb, uuid, jsonb)'::regprocedure);
  IF position('icms_origem = CASE WHEN p_payload ? ''icms_origem''' IN v_def) = 0 THEN
    RAISE EXCEPTION 'ATUALIZAR_PRODUTO_ICMS_ORIGEM_AUSENTE_NA_FUNCAO';
  END IF;
  -- Regressões pré-existentes continuam presentes (não sobrescritas por engano).
  IF position('v_perfil = ''GERENTE'' OR NOT COALESCE(v_ativo, false)' IN v_def) = 0 THEN
    RAISE EXCEPTION 'ATUALIZAR_PRODUTO_GUARD_PADRAO_A_AUSENTE';
  END IF;
  IF position('FOR UPDATE' IN v_def) = 0 THEN
    RAISE EXCEPTION 'ATUALIZAR_PRODUTO_LOCK_AUSENTE';
  END IF;
END
$verify$;

COMMIT;
