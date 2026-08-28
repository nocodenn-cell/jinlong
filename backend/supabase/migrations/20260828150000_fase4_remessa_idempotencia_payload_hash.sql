-- Fase 4 do plano de remediação Jīn Lóng — DIV-D0-021.
--
-- Achado (Codex review #321, comment_id 3839673711; docs/piloto-d0/
-- DIVERGENCIAS_E_DECISOES.md): `criar_confirmar_remessa_entrada` aceita
-- replay da mesma `idempotency_key` sem comparar o payload atual contra o
-- gravado. Se o gerente reenvia a remessa com quantidades corrigidas usando
-- a mesma chave (ex.: retry de app que reaproveita a chave por engano, ou
-- correção manual antes de perceber que a primeira chamada já tinha
-- sucedido), a função devolve sucesso silencioso com o ID antigo — a
-- correção nunca chega ao banco e ninguém é avisado.
--
-- Caminho real mas de baixa frequência (fluxo manual, baixo volume). Não
-- corrigido na #321 por exigir nova coluna + regeneração de
-- database.types.ts. Rastreado em https://github.com/nocodenn-cell/fastproduct/issues/322.
--
-- CORREÇÃO — grava um hash do payload normalizado (origem + observação +
-- itens canonicalizados por produto_id) na criação; no replay, compara o
-- hash gravado contra o hash do payload recebido. Hash igual -> mesmo
-- comportamento de sempre (retorna o ID existente, silencioso, é o
-- comportamento correto para um retry de verdade). Hash diferente -> RAISE
-- EXCEPTION explícita em vez de devolver sucesso com dado desatualizado.
--
-- md5() (core do Postgres, sem dependência de extensão) é suficiente aqui —
-- não é um hash de segurança, só um detector de divergência de conteúdo.
--
-- Linhas históricas de `remessas` ficam com `payload_hash` NULL (não há
-- payload original re-derivável com segurança sem reprocessar o pedido
-- original). Consequência deliberada: um replay de uma chave muito antiga
-- (linha pré-existente a esta migration) passa a exigir investigação
-- explícita em vez de confiar cegamente no silêncio anterior — alinhado ao
-- espírito da correção, não uma regressão de comportamento desejável.
--
-- ESCOPO — schema aditivo (ALTER TABLE ADD COLUMN nullable) + CREATE OR
-- REPLACE da RPC. Assinatura inalterada. Nenhuma outra lógica tocada.

BEGIN;

ALTER TABLE public.remessas ADD COLUMN IF NOT EXISTS payload_hash text;

COMMENT ON COLUMN public.remessas.payload_hash IS
  'md5 do payload normalizado (origem + observação + itens canonicalizados por produto_id) usado por criar_confirmar_remessa_entrada para detectar replay com payload divergente (DIV-D0-021, Fase 4 do plano de remediação). NULL em linhas anteriores a esta migration.';

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

DO $verify$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'remessas' AND column_name = 'payload_hash'
  ) THEN
    RAISE EXCEPTION 'FASE4_COLUNA_AUSENTE: remessas.payload_hash';
  END IF;

  IF position('REMESSA_IDEMPOTENCY_PAYLOAD_DIVERGENTE' IN pg_get_functiondef('public.criar_confirmar_remessa_entrada(text,text,jsonb,text)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'FASE4_GUARDA_AUSENTE: criar_confirmar_remessa_entrada';
  END IF;

  RAISE NOTICE 'FASE4 idempotencia OK — payload_hash presente e guarda de divergencia no corpo da RPC';
END
$verify$;

NOTIFY pgrst, 'reload schema';

COMMIT;
