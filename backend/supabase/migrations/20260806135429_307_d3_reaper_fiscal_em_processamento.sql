-- Migration 307: D-3 — reaper de EM_PROCESSAMENTO, limite de tentativas e DLQ automática
-- Data: 2026-08-06
-- Referência: docs/GO_LIVE_BLOCKERS.md §3 (D-3) · docs/PLANO_REMEDIACAO_CICD.md §"Risco crítico — órfão permanente"
-- Ordem obrigatória do fiscal: D-1 → D-2 → D-3 → B-6 → B-5. Esta é a terceira
-- (D-1 = migration 305, D-2 = migration 306).
--
-- PROBLEMA (confirmado no banco vivo em 2026-08-06)
-- ------------------------------------------------
-- `fiscal_claim_documentos` marca o documento como EM_PROCESSAMENTO **antes** de
-- chamar o provider. Se o worker morre no meio (timeout de Edge Function, deploy,
-- crash), o documento fica EM_PROCESSAMENTO para sempre:
--   • o claim só busca `status IN ('PENDENTE','ERRO')` → retry automático não pega;
--   • `fiscal_reprocessar_documento(uuid)` só aceita `status IN ('ERRO','PENDENTE')`
--     → o reprocesso manual do painel também não pega.
-- O resgate exigiria UPDATE direto no banco. Verificado por catálogo que não
-- existe nenhuma função de reaper/DLQ automática em produção (0 resultados para
-- proname ilike '%reaper%'/'%dlq%'/'%orfao%'/'%stuck%').
--
-- Além disso não há teto de tentativas: um documento que falha de forma
-- permanente é reenfileirado indefinidamente pelo backoff, sem nunca parar numa
-- fila morta onde alguém precise olhar.
--
-- O QUE ESTA MIGRATION FAZ
-- -----------------------
-- 1. `fiscal_reaper_documentos(timeout, max_tentativas)` — service_role/postgres
--    apenas. Varre EM_PROCESSAMENTO parados há mais que o timeout e, por linha:
--      • abaixo do teto  → volta para PENDENTE com backoff;
--      • atingiu o teto  → grava linha na DLQ e para em ERRO não-retryable.
-- 2. `fiscal_claim_documentos` passa a ignorar documentos com linha na DLQ —
--    sem isto a "fila morta" seria imediatamente ressuscitada pelo próprio claim.
-- 3. `fiscal_reprocessar_documento(uuid)` (reprocesso manual do gerente) passa a
--    limpar a linha de DLQ e zerar `tentativas`, fechando o ciclo: o único
--    caminho de volta da fila morta é a decisão humana, registrada na timeline.
--
-- DECISÕES DE DESENHO (e por que não outras)
-- ------------------------------------------
-- • **A DLQ é um marcador, não uma mudança de dono da linha.** A FK
--   `documentos_fiscais_dlq.documento_id → documentos_fiscais_pendentes(id)` é
--   `ON DELETE CASCADE`: mover o documento de tabela (apagando o original)
--   apagaria a própria linha de DLQ. Por isso o documento permanece em
--   `documentos_fiscais_pendentes` com status ERRO e ganha um registro na DLQ.
--   (Era exatamente aqui que o overload removido no D-1 estava errado: ele
--   tentava "restaurar da DLQ" reinserindo em pendentes e apagando da DLQ.)
-- • **Backoff idêntico ao de `fiscal_marcar_erro`** (`60 * 2^min(tentativas,6)`
--   segundos, teto de 3600) — a política de retry continua com fonte única.
-- • **Sem `evento_tipo` novo.** `documentos_fiscais_eventos_tipo_check` restringe
--   o conjunto de tipos; a ação do reaper é distinguida por `origem_acao`, que é
--   o campo livre já usado para isso pelo resto do módulo.
-- • **Sem agendamento aqui.** O cron fiscal está desagendado (migration 285) e só
--   volta em B-5. A chamada do reaper foi acoplada ao próprio worker
--   (`backend/supabase/functions/fiscal-worker/index.ts`, antes do claim), para
--   que exista um único ponto de agendamento quando o módulo for ligado.
--
-- ROLLBACK
-- --------
--   DROP FUNCTION IF EXISTS public.fiscal_reaper_documentos(integer, integer);
--   -- e reaplicar as versões anteriores de fiscal_claim_documentos /
--   -- fiscal_reprocessar_documento (corpos preservados em 093 e 282/266).

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Reaper
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fiscal_reaper_documentos(
  p_timeout_minutos integer DEFAULT 15,
  p_max_tentativas integer DEFAULT 5
)
RETURNS TABLE (reenfileirados integer, enviados_dlq integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_timeout integer := GREATEST(1, LEAST(COALESCE(p_timeout_minutos, 15), 1440));
  v_max integer := GREATEST(1, LEAST(COALESCE(p_max_tentativas, 5), 20));
  v_reenfileirados integer := 0;
  v_dlq integer := 0;
  r record;
  v_tentativas integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND current_user <> 'postgres' THEN
    RAISE EXCEPTION 'FISCAL_REAPER_FORBIDDEN';
  END IF;

  FOR r IN
    SELECT d.id, d.venda_id, d.tipo_doc, d.payload, d.status, d.tentativas,
           COALESCE(d.ultima_tentativa_em, d.updated_at, d.created_at) AS parado_desde
    FROM public.documentos_fiscais_pendentes d
    WHERE d.status = 'EM_PROCESSAMENTO'
      AND COALESCE(d.ultima_tentativa_em, d.updated_at, d.created_at)
          < now() - make_interval(mins => v_timeout)
    ORDER BY d.created_at ASC
    FOR UPDATE SKIP LOCKED
  LOOP
    v_tentativas := r.tentativas + 1;

    IF v_tentativas >= v_max THEN
      -- Teto atingido: para na fila morta.
      INSERT INTO public.documentos_fiscais_dlq (
        documento_id, venda_id, tipo_doc, payload, motivo,
        original_status, original_tentativas
      )
      SELECT r.id, r.venda_id, r.tipo_doc, r.payload,
             format('FISCAL_REAPER_ORFAO_MAX_TENTATIVAS: parado em EM_PROCESSAMENTO desde %s, %s tentativas (teto %s)',
                    r.parado_desde, v_tentativas, v_max),
             r.status, v_tentativas
      WHERE NOT EXISTS (
        SELECT 1 FROM public.documentos_fiscais_dlq dq WHERE dq.documento_id = r.id
      );

      UPDATE public.documentos_fiscais_pendentes
      SET status = 'ERRO',
          tentativas = v_tentativas,
          ultimo_erro = 'FISCAL_REAPER_ORFAO_MAX_TENTATIVAS',
          fiscal_error_code = 'FISCAL_REAPER_ORFAO_MAX_TENTATIVAS',
          fiscal_error_category = 'DESCONHECIDO',
          fiscal_action_hint = 'Documento preso em processamento e sem tentativas restantes. Revisar manualmente e reprocessar pelo painel.',
          fiscal_retryable = false,
          fiscal_next_step_url = '/gerente/financeiro?tab=fiscal',
          proxima_tentativa_em = NULL,
          updated_at = now()
      WHERE id = r.id;

      INSERT INTO public.documentos_fiscais_eventos (
        documento_id, evento_tipo, status_antes, status_depois,
        actor_user_id, actor_role, origem_acao, payload
      ) VALUES (
        r.id, 'ERRO', r.status, 'ERRO',
        NULL, 'service_role', 'RPC_FISCAL_REAPER_DLQ',
        jsonb_build_object(
          'motivo', 'MAX_TENTATIVAS',
          'parado_desde', r.parado_desde,
          'timeout_minutos', v_timeout,
          'tentativas', v_tentativas,
          'max_tentativas', v_max
        )
      );

      v_dlq := v_dlq + 1;
    ELSE
      -- Ainda há tentativas: devolve para a fila com o mesmo backoff do erro.
      UPDATE public.documentos_fiscais_pendentes
      SET status = 'PENDENTE',
          tentativas = v_tentativas,
          ultimo_erro = 'FISCAL_REAPER_ORFAO_REENFILEIRADO',
          proxima_tentativa_em = now() + make_interval(
            secs => LEAST(3600, 60 * CAST(power(2::numeric, LEAST(v_tentativas, 6)) AS integer))
          ),
          updated_at = now()
      WHERE id = r.id;

      INSERT INTO public.documentos_fiscais_eventos (
        documento_id, evento_tipo, status_antes, status_depois,
        actor_user_id, actor_role, origem_acao, payload
      ) VALUES (
        r.id, 'REENFILEIRADO', r.status, 'PENDENTE',
        NULL, 'service_role', 'RPC_FISCAL_REAPER_ORFAOS',
        jsonb_build_object(
          'parado_desde', r.parado_desde,
          'timeout_minutos', v_timeout,
          'tentativas', v_tentativas,
          'max_tentativas', v_max
        )
      );

      v_reenfileirados := v_reenfileirados + 1;
    END IF;
  END LOOP;

  reenfileirados := v_reenfileirados;
  enviados_dlq := v_dlq;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.fiscal_reaper_documentos(integer, integer) IS
  'D-3 (2026-08-06). Resgata documentos presos em EM_PROCESSAMENTO após morte do worker: reenfileira com backoff ou, atingido o teto de tentativas, registra na DLQ e para em ERRO não-retryable. Apenas service_role/postgres.';

REVOKE ALL ON FUNCTION public.fiscal_reaper_documentos(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fiscal_reaper_documentos(integer, integer) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Claim ignora quem está na DLQ
--    (corpo idêntico ao vivo, com a única adição do NOT EXISTS)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fiscal_claim_documentos(p_limit integer DEFAULT 20)
RETURNS SETOF public.documentos_fiscais_pendentes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 20), 100));
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND current_user <> 'postgres' THEN
    RAISE EXCEPTION 'FISCAL_CLAIM_FORBIDDEN';
  END IF;

  RETURN QUERY
  WITH claimed AS (
    UPDATE public.documentos_fiscais_pendentes d
    SET
      status = 'EM_PROCESSAMENTO',
      ultima_tentativa_em = now(),
      updated_at = now()
    WHERE d.id IN (
      SELECT q.id
      FROM public.documentos_fiscais_pendentes q
      WHERE q.status IN ('PENDENTE', 'ERRO')
        AND (
          q.proxima_tentativa_em IS NULL OR q.proxima_tentativa_em <= now()
        )
        -- D-3: documento na fila morta só volta por decisão humana
        -- (fiscal_reprocessar_documento limpa a linha de DLQ).
        AND NOT EXISTS (
          SELECT 1 FROM public.documentos_fiscais_dlq dq WHERE dq.documento_id = q.id
        )
      ORDER BY q.created_at ASC
      FOR UPDATE SKIP LOCKED
      LIMIT v_limit
    )
    RETURNING d.*
  )
  SELECT * FROM claimed;
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_claim_documentos(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fiscal_claim_documentos(integer) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Reprocesso manual tira o documento da fila morta
--    (corpo idêntico ao vivo; adiciona só a limpeza de DLQ + reset de tentativas)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fiscal_reprocessar_documento(p_documento_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_old_status text;
  v_prev_ultimo text;
  v_prev_fiscal_code text;
  v_prev_fiscal_cat text;
  v_estava_na_dlq boolean := false;
BEGIN
  IF current_user <> 'postgres' THEN
    IF v_uid IS NULL THEN
      RAISE EXCEPTION 'FISCAL_REPROCESSO_AUTH';
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = v_uid
        AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    ) THEN
      RAISE EXCEPTION 'FISCAL_REPROCESSO_PERFIL';
    END IF;
  END IF;

  SELECT d.status, d.ultimo_erro, d.fiscal_error_code, d.fiscal_error_category
  INTO v_old_status, v_prev_ultimo, v_prev_fiscal_code, v_prev_fiscal_cat
  FROM public.documentos_fiscais_pendentes d
  WHERE d.id = p_documento_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_DOCUMENTO_NAO_ENCONTRADO';
  END IF;

  -- D-3: decisão humana é o único caminho de volta da fila morta.
  DELETE FROM public.documentos_fiscais_dlq WHERE documento_id = p_documento_id;
  v_estava_na_dlq := FOUND;

  UPDATE public.documentos_fiscais_pendentes
  SET
    status = 'PENDENTE',
    tentativas = CASE WHEN v_estava_na_dlq THEN 0 ELSE tentativas END,
    proxima_tentativa_em = now(),
    ultimo_erro = NULL,
    fiscal_error_code = NULL,
    fiscal_error_category = NULL,
    fiscal_action_hint = NULL,
    fiscal_retryable = NULL,
    fiscal_next_step_url = NULL,
    fiscal_error_payload = NULL,
    updated_at = now()
  WHERE id = p_documento_id
    AND status IN ('ERRO', 'PENDENTE');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_REPROCESSO_STATUS_INVALIDO';
  END IF;

  INSERT INTO public.documentos_fiscais_eventos (
    documento_id,
    evento_tipo,
    status_antes,
    status_depois,
    actor_user_id,
    actor_role,
    origem_acao,
    payload
  ) VALUES (
    p_documento_id,
    'REPROCESSO_MANUAL',
    v_old_status,
    'PENDENTE',
    v_uid,
    current_setting('request.jwt.claim.role', true),
    'RPC_FISCAL_REPROCESSAR_DOCUMENTO',
    jsonb_build_object(
      'ultimo_erro_prev', v_prev_ultimo,
      'fiscal_error_code_prev', v_prev_fiscal_code,
      'fiscal_error_category_prev', v_prev_fiscal_cat,
      'resgatado_da_dlq', v_estava_na_dlq
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.fiscal_reprocessar_documento(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fiscal_reprocessar_documento(uuid) TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- Verificação no efeito — prova viva do ciclo órfão → reenfileirado → DLQ → resgate
-- ═══════════════════════════════════════════════════════════════════════════
DO $verify$
DECLARE
  v_venda_id uuid;
  v_doc_id uuid;
  v_res record;
  v_status text;
  v_tentativas integer;
  v_claim_pegou boolean;
BEGIN
  IF NOT has_function_privilege('service_role', 'public.fiscal_reaper_documentos(integer,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'MIG307_REAPER_SEM_GRANT_SERVICE_ROLE';
  END IF;
  IF has_function_privilege('authenticated', 'public.fiscal_reaper_documentos(integer,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'MIG307_REAPER_EXPOSTO_A_AUTHENTICATED';
  END IF;

  SELECT v.id INTO v_venda_id
  FROM public.vendas v
  WHERE NOT EXISTS (
    SELECT 1 FROM public.documentos_fiscais_pendentes d WHERE d.venda_id = v.id
  )
  LIMIT 1;

  IF v_venda_id IS NULL THEN
    RAISE NOTICE '307 — sem vendas livres para prova viva; verificação estrutural OK';
    RETURN;
  END IF;

  -- Órfão sintético: EM_PROCESSAMENTO parado há 60 min, já no teto de tentativas.
  INSERT INTO public.documentos_fiscais_pendentes (venda_id, tipo_doc, status, payload)
  VALUES (v_venda_id, 'NFE', 'PENDENTE', '{"probe":"mig307"}'::jsonb)
  RETURNING id INTO v_doc_id;

  UPDATE public.documentos_fiscais_pendentes
  SET status = 'EM_PROCESSAMENTO', tentativas = 4, ultima_tentativa_em = now() - interval '60 minutes'
  WHERE id = v_doc_id;

  SELECT * INTO v_res FROM public.fiscal_reaper_documentos(15, 5);

  IF v_res.enviados_dlq < 1 THEN
    RAISE EXCEPTION 'MIG307_REAPER_NAO_MOVEU_PARA_DLQ (reenfileirados=%, dlq=%)', v_res.reenfileirados, v_res.enviados_dlq;
  END IF;

  SELECT status INTO v_status FROM public.documentos_fiscais_pendentes WHERE id = v_doc_id;
  IF v_status <> 'ERRO' THEN
    RAISE EXCEPTION 'MIG307_STATUS_POS_DLQ_INESPERADO: %', v_status;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.documentos_fiscais_dlq WHERE documento_id = v_doc_id) THEN
    RAISE EXCEPTION 'MIG307_LINHA_DLQ_AUSENTE';
  END IF;

  -- Claim não pode ressuscitar quem está na DLQ.
  SELECT EXISTS (
    SELECT 1 FROM public.fiscal_claim_documentos(100) c WHERE c.id = v_doc_id
  ) INTO v_claim_pegou;

  IF v_claim_pegou THEN
    RAISE EXCEPTION 'MIG307_CLAIM_RESSUSCITOU_DOCUMENTO_DA_DLQ';
  END IF;

  -- Resgate humano limpa a DLQ e zera tentativas.
  PERFORM public.fiscal_reprocessar_documento(v_doc_id);

  SELECT status, tentativas INTO v_status, v_tentativas
  FROM public.documentos_fiscais_pendentes WHERE id = v_doc_id;

  IF v_status <> 'PENDENTE' OR v_tentativas <> 0 THEN
    RAISE EXCEPTION 'MIG307_RESGATE_MANUAL_FALHOU: status=% tentativas=%', v_status, v_tentativas;
  END IF;

  IF EXISTS (SELECT 1 FROM public.documentos_fiscais_dlq WHERE documento_id = v_doc_id) THEN
    RAISE EXCEPTION 'MIG307_LINHA_DLQ_NAO_LIMPA';
  END IF;

  -- Limpeza da prova.
  DELETE FROM public.documentos_fiscais_eventos WHERE documento_id = v_doc_id;
  DELETE FROM public.documentos_fiscais_pendentes WHERE id = v_doc_id;

  RAISE NOTICE '307 OK — D-3 fechado: órfão → DLQ → claim ignora → resgate manual';
END
$verify$;

NOTIFY pgrst, 'reload schema';

COMMIT;
