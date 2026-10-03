-- Rollback de 20261003120000_fiscal_focus_referencias_xml_cancelamento.sql.
-- Restaura as definições de 20260903170000/20260903180000 e remove colunas/RPCs novas.
-- ATENÇÃO: apaga referências Focus, dados de cancelamento e o estado do XML de
-- cancelamento. Exportar essas colunas antes se houver dado real.
BEGIN;

DROP FUNCTION IF EXISTS public.fiscal_marcar_emitido_focus(uuid, text, text, text, text, text, text);
DROP FUNCTION IF EXISTS public.fiscal_registrar_referencias_focus(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.fiscal_iniciar_cancelamento(uuid, text, integer);
DROP FUNCTION IF EXISTS public.fiscal_marcar_cancelado(uuid, text, text, uuid);
DROP FUNCTION IF EXISTS public.fiscal_marcar_cancelamento_erro(uuid, text, uuid);
DROP FUNCTION IF EXISTS public.fiscal_claim_documentos_xml_cancelamento(integer, integer);
DROP FUNCTION IF EXISTS public.fiscal_marcar_xml_cancelamento_armazenado(uuid, text, text, uuid);
DROP FUNCTION IF EXISTS public.fiscal_marcar_xml_cancelamento_bloqueado(uuid, text, uuid);
DROP FUNCTION IF EXISTS public.fiscal_marcar_xml_cancelamento_erro(uuid, text, uuid);

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

  -- Hotfix concorrência (missão final) — transição de xml_status precisa ser
  -- uma das válidas na máquina de estados de XML. Roda para TODA UPDATE
  -- (não só quando `status` também muda), porque claim/confirmar/erro/
  -- bloquear de XML nunca tocam `status` (fluxo de emissão já concluído,
  -- documento já EMITIDO). Defesa em profundidade: mesmo que uma RPC futura
  -- tenha um bug de guard, o banco recusa a transição inválida.
  IF OLD.xml_status IS DISTINCT FROM NEW.xml_status THEN
    IF NOT (
      (OLD.xml_status = 'NAO_APLICAVEL' AND NEW.xml_status = 'PENDENTE')
      OR (OLD.xml_status IN ('PENDENTE', 'ERRO') AND NEW.xml_status = 'EM_PROCESSAMENTO')
      OR (OLD.xml_status = 'EM_PROCESSAMENTO' AND NEW.xml_status IN ('EM_PROCESSAMENTO', 'ARMAZENADO', 'BLOCKED_EXTERNAL', 'ERRO'))
    ) THEN
      RAISE EXCEPTION 'FISCAL_XML_TRANSICAO_INVALIDA:%->%', OLD.xml_status, NEW.xml_status;
    END IF;
  END IF;

  -- Hotfix concorrência — uma vez ARMAZENADO, path/hash são imutáveis
  -- (mesmo se, hipoteticamente, algo tentasse mudá-los SEM também mudar
  -- xml_status na mesma UPDATE).
  IF OLD.xml_status = 'ARMAZENADO'
     AND (NEW.xml_storage_path IS DISTINCT FROM OLD.xml_storage_path OR NEW.xml_sha256 IS DISTINCT FROM OLD.xml_sha256) THEN
    RAISE EXCEPTION 'FISCAL_XML_ARMAZENADO_PATH_HASH_IMUTAVEL';
  END IF;

  -- A partir daqui, corpo IDÊNTICO ao anterior — nenhuma lógica de status
  -- (emissão)/provider pré-existente foi tocada.
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
$function$

;

DROP FUNCTION IF EXISTS public.fiscal_claim_documentos_xml(integer, integer);
CREATE FUNCTION public.fiscal_claim_documentos_xml(p_limit integer DEFAULT 20, p_lease_segundos integer DEFAULT 300)
 RETURNS TABLE(id uuid, venda_id uuid, tipo_doc text, provider text, payload jsonb, correlation_id uuid, xml_status text, xml_tentativas integer, xml_lease_token uuid)
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
    WHERE d.status = 'EMITIDO'
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
    claimed.correlation_id, claimed.xml_status, claimed.xml_tentativas, claimed.xml_lease_token
  FROM claimed;
END;
$function$

;

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
    AND status = 'EMITIDO'
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
  IF v_atual.status <> 'EMITIDO' THEN
    RAISE EXCEPTION 'FISCAL_XML_SO_PARA_DOCUMENTO_EMITIDO:%', v_atual.status;
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
    AND status = 'EMITIDO'
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
  IF v_atual.status <> 'EMITIDO' THEN
    RAISE EXCEPTION 'FISCAL_XML_SO_PARA_DOCUMENTO_EMITIDO:%', v_atual.status;
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

ALTER TABLE public.documentos_fiscais_eventos DROP CONSTRAINT IF EXISTS documentos_fiscais_eventos_tipo_check;
DELETE FROM public.documentos_fiscais_eventos
WHERE evento_tipo IN ('REFERENCIAS_FOCUS_REGISTRADAS', 'CANCELAMENTO_SOLICITADO', 'CANCELAMENTO_ERRO',
                      'XML_CANCELAMENTO_ARMAZENADO', 'XML_CANCELAMENTO_BLOCKED_EXTERNAL', 'XML_CANCELAMENTO_ERRO');
ALTER TABLE public.documentos_fiscais_eventos
  ADD CONSTRAINT documentos_fiscais_eventos_tipo_check
  CHECK (evento_tipo = ANY (ARRAY[
    'ENFILEIRADO', 'REENFILEIRADO', 'CLAIM', 'ERRO', 'ERRO_ENQUEUE', 'EMITIDO', 'REPROCESSO_MANUAL', 'CANCELADO',
    'XML_ARMAZENADO', 'XML_BLOCKED_EXTERNAL', 'XML_ERRO', 'PROVIDER_CONGELADO'
  ]));

DROP INDEX IF EXISTS public.idx_doc_fiscal_xml_cancelamento_fila;
ALTER TABLE public.documentos_fiscais_pendentes
  DROP CONSTRAINT IF EXISTS documentos_fiscais_xml_cancelamento_status_check,
  DROP CONSTRAINT IF EXISTS documentos_fiscais_cancelamento_justificativa_check,
  DROP COLUMN IF EXISTS focus_xml_path,
  DROP COLUMN IF EXISTS focus_danfe_path,
  DROP COLUMN IF EXISTS focus_qrcode_url,
  DROP COLUMN IF EXISTS cancelamento_justificativa,
  DROP COLUMN IF EXISTS cancelamento_solicitado_em,
  DROP COLUMN IF EXISTS cancelamento_tentativas,
  DROP COLUMN IF EXISTS cancelamento_lease_token,
  DROP COLUMN IF EXISTS cancelamento_lease_expires_em,
  DROP COLUMN IF EXISTS cancelamento_ultimo_erro,
  DROP COLUMN IF EXISTS cancelamento_protocolo,
  DROP COLUMN IF EXISTS cancelado_em,
  DROP COLUMN IF EXISTS focus_xml_cancelamento_path,
  DROP COLUMN IF EXISTS xml_cancelamento_status,
  DROP COLUMN IF EXISTS xml_cancelamento_storage_path,
  DROP COLUMN IF EXISTS xml_cancelamento_sha256,
  DROP COLUMN IF EXISTS xml_cancelamento_armazenado_em,
  DROP COLUMN IF EXISTS xml_cancelamento_ultimo_erro,
  DROP COLUMN IF EXISTS xml_cancelamento_tentativas,
  DROP COLUMN IF EXISTS xml_cancelamento_proxima_tentativa_em,
  DROP COLUMN IF EXISTS xml_cancelamento_lease_token,
  DROP COLUMN IF EXISTS xml_cancelamento_lease_expires_em;

COMMIT;
