-- Missão final — bug encontrado durante o fechamento de infraestrutura
-- local restante (item "auditoria/timeline"): o congelamento da identidade
-- de provider (Sprint C2.10/C2.11 — `documentos_fiscais_pendentes.provider`,
-- pré-condição fatal para POST) é uma UPDATE que NÃO muda `status`
-- (PENDENTE continua PENDENTE, só `provider` passa de NULL/legado para o
-- valor congelado). `tg_documentos_fiscais_eventos_au` (trigger AFTER
-- UPDATE que popula a timeline de auditoria) está inteiramente organizado
-- em torno de MUDANÇAS DE STATUS — o único caso que trata sem mudança de
-- status é ERRO-sem-mudar-status (payload de erro atualizado). O
-- congelamento de provider cai no `RETURN NEW` silencioso no fim do
-- primeiro bloco (`IF NEW.status IS NOT DISTINCT FROM OLD.status`) — nunca
-- gera evento. Resultado real: qual empresa+ambiente+provider processou
-- cada documento fiscal (dado de auditoria/compliance genuinamente
-- relevante — é exatamente o que decide se um POST pôde ou não acontecer,
-- ver P0-1 de C2.11) fica invisível na timeline (`documentos_fiscais_
-- eventos`), só reconstruível comparando snapshots manualmente.
--
-- CORREÇÃO: novo evento `PROVIDER_CONGELADO`, logado sempre que `provider`
-- muda de um valor NULO/não-reconhecido para um valor NÃO-nulo — isso só
-- pode ser o PRIMEIRO congelamento real (uma vez reconhecido, o trigger
-- `tg_documentos_fiscais_estado_bu`, que roda ANTES deste, já impede
-- qualquer UPDATE subsequente que mude um valor já reconhecido — ver
-- migration 20260903120000 — então este AFTER trigger nunca chega a rodar
-- para uma tentativa de mudança rejeitada). Checagem colocada no TOPO da
-- função, fora dos blocos de status, porque é ortogonal a qual branch de
-- status está sendo tratada (na prática, hoje, congelamento sempre
-- acontece numa UPDATE separada sem mudança de status — mas o código não
-- deve depender silenciosamente disso).
--
-- Nenhuma lógica de status pré-existente foi alterada — corpo idêntico ao
-- anterior em tudo o mais, só a checagem nova adicionada no início.
--
-- ROLLBACK: reaplicar a definição anterior de tg_documentos_fiscais_eventos_au,
-- disponível na migration que a criou/alterou por último antes desta.

BEGIN;

ALTER TABLE public.documentos_fiscais_eventos
  DROP CONSTRAINT IF EXISTS documentos_fiscais_eventos_tipo_check;
ALTER TABLE public.documentos_fiscais_eventos
  ADD CONSTRAINT documentos_fiscais_eventos_tipo_check
  CHECK (evento_tipo = ANY (ARRAY[
    'ENFILEIRADO', 'REENFILEIRADO', 'CLAIM', 'ERRO', 'ERRO_ENQUEUE', 'EMITIDO', 'REPROCESSO_MANUAL', 'CANCELADO',
    'XML_ARMAZENADO', 'XML_BLOCKED_EXTERNAL', 'XML_ERRO', 'PROVIDER_CONGELADO'
  ]));

CREATE OR REPLACE FUNCTION public.tg_documentos_fiscais_eventos_au()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_payload jsonb;
BEGIN
  -- Missão final — congelamento de identidade de provider (C2.10/C2.11):
  -- só pode ser o PRIMEIRO congelamento real (ver comentário da migration
  -- 20260903160000) — logado independente de qual branch de status abaixo
  -- também dispara nesta mesma UPDATE.
  IF OLD.provider IS DISTINCT FROM NEW.provider AND NEW.provider IS NOT NULL THEN
    INSERT INTO public.documentos_fiscais_eventos (
      documento_id, evento_tipo, status_antes, status_depois,
      actor_user_id, actor_role, origem_acao, payload
    ) VALUES (
      NEW.id, 'PROVIDER_CONGELADO', OLD.status, NEW.status,
      auth.uid(), current_setting('request.jwt.claim.role', true), 'FISCAL_WORKER_CONGELAMENTO_IDENTIDADE',
      jsonb_build_object('provider_congelado', NEW.provider, 'provider_anterior', OLD.provider)
    );
  END IF;

  -- A partir daqui, corpo IDÊNTICO ao anterior — nenhuma lógica de status
  -- pré-existente foi tocada.
  IF OLD.status = 'ERRO' AND NEW.status = 'PENDENTE' THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    IF NEW.status = 'ERRO'
      AND (
        NEW.ultimo_erro IS DISTINCT FROM OLD.ultimo_erro
        OR NEW.fiscal_error_code IS DISTINCT FROM OLD.fiscal_error_code
      ) THEN
      v_payload := jsonb_build_object(
        'ultimo_erro', NEW.ultimo_erro,
        'ultimo_erro_anterior', OLD.ultimo_erro,
        'fiscal_error_code', NEW.fiscal_error_code,
        'fiscal_error_code_anterior', OLD.fiscal_error_code,
        'fiscal_error_category', NEW.fiscal_error_category,
        'fiscal_error_category_anterior', OLD.fiscal_error_category,
        'tentativas', NEW.tentativas,
        'proxima_tentativa_em', NEW.proxima_tentativa_em,
        'ultima_tentativa_em', NEW.ultima_tentativa_em
      );
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
        NEW.id,
        'ERRO',
        OLD.status,
        NEW.status,
        auth.uid(),
        current_setting('request.jwt.claim.role', true),
        'ATUALIZACAO_ERRO_SEM_MUDANCA_STATUS',
        COALESCE(v_payload, '{}'::jsonb)
      );
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status = 'EM_PROCESSAMENTO'
    AND OLD.status IS DISTINCT FROM 'EM_PROCESSAMENTO'
    AND OLD.status IN ('PENDENTE', 'ERRO') THEN
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
      NEW.id,
      'CLAIM',
      OLD.status,
      NEW.status,
      auth.uid(),
      current_setting('request.jwt.claim.role', true),
      'FISCAL_CLAIM_WORKER',
      jsonb_build_object(
        'ultima_tentativa_em', NEW.ultima_tentativa_em,
        'tentativas', NEW.tentativas
      )
    );
    RETURN NEW;
  END IF;

  IF NEW.status = 'ERRO' AND OLD.status IS DISTINCT FROM 'ERRO' THEN
    v_payload := jsonb_build_object(
      'ultimo_erro', NEW.ultimo_erro,
      'ultimo_erro_anterior', OLD.ultimo_erro,
      'fiscal_error_code', NEW.fiscal_error_code,
      'fiscal_error_code_anterior', OLD.fiscal_error_code,
      'fiscal_error_category', NEW.fiscal_error_category,
      'fiscal_error_category_anterior', OLD.fiscal_error_category,
      'tentativas', NEW.tentativas,
      'proxima_tentativa_em', NEW.proxima_tentativa_em,
      'ultima_tentativa_em', NEW.ultima_tentativa_em
    );
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
      NEW.id,
      'ERRO',
      OLD.status,
      NEW.status,
      auth.uid(),
      current_setting('request.jwt.claim.role', true),
      'ATUALIZACAO_STATUS_ERRO',
      COALESCE(v_payload, '{}'::jsonb)
    );
    RETURN NEW;
  END IF;

  IF NEW.status = 'EMITIDO' AND OLD.status IS DISTINCT FROM 'EMITIDO' THEN
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
      NEW.id,
      'EMITIDO',
      OLD.status,
      NEW.status,
      auth.uid(),
      current_setting('request.jwt.claim.role', true),
      'ATUALIZACAO_STATUS_EMITIDO',
      jsonb_build_object(
        'chave_fiscal', NEW.chave_fiscal,
        'protocolo', NEW.protocolo,
        'provider_ref', NEW.provider_ref,
        'processado_em', NEW.processado_em
      )
    );
    RETURN NEW;
  END IF;

  IF NEW.status = 'CANCELADO' AND OLD.status IS DISTINCT FROM 'CANCELADO' THEN
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
      NEW.id,
      'CANCELADO',
      OLD.status,
      NEW.status,
      auth.uid(),
      current_setting('request.jwt.claim.role', true),
      'ATUALIZACAO_STATUS_CANCELADO',
      '{}'::jsonb
    );
  END IF;

  RETURN NEW;
END;
$function$;

NOTIFY pgrst, 'reload schema';

DO $verify$
DECLARE
  v_uid uuid;
  v_venda_id uuid;
  v_doc_id uuid;
BEGIN
  BEGIN
  IF position('PROVIDER_CONGELADO' IN pg_get_functiondef('tg_documentos_fiscais_eventos_au'::regproc)) = 0 THEN
    RAISE EXCEPTION 'EVT_PROVIDER_CONGELADO_AUSENTE_NA_FUNCAO';
  END IF;
  -- Regressão: blocos de status pré-existentes continuam presentes.
  IF position('ATUALIZACAO_STATUS_EMITIDO' IN pg_get_functiondef('tg_documentos_fiscais_eventos_au'::regproc)) = 0 THEN
    RAISE EXCEPTION 'EVT_REGRESSAO_BLOCO_EMITIDO_AUSENTE';
  END IF;

  SELECT id INTO v_uid FROM public.usuarios LIMIT 1;
  IF v_uid IS NULL THEN
    RAISE NOTICE 'EVT_PROVIDER_CONGELADO: sem usuário para prova viva; verificação estrutural OK';
    RETURN;
  END IF;

  v_venda_id := gen_random_uuid();
  INSERT INTO public.vendas (id, operador_id, total_bruto, total_desconto, total_liquido, forma_pagamento, status)
  VALUES (v_venda_id, v_uid, 10, 0, 10, 'DINHEIRO', 'CONCLUIDA');
  INSERT INTO public.documentos_fiscais_pendentes (venda_id, tipo_doc, status, payload)
  VALUES (v_venda_id, 'NFC_E_STUB', 'PENDENTE', '{}'::jsonb)
  RETURNING id INTO v_doc_id;

  IF EXISTS (SELECT 1 FROM public.documentos_fiscais_eventos WHERE documento_id = v_doc_id AND evento_tipo = 'PROVIDER_CONGELADO') THEN
    RAISE EXCEPTION 'EVT_PROVIDER_CONGELADO_APARECEU_ANTES_DO_CONGELAMENTO';
  END IF;

  -- Congela — mesma operação exata que index.ts faz (UPDATE só de provider,
  -- status intocado).
  UPDATE public.documentos_fiscais_pendentes SET provider = 'focus:homologacao:loja-x' WHERE id = v_doc_id;

  IF NOT EXISTS (
    SELECT 1 FROM public.documentos_fiscais_eventos
    WHERE documento_id = v_doc_id AND evento_tipo = 'PROVIDER_CONGELADO'
      AND payload->>'provider_congelado' = 'focus:homologacao:loja-x'
      AND payload->>'provider_anterior' IS NULL
  ) THEN
    RAISE EXCEPTION 'EVT_PROVIDER_CONGELADO_NAO_REGISTRADO';
  END IF;
  RAISE NOTICE 'PROVA (1) PASS: congelamento de provider gera evento PROVIDER_CONGELADO na timeline';

  -- Confirma que NÃO gera evento duplicado numa UPDATE não relacionada
  -- (ex.: claim, que muda status mas não provider outra vez).
  UPDATE public.documentos_fiscais_pendentes SET status = 'EM_PROCESSAMENTO' WHERE id = v_doc_id;
  IF (SELECT count(*) FROM public.documentos_fiscais_eventos WHERE documento_id = v_doc_id AND evento_tipo = 'PROVIDER_CONGELADO') <> 1 THEN
    RAISE EXCEPTION 'EVT_PROVIDER_CONGELADO_DUPLICOU_EM_UPDATE_SEM_MUDAR_PROVIDER';
  END IF;
  RAISE NOTICE 'PROVA (2) PASS: UPDATE subsequente que não muda provider não duplica o evento';

  DELETE FROM public.documentos_fiscais_eventos WHERE documento_id = v_doc_id;
  DELETE FROM public.documentos_fiscais_pendentes WHERE id = v_doc_id;
  DELETE FROM public.vendas WHERE id = v_venda_id;
  RAISE NOTICE 'EVT_PROVIDER_CONGELADO: TODAS AS PROVAS VIVAS PASSARAM';
    RAISE EXCEPTION USING ERRCODE = 'ZX001', MESSAGE = 'verify-rollback-sentinel';
  EXCEPTION
    WHEN SQLSTATE 'ZX001' THEN
      NULL;
  END;
END
$verify$;

COMMIT;
