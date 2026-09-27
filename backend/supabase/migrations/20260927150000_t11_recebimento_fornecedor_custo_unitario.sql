-- T11 (auditoria Jinlong 2026-09-27): recebimento de mercadoria sem custo e
-- sem fornecedor do cadastro.
--
-- Correção mínima (fora de escopo: unificar Compras, Recebimento e NF-e —
-- fica como dívida técnica, Jinlong/decisoes ainda a registrar):
--   1. remessas ganha fornecedor_id (FK cadastro) + documento (texto livre,
--      ex. número da NF/nota do fornecedor). origem_descricao continua
--      NOT NULL: quando fornecedor_id é enviado, ela é derivada do nome do
--      fornecedor (compat retroativa — os 3 callers legados em
--      backend/scripts/*.test.sql continuam mandando origem em texto livre,
--      sem fornecedor, e seguem funcionando sem alteração).
--   2. remessa_itens ganha custo_unitario (opcional na RPC/schema — a UI
--      nova passa a exigi-lo; scripts legados que não mandam continuam OK).
--      Quando informado, atualiza produtos.preco_custo por média ponderada
--      (estoque antes × custo antes + qtd recebida × custo novo) / total.
--   3. O kardex (movimentos_estoque_log.observacao, já exibido no Sheet de
--      estoque) passa a registrar fornecedor + documento + quem recebeu —
--      "origem, usuário e documento" do aceite, sem precisar de coluna nova
--      nem mudança na view/UI do kardex.
--
-- Assinatura da RPC: `CREATE OR REPLACE FUNCTION` com uma lista de
-- parâmetros DIFERENTE (mesmo só acrescentando novos com DEFAULT no final)
-- não substitui a função existente — cria um OVERLOAD. Comprovado rodando
-- as duas versões lado a lado num Postgres real: uma chamada com 4
-- argumentos literais passou a ser ambígua entre "a função de 4 args" e "a
-- de 6 args com os 2 últimos por default", e o Postgres recusa escolher
-- (`is not unique`). Por isso o `DROP FUNCTION` explícito da assinatura
-- antiga abaixo, antes do `CREATE OR REPLACE` — sem ele, os 3 scripts de
-- smoke/gate em backend/scripts/*.test.sql (que chamam com 4 args
-- posicionais) quebrariam ao lado da própria action nova.
-- payload_hash (idempotência, Fase 4) passa a cobrir os campos novos —
-- senão um retry com o MESMO idempotency_key mas fornecedor/documento/custo
-- diferentes devolveria sucesso silencioso com o registro antigo.

BEGIN;

DROP FUNCTION IF EXISTS public.criar_confirmar_remessa_entrada(text, text, jsonb, text);

ALTER TABLE public.remessas
  ADD COLUMN IF NOT EXISTS fornecedor_id uuid REFERENCES public.fornecedores(id),
  ADD COLUMN IF NOT EXISTS documento text;

COMMENT ON COLUMN public.remessas.fornecedor_id IS
  'T11 (2026-09-27): fornecedor do cadastro. NULL em remessas anteriores a esta migration (origem em texto livre).';
COMMENT ON COLUMN public.remessas.documento IS
  'T11 (2026-09-27): referência do documento físico do recebimento (ex. número da NF/nota do fornecedor). Texto livre, opcional.';

ALTER TABLE public.remessa_itens
  ADD COLUMN IF NOT EXISTS custo_unitario numeric(10,2)
    CHECK (custo_unitario IS NULL OR custo_unitario >= 0);

COMMENT ON COLUMN public.remessa_itens.custo_unitario IS
  'T11 (2026-09-27): custo unitário de aquisição desta remessa. Opcional no schema (compat com callers legados); a UI de recebimento passa a exigir. Quando informado, atualiza produtos.preco_custo por média ponderada.';

CREATE OR REPLACE FUNCTION public.criar_confirmar_remessa_entrada(
  p_origem text,
  p_observacao text,
  p_itens jsonb,
  p_idempotency_key text,
  p_fornecedor_id uuid DEFAULT NULL,
  p_documento text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_loja uuid;
  v_usuario_nome text;
  v_fornecedor_nome text;
  v_remessa uuid;
  v_existente uuid;
  v_existente_hash text;
  v_item jsonb;
  v_produto uuid;
  v_esperada numeric;
  v_conferida numeric;
  v_custo_unitario numeric;
  v_custo_atual numeric;
  v_estoque_antes numeric;
  v_novo_custo_medio numeric;
  v_observacao_norm text;
  v_documento_norm text;
  v_observacao_mov text;
  v_itens_canon jsonb;
  v_payload_hash text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'REMESSA_AUTH'; END IF;

  SELECT u.loja_id, u.nome INTO v_loja, v_usuario_nome
  FROM public.usuarios u
  WHERE u.id = v_uid AND u.ativo AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN');
  IF NOT FOUND OR v_loja IS NULL THEN RAISE EXCEPTION 'REMESSA_PERFIL'; END IF;

  p_idempotency_key := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
  IF p_idempotency_key IS NULL THEN RAISE EXCEPTION 'REMESSA_IDEMPOTENCY_KEY'; END IF;

  -- T11: Origem vira o nome do fornecedor do cadastro quando informado —
  -- origem_descricao (NOT NULL, exibida na lista de remessas) é derivada
  -- dele. Sem fornecedor_id, mantém o texto livre legado.
  IF p_fornecedor_id IS NOT NULL THEN
    SELECT f.nome INTO v_fornecedor_nome
    FROM public.fornecedores f
    WHERE f.id = p_fornecedor_id AND f.loja_id = v_loja;
    IF NOT FOUND THEN RAISE EXCEPTION 'REMESSA_FORNECEDOR_INVALIDO'; END IF;
    p_origem := v_fornecedor_nome;
  ELSE
    p_origem := NULLIF(btrim(COALESCE(p_origem, '')), '');
  END IF;
  IF p_origem IS NULL THEN RAISE EXCEPTION 'REMESSA_ORIGEM'; END IF;

  v_observacao_norm := NULLIF(btrim(COALESCE(p_observacao, '')), '');
  v_documento_norm := NULLIF(btrim(COALESCE(p_documento, '')), '');

  -- Canonicaliza os itens por produto_id (extração como texto — best-effort,
  -- não exige o payload já validado; itens malformados só produzem um hash
  -- diferente, o que é o comportamento desejado). Guarda de tipo ANTES de
  -- expandir — `jsonb_array_elements` lança erro nativo do Postgres (não a
  -- exceção limpa REMESSA_ITENS_VAZIOS) se `p_itens` não for array.
  IF p_itens IS NOT NULL AND jsonb_typeof(p_itens) = 'array' THEN
    SELECT jsonb_agg(
      jsonb_build_object(
        'produto_id', COALESCE(elem->>'produto_id', ''),
        'quantidade_esperada', COALESCE(elem->>'quantidade_esperada', ''),
        'quantidade_conferida', COALESCE(elem->>'quantidade_conferida', ''),
        'custo_unitario', COALESCE(elem->>'custo_unitario', '')
      ) ORDER BY elem->>'produto_id'
    )
    INTO v_itens_canon
    FROM jsonb_array_elements(p_itens) elem;
  END IF;

  -- jsonb_build_object serializa cada campo como string JSON propriamente
  -- escapada — texto livre em qualquer campo não "vaza" para o vizinho.
  v_payload_hash := md5(
    jsonb_build_object(
      'origem', COALESCE(p_origem, ''),
      'observacao', COALESCE(v_observacao_norm, ''),
      'itens', COALESCE(v_itens_canon, '[]'::jsonb),
      'fornecedor_id', COALESCE(p_fornecedor_id::text, ''),
      'documento', COALESCE(v_documento_norm, '')
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
      v_custo_unitario := NULLIF(v_item->>'custo_unitario', '')::numeric;
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
    IF v_custo_unitario IS NOT NULL AND (
      v_custo_unitario < 0 OR v_custo_unitario = 'NaN'::numeric OR v_custo_unitario = 'Infinity'::numeric
    ) THEN
      RAISE EXCEPTION 'REMESSA_CUSTO_UNITARIO_INVALIDO';
    END IF;
  END LOOP;

  INSERT INTO public.remessas(
    loja_id, origem_descricao, status, observacao, created_by, idempotency_key, payload_hash,
    fornecedor_id, documento
  ) VALUES (
    v_loja, p_origem, 'EM_CONFERENCIA', v_observacao_norm,
    v_uid, p_idempotency_key, v_payload_hash, p_fornecedor_id, v_documento_norm
  ) RETURNING id INTO v_remessa;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens)
  LOOP
    v_produto := (v_item->>'produto_id')::uuid;
    v_esperada := (v_item->>'quantidade_esperada')::numeric;
    v_conferida := (v_item->>'quantidade_conferida')::numeric;
    v_custo_unitario := NULLIF(v_item->>'custo_unitario', '')::numeric;

    INSERT INTO public.remessa_itens(
      remessa_id, produto_id, quantidade_esperada, quantidade_conferida, custo_unitario
    ) VALUES (
      v_remessa, v_produto, v_esperada, v_conferida, v_custo_unitario
    );

    -- Lê o saldo ANTES de somar esta remessa — é o peso da ponta antiga na
    -- média ponderada. FOR UPDATE: mesma linha que o UPSERT abaixo trava.
    SELECT e.quantidade_atual INTO v_estoque_antes
    FROM public.estoque e
    WHERE e.produto_id = v_produto AND e.loja_id = v_loja
    FOR UPDATE;
    v_estoque_antes := COALESCE(v_estoque_antes, 0);

    INSERT INTO public.estoque(loja_id, produto_id, quantidade_atual, estoque_minimo)
    VALUES (v_loja, v_produto, v_conferida, 0)
    ON CONFLICT (loja_id, produto_id) DO UPDATE
      SET quantidade_atual = public.estoque.quantidade_atual + EXCLUDED.quantidade_atual,
          version = public.estoque.version + 1,
          updated_at = now();

    IF v_custo_unitario IS NOT NULL THEN
      SELECT p.preco_custo INTO v_custo_atual FROM public.produtos p WHERE p.id = v_produto;
      v_novo_custo_medio := ROUND(
        (v_estoque_antes * COALESCE(v_custo_atual, v_custo_unitario) + v_conferida * v_custo_unitario)
        / NULLIF(v_estoque_antes + v_conferida, 0),
        2
      );
      UPDATE public.produtos SET preco_custo = v_novo_custo_medio WHERE id = v_produto;
    END IF;

    v_observacao_mov := 'Recebimento de ' || p_origem
      || CASE WHEN v_documento_norm IS NOT NULL THEN ' | Documento: ' || v_documento_norm ELSE '' END
      || ' | Recebido por: ' || COALESCE(v_usuario_nome, 'operador')
      || CASE WHEN v_observacao_norm IS NOT NULL THEN ' | ' || v_observacao_norm ELSE '' END;

    INSERT INTO public.movimentos_estoque_log(
      loja_id, produto_id, tipo_codigo, quantidade_delta, remessa_id, usuario_id, observacao
    ) VALUES (
      v_loja, v_produto, 'ENTRADA_REMessa_LOJA', v_conferida, v_remessa, v_uid, v_observacao_mov
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

COMMENT ON FUNCTION public.criar_confirmar_remessa_entrada(text, text, jsonb, text, uuid, text) IS
  'T11 (2026-09-27): +fornecedor_id/documento (remessa) e custo_unitario por item (opcional, atualiza produtos.preco_custo por média ponderada quando informado). Assinatura estende a anterior só com parâmetros DEFAULT no final — callers com 4 args continuam funcionando.';

NOTIFY pgrst, 'reload schema';

DO $verify_t11_recebimento$
DECLARE
  v_def text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'remessas' AND column_name = 'fornecedor_id'
  ) THEN
    RAISE EXCEPTION 'T11_COLUNA_AUSENTE: remessas.fornecedor_id';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'remessas' AND column_name = 'documento'
  ) THEN
    RAISE EXCEPTION 'T11_COLUNA_AUSENTE: remessas.documento';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'remessa_itens' AND column_name = 'custo_unitario'
  ) THEN
    RAISE EXCEPTION 'T11_COLUNA_AUSENTE: remessa_itens.custo_unitario';
  END IF;

  v_def := pg_get_functiondef(
    'public.criar_confirmar_remessa_entrada(text,text,jsonb,text,uuid,text)'::regprocedure
  );
  IF position('REMESSA_FORNECEDOR_INVALIDO' IN v_def) = 0 THEN
    RAISE EXCEPTION 'T11_GUARDA_FORNECEDOR_AUSENTE';
  END IF;
  IF position('preco_custo = v_novo_custo_medio' IN v_def) = 0 THEN
    RAISE EXCEPTION 'T11_CUSTO_MEDIO_AUSENTE';
  END IF;
  IF position('REMESSA_IDEMPOTENCY_PAYLOAD_DIVERGENTE' IN v_def) = 0 THEN
    RAISE EXCEPTION 'T11_GUARDA_IDEMPOTENCIA_PREEXISTENTE_AUSENTE';
  END IF;

  -- Exatamente 1 overload: uma chamada com 4 args posicionais (os scripts
  -- de smoke/gate legados em backend/scripts/*.test.sql) tem que resolver
  -- sem ambiguidade contra os 2 parâmetros novos por DEFAULT — 2+ overloads
  -- tornam qualquer chamada com 4 args um erro "is not unique" (comprovado
  -- rodando as duas versões lado a lado antes desta correção).
  IF (
    SELECT count(*) FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'criar_confirmar_remessa_entrada'
  ) <> 1 THEN
    RAISE EXCEPTION 'T11_OVERLOAD_AMBIGUO: mais de uma versão de criar_confirmar_remessa_entrada coexistindo';
  END IF;
END
$verify_t11_recebimento$;

COMMIT;
