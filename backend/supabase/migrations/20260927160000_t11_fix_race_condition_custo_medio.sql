-- T11-RACE (auditoria Jinlong 2026-09-27, achado da revisão final pós-T11):
-- criar_confirmar_remessa_entrada calcula o custo médio ponderado do
-- produto sem nenhuma serialização por (loja_id, produto_id) — só
-- `SELECT e.quantidade_atual ... FOR UPDATE`, que só protege quando a linha
-- de `estoque` JÁ existe.
--
-- Quando a linha ainda não existe (primeiro recebimento de um produto),
-- `FOR UPDATE` não trava nada — não há linha para lockar. Duas transações
-- concorrentes recebendo o MESMO produto pela primeira vez leem
-- v_estoque_antes = 0 cada uma. O `INSERT ... ON CONFLICT DO UPDATE` logo
-- depois corrige a QUANTIDADE final (é atômico), mas o custo médio já foi
-- calculado com o v_estoque_antes obsoleto — `produtos.preco_custo` termina
-- no valor de quem escreveu por último, não na média ponderada correta.
--
-- PROVA (2 sessões PostgreSQL reais, estoque inexistente, produto novo):
--   A: 10 unidades a custo 10.  B: 10 unidades a custo 20, concorrente.
--   Sem esta correção: quantidade fecha em 20 (correto), preco_custo fecha
--     em 20,00 (deveria ser 15,00) — a sessão B nunca via a linha que A
--     estava prestes a criar, porque `FOR UPDATE` sobre linha inexistente
--     não bloqueia ninguém.
--   Com esta correção: B bloqueia no lock advisory até A commitar, relê
--     v_estoque_antes=10 (já correto) e calcula 15,00.
--
-- Correção: lock advisory por (loja_id, produto_id), adquirido para TODOS
-- os produtos distintos da remessa em ordem determinística
-- (produto_id::text ASC — não a ordem em que aparecem no JSON), antes de
-- qualquer leitura/escrita de estoque ou custo. Ordem determinística é o
-- que evita espera circular entre duas remessas concorrentes com os mesmos
-- produtos em ordem invertida (remessa A: [p1,p2] vs remessa B: [p2,p1]) —
-- as duas sempre disputam p1 primeiro; nenhuma segura p2 enquanto espera
-- p1, então não há como fechar o ciclo.
--
-- Mesmo padrão (namespace no hash) já usado em
-- 20260902120000_serializa_invariante_varejo_tier_e_reativacao.sql, para
-- não colidir com os locks por venda_id/request_id usados por outras RPCs.
--
-- Único trecho novo: o loop de lock logo após a validação de itens, antes
-- do primeiro INSERT. Assinatura da função INALTERADA (mesmos 6
-- parâmetros) — CREATE OR REPLACE simples, sem risco de overload (não há
-- mudança de lista de parâmetros desta vez). Callers, schema e
-- payload_hash não são tocados.
--
-- ROLLBACK: reaplicar o CREATE OR REPLACE anterior, disponível em
-- 20260927150000_t11_recebimento_fornecedor_custo_unitario.sql.

BEGIN;

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

  -- T11-RACE: lock advisory por (loja_id, produto_id), para TODOS os
  -- produtos distintos da remessa, em ordem determinística
  -- (produto_id::text ASC — não a ordem do JSON) — antes de qualquer
  -- leitura/escrita de estoque ou custo médio. Serializa qualquer
  -- combinação de remessas concorrentes para o mesmo produto, inclusive
  -- quando a linha de `estoque` ainda não existe (caso em que `SELECT ...
  -- FOR UPDATE`, mais abaixo, não tem nada para travar). Ordem
  -- determinística evita espera circular entre duas remessas com os mesmos
  -- produtos em ordem invertida.
  FOR v_produto IN
    SELECT DISTINCT (elem->>'produto_id')::uuid AS produto_id
    FROM jsonb_array_elements(p_itens) elem
    ORDER BY 1
  LOOP
    PERFORM pg_advisory_xact_lock(
      hashtextextended('recebimento_estoque_custo_medio:' || v_loja::text || ':' || v_produto::text, 0)
    );
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
    -- Quando a linha ainda não existe, quem protege a leitura contra
    -- concorrência é o lock advisory acima, não este FOR UPDATE.
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
  'T11-RACE (2026-09-27): lock advisory por (loja_id, produto_id) — ordem determinística por produto_id — antes de ler/escrever estoque ou custo médio, corrigindo race de custo médio ponderado no primeiro recebimento concorrente de um produto (linha de estoque ainda inexistente). Mesma assinatura de 20260927150000.';

NOTIFY pgrst, 'reload schema';

DO $verify_t11_race$
DECLARE
  v_def text;
BEGIN
  v_def := pg_get_functiondef(
    'public.criar_confirmar_remessa_entrada(text,text,jsonb,text,uuid,text)'::regprocedure
  );

  -- Regressões pré-existentes (T11) continuam presentes.
  IF position('REMESSA_FORNECEDOR_INVALIDO' IN v_def) = 0 THEN
    RAISE EXCEPTION 'T11_RACE_GUARDA_FORNECEDOR_AUSENTE';
  END IF;
  IF position('preco_custo = v_novo_custo_medio' IN v_def) = 0 THEN
    RAISE EXCEPTION 'T11_RACE_CUSTO_MEDIO_AUSENTE';
  END IF;
  IF position('REMESSA_IDEMPOTENCY_PAYLOAD_DIVERGENTE' IN v_def) = 0 THEN
    RAISE EXCEPTION 'T11_RACE_GUARDA_IDEMPOTENCIA_AUSENTE';
  END IF;

  -- Novo: lock advisory presente, em ordem determinística, antes do
  -- primeiro INSERT (remessas).
  IF position('pg_advisory_xact_lock' IN v_def) = 0 THEN
    RAISE EXCEPTION 'T11_RACE_LOCK_ADVISORY_AUSENTE';
  END IF;
  IF position('recebimento_estoque_custo_medio:' IN v_def) = 0 THEN
    RAISE EXCEPTION 'T11_RACE_LOCK_NAMESPACE_AUSENTE';
  END IF;
  IF position('ORDER BY 1' IN v_def) = 0 THEN
    RAISE EXCEPTION 'T11_RACE_LOCK_ORDEM_DETERMINISTICA_AUSENTE';
  END IF;
  IF position('pg_advisory_xact_lock' IN v_def) > position('INSERT INTO public.remessas(' IN v_def) THEN
    RAISE EXCEPTION 'T11_RACE_LOCK_APOS_INSERT_REMESSAS';
  END IF;

  -- Continua exatamente 1 overload (assinatura não mudou nesta migration).
  IF (
    SELECT count(*) FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'criar_confirmar_remessa_entrada'
  ) <> 1 THEN
    RAISE EXCEPTION 'T11_RACE_OVERLOAD_AMBIGUO';
  END IF;
END
$verify_t11_race$;

COMMIT;
