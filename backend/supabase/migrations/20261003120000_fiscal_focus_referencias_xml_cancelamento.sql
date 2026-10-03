-- Sprint P0 Focus NFe — referências Focus, XML real (autorização) e
-- cancelamento fiscal com XML separado.
--
-- STATUS: NÃO APLICADA em nenhum ambiente remoto. Depende das migrations
-- fiscais 20260902130000..20260903180000 (também ainda não aplicadas em
-- produção — ver plano de aplicação das 26 migrations pendentes).
--
-- CONTRATO FOCUS (resposta oficial recebida pelo cliente, 2026-10-03):
--   - emissão NFC-e devolve `caminho_xml_nota_fiscal`, `caminho_danfe`,
--     `qrcode_url`; links sem autenticação, sem expiração, XML/DANFCe por 5 anos;
--   - cancelamento devolve `status = cancelado`, `caminho_xml_cancelamento`,
--     `numero_protocolo`.
--
-- O QUE MUDA
--   1. Colunas com a referência ORIGINAL devolvida pela Focus (auditoria —
--      ficam mesmo depois do XML estar no Storage): focus_xml_path,
--      focus_danfe_path, focus_qrcode_url. Imutáveis depois de gravadas.
--   2. `fiscal_marcar_emitido_focus`: marca EMITIDO e grava as referências na
--      MESMA transação (sem janela onde o documento está EMITIDO sem o caminho
--      do XML). Reusa `fiscal_marcar_emitido` — nenhuma regra de emissão nova.
--   3. `fiscal_registrar_referencias_focus`: preenche só referências ainda
--      NULAS (recuperação via consulta para documentos emitidos antes disto).
--   4. Cancelamento: solicitação com lease (`fiscal_iniciar_cancelamento`),
--      confirmação (`fiscal_marcar_cancelado`) e erro
--      (`fiscal_marcar_cancelamento_erro`). CANCELADO nunca volta para EMITIDO
--      (já garantido pelo trigger de estado; não alterado).
--   5. XML de cancelamento: colunas e fila PRÓPRIAS (xml_cancelamento_*),
--      mesmo padrão de lease/monotonicidade da fila do XML de autorização.
--      Path distinto no Storage — o XML da autorização nunca é sobrescrito.
--   6. Fila do XML de AUTORIZAÇÃO passa a aceitar documentos CANCELADO (o XML
--      autorizado continua sendo artefato fiscal a preservar mesmo após o
--      cancelamento) e devolve `focus_xml_path` no claim.
--
-- ROLLBACK: backend/supabase/rollback/20261003120000_fiscal_focus_referencias_xml_cancelamento.rollback.sql

BEGIN;

-- 1. Colunas -----------------------------------------------------------------
ALTER TABLE public.documentos_fiscais_pendentes
  ADD COLUMN IF NOT EXISTS focus_xml_path text,
  ADD COLUMN IF NOT EXISTS focus_danfe_path text,
  ADD COLUMN IF NOT EXISTS focus_qrcode_url text,
  ADD COLUMN IF NOT EXISTS cancelamento_justificativa text,
  ADD COLUMN IF NOT EXISTS cancelamento_solicitado_em timestamptz,
  ADD COLUMN IF NOT EXISTS cancelamento_tentativas integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cancelamento_lease_token uuid,
  ADD COLUMN IF NOT EXISTS cancelamento_lease_expires_em timestamptz,
  ADD COLUMN IF NOT EXISTS cancelamento_ultimo_erro text,
  ADD COLUMN IF NOT EXISTS cancelamento_protocolo text,
  ADD COLUMN IF NOT EXISTS cancelado_em timestamptz,
  ADD COLUMN IF NOT EXISTS focus_xml_cancelamento_path text,
  ADD COLUMN IF NOT EXISTS xml_cancelamento_status text NOT NULL DEFAULT 'NAO_APLICAVEL',
  ADD COLUMN IF NOT EXISTS xml_cancelamento_storage_path text,
  ADD COLUMN IF NOT EXISTS xml_cancelamento_sha256 text,
  ADD COLUMN IF NOT EXISTS xml_cancelamento_armazenado_em timestamptz,
  ADD COLUMN IF NOT EXISTS xml_cancelamento_ultimo_erro text,
  ADD COLUMN IF NOT EXISTS xml_cancelamento_tentativas integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS xml_cancelamento_proxima_tentativa_em timestamptz,
  ADD COLUMN IF NOT EXISTS xml_cancelamento_lease_token uuid,
  ADD COLUMN IF NOT EXISTS xml_cancelamento_lease_expires_em timestamptz;

ALTER TABLE public.documentos_fiscais_pendentes
  DROP CONSTRAINT IF EXISTS documentos_fiscais_xml_cancelamento_status_check;
ALTER TABLE public.documentos_fiscais_pendentes
  ADD CONSTRAINT documentos_fiscais_xml_cancelamento_status_check
  CHECK (xml_cancelamento_status = ANY (ARRAY['NAO_APLICAVEL', 'PENDENTE', 'EM_PROCESSAMENTO', 'ARMAZENADO', 'BLOCKED_EXTERNAL', 'ERRO']));

ALTER TABLE public.documentos_fiscais_pendentes
  DROP CONSTRAINT IF EXISTS documentos_fiscais_cancelamento_justificativa_check;
ALTER TABLE public.documentos_fiscais_pendentes
  ADD CONSTRAINT documentos_fiscais_cancelamento_justificativa_check
  CHECK (cancelamento_justificativa IS NULL OR char_length(cancelamento_justificativa) BETWEEN 15 AND 255);

CREATE INDEX IF NOT EXISTS idx_doc_fiscal_xml_cancelamento_fila
  ON public.documentos_fiscais_pendentes (xml_cancelamento_proxima_tentativa_em)
  WHERE status = 'CANCELADO' AND xml_cancelamento_status IN ('PENDENTE', 'ERRO', 'EM_PROCESSAMENTO');

COMMENT ON COLUMN public.documentos_fiscais_pendentes.focus_xml_path IS
  'Valor original de `caminho_xml_nota_fiscal` devolvido pela Focus na autorização. Imutável; preservado para auditoria mesmo após o XML estar no Storage.';
COMMENT ON COLUMN public.documentos_fiscais_pendentes.focus_danfe_path IS
  'Valor original de `caminho_danfe` devolvido pela Focus. Imutável.';
COMMENT ON COLUMN public.documentos_fiscais_pendentes.focus_qrcode_url IS
  'Valor original de `qrcode_url` devolvido pela Focus (NFC-e). Imutável.';
COMMENT ON COLUMN public.documentos_fiscais_pendentes.focus_xml_cancelamento_path IS
  'Valor original de `caminho_xml_cancelamento` devolvido pela Focus no cancelamento. Imutável.';
COMMENT ON COLUMN public.documentos_fiscais_pendentes.cancelamento_protocolo IS
  'Valor de `numero_protocolo` devolvido pela Focus no cancelamento. Imutável.';

-- 2. Eventos de auditoria novos ---------------------------------------------
ALTER TABLE public.documentos_fiscais_eventos
  DROP CONSTRAINT IF EXISTS documentos_fiscais_eventos_tipo_check;
ALTER TABLE public.documentos_fiscais_eventos
  ADD CONSTRAINT documentos_fiscais_eventos_tipo_check
  CHECK (evento_tipo = ANY (ARRAY[
    'ENFILEIRADO', 'REENFILEIRADO', 'CLAIM', 'ERRO', 'ERRO_ENQUEUE', 'EMITIDO', 'REPROCESSO_MANUAL', 'CANCELADO',
    'XML_ARMAZENADO', 'XML_BLOCKED_EXTERNAL', 'XML_ERRO', 'PROVIDER_CONGELADO',
    'REFERENCIAS_FOCUS_REGISTRADAS', 'CANCELAMENTO_SOLICITADO', 'CANCELAMENTO_ERRO',
    'XML_CANCELAMENTO_ARMAZENADO', 'XML_CANCELAMENTO_BLOCKED_EXTERNAL', 'XML_CANCELAMENTO_ERRO'
  ]));

-- 3. Trigger de estado: corpo anterior (20260903170000) intacto + guardas
--    novas para referências Focus, cancelamento e XML de cancelamento.
CREATE OR REPLACE FUNCTION public.tg_documentos_fiscais_estado_bu()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Sprint C2.10 (P0-1): identidade do provider imutável uma vez reconhecida.
  IF OLD.provider IS NOT NULL
     AND (
       OLD.provider = ANY (ARRAY['mock', 'http', 'bling'])
       OR OLD.provider ~ '^focus:(homologacao|producao):.+$'
     )
     AND NEW.provider IS DISTINCT FROM OLD.provider THEN
    RAISE EXCEPTION 'FISCAL_PROVIDER_IMUTAVEL_APOS_CONGELADO:%->%', OLD.provider, NEW.provider;
  END IF;

  -- Sprint P0 Focus: referências devolvidas pela Focus são registro de
  -- auditoria — uma vez gravadas, nunca mudam (só NULL -> valor).
  IF (OLD.focus_xml_path IS NOT NULL AND NEW.focus_xml_path IS DISTINCT FROM OLD.focus_xml_path)
     OR (OLD.focus_danfe_path IS NOT NULL AND NEW.focus_danfe_path IS DISTINCT FROM OLD.focus_danfe_path)
     OR (OLD.focus_qrcode_url IS NOT NULL AND NEW.focus_qrcode_url IS DISTINCT FROM OLD.focus_qrcode_url)
     OR (OLD.focus_xml_cancelamento_path IS NOT NULL AND NEW.focus_xml_cancelamento_path IS DISTINCT FROM OLD.focus_xml_cancelamento_path)
     OR (OLD.cancelamento_protocolo IS NOT NULL AND NEW.cancelamento_protocolo IS DISTINCT FROM OLD.cancelamento_protocolo) THEN
    RAISE EXCEPTION 'FISCAL_REFERENCIA_FOCUS_IMUTAVEL';
  END IF;

  IF OLD.xml_status IS DISTINCT FROM NEW.xml_status THEN
    IF NOT (
      (OLD.xml_status = 'NAO_APLICAVEL' AND NEW.xml_status = 'PENDENTE')
      OR (OLD.xml_status IN ('PENDENTE', 'ERRO') AND NEW.xml_status = 'EM_PROCESSAMENTO')
      OR (OLD.xml_status = 'EM_PROCESSAMENTO' AND NEW.xml_status IN ('EM_PROCESSAMENTO', 'ARMAZENADO', 'BLOCKED_EXTERNAL', 'ERRO'))
    ) THEN
      RAISE EXCEPTION 'FISCAL_XML_TRANSICAO_INVALIDA:%->%', OLD.xml_status, NEW.xml_status;
    END IF;
  END IF;

  IF OLD.xml_status = 'ARMAZENADO'
     AND (NEW.xml_storage_path IS DISTINCT FROM OLD.xml_storage_path OR NEW.xml_sha256 IS DISTINCT FROM OLD.xml_sha256) THEN
    RAISE EXCEPTION 'FISCAL_XML_ARMAZENADO_PATH_HASH_IMUTAVEL';
  END IF;

  -- Sprint P0 Focus: mesma máquina de estados para o XML de cancelamento.
  IF OLD.xml_cancelamento_status IS DISTINCT FROM NEW.xml_cancelamento_status THEN
    IF NOT (
      (OLD.xml_cancelamento_status = 'NAO_APLICAVEL' AND NEW.xml_cancelamento_status = 'PENDENTE')
      OR (OLD.xml_cancelamento_status IN ('PENDENTE', 'ERRO') AND NEW.xml_cancelamento_status = 'EM_PROCESSAMENTO')
      OR (OLD.xml_cancelamento_status = 'EM_PROCESSAMENTO' AND NEW.xml_cancelamento_status IN ('EM_PROCESSAMENTO', 'ARMAZENADO', 'BLOCKED_EXTERNAL', 'ERRO'))
    ) THEN
      RAISE EXCEPTION 'FISCAL_XML_CANCELAMENTO_TRANSICAO_INVALIDA:%->%', OLD.xml_cancelamento_status, NEW.xml_cancelamento_status;
    END IF;
  END IF;

  IF OLD.xml_cancelamento_status = 'ARMAZENADO'
     AND (NEW.xml_cancelamento_storage_path IS DISTINCT FROM OLD.xml_cancelamento_storage_path
          OR NEW.xml_cancelamento_sha256 IS DISTINCT FROM OLD.xml_cancelamento_sha256) THEN
    RAISE EXCEPTION 'FISCAL_XML_CANCELAMENTO_ARMAZENADO_PATH_HASH_IMUTAVEL';
  END IF;

  -- A partir daqui, corpo IDÊNTICO ao anterior.
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'CANCELADO' THEN
    NEW.ultima_transicao_em := now();
    NEW.transicao_origem := concat(OLD.status, '>CANCELADO');
    RETURN NEW;
  END IF;

  IF NOT (
    (OLD.status = 'PENDENTE' AND NEW.status IN ('EM_PROCESSAMENTO', 'ERRO', 'CANCELADO'))
    OR (OLD.status = 'ERRO' AND NEW.status IN ('PENDENTE', 'EM_PROCESSAMENTO', 'CANCELADO'))
    OR (OLD.status = 'EM_PROCESSAMENTO' AND NEW.status IN ('EMITIDO', 'ERRO', 'PENDENTE', 'CANCELADO'))
    OR (OLD.status = 'EMITIDO' AND NEW.status IN ('CANCELADO'))
  ) THEN
    RAISE EXCEPTION 'FISCAL_TRANSICAO_INVALIDA:%->%', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.ultima_transicao_em := now();
  NEW.transicao_origem := concat(OLD.status, '>', NEW.status);

  IF NEW.status = 'EMITIDO' AND NEW.xml_status = 'NAO_APLICAVEL' THEN
    NEW.xml_status := 'PENDENTE';
  END IF;

  RETURN NEW;
END;
$function$;

-- 4. Emissão autorizada + referências Focus, numa transação só -------------
CREATE OR REPLACE FUNCTION public.fiscal_marcar_emitido_focus(
  p_documento_id uuid,
  p_chave_fiscal text,
  p_protocolo text,
  p_provider_ref text DEFAULT NULL,
  p_focus_xml_path text DEFAULT NULL,
  p_focus_danfe_path text DEFAULT NULL,
  p_focus_qrcode_url text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND current_user <> 'postgres' THEN
    RAISE EXCEPTION 'FISCAL_EMITIDO_FORBIDDEN';
  END IF;

  -- Mesma regra de sempre (nunca passa payload: o snapshot congelado fica intacto).
  PERFORM public.fiscal_marcar_emitido(p_documento_id, p_chave_fiscal, p_protocolo, p_provider_ref, NULL);

  UPDATE public.documentos_fiscais_pendentes
  SET focus_xml_path = COALESCE(focus_xml_path, NULLIF(trim(p_focus_xml_path), '')),
      focus_danfe_path = COALESCE(focus_danfe_path, NULLIF(trim(p_focus_danfe_path), '')),
      focus_qrcode_url = COALESCE(focus_qrcode_url, NULLIF(trim(p_focus_qrcode_url), '')),
      updated_at = now()
  WHERE id = p_documento_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.fiscal_marcar_emitido_focus(uuid, text, text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fiscal_marcar_emitido_focus(uuid, text, text, text, text, text, text) TO service_role;

-- 5. Recuperação de referências (documento já emitido sem referência) -------
CREATE OR REPLACE FUNCTION public.fiscal_registrar_referencias_focus(
  p_documento_id uuid,
  p_focus_xml_path text,
  p_focus_danfe_path text DEFAULT NULL,
  p_focus_qrcode_url text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_antes record;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND current_user <> 'postgres' THEN
    RAISE EXCEPTION 'FISCAL_REFERENCIAS_FORBIDDEN';
  END IF;

  SELECT status, focus_xml_path, focus_danfe_path, focus_qrcode_url INTO v_antes
  FROM public.documentos_fiscais_pendentes WHERE id = p_documento_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_DOCUMENTO_NAO_ENCONTRADO';
  END IF;
  IF v_antes.status NOT IN ('EMITIDO', 'CANCELADO') THEN
    RAISE EXCEPTION 'FISCAL_REFERENCIAS_SO_PARA_DOCUMENTO_AUTORIZADO:%', v_antes.status;
  END IF;

  UPDATE public.documentos_fiscais_pendentes
  SET focus_xml_path = COALESCE(focus_xml_path, NULLIF(trim(p_focus_xml_path), '')),
      focus_danfe_path = COALESCE(focus_danfe_path, NULLIF(trim(p_focus_danfe_path), '')),
      focus_qrcode_url = COALESCE(focus_qrcode_url, NULLIF(trim(p_focus_qrcode_url), '')),
      updated_at = now()
  WHERE id = p_documento_id
    AND (
      (focus_xml_path IS NULL AND NULLIF(trim(p_focus_xml_path), '') IS NOT NULL)
      OR (focus_danfe_path IS NULL AND NULLIF(trim(p_focus_danfe_path), '') IS NOT NULL)
      OR (focus_qrcode_url IS NULL AND NULLIF(trim(p_focus_qrcode_url), '') IS NOT NULL)
    );

  IF FOUND THEN
    INSERT INTO public.documentos_fiscais_eventos (documento_id, evento_tipo, origem_acao, payload)
    VALUES (p_documento_id, 'REFERENCIAS_FOCUS_REGISTRADAS', 'FISCAL_WORKER_XML',
            jsonb_build_object('focus_xml_path', p_focus_xml_path, 'focus_danfe_path', p_focus_danfe_path, 'focus_qrcode_url', p_focus_qrcode_url));
  END IF;
  RETURN FOUND;
END;
$function$;

REVOKE ALL ON FUNCTION public.fiscal_registrar_referencias_focus(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fiscal_registrar_referencias_focus(uuid, text, text, text) TO service_role;

-- 6. Cancelamento ------------------------------------------------------------
-- Início com lease: no máximo UMA chamada de cancelamento em andamento por
-- documento. `tentativas_anteriores > 0` obriga o worker a consultar a Focus
-- antes de repetir o pedido (mesmo princípio do retry seguro da emissão).
CREATE OR REPLACE FUNCTION public.fiscal_iniciar_cancelamento(
  p_documento_id uuid,
  p_justificativa text,
  p_lease_segundos integer DEFAULT 120
)
RETURNS TABLE(
  resultado text,
  id uuid,
  venda_id uuid,
  tipo_doc text,
  provider text,
  payload jsonb,
  correlation_id uuid,
  cancelamento_tentativas_anteriores integer,
  cancelamento_lease_token uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_doc record;
  v_just text := trim(COALESCE(p_justificativa, ''));
  v_lease_segundos integer := GREATEST(30, LEAST(COALESCE(p_lease_segundos, 120), 900));
  v_token uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND current_user <> 'postgres' THEN
    RAISE EXCEPTION 'FISCAL_CANCELAMENTO_FORBIDDEN';
  END IF;
  IF char_length(v_just) < 15 OR char_length(v_just) > 255 THEN
    RAISE EXCEPTION 'FISCAL_CANCELAMENTO_JUSTIFICATIVA_INVALIDA: entre 15 e 255 caracteres';
  END IF;

  SELECT d.* INTO v_doc
  FROM public.documentos_fiscais_pendentes d
  WHERE d.id = p_documento_id AND d.deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_DOCUMENTO_NAO_ENCONTRADO';
  END IF;

  IF v_doc.status = 'CANCELADO' THEN
    RETURN QUERY SELECT 'JA_CANCELADO'::text, v_doc.id, v_doc.venda_id, v_doc.tipo_doc, v_doc.provider,
      v_doc.payload, v_doc.correlation_id, v_doc.cancelamento_tentativas, NULL::uuid;
    RETURN;
  END IF;
  IF v_doc.status <> 'EMITIDO' THEN
    RAISE EXCEPTION 'FISCAL_CANCELAMENTO_SO_PARA_DOCUMENTO_EMITIDO:%', v_doc.status;
  END IF;
  IF v_doc.cancelamento_lease_token IS NOT NULL AND v_doc.cancelamento_lease_expires_em > now() THEN
    RETURN QUERY SELECT 'EM_ANDAMENTO'::text, v_doc.id, v_doc.venda_id, v_doc.tipo_doc, v_doc.provider,
      v_doc.payload, v_doc.correlation_id, v_doc.cancelamento_tentativas, NULL::uuid;
    RETURN;
  END IF;

  v_token := gen_random_uuid();
  UPDATE public.documentos_fiscais_pendentes d
  SET cancelamento_justificativa = v_just,
      cancelamento_solicitado_em = COALESCE(d.cancelamento_solicitado_em, now()),
      cancelamento_tentativas = d.cancelamento_tentativas + 1,
      cancelamento_lease_token = v_token,
      cancelamento_lease_expires_em = now() + make_interval(secs => v_lease_segundos),
      updated_at = now()
  WHERE d.id = p_documento_id;

  INSERT INTO public.documentos_fiscais_eventos (documento_id, evento_tipo, status_antes, status_depois, origem_acao, payload)
  VALUES (p_documento_id, 'CANCELAMENTO_SOLICITADO', v_doc.status, v_doc.status, 'FISCAL_WORKER_CANCELAMENTO',
          jsonb_build_object('justificativa', v_just, 'tentativa', v_doc.cancelamento_tentativas + 1));

  RETURN QUERY SELECT 'INICIADO'::text, v_doc.id, v_doc.venda_id, v_doc.tipo_doc, v_doc.provider,
    v_doc.payload, v_doc.correlation_id, v_doc.cancelamento_tentativas, v_token;
END;
$function$;

REVOKE ALL ON FUNCTION public.fiscal_iniciar_cancelamento(uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fiscal_iniciar_cancelamento(uuid, text, integer) TO service_role;

-- Confirmação de cancelamento pela Focus. Com lease: só o dono do pedido
-- confirma. Sem lease (NULL): a Focus informou `cancelado` numa consulta/
-- emissão (reconciliação) — aceito para qualquer estado não terminal.
-- Idempotente sobre CANCELADO: só completa referências ainda nulas.
CREATE OR REPLACE FUNCTION public.fiscal_marcar_cancelado(
  p_documento_id uuid,
  p_protocolo_cancelamento text,
  p_focus_xml_cancelamento_path text,
  p_lease_token uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_doc record;
  v_path text := NULLIF(trim(COALESCE(p_focus_xml_cancelamento_path, '')), '');
  v_proto text := NULLIF(trim(COALESCE(p_protocolo_cancelamento, '')), '');
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND current_user <> 'postgres' THEN
    RAISE EXCEPTION 'FISCAL_CANCELAMENTO_FORBIDDEN';
  END IF;

  SELECT d.status, d.cancelamento_lease_token, d.xml_cancelamento_status INTO v_doc
  FROM public.documentos_fiscais_pendentes d WHERE d.id = p_documento_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_DOCUMENTO_NAO_ENCONTRADO';
  END IF;

  IF v_doc.status = 'CANCELADO' THEN
    UPDATE public.documentos_fiscais_pendentes
    SET cancelamento_protocolo = COALESCE(cancelamento_protocolo, v_proto),
        focus_xml_cancelamento_path = COALESCE(focus_xml_cancelamento_path, v_path),
        xml_cancelamento_status = CASE
          WHEN xml_cancelamento_status = 'NAO_APLICAVEL' AND COALESCE(focus_xml_cancelamento_path, v_path) IS NOT NULL THEN 'PENDENTE'
          ELSE xml_cancelamento_status END,
        cancelamento_lease_token = NULL,
        cancelamento_lease_expires_em = NULL,
        updated_at = now()
    WHERE id = p_documento_id;
    RETURN true;
  END IF;

  IF p_lease_token IS NOT NULL AND v_doc.cancelamento_lease_token IS DISTINCT FROM p_lease_token THEN
    RAISE NOTICE 'FISCAL_CANCELAMENTO_LEASE_STALE_IGNORADO: documento=%', p_documento_id;
    RETURN false;
  END IF;

  UPDATE public.documentos_fiscais_pendentes
  SET status = 'CANCELADO',
      cancelamento_protocolo = v_proto,
      focus_xml_cancelamento_path = v_path,
      cancelado_em = now(),
      cancelamento_ultimo_erro = NULL,
      cancelamento_lease_token = NULL,
      cancelamento_lease_expires_em = NULL,
      xml_cancelamento_status = CASE WHEN v_path IS NOT NULL THEN 'PENDENTE' ELSE xml_cancelamento_status END,
      proxima_tentativa_em = NULL,
      updated_at = now()
  WHERE id = p_documento_id;

  -- O evento 'CANCELADO' da timeline já é gravado pelo trigger
  -- tg_documentos_fiscais_eventos_au na mudança de status; protocolo e
  -- caminho ficam nas colunas imutáveis acima.
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.fiscal_marcar_cancelado(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fiscal_marcar_cancelado(uuid, text, text, uuid) TO service_role;

-- Falha do pedido de cancelamento: documento continua EMITIDO; lease liberado.
CREATE OR REPLACE FUNCTION public.fiscal_marcar_cancelamento_erro(
  p_documento_id uuid,
  p_erro text,
  p_lease_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND current_user <> 'postgres' THEN
    RAISE EXCEPTION 'FISCAL_CANCELAMENTO_FORBIDDEN';
  END IF;

  UPDATE public.documentos_fiscais_pendentes
  SET cancelamento_ultimo_erro = LEFT(COALESCE(p_erro, 'ERRO_CANCELAMENTO_DESCONHECIDO'), 1000),
      cancelamento_lease_token = NULL,
      cancelamento_lease_expires_em = NULL,
      updated_at = now()
  WHERE id = p_documento_id
    AND status = 'EMITIDO'
    AND cancelamento_lease_token = p_lease_token;

  IF FOUND THEN
    INSERT INTO public.documentos_fiscais_eventos (documento_id, evento_tipo, status_antes, status_depois, origem_acao, payload)
    VALUES (p_documento_id, 'CANCELAMENTO_ERRO', 'EMITIDO', 'EMITIDO', 'FISCAL_WORKER_CANCELAMENTO', jsonb_build_object('erro', p_erro));
    RETURN true;
  END IF;
  RAISE NOTICE 'FISCAL_CANCELAMENTO_ERRO_IGNORADO: documento=%', p_documento_id;
  RETURN false;
END;
$function$;

REVOKE ALL ON FUNCTION public.fiscal_marcar_cancelamento_erro(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fiscal_marcar_cancelamento_erro(uuid, text, uuid) TO service_role;

-- 7. Fila do XML de AUTORIZAÇÃO: aceita EMITIDO ou CANCELADO e devolve a
--    referência Focus. Retorno muda -> DROP + CREATE (mesmos argumentos).
DROP FUNCTION IF EXISTS public.fiscal_claim_documentos_xml(integer, integer);

CREATE FUNCTION public.fiscal_claim_documentos_xml(p_limit integer DEFAULT 20, p_lease_segundos integer DEFAULT 300)
RETURNS TABLE(id uuid, venda_id uuid, tipo_doc text, provider text, payload jsonb, correlation_id uuid, xml_status text, xml_tentativas integer, xml_lease_token uuid, focus_xml_path text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 20), 100));
  v_lease_segundos integer := GREATEST(30, LEAST(COALESCE(p_lease_segundos, 300), 3600));
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND current_user <> 'postgres' THEN
    RAISE EXCEPTION 'FISCAL_CLAIM_XML_FORBIDDEN';
  END IF;

  RETURN QUERY
  WITH candidatos AS (
    SELECT d.id
    FROM public.documentos_fiscais_pendentes d
    WHERE d.status IN ('EMITIDO', 'CANCELADO')
      AND d.deleted_at IS NULL
      AND (
        d.xml_status IN ('PENDENTE', 'ERRO')
        OR (d.xml_status = 'EM_PROCESSAMENTO' AND d.xml_lease_expires_em < now())
      )
      AND (d.xml_proxima_tentativa_em IS NULL OR d.xml_proxima_tentativa_em <= now())
    ORDER BY d.processado_em ASC NULLS LAST, d.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT v_limit
  ),
  claimed AS (
    UPDATE public.documentos_fiscais_pendentes d
    SET
      xml_status = 'EM_PROCESSAMENTO',
      xml_lease_token = gen_random_uuid(),
      xml_lease_expires_em = now() + make_interval(secs => v_lease_segundos),
      updated_at = now()
    FROM candidatos c
    WHERE d.id = c.id
    RETURNING d.*
  )
  SELECT
    claimed.id, claimed.venda_id, claimed.tipo_doc, claimed.provider, claimed.payload,
    claimed.correlation_id, claimed.xml_status, claimed.xml_tentativas, claimed.xml_lease_token,
    claimed.focus_xml_path
  FROM claimed;
END;
$function$;

REVOKE ALL ON FUNCTION public.fiscal_claim_documentos_xml(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fiscal_claim_documentos_xml(integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.fiscal_marcar_xml_armazenado(p_documento_id uuid, p_storage_path text, p_sha256 text, p_lease_token uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_atual record;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND current_user <> 'postgres' THEN
    RAISE EXCEPTION 'FISCAL_MARCAR_XML_FORBIDDEN';
  END IF;
  IF p_storage_path IS NULL OR trim(p_storage_path) = '' THEN
    RAISE EXCEPTION 'FISCAL_XML_STORAGE_PATH_OBRIGATORIO';
  END IF;
  IF p_sha256 IS NULL OR p_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'FISCAL_XML_SHA256_INVALIDO';
  END IF;

  -- Tentativa ATÔMICA: a posse do lease é parte do próprio WHERE — nenhuma
  -- janela entre checar e escrever (achado Codex, ver cabeçalho).
  UPDATE public.documentos_fiscais_pendentes
  SET xml_status = 'ARMAZENADO',
      xml_storage_path = p_storage_path,
      xml_sha256 = p_sha256,
      xml_armazenado_em = now(),
      xml_ultimo_erro = NULL,
      xml_lease_token = NULL,
      xml_lease_expires_em = NULL,
      updated_at = now()
  WHERE id = p_documento_id
    AND status IN ('EMITIDO', 'CANCELADO')
    AND xml_status = 'EM_PROCESSAMENTO'
    AND xml_lease_token = p_lease_token;

  IF FOUND THEN
    INSERT INTO public.documentos_fiscais_eventos (documento_id, evento_tipo, origem_acao, payload)
    VALUES (p_documento_id, 'XML_ARMAZENADO', 'FISCAL_WORKER_XML', jsonb_build_object('storage_path', p_storage_path, 'sha256', p_sha256));
    RETURN true;
  END IF;

  -- UPDATE não aplicou — já sabemos que nada foi escrito; esta leitura só
  -- existe para relatar o motivo exato (sem risco de corrida: a decisão
  -- "escreveu ou não" já está tomada acima, de forma atômica).
  SELECT status, xml_status, xml_storage_path, xml_sha256 INTO v_atual
  FROM public.documentos_fiscais_pendentes WHERE id = p_documento_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_DOCUMENTO_NAO_ENCONTRADO';
  END IF;
  IF v_atual.status NOT IN ('EMITIDO', 'CANCELADO') THEN
    RAISE EXCEPTION 'FISCAL_XML_SO_PARA_DOCUMENTO_EMITIDO_OU_CANCELADO:%', v_atual.status;
  END IF;
  IF v_atual.xml_status = 'ARMAZENADO' THEN
    IF v_atual.xml_storage_path = p_storage_path AND v_atual.xml_sha256 = p_sha256 THEN
      RETURN true;
    END IF;
    RAISE EXCEPTION 'FISCAL_XML_JA_ARMAZENADO_IMUTAVEL:path_atual=%,path_novo=%', v_atual.xml_storage_path, p_storage_path;
  END IF;
  RAISE NOTICE 'FISCAL_XML_ARMAZENAR_IGNORADO: documento=%, xml_status_atual=%', p_documento_id, v_atual.xml_status;
  RETURN false;
END;
$function$

;

CREATE OR REPLACE FUNCTION public.fiscal_marcar_xml_bloqueado(p_documento_id uuid, p_motivo text, p_lease_token uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_atual record;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND current_user <> 'postgres' THEN
    RAISE EXCEPTION 'FISCAL_MARCAR_XML_FORBIDDEN';
  END IF;

  UPDATE public.documentos_fiscais_pendentes
  SET xml_status = 'BLOCKED_EXTERNAL',
      xml_ultimo_erro = LEFT(COALESCE(p_motivo, 'BLOCKED_EXTERNAL'), 1000),
      xml_lease_token = NULL,
      xml_lease_expires_em = NULL,
      updated_at = now()
  WHERE id = p_documento_id
    AND status IN ('EMITIDO', 'CANCELADO')
    AND xml_status = 'EM_PROCESSAMENTO'
    AND xml_lease_token = p_lease_token;

  IF FOUND THEN
    INSERT INTO public.documentos_fiscais_eventos (documento_id, evento_tipo, origem_acao, payload)
    VALUES (p_documento_id, 'XML_BLOCKED_EXTERNAL', 'FISCAL_WORKER_XML', jsonb_build_object('motivo', p_motivo));
    RETURN true;
  END IF;

  SELECT status, xml_status INTO v_atual FROM public.documentos_fiscais_pendentes WHERE id = p_documento_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_DOCUMENTO_NAO_ENCONTRADO';
  END IF;
  IF v_atual.status NOT IN ('EMITIDO', 'CANCELADO') THEN
    RAISE EXCEPTION 'FISCAL_XML_SO_PARA_DOCUMENTO_EMITIDO_OU_CANCELADO:%', v_atual.status;
  END IF;
  RAISE NOTICE 'FISCAL_XML_BLOQUEAR_IGNORADO: documento=%, xml_status_atual=%', p_documento_id, v_atual.xml_status;
  RETURN false;
END;
$function$

;

CREATE OR REPLACE FUNCTION public.fiscal_marcar_xml_erro(p_documento_id uuid, p_erro text, p_lease_token uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_atual record;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND current_user <> 'postgres' THEN
    RAISE EXCEPTION 'FISCAL_MARCAR_XML_FORBIDDEN';
  END IF;

  -- xml_tentativas é lido AQUI só para o cálculo de backoff — mas a
  -- checagem de posse que decide se a escrita acontece está inteira no
  -- WHERE do UPDATE abaixo, atomicamente. Um valor de xml_tentativas
  -- levemente desatualizado neste SELECT afeta, no pior caso, o tempo de
  -- backoff calculado (cosmético) — nunca SE a escrita é aplicada.
  SELECT xml_tentativas INTO v_atual FROM public.documentos_fiscais_pendentes WHERE id = p_documento_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_DOCUMENTO_NAO_ENCONTRADO';
  END IF;

  UPDATE public.documentos_fiscais_pendentes
  SET xml_status = 'ERRO',
      xml_ultimo_erro = LEFT(COALESCE(p_erro, 'ERRO_XML_DESCONHECIDO'), 1000),
      xml_tentativas = xml_tentativas + 1,
      xml_proxima_tentativa_em = now() + make_interval(
        secs => LEAST(7200, GREATEST(30, (60 * (xml_tentativas + 1) * (xml_tentativas + 1))::integer))
      ),
      xml_lease_token = NULL,
      xml_lease_expires_em = NULL,
      updated_at = now()
  WHERE id = p_documento_id
    AND xml_status = 'EM_PROCESSAMENTO'
    AND xml_lease_token = p_lease_token;

  IF FOUND THEN
    INSERT INTO public.documentos_fiscais_eventos (documento_id, evento_tipo, origem_acao, payload)
    VALUES (p_documento_id, 'XML_ERRO', 'FISCAL_WORKER_XML', jsonb_build_object('erro', p_erro));
    RETURN true;
  END IF;

  -- Não aplicou: relata o motivo (terminal já alcançado ou lease obsoleto)
  -- sem nunca ter escrito nada — monotonicidade preservada.
  SELECT xml_status INTO v_atual FROM public.documentos_fiscais_pendentes WHERE id = p_documento_id;
  RAISE NOTICE 'FISCAL_XML_ERRO_IGNORADO: documento=%, xml_status_atual=%', p_documento_id, v_atual.xml_status;
  RETURN false;
END;
$function$

;

-- 8. Fila do XML de CANCELAMENTO (colunas próprias; mesmo padrão de lease).
CREATE OR REPLACE FUNCTION public.fiscal_claim_documentos_xml_cancelamento(p_limit integer DEFAULT 20, p_lease_segundos integer DEFAULT 300)
RETURNS TABLE(id uuid, venda_id uuid, tipo_doc text, provider text, correlation_id uuid, xml_cancelamento_status text, xml_cancelamento_tentativas integer, xml_cancelamento_lease_token uuid, focus_xml_cancelamento_path text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 20), 100));
  v_lease_segundos integer := GREATEST(30, LEAST(COALESCE(p_lease_segundos, 300), 3600));
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND current_user <> 'postgres' THEN
    RAISE EXCEPTION 'FISCAL_CLAIM_XML_FORBIDDEN';
  END IF;

  RETURN QUERY
  WITH candidatos AS (
    SELECT d.id
    FROM public.documentos_fiscais_pendentes d
    WHERE d.status = 'CANCELADO'
      AND d.deleted_at IS NULL
      AND (
        d.xml_cancelamento_status IN ('PENDENTE', 'ERRO')
        OR (d.xml_cancelamento_status = 'EM_PROCESSAMENTO' AND d.xml_cancelamento_lease_expires_em < now())
      )
      AND (d.xml_cancelamento_proxima_tentativa_em IS NULL OR d.xml_cancelamento_proxima_tentativa_em <= now())
    ORDER BY d.cancelado_em ASC NULLS LAST, d.created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT v_limit
  ),
  claimed AS (
    UPDATE public.documentos_fiscais_pendentes d
    SET
      xml_cancelamento_status = 'EM_PROCESSAMENTO',
      xml_cancelamento_lease_token = gen_random_uuid(),
      xml_cancelamento_lease_expires_em = now() + make_interval(secs => v_lease_segundos),
      updated_at = now()
    FROM candidatos c
    WHERE d.id = c.id
    RETURNING d.*
  )
  SELECT
    claimed.id, claimed.venda_id, claimed.tipo_doc, claimed.provider, claimed.correlation_id,
    claimed.xml_cancelamento_status, claimed.xml_cancelamento_tentativas, claimed.xml_cancelamento_lease_token,
    claimed.focus_xml_cancelamento_path
  FROM claimed;
END;
$function$;

REVOKE ALL ON FUNCTION public.fiscal_claim_documentos_xml_cancelamento(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fiscal_claim_documentos_xml_cancelamento(integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.fiscal_marcar_xml_cancelamento_armazenado(p_documento_id uuid, p_storage_path text, p_sha256 text, p_lease_token uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_atual record;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND current_user <> 'postgres' THEN
    RAISE EXCEPTION 'FISCAL_MARCAR_XML_FORBIDDEN';
  END IF;
  IF p_storage_path IS NULL OR trim(p_storage_path) = '' THEN
    RAISE EXCEPTION 'FISCAL_XML_STORAGE_PATH_OBRIGATORIO';
  END IF;
  IF p_sha256 IS NULL OR p_sha256 !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'FISCAL_XML_SHA256_INVALIDO';
  END IF;

  -- Tentativa ATÔMICA: a posse do lease é parte do próprio WHERE — nenhuma
  -- janela entre checar e escrever (achado Codex, ver cabeçalho).
  UPDATE public.documentos_fiscais_pendentes
  SET xml_cancelamento_status = 'ARMAZENADO',
      xml_cancelamento_storage_path = p_storage_path,
      xml_cancelamento_sha256 = p_sha256,
      xml_cancelamento_armazenado_em = now(),
      xml_cancelamento_ultimo_erro = NULL,
      xml_cancelamento_lease_token = NULL,
      xml_cancelamento_lease_expires_em = NULL,
      updated_at = now()
  WHERE id = p_documento_id
    AND status = 'CANCELADO'
    AND xml_cancelamento_status = 'EM_PROCESSAMENTO'
    AND xml_cancelamento_lease_token = p_lease_token;

  IF FOUND THEN
    INSERT INTO public.documentos_fiscais_eventos (documento_id, evento_tipo, origem_acao, payload)
    VALUES (p_documento_id, 'XML_CANCELAMENTO_ARMAZENADO', 'FISCAL_WORKER_XML_CANCELAMENTO', jsonb_build_object('storage_path', p_storage_path, 'sha256', p_sha256));
    RETURN true;
  END IF;

  -- UPDATE não aplicou — já sabemos que nada foi escrito; esta leitura só
  -- existe para relatar o motivo exato (sem risco de corrida: a decisão
  -- "escreveu ou não" já está tomada acima, de forma atômica).
  SELECT status, xml_cancelamento_status, xml_cancelamento_storage_path, xml_cancelamento_sha256 INTO v_atual
  FROM public.documentos_fiscais_pendentes WHERE id = p_documento_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_DOCUMENTO_NAO_ENCONTRADO';
  END IF;
  IF v_atual.status <> 'CANCELADO' THEN
    RAISE EXCEPTION 'FISCAL_XML_CANCELAMENTO_SO_PARA_DOCUMENTO_CANCELADO:%', v_atual.status;
  END IF;
  IF v_atual.xml_cancelamento_status = 'ARMAZENADO' THEN
    IF v_atual.xml_cancelamento_storage_path = p_storage_path AND v_atual.xml_cancelamento_sha256 = p_sha256 THEN
      RETURN true;
    END IF;
    RAISE EXCEPTION 'FISCAL_XML_JA_ARMAZENADO_IMUTAVEL:path_atual=%,path_novo=%', v_atual.xml_cancelamento_storage_path, p_storage_path;
  END IF;
  RAISE NOTICE 'FISCAL_XML_ARMAZENAR_IGNORADO: documento=%, xml_cancelamento_status_atual=%', p_documento_id, v_atual.xml_cancelamento_status;
  RETURN false;
END;
$function$

;

CREATE OR REPLACE FUNCTION public.fiscal_marcar_xml_cancelamento_bloqueado(p_documento_id uuid, p_motivo text, p_lease_token uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_atual record;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND current_user <> 'postgres' THEN
    RAISE EXCEPTION 'FISCAL_MARCAR_XML_FORBIDDEN';
  END IF;

  UPDATE public.documentos_fiscais_pendentes
  SET xml_cancelamento_status = 'BLOCKED_EXTERNAL',
      xml_cancelamento_ultimo_erro = LEFT(COALESCE(p_motivo, 'BLOCKED_EXTERNAL'), 1000),
      xml_cancelamento_lease_token = NULL,
      xml_cancelamento_lease_expires_em = NULL,
      updated_at = now()
  WHERE id = p_documento_id
    AND status = 'CANCELADO'
    AND xml_cancelamento_status = 'EM_PROCESSAMENTO'
    AND xml_cancelamento_lease_token = p_lease_token;

  IF FOUND THEN
    INSERT INTO public.documentos_fiscais_eventos (documento_id, evento_tipo, origem_acao, payload)
    VALUES (p_documento_id, 'XML_CANCELAMENTO_BLOCKED_EXTERNAL', 'FISCAL_WORKER_XML_CANCELAMENTO', jsonb_build_object('motivo', p_motivo));
    RETURN true;
  END IF;

  SELECT status, xml_cancelamento_status INTO v_atual FROM public.documentos_fiscais_pendentes WHERE id = p_documento_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_DOCUMENTO_NAO_ENCONTRADO';
  END IF;
  IF v_atual.status <> 'CANCELADO' THEN
    RAISE EXCEPTION 'FISCAL_XML_CANCELAMENTO_SO_PARA_DOCUMENTO_CANCELADO:%', v_atual.status;
  END IF;
  RAISE NOTICE 'FISCAL_XML_BLOQUEAR_IGNORADO: documento=%, xml_cancelamento_status_atual=%', p_documento_id, v_atual.xml_cancelamento_status;
  RETURN false;
END;
$function$

;

CREATE OR REPLACE FUNCTION public.fiscal_marcar_xml_cancelamento_erro(p_documento_id uuid, p_erro text, p_lease_token uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_atual record;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND current_user <> 'postgres' THEN
    RAISE EXCEPTION 'FISCAL_MARCAR_XML_FORBIDDEN';
  END IF;

  -- xml_cancelamento_tentativas é lido AQUI só para o cálculo de backoff — mas a
  -- checagem de posse que decide se a escrita acontece está inteira no
  -- WHERE do UPDATE abaixo, atomicamente. Um valor de xml_cancelamento_tentativas
  -- levemente desatualizado neste SELECT afeta, no pior caso, o tempo de
  -- backoff calculado (cosmético) — nunca SE a escrita é aplicada.
  SELECT xml_cancelamento_tentativas INTO v_atual FROM public.documentos_fiscais_pendentes WHERE id = p_documento_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_DOCUMENTO_NAO_ENCONTRADO';
  END IF;

  UPDATE public.documentos_fiscais_pendentes
  SET xml_cancelamento_status = 'ERRO',
      xml_cancelamento_ultimo_erro = LEFT(COALESCE(p_erro, 'ERRO_XML_DESCONHECIDO'), 1000),
      xml_cancelamento_tentativas = xml_cancelamento_tentativas + 1,
      xml_cancelamento_proxima_tentativa_em = now() + make_interval(
        secs => LEAST(7200, GREATEST(30, (60 * (xml_cancelamento_tentativas + 1) * (xml_cancelamento_tentativas + 1))::integer))
      ),
      xml_cancelamento_lease_token = NULL,
      xml_cancelamento_lease_expires_em = NULL,
      updated_at = now()
  WHERE id = p_documento_id
    AND xml_cancelamento_status = 'EM_PROCESSAMENTO'
    AND xml_cancelamento_lease_token = p_lease_token;

  IF FOUND THEN
    INSERT INTO public.documentos_fiscais_eventos (documento_id, evento_tipo, origem_acao, payload)
    VALUES (p_documento_id, 'XML_CANCELAMENTO_ERRO', 'FISCAL_WORKER_XML_CANCELAMENTO', jsonb_build_object('erro', p_erro));
    RETURN true;
  END IF;

  -- Não aplicou: relata o motivo (terminal já alcançado ou lease obsoleto)
  -- sem nunca ter escrito nada — monotonicidade preservada.
  SELECT xml_cancelamento_status INTO v_atual FROM public.documentos_fiscais_pendentes WHERE id = p_documento_id;
  RAISE NOTICE 'FISCAL_XML_ERRO_IGNORADO: documento=%, xml_cancelamento_status_atual=%', p_documento_id, v_atual.xml_cancelamento_status;
  RETURN false;
END;
$function$

;

REVOKE ALL ON FUNCTION public.fiscal_marcar_xml_cancelamento_armazenado(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fiscal_marcar_xml_cancelamento_armazenado(uuid, text, text, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.fiscal_marcar_xml_cancelamento_bloqueado(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fiscal_marcar_xml_cancelamento_bloqueado(uuid, text, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.fiscal_marcar_xml_cancelamento_erro(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fiscal_marcar_xml_cancelamento_erro(uuid, text, uuid) TO service_role;

-- 9. Verificação estrutural (sem escrita de dados).
DO $verify$
BEGIN
  IF to_regprocedure('public.fiscal_marcar_emitido_focus(uuid,text,text,text,text,text,text)') IS NULL
     OR to_regprocedure('public.fiscal_iniciar_cancelamento(uuid,text,integer)') IS NULL
     OR to_regprocedure('public.fiscal_marcar_cancelado(uuid,text,text,uuid)') IS NULL
     OR to_regprocedure('public.fiscal_claim_documentos_xml_cancelamento(integer,integer)') IS NULL THEN
    RAISE EXCEPTION 'FISCAL_P0_FOCUS_RPCS_AUSENTES';
  END IF;
  IF has_function_privilege('authenticated', 'public.fiscal_marcar_cancelado(uuid,text,text,uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.fiscal_iniciar_cancelamento(uuid,text,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FISCAL_P0_FOCUS_RPC_EXPOSTA';
  END IF;
END
$verify$;

COMMIT;
