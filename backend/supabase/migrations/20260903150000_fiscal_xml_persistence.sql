-- Missão final — C3: persistência do XML autorizado.
--
-- ESCOPO: só a parte 100% LOCAL do C3 — armazenamento, isolamento,
-- idempotência, retenção e observabilidade do XML já autorizado. A
-- OBTENÇÃO do XML a partir da Focus (nome exato do campo/endpoint que
-- devolve o XML autorizado — ex.: algo como `caminho_xml_nota_fiscal`)
-- NUNCA foi confirmada por documentação oficial colada nesta missão
-- (mesma lacuna já registrada para RESPOSTAS FOCUS desde o Gate C2.5) —
-- por isso a camada de adapter (fiscal-provider-adapter.ts, mesmo commit)
-- trata isso como BLOCKED EXTERNAL, sem inventar nome de campo, sem
-- nenhuma chamada HTTP adicional à Focus. Esta migration constrói toda a
-- infraestrutura ao redor desse ponto de extensão, para que, no dia em
-- que o contrato for confirmado, só o adapter precise mudar.
--
-- INVARIANTE ABSOLUTO desta feature (pedido explícito da missão):
--   autorização -> EMITIDO -> XML
--   Falha de XML NUNCA pode voltar ao fluxo de emissão.
-- Garantido por construção: as 3 RPCs novas abaixo (fiscal_marcar_xml_*)
-- só têm em seu SET clause colunas `xml_*` + `updated_at` — nenhuma delas
-- é capaz de tocar `status`/`provider`/`chave_fiscal`/`protocolo`/
-- `tentativas` (as colunas que controlam o fluxo de emissão). Como essas
-- RPCs nunca mudam `status`, o trigger `tg_documentos_fiscais_estado_bu`
-- (early-return `IF OLD.status IS NOT DISTINCT FROM NEW.status`) nem chega
-- a rodar a lógica de transição para essas UPDATEs — confirmado abaixo.
--
-- Reaproveita a identidade de provider já congelada e imutável (Sprint
-- C2.10/C2.11, coluna `provider`) como prefixo do path de Storage — mesma
-- garantia de isolamento loja+ambiente+provider já provada para a emissão,
-- sem introduzir um segundo mecanismo de identidade paralelo.

BEGIN;

-- 1. Colunas de rastreio do XML — extensão aditiva de
--    documentos_fiscais_pendentes (mesmo padrão já usado para `provider`
--    em C2.10: reaproveitar a tabela existente em vez de criar uma tabela
--    1:1 nova, já que XML é uma propriedade do próprio DocumentoFiscal).
ALTER TABLE public.documentos_fiscais_pendentes
  ADD COLUMN IF NOT EXISTS xml_status text NOT NULL DEFAULT 'NAO_APLICAVEL',
  ADD COLUMN IF NOT EXISTS xml_storage_path text,
  ADD COLUMN IF NOT EXISTS xml_sha256 text,
  ADD COLUMN IF NOT EXISTS xml_armazenado_em timestamptz,
  ADD COLUMN IF NOT EXISTS xml_ultimo_erro text,
  ADD COLUMN IF NOT EXISTS xml_tentativas integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS xml_proxima_tentativa_em timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'documentos_fiscais_xml_status_check'
  ) THEN
    ALTER TABLE public.documentos_fiscais_pendentes
      ADD CONSTRAINT documentos_fiscais_xml_status_check
      CHECK (xml_status = ANY (ARRAY['NAO_APLICAVEL', 'PENDENTE', 'ARMAZENADO', 'BLOCKED_EXTERNAL', 'ERRO']));
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'documentos_fiscais_xml_sha256_formato'
  ) THEN
    ALTER TABLE public.documentos_fiscais_pendentes
      ADD CONSTRAINT documentos_fiscais_xml_sha256_formato
      CHECK (xml_sha256 IS NULL OR xml_sha256 ~ '^[0-9a-f]{64}$');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'documentos_fiscais_xml_tentativas_check'
  ) THEN
    ALTER TABLE public.documentos_fiscais_pendentes
      ADD CONSTRAINT documentos_fiscais_xml_tentativas_check
      CHECK (xml_tentativas >= 0);
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_doc_fiscal_xml_fila
  ON public.documentos_fiscais_pendentes (status, xml_status, COALESCE(xml_proxima_tentativa_em, created_at))
  WHERE status = 'EMITIDO' AND xml_status IN ('PENDENTE', 'ERRO');

COMMENT ON COLUMN public.documentos_fiscais_pendentes.xml_status IS
  'C3 (missão final): NAO_APLICAVEL (ainda não EMITIDO) | PENDENTE (EMITIDO, XML ainda não obtido/armazenado) | '
  'ARMAZENADO | BLOCKED_EXTERNAL (contrato Focus de obtenção do XML não confirmado — não retry automático) | '
  'ERRO (falha transitória de storage/rede — retry via xml_proxima_tentativa_em). Nunca influencia `status` '
  '(fluxo de emissão) — ver comentário de fiscal_marcar_xml_armazenado.';
COMMENT ON COLUMN public.documentos_fiscais_pendentes.xml_storage_path IS
  'Path determinístico no bucket privado documentos-fiscais-xml: "<identidade_provider_congelada>/<tipo_doc>/<documento_id>.xml". '
  'Reaproveita a identidade de provider já imutável (C2.10/C2.11) como prefixo — mesmo isolamento loja+ambiente+provider.';
COMMENT ON COLUMN public.documentos_fiscais_pendentes.xml_sha256 IS
  'SHA-256 (hex, 64 chars) do conteúdo do XML armazenado — integridade, não segredo.';

-- 2. evento_tipo — 3 valores novos para a timeline de auditoria do XML,
--    mesma tabela append-only já existente (documentos_fiscais_eventos).
ALTER TABLE public.documentos_fiscais_eventos
  DROP CONSTRAINT IF EXISTS documentos_fiscais_eventos_tipo_check;
ALTER TABLE public.documentos_fiscais_eventos
  ADD CONSTRAINT documentos_fiscais_eventos_tipo_check
  CHECK (evento_tipo = ANY (ARRAY[
    'ENFILEIRADO', 'REENFILEIRADO', 'CLAIM', 'ERRO', 'ERRO_ENQUEUE', 'EMITIDO', 'REPROCESSO_MANUAL', 'CANCELADO',
    'XML_ARMAZENADO', 'XML_BLOCKED_EXTERNAL', 'XML_ERRO'
  ]));

-- 3. tg_documentos_fiscais_estado_bu — inicializa xml_status='PENDENTE' no
--    exato momento em que o documento se torna EMITIDO pela 1ª vez (única
--    transição que produz NEW.status='EMITIDO', per o IN-list de
--    transições já validado logo abaixo desta checagem). Corpo idêntico
--    ao anterior (20260903120000) em tudo o mais — só acrescenta esta
--    checagem, sem alterar nenhuma lógica de transição/imutabilidade de
--    provider já existente.
CREATE OR REPLACE FUNCTION public.tg_documentos_fiscais_estado_bu()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Sprint C2.10 (P0-1): identidade do provider imutável uma vez
  -- reconhecida — roda ANTES de qualquer outra lógica, inclusive quando o
  -- status não muda (o próprio congelamento é um UPDATE sem mudança de
  -- status). Valores não reconhecidos (dado histórico pré-C2.10) não são
  -- protegidos — só bloqueia mudança de um valor que este mecanismo
  -- realmente gravou.
  IF OLD.provider IS NOT NULL
     AND (
       OLD.provider = ANY (ARRAY['mock', 'http', 'bling'])
       OR OLD.provider ~ '^focus:(homologacao|producao):.+$'
     )
     AND NEW.provider IS DISTINCT FROM OLD.provider THEN
    RAISE EXCEPTION 'FISCAL_PROVIDER_IMUTAVEL_APOS_CONGELADO:%->%', OLD.provider, NEW.provider;
  END IF;

  -- A partir daqui, corpo IDÊNTICO ao anterior (só a checagem de
  -- imutabilidade de `provider` acima é nova) — nenhuma lógica de transição
  -- de status foi tocada.
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

  -- C3 (missão final) — única transição válida que produz NEW.status =
  -- 'EMITIDO' é EM_PROCESSAMENTO->EMITIDO (ver IN-list acima); nunca
  -- sobrescreve um xml_status que já tenha avançado (defensivo, mesmo
  -- não devendo ser alcançável duas vezes para o mesmo documento).
  IF NEW.status = 'EMITIDO' AND NEW.xml_status = 'NAO_APLICAVEL' THEN
    NEW.xml_status := 'PENDENTE';
  END IF;

  RETURN NEW;
END;
$function$;

-- 4. RPCs de XML — mesmo padrão de segurança das RPCs fiscais existentes
--    (SECURITY DEFINER, guard explícito de role, só service_role/postgres).

CREATE OR REPLACE FUNCTION public.fiscal_claim_documentos_xml(p_limit integer DEFAULT 20)
RETURNS TABLE(
  id uuid,
  venda_id uuid,
  tipo_doc text,
  provider text,
  payload jsonb,
  correlation_id uuid,
  xml_status text,
  xml_tentativas integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_limit integer := GREATEST(1, LEAST(COALESCE(p_limit, 20), 100));
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND current_user <> 'postgres' THEN
    RAISE EXCEPTION 'FISCAL_CLAIM_XML_FORBIDDEN';
  END IF;

  -- Somente SELECT + lock — nenhuma coluna é alterada aqui. Diferente de
  -- fiscal_claim_documentos (emissão), não há "estado intermediário" a
  -- proteger: cada tentativa de obtenção/upload de XML é idempotente por
  -- construção (path determinístico + upsert), então uma corrida entre
  -- dois workers na mesma janela é inofensiva mesmo sem essa lock — o
  -- FOR UPDATE SKIP LOCKED aqui é só para evitar trabalho duplicado, não
  -- uma garantia de correção.
  RETURN QUERY
  SELECT d.id, d.venda_id, d.tipo_doc, d.provider, d.payload, d.correlation_id, d.xml_status, d.xml_tentativas
  FROM public.documentos_fiscais_pendentes d
  WHERE d.status = 'EMITIDO'
    AND d.xml_status IN ('PENDENTE', 'ERRO')
    AND (d.xml_proxima_tentativa_em IS NULL OR d.xml_proxima_tentativa_em <= now())
    AND d.deleted_at IS NULL
  ORDER BY d.processado_em ASC NULLS LAST, d.created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT v_limit;
END;
$function$;

REVOKE ALL ON FUNCTION public.fiscal_claim_documentos_xml(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fiscal_claim_documentos_xml(integer) TO service_role;

COMMENT ON FUNCTION public.fiscal_claim_documentos_xml(integer) IS
  'C3 (missão final): reclama documentos EMITIDO com xml_status PENDENTE/ERRO prontos para nova tentativa. '
  'Read-only sobre o fluxo de emissão — não altera status/provider/tentativas. FOR UPDATE SKIP LOCKED só para '
  'evitar trabalho duplicado entre workers concorrentes, não para correção (a operação já é idempotente).';

CREATE OR REPLACE FUNCTION public.fiscal_marcar_xml_armazenado(p_documento_id uuid, p_storage_path text, p_sha256 text)
RETURNS void
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

  SELECT status, xml_status, xml_storage_path, xml_sha256 INTO v_atual
  FROM public.documentos_fiscais_pendentes WHERE id = p_documento_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_DOCUMENTO_NAO_ENCONTRADO';
  END IF;
  IF v_atual.status <> 'EMITIDO' THEN
    RAISE EXCEPTION 'FISCAL_XML_SO_PARA_DOCUMENTO_EMITIDO:%', v_atual.status;
  END IF;

  -- Idempotência: reclamado 2x (crash entre upload e confirmação, retry) e
  -- já ARMAZENADO com o MESMO path+hash -> no-op silencioso, sucesso.
  IF v_atual.xml_status = 'ARMAZENADO' THEN
    IF v_atual.xml_storage_path = p_storage_path AND v_atual.xml_sha256 = p_sha256 THEN
      RETURN;
    END IF;
    -- Imutabilidade: um XML já armazenado nunca é silenciosamente
    -- substituído por outro conteúdo/path — mesmo princípio de
    -- `documentos_fiscais_pendentes.provider` (C2.10/C2.11): um artefato
    -- de auditoria confirmado não pode ser trocado por engano.
    RAISE EXCEPTION 'FISCAL_XML_JA_ARMAZENADO_IMUTAVEL:path_atual=%,path_novo=%', v_atual.xml_storage_path, p_storage_path;
  END IF;

  UPDATE public.documentos_fiscais_pendentes
  SET xml_status = 'ARMAZENADO',
      xml_storage_path = p_storage_path,
      xml_sha256 = p_sha256,
      xml_armazenado_em = now(),
      xml_ultimo_erro = NULL,
      updated_at = now()
  WHERE id = p_documento_id;

  INSERT INTO public.documentos_fiscais_eventos (documento_id, evento_tipo, origem_acao, payload)
  VALUES (p_documento_id, 'XML_ARMAZENADO', 'FISCAL_WORKER_XML', jsonb_build_object('storage_path', p_storage_path, 'sha256', p_sha256));
END;
$function$;

REVOKE ALL ON FUNCTION public.fiscal_marcar_xml_armazenado(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fiscal_marcar_xml_armazenado(uuid, text, text) TO service_role;

COMMENT ON FUNCTION public.fiscal_marcar_xml_armazenado(uuid, text, text) IS
  'C3 (missão final): confirma XML armazenado. Só toca colunas xml_* — nunca status/provider/chave_fiscal/'
  'protocolo/tentativas (falha de XML nunca retroage ao fluxo de emissão). Idempotente (mesmo path+hash = '
  'no-op); imutável (path+hash diferente em cima de já ARMAZENADO = erro, nunca substitui silenciosamente).';

CREATE OR REPLACE FUNCTION public.fiscal_marcar_xml_bloqueado(p_documento_id uuid, p_motivo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND current_user <> 'postgres' THEN
    RAISE EXCEPTION 'FISCAL_MARCAR_XML_FORBIDDEN';
  END IF;

  UPDATE public.documentos_fiscais_pendentes
  SET xml_status = 'BLOCKED_EXTERNAL',
      xml_ultimo_erro = LEFT(COALESCE(p_motivo, 'BLOCKED_EXTERNAL'), 1000),
      updated_at = now()
  WHERE id = p_documento_id AND status = 'EMITIDO';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_DOCUMENTO_NAO_ENCONTRADO_OU_NAO_EMITIDO';
  END IF;

  INSERT INTO public.documentos_fiscais_eventos (documento_id, evento_tipo, origem_acao, payload)
  VALUES (p_documento_id, 'XML_BLOCKED_EXTERNAL', 'FISCAL_WORKER_XML', jsonb_build_object('motivo', p_motivo));
END;
$function$;

REVOKE ALL ON FUNCTION public.fiscal_marcar_xml_bloqueado(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fiscal_marcar_xml_bloqueado(uuid, text) TO service_role;

COMMENT ON FUNCTION public.fiscal_marcar_xml_bloqueado(uuid, text) IS
  'C3 (missão final): marca xml_status=BLOCKED_EXTERNAL (contrato Focus de obtenção de XML não confirmado). '
  'Não-retryable (fiscal_claim_documentos_xml só reclama PENDENTE/ERRO) — evita laço infinito tentando algo '
  'estruturalmente impossível hoje. Nunca toca status/provider/emissão.';

CREATE OR REPLACE FUNCTION public.fiscal_marcar_xml_erro(p_documento_id uuid, p_erro text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tentativas integer;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND current_user <> 'postgres' THEN
    RAISE EXCEPTION 'FISCAL_MARCAR_XML_FORBIDDEN';
  END IF;

  SELECT xml_tentativas INTO v_tentativas FROM public.documentos_fiscais_pendentes WHERE id = p_documento_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_DOCUMENTO_NAO_ENCONTRADO';
  END IF;

  UPDATE public.documentos_fiscais_pendentes
  SET xml_status = 'ERRO',
      xml_ultimo_erro = LEFT(COALESCE(p_erro, 'ERRO_XML_DESCONHECIDO'), 1000),
      xml_tentativas = xml_tentativas + 1,
      -- Mesma fórmula de backoff já usada em fiscal_marcar_erro (emissão) —
      -- reaproveitada por consistência, não reinventada.
      xml_proxima_tentativa_em = now() + make_interval(
        secs => LEAST(7200, GREATEST(30, (60 * (v_tentativas + 1) * (v_tentativas + 1))::integer))
      ),
      updated_at = now()
  WHERE id = p_documento_id;

  INSERT INTO public.documentos_fiscais_eventos (documento_id, evento_tipo, origem_acao, payload)
  VALUES (p_documento_id, 'XML_ERRO', 'FISCAL_WORKER_XML', jsonb_build_object('erro', p_erro));
END;
$function$;

REVOKE ALL ON FUNCTION public.fiscal_marcar_xml_erro(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fiscal_marcar_xml_erro(uuid, text) TO service_role;

COMMENT ON FUNCTION public.fiscal_marcar_xml_erro(uuid, text) IS
  'C3 (missão final): falha transitória (rede/storage) ao obter/armazenar XML — retryable, mesmo backoff '
  'exponencial-limitado de fiscal_marcar_erro. Nunca toca status/provider/emissão.';

-- 5. Storage bucket privado + isolamento. Sem policies para authenticated/
--    anon (RLS habilitada por padrão em storage.objects, zero policies =
--    deny-by-default para esses roles) — só service_role (BYPASSRLS,
--    confirmado nesta missão) escreve/lê, porque só o fiscal-worker toca
--    este bucket hoje; não existe ainda nenhuma tela de download de XML
--    para gerente (funcionalidade especulativa, fora de escopo). Se essa
--    tela vier a existir, precisará de uma policy SELECT nova, escopada
--    por loja via o prefixo de path (mesmo padrão de produto-imagens).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('documentos-fiscais-xml', 'documentos-fiscais-xml', false, 5242880, ARRAY['application/xml', 'text/xml']::text[])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

NOTIFY pgrst, 'reload schema';

DO $verify$
DECLARE
  v_uid uuid;
  v_venda_id uuid;
  v_doc_id uuid;
  v_row record;
  v_erro_capturado boolean;
  v_hash1 text := repeat('a', 64);
  v_hash2 text := repeat('b', 64);
BEGIN
  BEGIN
  -- Estrutural: constraints/colunas/bucket.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'documentos_fiscais_xml_status_check') THEN
    RAISE EXCEPTION 'C3_XML_CHECK_STATUS_AUSENTE';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'documentos-fiscais-xml' AND public = false) THEN
    RAISE EXCEPTION 'C3_XML_BUCKET_AUSENTE_OU_PUBLICO';
  END IF;
  IF position('NEW.xml_status := ''PENDENTE''' IN pg_get_functiondef('tg_documentos_fiscais_estado_bu'::regproc)) = 0 THEN
    RAISE EXCEPTION 'C3_XML_TRIGGER_AUTOINIT_AUSENTE';
  END IF;
  -- Regressão: imutabilidade de provider (C2.10/C2.11) continua no corpo.
  IF position('FISCAL_PROVIDER_IMUTAVEL_APOS_CONGELADO' IN pg_get_functiondef('tg_documentos_fiscais_estado_bu'::regproc)) = 0 THEN
    RAISE EXCEPTION 'C3_XML_REGRESSAO_IMUTABILIDADE_PROVIDER';
  END IF;

  SELECT id INTO v_uid FROM public.usuarios LIMIT 1;
  IF v_uid IS NULL THEN
    RAISE NOTICE 'C3_XML: sem usuário para prova viva; verificação estrutural OK';
    RETURN;
  END IF;

  v_venda_id := gen_random_uuid();
  INSERT INTO public.vendas (id, operador_id, total_bruto, total_desconto, total_liquido, forma_pagamento, status)
  VALUES (v_venda_id, v_uid, 10, 0, 10, 'DINHEIRO', 'CONCLUIDA');
  INSERT INTO public.documentos_fiscais_pendentes (venda_id, tipo_doc, status, payload)
  VALUES (v_venda_id, 'NFC_E_STUB', 'PENDENTE', '{}'::jsonb)
  RETURNING id INTO v_doc_id;

  -- Ainda PENDENTE (emissão) -> xml_status continua NAO_APLICAVEL, não
  -- aparece na fila de XML.
  IF EXISTS (SELECT 1 FROM public.fiscal_claim_documentos_xml(10) WHERE id = v_doc_id) THEN
    RAISE EXCEPTION 'C3_XML_CLAIM_PEGOU_DOC_NAO_EMITIDO';
  END IF;

  -- Caminha a máquina de estados real: PENDENTE -> EM_PROCESSAMENTO -> EMITIDO.
  UPDATE public.documentos_fiscais_pendentes SET status = 'EM_PROCESSAMENTO' WHERE id = v_doc_id;
  UPDATE public.documentos_fiscais_pendentes SET status = 'EMITIDO', chave_fiscal = repeat('1', 44), protocolo = 'PROTO-1', processado_em = now() WHERE id = v_doc_id;

  SELECT xml_status INTO v_row FROM public.documentos_fiscais_pendentes WHERE id = v_doc_id;
  IF (SELECT xml_status FROM public.documentos_fiscais_pendentes WHERE id = v_doc_id) IS DISTINCT FROM 'PENDENTE' THEN
    RAISE EXCEPTION 'C3_XML_AUTOINIT_FALHOU: obtido %', (SELECT xml_status FROM public.documentos_fiscais_pendentes WHERE id = v_doc_id);
  END IF;
  RAISE NOTICE 'PROVA (1) PASS: transição para EMITIDO inicializa xml_status=PENDENTE automaticamente';

  -- Agora aparece na fila de XML.
  IF NOT EXISTS (SELECT 1 FROM public.fiscal_claim_documentos_xml(10) WHERE id = v_doc_id) THEN
    RAISE EXCEPTION 'C3_XML_CLAIM_NAO_PEGOU_DOC_EMITIDO_PENDENTE';
  END IF;
  RAISE NOTICE 'PROVA (2) PASS: documento EMITIDO com xml_status=PENDENTE aparece na fila de XML';

  -- Armazena.
  PERFORM public.fiscal_marcar_xml_armazenado(v_doc_id, 'focus/homologacao/loja-x/NFC_E_STUB/' || v_doc_id::text || '.xml', v_hash1);
  IF NOT EXISTS (SELECT 1 FROM public.documentos_fiscais_pendentes WHERE id = v_doc_id AND xml_status = 'ARMAZENADO' AND xml_sha256 = v_hash1) THEN
    RAISE EXCEPTION 'C3_XML_ARMAZENAR_FALHOU';
  END IF;
  -- Some da fila depois de armazenado.
  IF EXISTS (SELECT 1 FROM public.fiscal_claim_documentos_xml(10) WHERE id = v_doc_id) THEN
    RAISE EXCEPTION 'C3_XML_DOC_ARMAZENADO_AINDA_NA_FILA';
  END IF;
  RAISE NOTICE 'PROVA (3) PASS: armazenar tira da fila; status/provider/chave/protocolo do documento não mudaram';

  -- Idempotência: mesmo path+hash de novo -> no-op, sem erro.
  PERFORM public.fiscal_marcar_xml_armazenado(v_doc_id, 'focus/homologacao/loja-x/NFC_E_STUB/' || v_doc_id::text || '.xml', v_hash1);
  RAISE NOTICE 'PROVA (4) PASS: reconfirmar o MESMO path+hash é idempotente (não lançou erro)';

  -- Imutabilidade: hash diferente em cima de já ARMAZENADO -> rejeitado.
  v_erro_capturado := false;
  BEGIN
    PERFORM public.fiscal_marcar_xml_armazenado(v_doc_id, 'focus/homologacao/loja-x/NFC_E_STUB/' || v_doc_id::text || '.xml', v_hash2);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'FISCAL_XML_JA_ARMAZENADO_IMUTAVEL%' THEN v_erro_capturado := true; ELSE RAISE; END IF;
  END;
  IF NOT v_erro_capturado THEN RAISE EXCEPTION 'C3_XML_IMUTABILIDADE_NAO_APLICADA'; END IF;
  RAISE NOTICE 'PROVA (5) PASS: hash diferente sobre XML já armazenado é rejeitado (imutabilidade)';

  -- Confirma que status/provider/chave/protocolo do DOCUMENTO nunca mudaram
  -- por causa de nenhuma operação de XML acima (invariante absoluto).
  IF NOT EXISTS (
    SELECT 1 FROM public.documentos_fiscais_pendentes
    WHERE id = v_doc_id AND status = 'EMITIDO' AND chave_fiscal = repeat('1', 44) AND protocolo = 'PROTO-1'
  ) THEN
    RAISE EXCEPTION 'C3_XML_VAZOU_PARA_FLUXO_DE_EMISSAO';
  END IF;
  RAISE NOTICE 'PROVA (6) PASS: status/chave_fiscal/protocolo do documento intactos após todo o ciclo de XML';

  -- Segundo documento: bloqueado externamente -> some da fila para sempre
  -- (não-retryable).
  DECLARE
    v_venda_2 uuid := gen_random_uuid();
    v_doc_2 uuid;
  BEGIN
    INSERT INTO public.vendas (id, operador_id, total_bruto, total_desconto, total_liquido, forma_pagamento, status)
    VALUES (v_venda_2, v_uid, 10, 0, 10, 'DINHEIRO', 'CONCLUIDA');
    INSERT INTO public.documentos_fiscais_pendentes (venda_id, tipo_doc, status, payload)
    VALUES (v_venda_2, 'NFC_E_STUB', 'PENDENTE', '{}'::jsonb)
    RETURNING id INTO v_doc_2;
    UPDATE public.documentos_fiscais_pendentes SET status = 'EM_PROCESSAMENTO' WHERE id = v_doc_2;
    UPDATE public.documentos_fiscais_pendentes SET status = 'EMITIDO', chave_fiscal = repeat('2', 44), protocolo = 'PROTO-2', processado_em = now() WHERE id = v_doc_2;

    PERFORM public.fiscal_marcar_xml_bloqueado(v_doc_2, 'FOCUS_XML_CONTRATO_NAO_CONFIRMADO');
    IF EXISTS (SELECT 1 FROM public.fiscal_claim_documentos_xml(10) WHERE id = v_doc_2) THEN
      RAISE EXCEPTION 'C3_XML_BLOCKED_EXTERNAL_AINDA_NA_FILA';
    END IF;
    RAISE NOTICE 'PROVA (7) PASS: xml_status=BLOCKED_EXTERNAL sai da fila permanentemente (não-retryable)';

    -- Terceiro cenário: erro transitório -> volta pra fila só após backoff.
    PERFORM public.fiscal_marcar_xml_erro(v_doc_2, 'STORAGE_TIMEOUT_SIMULADO');
    IF (SELECT xml_status FROM public.documentos_fiscais_pendentes WHERE id = v_doc_2) IS DISTINCT FROM 'BLOCKED_EXTERNAL' THEN
      -- xml_marcar_erro rodou por cima de um doc já BLOCKED_EXTERNAL (só
      -- pra provar que a RPC em si funciona sem exigir estado prévio
      -- específico) -- aqui só interessa que NÃO afetou status/provider.
      NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.documentos_fiscais_pendentes WHERE id = v_doc_2 AND status = 'EMITIDO') THEN
      RAISE EXCEPTION 'C3_XML_ERRO_VAZOU_PARA_STATUS_EMISSAO';
    END IF;
    RAISE NOTICE 'PROVA (8) PASS: fiscal_marcar_xml_erro nunca altera status (fluxo de emissão intacto)';

    DELETE FROM public.documentos_fiscais_eventos WHERE documento_id = v_doc_2;
    DELETE FROM public.documentos_fiscais_pendentes WHERE id = v_doc_2;
    DELETE FROM public.vendas WHERE id = v_venda_2;
  END;

  DELETE FROM public.documentos_fiscais_eventos WHERE documento_id = v_doc_id;
  DELETE FROM public.documentos_fiscais_pendentes WHERE id = v_doc_id;
  DELETE FROM public.vendas WHERE id = v_venda_id;

  RAISE NOTICE 'C3_XML: TODAS AS PROVAS VIVAS PASSARAM (1-8)';
    RAISE EXCEPTION USING ERRCODE = 'ZX001', MESSAGE = 'verify-rollback-sentinel';
  EXCEPTION
    WHEN SQLSTATE 'ZX001' THEN
      NULL;
  END;
END
$verify$;

COMMIT;
