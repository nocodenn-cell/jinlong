-- Sprint C2.9 (fechamento dos P0 fiscais, auditoria Codex) — P0-1: elimina o
-- bypass de reemissão duplicada após DLQ/reprocessamento manual.
--
-- ACHADO (Codex): `fiscal_reprocessar_documento` zera `tentativas` sempre que
-- resgata um documento da DLQ (`tentativas = CASE WHEN v_estava_na_dlq THEN 0
-- ELSE tentativas END`) — correto para fins de BACKOFF (a janela de retry
-- deve reiniciar), mas o worker (`index.ts`) usava `(doc.tentativas ?? 0) > 0`
-- como sinal de "já existe uma tentativa anterior, preciso consultar a Focus
-- antes de reemitir" (retry-safe gate, C2.7). Um documento cujo POST
-- ANTERIOR ficou com resultado remoto DESCONHECIDO (timeout/crash do worker
-- entre o POST e a marcação do resultado) segue este caminho real:
--   POST enviado (resultado desconhecido) -> reaper detecta EM_PROCESSAMENTO
--   parado -> reenfileira (tentativas=1) ou manda para DLQ (max tentativas)
--   -> operador reprocessa manualmente -> tentativas volta a 0
--   -> fiscal_claim_documentos reclama -> gate vê tentativas=0
--   -> trata como PRIMEIRA tentativa -> pula a consulta -> SEGUNDO POST.
-- `tentativas` é uma métrica de BACKOFF, não uma prova de que nunca houve
-- POST — usá-la para essa segunda finalidade é a causa raiz do bypass.
--
-- CORREÇÃO: a máquina de estados existente já tem o sinal certo, só não era
-- exposto ao worker. `ultima_tentativa_em` é setado em TODO claim (inclusive
-- o primeiro) e NUNCA é resetado por `fiscal_reaper_documentos` nem por
-- `fiscal_reprocessar_documento` (conferido nos dois corpos — nenhum dos
-- dois tem `ultima_tentativa_em` na lista de colunas que altera). Portanto o
-- valor de `ultima_tentativa_em` IMEDIATAMENTE ANTES do claim atual —
-- capturado aqui antes do UPDATE sobrescrever — é exatamente "este
-- documento já foi reclamado ao menos uma vez antes", sobrevivendo a
-- retry/restart/reaper/DLQ/reprocessamento manual/crash, independente do
-- valor de `tentativas`.
--
-- Nenhum estado novo na máquina PENDENTE/EM_PROCESSAMENTO/EMITIDO/ERRO/
-- CANCELADO — só um campo booleano NOVO no RETORNO da RPC (não uma coluna
-- nova na tabela, não um status novo), derivado de um valor que a tabela já
-- guarda. `CREATE OR REPLACE FUNCTION` não permite adicionar coluna ao
-- `RETURNS SETOF <tabela>` existente (mesma restrição do Postgres já
-- documentada nas migrations 20260902150000/20260902160000 desta missão) —
-- troca para `RETURNS TABLE(...)` explícito exige DROP FUNCTION + CREATE.
--
-- ROLLBACK: reaplicar a definição anterior (RETURNS SETOF
-- documentos_fiscais_pendentes), disponível em
-- 20260806135429_307_d3_reaper_fiscal_em_processamento.sql. GRANT/dono/
-- segurança preservados e verificados abaixo.

BEGIN;

DROP FUNCTION public.fiscal_claim_documentos(integer);

CREATE FUNCTION public.fiscal_claim_documentos(p_limit integer DEFAULT 20)
RETURNS TABLE(
  id uuid,
  venda_id uuid,
  tipo_doc text,
  status text,
  payload jsonb,
  ultimo_erro text,
  created_at timestamptz,
  updated_at timestamptz,
  tentativas integer,
  proxima_tentativa_em timestamptz,
  ultima_tentativa_em timestamptz,
  provider text,
  provider_ref text,
  chave_fiscal text,
  protocolo text,
  processado_em timestamptz,
  fiscal_error_code text,
  fiscal_error_category text,
  fiscal_action_hint text,
  fiscal_retryable boolean,
  fiscal_next_step_url text,
  fiscal_error_payload jsonb,
  deleted_at timestamptz,
  correlation_id uuid,
  ultima_transicao_em timestamptz,
  transicao_origem text,
  -- Sprint C2.9 (P0-1) — único campo novo: TRUE quando este documento já
  -- tinha sido reclamado (EM_PROCESSAMENTO) em algum momento ANTES deste
  -- claim, não importa o que aconteceu depois (reaper/DLQ/reprocessamento).
  ja_tentou_emissao_antes boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 20), 100));
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND current_user <> 'postgres' THEN
    RAISE EXCEPTION 'FISCAL_CLAIM_FORBIDDEN';
  END IF;

  RETURN QUERY
  WITH candidatos AS (
    SELECT q.id, q.ultima_tentativa_em AS ultima_tentativa_em_anterior
    FROM public.documentos_fiscais_pendentes q
    WHERE q.status IN ('PENDENTE', 'ERRO')
      AND (
        q.proxima_tentativa_em IS NULL OR q.proxima_tentativa_em <= now()
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.documentos_fiscais_dlq dq WHERE dq.documento_id = q.id
      )
    ORDER BY q.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT v_limit
  ),
  claimed AS (
    UPDATE public.documentos_fiscais_pendentes d
    SET
      status = 'EM_PROCESSAMENTO',
      ultima_tentativa_em = now(),
      updated_at = now()
    FROM candidatos c
    WHERE d.id = c.id
    RETURNING d.*, c.ultima_tentativa_em_anterior
  )
  SELECT
    claimed.id, claimed.venda_id, claimed.tipo_doc, claimed.status, claimed.payload,
    claimed.ultimo_erro, claimed.created_at, claimed.updated_at, claimed.tentativas,
    claimed.proxima_tentativa_em, claimed.ultima_tentativa_em, claimed.provider,
    claimed.provider_ref, claimed.chave_fiscal, claimed.protocolo, claimed.processado_em,
    claimed.fiscal_error_code, claimed.fiscal_error_category, claimed.fiscal_action_hint,
    claimed.fiscal_retryable, claimed.fiscal_next_step_url, claimed.fiscal_error_payload,
    claimed.deleted_at, claimed.correlation_id, claimed.ultima_transicao_em, claimed.transicao_origem,
    (claimed.ultima_tentativa_em_anterior IS NOT NULL) AS ja_tentou_emissao_antes
  FROM claimed;
END;
$function$;

REVOKE ALL ON FUNCTION public.fiscal_claim_documentos(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fiscal_claim_documentos(integer) TO service_role;

COMMENT ON FUNCTION public.fiscal_claim_documentos(integer) IS
  'Reclama documentos PENDENTE/ERRO prontos para tentativa, exclui DLQ, FOR UPDATE SKIP LOCKED. '
  'Sprint C2.9 (2026-09-03, P0-1): retorna também ja_tentou_emissao_antes — TRUE se este documento '
  'já foi reclamado antes desta chamada, independente de tentativas ter sido resetada por DLQ/'
  'reprocessamento. O worker usa este campo (não tentativas) para decidir se precisa consultar a '
  'Focus antes de reemitir.';

NOTIFY pgrst, 'reload schema';

DO $verify$
DECLARE
  v_owner text;
  v_secdef boolean;
  v_acl text[];
  v_ret text;
  v_uid uuid;
  v_venda_id uuid;
  v_doc_id uuid;
  v_row record;
BEGIN
  -- B2 (go-live): o autoteste roda dentro de um sub-bloco que SEMPRE termina
  -- com a exceção sentinela VRB01. O Postgres desfaz tudo o que o sub-bloco
  -- gravou (vendas, itens, pagamentos, estoque, saldo, kardex, comissões,
  -- documentos fiscais, eventos). As asserções continuam valendo: qualquer
  -- outra exceção (inclusive as RAISE do teste) não é capturada e aborta a
  -- migration, como antes. Os RETURN de pré-condição vêm antes de qualquer
  -- escrita, então não deixam efeito.
  BEGIN
  SELECT p.proowner::regrole::text, p.prosecdef, p.proacl::text[], pg_get_function_result(p.oid)
  INTO v_owner, v_secdef, v_acl, v_ret
  FROM pg_proc p WHERE p.proname = 'fiscal_claim_documentos';

  IF v_owner IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION 'C2_9_P01_OWNER_ALTERADO: %', v_owner;
  END IF;
  IF v_secdef IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'C2_9_P01_SECURITY_ALTERADA';
  END IF;
  IF NOT ('service_role=X/postgres' = ANY(v_acl))
     OR ('authenticated=X/postgres' = ANY(v_acl))
     OR EXISTS (SELECT 1 FROM unnest(v_acl) a WHERE a ILIKE 'anon=%') THEN
    RAISE EXCEPTION 'C2_9_P01_GRANT_INESPERADO: %', v_acl;
  END IF;
  IF position('ja_tentou_emissao_antes boolean' IN v_ret) = 0 THEN
    RAISE EXCEPTION 'C2_9_P01_CAMPO_AUSENTE_NO_RETURN: %', v_ret;
  END IF;

  -- Prova viva: reproduz o cenário exato do achado do Codex — 1º claim
  -- (ja_tentou_emissao_antes deve ser FALSE), simula reaper->DLQ->
  -- reprocessamento (tentativas volta a 0, exatamente como
  -- fiscal_reprocessar_documento faz), 2º claim (ja_tentou_emissao_antes
  -- deve ser TRUE mesmo com tentativas=0).
  SELECT id INTO v_uid FROM public.usuarios LIMIT 1;
  IF v_uid IS NULL THEN
    RAISE NOTICE 'C2_9_P01: sem usuário para prova viva; verificação estrutural OK';
  ELSE
    v_venda_id := gen_random_uuid();
    INSERT INTO public.vendas (id, operador_id, total_bruto, total_desconto, total_liquido, forma_pagamento, status)
    VALUES (v_venda_id, v_uid, 10, 0, 10, 'DINHEIRO', 'CONCLUIDA');

    INSERT INTO public.documentos_fiscais_pendentes (venda_id, tipo_doc, status, payload)
    VALUES (v_venda_id, 'NFC_E_STUB', 'PENDENTE', '{}'::jsonb)
    RETURNING id INTO v_doc_id;

    -- 1º claim: primeira vez, nunca reclamado antes.
    SELECT * INTO v_row FROM public.fiscal_claim_documentos(10) WHERE id = v_doc_id;
    IF v_row.id IS NULL THEN
      RAISE EXCEPTION 'C2_9_P01_PRIMEIRO_CLAIM_NAO_RETORNOU_DOCUMENTO';
    END IF;
    IF v_row.ja_tentou_emissao_antes IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'C2_9_P01_PRIMEIRO_CLAIM_DEVERIA_SER_FALSE: obtido %', v_row.ja_tentou_emissao_antes;
    END IF;

    -- Simula: POST enviado, resultado nunca confirmado (worker crashou) —
    -- backdata ultima_tentativa_em (o claim acima acabou de setar "agora",
    -- precisa parecer parado há tempo suficiente para o reaper agir).
    UPDATE public.documentos_fiscais_pendentes
    SET ultima_tentativa_em = now() - interval '20 minutes'
    WHERE id = v_doc_id;

    -- reaper detecta EM_PROCESSAMENTO parado; max_tentativas=1 força direto
    -- para DLQ nesta primeira detecção (0 tentativas + 1 >= max 1).
    PERFORM public.fiscal_reaper_documentos(1, 1);

    IF NOT EXISTS (SELECT 1 FROM public.documentos_fiscais_dlq WHERE documento_id = v_doc_id) THEN
      RAISE EXCEPTION 'C2_9_P01_DOCUMENTO_NAO_FOI_PARA_DLQ_NA_SIMULACAO';
    END IF;

    -- Reprocessamento manual do operador — reseta tentativas para 0 (mesmo
    -- comportamento real de fiscal_reprocessar_documento).
    PERFORM set_config('request.jwt.claim.sub', v_uid::text, true);
    PERFORM public.fiscal_reprocessar_documento(v_doc_id);

    IF NOT EXISTS (SELECT 1 FROM public.documentos_fiscais_pendentes WHERE id = v_doc_id AND tentativas = 0) THEN
      RAISE EXCEPTION 'C2_9_P01_TENTATIVAS_NAO_ZEROU_APOS_REPROCESSO';
    END IF;

    -- 2º claim, pós-reprocessamento: tentativas=0 (reset), mas
    -- ja_tentou_emissao_antes TEM que continuar TRUE — é exatamente o
    -- bypass que este fix fecha.
    SELECT * INTO v_row FROM public.fiscal_claim_documentos(10) WHERE id = v_doc_id;
    IF v_row.id IS NULL THEN
      RAISE EXCEPTION 'C2_9_P01_SEGUNDO_CLAIM_NAO_RETORNOU_DOCUMENTO';
    END IF;
    IF v_row.tentativas IS DISTINCT FROM 0 THEN
      RAISE EXCEPTION 'C2_9_P01_PRECONDICAO_TENTATIVAS_DEVERIA_SER_0: obtido %', v_row.tentativas;
    END IF;
    IF v_row.ja_tentou_emissao_antes IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'C2_9_P01_BYPASS_NAO_FECHADO: ja_tentou_emissao_antes deveria ser TRUE mesmo com tentativas=0, obtido %', v_row.ja_tentou_emissao_antes;
    END IF;

    -- Limpeza.
    DELETE FROM public.documentos_fiscais_eventos WHERE documento_id = v_doc_id;
    DELETE FROM public.documentos_fiscais_dlq WHERE documento_id = v_doc_id;
    DELETE FROM public.documentos_fiscais_pendentes WHERE id = v_doc_id;
    DELETE FROM public.vendas WHERE id = v_venda_id;
  END IF;
  RAISE EXCEPTION 'VERIFY_ROLLBACK_SENTINELA' USING ERRCODE = 'VRB01';
  EXCEPTION WHEN SQLSTATE 'VRB01' THEN
    RAISE NOTICE '20260903100000: autoteste concluído; efeitos desfeitos (rollback do sub-bloco)';
  END;
END
$verify$;

COMMIT;
