-- Hotfix final — P0 de concorrência no C3 (XML), achado pela auditoria
-- independente do Codex.
--
-- CAUSA RAIZ: `fiscal_claim_documentos_xml` (migration 20260903150000) fazia
-- só um `SELECT ... FOR UPDATE SKIP LOCKED` — a exclusividade do lock durava
-- apenas a transação da própria função, que termina no instante em que a RPC
-- retorna. `xml_status` continuava 'PENDENTE' no banco depois do claim, sem
-- nenhum estado durável marcando "este documento já está sendo processado".
-- Dois workers podiam reclamar o MESMO documento em claims sucessivos
-- (sequenciais no tempo de parede, mas ambos "legítimos" do ponto de vista do
-- banco). Caminho comprovado:
--   claim A -> claim B -> upload A (upsert=true) -> confirma A (ARMAZENADO)
--   -> upload B (upsert=true, MESMO path) sobrescreve o blob de A -> RPC de
--   confirmação de B rejeita (hash não bate) -> processXmlDocumento chamava
--   fiscal_marcar_xml_erro, que ATÉ ENTÃO não tinha nenhum guard contra
--   regressão -> ARMAZENADO virava ERRO mesmo com o blob já corrompido.
--
-- CORREÇÃO (2 camadas independentes, cada uma suficiente sozinha):
--   1. Claim com posse durável (lease): `fiscal_claim_documentos_xml` agora
--      faz um UPDATE real (mesmo padrão já usado em `fiscal_claim_documentos`
--      desde antes desta missão — duas CTEs, `FOR UPDATE SKIP LOCKED` na
--      seleção + UPDATE na mesma transação), setando `xml_status =
--      'EM_PROCESSAMENTO'` + um `xml_lease_token` novo + expiração. Um
--      segundo claim só pode pegar o MESMO documento se o lease já expirou
--      (worker anterior morreu/travou) — nunca enquanto um lease válido
--      existe. Todas as RPCs de confirmação/erro/bloqueio agora EXIGEM o
--      token do lease e só aplicam a mudança se ele ainda for o vigente —
--      um worker cujo lease expirou e foi reclamado por outro tem sua
--      tentativa de escrita silenciosamente ignorada (RAISE NOTICE, não
--      exceção), nunca aplicada por cima do resultado do novo dono.
--   2. Storage create-only: `upsert:true` (que sobrescreve) removido do
--      código TypeScript (mesmo commit) em favor do padrão `upsert:false`
--      (o default do Storage do Supabase já é "falha se já existe" — HTTP
--      409/"Duplicate", confirmado empiricamente contra o stack local nesta
--      sessão). Path já ocupado -> baixa o conteúdo existente, compara hash:
--      igual -> reconcilia idempotentemente (mesmo XML, sem reescrever);
--      diferente -> fail-closed, nunca sobrescreve.
--   3. Monotonicidade do estado XML garantida em DUAS camadas: (a) guard
--      explícito em cada RPC (`ARMAZENADO`/`BLOCKED_EXTERNAL` são terminais
--      — uma tentativa de erro/reconfirmação sobre um documento já nesses
--      estados é um no-op silencioso, nunca regride); (b) o próprio trigger
--      `tg_documentos_fiscais_estado_bu` (BEFORE UPDATE, já a única porta de
--      entrada de qualquer escrita nesta tabela) agora valida a transição de
--      `xml_status` e recusa qualquer UPDATE (de QUALQUER origem, incluindo
--      um bug futuro numa RPC ou uma migration futura) que tente sair de
--      `ARMAZENADO`/`BLOCKED_EXTERNAL`, ou que tente mudar `xml_storage_path`/
--      `xml_sha256` uma vez `ARMAZENADO` — defesa em profundidade, mesmo
--      princípio já usado para a imutabilidade de `provider` (C2.10/C2.11).
--
-- NÃO REABRE C2: nenhuma lógica de `status` (fluxo de emissão)/`provider`
-- foi tocada — corpo do trigger idêntico em tudo o que já existia, só as
-- checagens de `xml_status` foram adicionadas.
--
-- ROLLBACK: reaplicar as definições de 20260903150000 (sem lease/sem
-- checagem de transição de xml_status) — não recomendado, reintroduz o P0.

BEGIN;

-- 1. Novas colunas de posse (lease) + novo valor de xml_status.
ALTER TABLE public.documentos_fiscais_pendentes
  ADD COLUMN IF NOT EXISTS xml_lease_token uuid,
  ADD COLUMN IF NOT EXISTS xml_lease_expires_em timestamptz;

ALTER TABLE public.documentos_fiscais_pendentes
  DROP CONSTRAINT IF EXISTS documentos_fiscais_xml_status_check;
ALTER TABLE public.documentos_fiscais_pendentes
  ADD CONSTRAINT documentos_fiscais_xml_status_check
  CHECK (xml_status = ANY (ARRAY['NAO_APLICAVEL', 'PENDENTE', 'EM_PROCESSAMENTO', 'ARMAZENADO', 'BLOCKED_EXTERNAL', 'ERRO']));

CREATE INDEX IF NOT EXISTS idx_doc_fiscal_xml_lease_expirado
  ON public.documentos_fiscais_pendentes (xml_lease_expires_em)
  WHERE status = 'EMITIDO' AND xml_status = 'EM_PROCESSAMENTO';

COMMENT ON COLUMN public.documentos_fiscais_pendentes.xml_lease_token IS
  'Hotfix concorrência (missão final): token de posse do lease de processamento de XML — só quem apresenta '
  'o token vigente pode escrever xml_status/path/hash. NULL quando não há processamento em andamento (PENDENTE/'
  'ARMAZENADO/BLOCKED_EXTERNAL/ERRO).';
COMMENT ON COLUMN public.documentos_fiscais_pendentes.xml_lease_expires_em IS
  'Hotfix concorrência (missão final): expiração do lease atual — vencido, o documento volta a ser elegível '
  'para um novo claim (recuperação automática após worker morto, sem ficar preso indefinidamente).';

-- 2. tg_documentos_fiscais_estado_bu — adiciona validação de transição de
--    xml_status + imutabilidade de path/hash sob ARMAZENADO. Corpo idêntico
--    ao anterior (20260903150000) em tudo o mais.
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
$function$;

-- 3. fiscal_claim_documentos_xml — agora um claim de VERDADE (UPDATE, não só
--    SELECT), com lease token + expiração, reclamando leases vencidos.
DROP FUNCTION IF EXISTS public.fiscal_claim_documentos_xml(integer);

CREATE FUNCTION public.fiscal_claim_documentos_xml(p_limit integer DEFAULT 20, p_lease_segundos integer DEFAULT 300)
RETURNS TABLE(
  id uuid,
  venda_id uuid,
  tipo_doc text,
  provider text,
  payload jsonb,
  correlation_id uuid,
  xml_status text,
  xml_tentativas integer,
  xml_lease_token uuid
)
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
$function$;

REVOKE ALL ON FUNCTION public.fiscal_claim_documentos_xml(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fiscal_claim_documentos_xml(integer, integer) TO service_role;

COMMENT ON FUNCTION public.fiscal_claim_documentos_xml(integer, integer) IS
  'Hotfix concorrência (missão final): claim de posse durável (lease) — UPDATE real (mesmo padrão de '
  'fiscal_claim_documentos), não mais um SELECT que perde exclusividade ao fim da RPC. Lease vencido volta a '
  'ser elegível automaticamente (recovery sem worker preso indefinidamente). p_lease_segundos: 30s a 3600s, '
  'default 300s.';

-- 4. fiscal_marcar_xml_armazenado — agora exige o lease vigente; idempotência
--    (mesmo path+hash) e imutabilidade (path+hash diferente) continuam
--    independentes do lease (retry legítimo do MESMO worker após o lease já
--    ter sido limpo por um sucesso anterior não pode ser rejeitado).
DROP FUNCTION IF EXISTS public.fiscal_marcar_xml_armazenado(uuid, text, text);

CREATE FUNCTION public.fiscal_marcar_xml_armazenado(p_documento_id uuid, p_storage_path text, p_sha256 text, p_lease_token uuid)
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

  SELECT status, xml_status, xml_storage_path, xml_sha256, xml_lease_token INTO v_atual
  FROM public.documentos_fiscais_pendentes WHERE id = p_documento_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_DOCUMENTO_NAO_ENCONTRADO';
  END IF;
  IF v_atual.status <> 'EMITIDO' THEN
    RAISE EXCEPTION 'FISCAL_XML_SO_PARA_DOCUMENTO_EMITIDO:%', v_atual.status;
  END IF;

  -- Terminal: idempotência/imutabilidade — independente do lease (um retry
  -- legítimo do mesmo worker, com o lease já limpo por um sucesso anterior,
  -- não pode ser rejeitado só por isso).
  IF v_atual.xml_status = 'ARMAZENADO' THEN
    IF v_atual.xml_storage_path = p_storage_path AND v_atual.xml_sha256 = p_sha256 THEN
      RETURN true;
    END IF;
    RAISE EXCEPTION 'FISCAL_XML_JA_ARMAZENADO_IMUTAVEL:path_atual=%,path_novo=%', v_atual.xml_storage_path, p_storage_path;
  END IF;

  -- Terminal (bloqueado externamente) nunca é sobrescrito por uma
  -- confirmação atrasada.
  IF v_atual.xml_status = 'BLOCKED_EXTERNAL' THEN
    RAISE NOTICE 'FISCAL_XML_ARMAZENAR_IGNORADO_JA_BLOQUEADO: documento=%', p_documento_id;
    RETURN false;
  END IF;

  -- Posse do lease: só quem detém o token VIGENTE pode escrever. Um worker
  -- cujo lease expirou e foi reclamado por outro (ou que nunca teve lease
  -- nenhum, ex.: chamada indevida) é ignorado silenciosamente — nunca
  -- sobrescreve o resultado do dono atual.
  IF v_atual.xml_status <> 'EM_PROCESSAMENTO' OR v_atual.xml_lease_token IS DISTINCT FROM p_lease_token THEN
    RAISE NOTICE 'FISCAL_XML_LEASE_STALE_IGNORADO: documento=%, xml_status_atual=%', p_documento_id, v_atual.xml_status;
    RETURN false;
  END IF;

  UPDATE public.documentos_fiscais_pendentes
  SET xml_status = 'ARMAZENADO',
      xml_storage_path = p_storage_path,
      xml_sha256 = p_sha256,
      xml_armazenado_em = now(),
      xml_ultimo_erro = NULL,
      xml_lease_token = NULL,
      xml_lease_expires_em = NULL,
      updated_at = now()
  WHERE id = p_documento_id;

  INSERT INTO public.documentos_fiscais_eventos (documento_id, evento_tipo, origem_acao, payload)
  VALUES (p_documento_id, 'XML_ARMAZENADO', 'FISCAL_WORKER_XML', jsonb_build_object('storage_path', p_storage_path, 'sha256', p_sha256));
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.fiscal_marcar_xml_armazenado(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fiscal_marcar_xml_armazenado(uuid, text, text, uuid) TO service_role;

COMMENT ON FUNCTION public.fiscal_marcar_xml_armazenado(uuid, text, text, uuid) IS
  'Hotfix concorrência (missão final): exige p_lease_token vigente. Retorna true se o resultado persistido '
  'é ARMAZENADO com este path+hash (aplicado agora ou já idempotente); false se ignorado por lease obsoleto '
  '(outro worker já resolveu este documento) ou por já estar BLOCKED_EXTERNAL. Nunca toca status/provider/'
  'chave_fiscal/protocolo/tentativas.';

-- 5. fiscal_marcar_xml_bloqueado — mesmo padrão de guards.
DROP FUNCTION IF EXISTS public.fiscal_marcar_xml_bloqueado(uuid, text);

CREATE FUNCTION public.fiscal_marcar_xml_bloqueado(p_documento_id uuid, p_motivo text, p_lease_token uuid)
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

  SELECT status, xml_status, xml_lease_token INTO v_atual
  FROM public.documentos_fiscais_pendentes WHERE id = p_documento_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_DOCUMENTO_NAO_ENCONTRADO';
  END IF;
  IF v_atual.status <> 'EMITIDO' THEN
    RAISE EXCEPTION 'FISCAL_XML_SO_PARA_DOCUMENTO_EMITIDO:%', v_atual.status;
  END IF;

  -- Monotonicidade: terminal nunca regride, independente do motivo.
  IF v_atual.xml_status IN ('ARMAZENADO', 'BLOCKED_EXTERNAL') THEN
    RAISE NOTICE 'FISCAL_XML_BLOQUEAR_IGNORADO_JA_TERMINAL: documento=%, xml_status_atual=%', p_documento_id, v_atual.xml_status;
    RETURN false;
  END IF;

  IF v_atual.xml_status <> 'EM_PROCESSAMENTO' OR v_atual.xml_lease_token IS DISTINCT FROM p_lease_token THEN
    RAISE NOTICE 'FISCAL_XML_LEASE_STALE_IGNORADO: documento=%, xml_status_atual=%', p_documento_id, v_atual.xml_status;
    RETURN false;
  END IF;

  UPDATE public.documentos_fiscais_pendentes
  SET xml_status = 'BLOCKED_EXTERNAL',
      xml_ultimo_erro = LEFT(COALESCE(p_motivo, 'BLOCKED_EXTERNAL'), 1000),
      xml_lease_token = NULL,
      xml_lease_expires_em = NULL,
      updated_at = now()
  WHERE id = p_documento_id;

  INSERT INTO public.documentos_fiscais_eventos (documento_id, evento_tipo, origem_acao, payload)
  VALUES (p_documento_id, 'XML_BLOCKED_EXTERNAL', 'FISCAL_WORKER_XML', jsonb_build_object('motivo', p_motivo));
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.fiscal_marcar_xml_bloqueado(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fiscal_marcar_xml_bloqueado(uuid, text, uuid) TO service_role;

COMMENT ON FUNCTION public.fiscal_marcar_xml_bloqueado(uuid, text, uuid) IS
  'Hotfix concorrência (missão final): exige p_lease_token vigente; terminal (ARMAZENADO/BLOCKED_EXTERNAL) '
  'nunca regride. Retorna true se aplicado, false se ignorado (lease obsoleto ou já terminal).';

-- 6. fiscal_marcar_xml_erro — mesmo padrão; é o ponto exato do achado do
--    Codex (ARMAZENADO -> ERRO por um worker atrasado).
DROP FUNCTION IF EXISTS public.fiscal_marcar_xml_erro(uuid, text);

CREATE FUNCTION public.fiscal_marcar_xml_erro(p_documento_id uuid, p_erro text, p_lease_token uuid)
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

  SELECT status, xml_status, xml_tentativas, xml_lease_token INTO v_atual
  FROM public.documentos_fiscais_pendentes WHERE id = p_documento_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'FISCAL_DOCUMENTO_NAO_ENCONTRADO';
  END IF;

  -- Monotonicidade: o achado do Codex, fechado aqui. ARMAZENADO é terminal
  -- para o artefato autorizado — uma tentativa concorrente atrasada de
  -- marcar erro NUNCA pode regredir para ERRO. Mesma regra para
  -- BLOCKED_EXTERNAL (também terminal).
  IF v_atual.xml_status IN ('ARMAZENADO', 'BLOCKED_EXTERNAL') THEN
    RAISE NOTICE 'FISCAL_XML_ERRO_IGNORADO_JA_TERMINAL: documento=%, xml_status_atual=%', p_documento_id, v_atual.xml_status;
    RETURN false;
  END IF;

  IF v_atual.xml_status <> 'EM_PROCESSAMENTO' OR v_atual.xml_lease_token IS DISTINCT FROM p_lease_token THEN
    RAISE NOTICE 'FISCAL_XML_LEASE_STALE_IGNORADO: documento=%, xml_status_atual=%', p_documento_id, v_atual.xml_status;
    RETURN false;
  END IF;

  UPDATE public.documentos_fiscais_pendentes
  SET xml_status = 'ERRO',
      xml_ultimo_erro = LEFT(COALESCE(p_erro, 'ERRO_XML_DESCONHECIDO'), 1000),
      xml_tentativas = xml_tentativas + 1,
      xml_proxima_tentativa_em = now() + make_interval(
        secs => LEAST(7200, GREATEST(30, (60 * (v_atual.xml_tentativas + 1) * (v_atual.xml_tentativas + 1))::integer))
      ),
      xml_lease_token = NULL,
      xml_lease_expires_em = NULL,
      updated_at = now()
  WHERE id = p_documento_id;

  INSERT INTO public.documentos_fiscais_eventos (documento_id, evento_tipo, origem_acao, payload)
  VALUES (p_documento_id, 'XML_ERRO', 'FISCAL_WORKER_XML', jsonb_build_object('erro', p_erro));
  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.fiscal_marcar_xml_erro(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fiscal_marcar_xml_erro(uuid, text, uuid) TO service_role;

COMMENT ON FUNCTION public.fiscal_marcar_xml_erro(uuid, text, uuid) IS
  'Hotfix concorrência (missão final): fecha o P0 do Codex — nunca regride ARMAZENADO/BLOCKED_EXTERNAL para '
  'ERRO, mesmo quando chamada por um worker cujo lease já expirou/foi reclamado. Retorna true se aplicado, '
  'false se ignorado.';

NOTIFY pgrst, 'reload schema';

DO $verify$
DECLARE
  v_uid uuid;
  v_venda_id uuid;
  v_doc_id uuid;
  v_claim record;
  v_claim2 record;
  v_ok boolean;
  v_erro_capturado boolean;
  v_hash1 text := repeat('a', 64);
  v_hash2 text := repeat('b', 64);
BEGIN
  BEGIN
  IF position('FISCAL_XML_TRANSICAO_INVALIDA' IN pg_get_functiondef('tg_documentos_fiscais_estado_bu'::regproc)) = 0 THEN
    RAISE EXCEPTION 'HOTFIX_XML_TRIGGER_TRANSICAO_AUSENTE';
  END IF;
  IF position('FISCAL_XML_ARMAZENADO_PATH_HASH_IMUTAVEL' IN pg_get_functiondef('tg_documentos_fiscais_estado_bu'::regproc)) = 0 THEN
    RAISE EXCEPTION 'HOTFIX_XML_TRIGGER_IMUTABILIDADE_AUSENTE';
  END IF;
  IF position('FISCAL_PROVIDER_IMUTAVEL_APOS_CONGELADO' IN pg_get_functiondef('tg_documentos_fiscais_estado_bu'::regproc)) = 0 THEN
    RAISE EXCEPTION 'HOTFIX_XML_REGRESSAO_IMUTABILIDADE_PROVIDER';
  END IF;

  SELECT id INTO v_uid FROM public.usuarios LIMIT 1;
  IF v_uid IS NULL THEN
    RAISE NOTICE 'HOTFIX_XML_CONCORRENCIA: sem usuário para prova viva; verificação estrutural OK';
    RETURN;
  END IF;

  v_venda_id := gen_random_uuid();
  INSERT INTO public.vendas (id, operador_id, total_bruto, total_desconto, total_liquido, forma_pagamento, status)
  VALUES (v_venda_id, v_uid, 10, 0, 10, 'DINHEIRO', 'CONCLUIDA');
  INSERT INTO public.documentos_fiscais_pendentes (venda_id, tipo_doc, status, payload)
  VALUES (v_venda_id, 'NFC_E_STUB', 'PENDENTE', '{}'::jsonb)
  RETURNING id INTO v_doc_id;
  UPDATE public.documentos_fiscais_pendentes SET status = 'EM_PROCESSAMENTO' WHERE id = v_doc_id;
  UPDATE public.documentos_fiscais_pendentes SET status = 'EMITIDO', chave_fiscal = repeat('1', 44), protocolo = 'PROTO-1', processado_em = now() WHERE id = v_doc_id;

  -- (1) Claim atribui lease; um SEGUNDO claim imediato NÃO pega o mesmo doc
  -- (lease ainda vigente).
  SELECT * INTO v_claim FROM public.fiscal_claim_documentos_xml(10) WHERE id = v_doc_id;
  IF v_claim.id IS NULL OR v_claim.xml_lease_token IS NULL THEN
    RAISE EXCEPTION 'HOTFIX_XML_CLAIM_SEM_LEASE';
  END IF;
  IF EXISTS (SELECT 1 FROM public.fiscal_claim_documentos_xml(10) WHERE id = v_doc_id) THEN
    RAISE EXCEPTION 'HOTFIX_XML_SEGUNDO_CLAIM_PEGOU_LEASE_VIGENTE';
  END IF;
  RAISE NOTICE 'PROVA (1) PASS: claim atribui lease; segundo claim imediato NAO pega o mesmo documento';

  -- (2) Confirmar ARMAZENADO com o lease certo -> sucesso (true), sai da fila.
  v_ok := public.fiscal_marcar_xml_armazenado(v_doc_id, 'focus/homologacao/loja-x/NFC_E_STUB/' || v_doc_id::text || '.xml', v_hash1, v_claim.xml_lease_token);
  IF NOT v_ok THEN RAISE EXCEPTION 'HOTFIX_XML_ARMAZENAR_COM_LEASE_CERTO_FALHOU'; END IF;
  RAISE NOTICE 'PROVA (2) PASS: armazenar com lease correto retorna true';

  -- (3) O ACHADO DO CODEX, reproduzido e fechado: um worker "atrasado" (lease
  -- ANTIGO, já superado pelo sucesso acima) tenta marcar ERRO -> ignorado,
  -- retorna false, xml_status continua ARMAZENADO.
  v_ok := public.fiscal_marcar_xml_erro(v_doc_id, 'erro tardio simulado', v_claim.xml_lease_token);
  IF v_ok THEN RAISE EXCEPTION 'HOTFIX_XML_ERRO_TARDIO_NAO_FOI_IGNORADO'; END IF;
  IF (SELECT xml_status FROM public.documentos_fiscais_pendentes WHERE id = v_doc_id) IS DISTINCT FROM 'ARMAZENADO' THEN
    RAISE EXCEPTION 'HOTFIX_XML_REGREDIU_APOS_ERRO_TARDIO: %', (SELECT xml_status FROM public.documentos_fiscais_pendentes WHERE id = v_doc_id);
  END IF;
  RAISE NOTICE 'PROVA (3) PASS: erro tardio com lease obsoleto sobre documento ARMAZENADO -> ignorado, retorna false, estado NAO regride (achado do Codex fechado)';

  -- (4) Path/hash continuam intactos (imutabilidade real, não só o retorno).
  IF NOT EXISTS (SELECT 1 FROM public.documentos_fiscais_pendentes WHERE id = v_doc_id AND xml_sha256 = v_hash1) THEN
    RAISE EXCEPTION 'HOTFIX_XML_HASH_MUDOU_APOS_ERRO_TARDIO';
  END IF;
  RAISE NOTICE 'PROVA (4) PASS: hash/path permanecem os do primeiro armazenamento';

  -- (5) Trigger recusa DIRETAMENTE uma tentativa de regressão (defesa em
  -- profundidade, independente das RPCs).
  v_erro_capturado := false;
  BEGIN
    UPDATE public.documentos_fiscais_pendentes SET xml_status = 'ERRO' WHERE id = v_doc_id;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'FISCAL_XML_TRANSICAO_INVALIDA%' THEN v_erro_capturado := true; ELSE RAISE; END IF;
  END;
  IF NOT v_erro_capturado THEN RAISE EXCEPTION 'HOTFIX_XML_TRIGGER_NAO_BLOQUEOU_REGRESSAO_DIRETA'; END IF;
  RAISE NOTICE 'PROVA (5) PASS: trigger recusa ARMAZENADO->ERRO mesmo tentado diretamente (sem passar pela RPC)';

  -- (6) Trigger recusa mudar path/hash sobre ARMAZENADO, mesmo sem mudar
  -- xml_status na mesma UPDATE.
  v_erro_capturado := false;
  BEGIN
    UPDATE public.documentos_fiscais_pendentes SET xml_sha256 = v_hash2 WHERE id = v_doc_id;
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'FISCAL_XML_ARMAZENADO_PATH_HASH_IMUTAVEL' THEN v_erro_capturado := true; ELSE RAISE; END IF;
  END;
  IF NOT v_erro_capturado THEN RAISE EXCEPTION 'HOTFIX_XML_TRIGGER_NAO_BLOQUEOU_MUDANCA_HASH_DIRETA'; END IF;
  RAISE NOTICE 'PROVA (6) PASS: trigger recusa mudar hash sobre ARMAZENADO mesmo sem mudar xml_status junto';

  -- (7) Lease vencido -> documento volta a ser elegível (recovery após
  -- worker morto). Simula o vencimento backdatando xml_lease_expires_em
  -- (mesma técnica já usada em C2.9 para simular timeout do reaper).
  DECLARE
    v_venda2 uuid := gen_random_uuid();
    v_doc2 uuid;
    v_claim_a record;
    v_claim_b record;
  BEGIN
    INSERT INTO public.vendas (id, operador_id, total_bruto, total_desconto, total_liquido, forma_pagamento, status)
    VALUES (v_venda2, v_uid, 10, 0, 10, 'DINHEIRO', 'CONCLUIDA');
    INSERT INTO public.documentos_fiscais_pendentes (venda_id, tipo_doc, status, payload)
    VALUES (v_venda2, 'NFC_E_STUB', 'PENDENTE', '{}'::jsonb)
    RETURNING id INTO v_doc2;
    UPDATE public.documentos_fiscais_pendentes SET status = 'EM_PROCESSAMENTO' WHERE id = v_doc2;
    UPDATE public.documentos_fiscais_pendentes SET status = 'EMITIDO', chave_fiscal = repeat('2', 44), protocolo = 'PROTO-2', processado_em = now() WHERE id = v_doc2;

    -- Worker A reclama (lease "vivo").
    SELECT * INTO v_claim_a FROM public.fiscal_claim_documentos_xml(10) WHERE id = v_doc2;
    IF v_claim_a.id IS NULL THEN RAISE EXCEPTION 'HOTFIX_XML_CLAIM_A_FALHOU'; END IF;

    -- Simula A morrendo: backdata a expiração do lease.
    UPDATE public.documentos_fiscais_pendentes SET xml_lease_expires_em = now() - interval '1 second' WHERE id = v_doc2;

    -- Worker B reclama o MESMO documento (lease de A expirado) -> consegue,
    -- com um token DIFERENTE.
    SELECT * INTO v_claim_b FROM public.fiscal_claim_documentos_xml(10) WHERE id = v_doc2;
    IF v_claim_b.id IS NULL THEN RAISE EXCEPTION 'HOTFIX_XML_CLAIM_B_NAO_RECUPEROU_LEASE_VENCIDO'; END IF;
    IF v_claim_b.xml_lease_token = v_claim_a.xml_lease_token THEN
      RAISE EXCEPTION 'HOTFIX_XML_CLAIM_B_RECEBEU_O_MESMO_TOKEN_DE_A';
    END IF;
    RAISE NOTICE 'PROVA (7) PASS: lease vencido -> documento reclamado por outro worker (recovery), token novo e diferente';

    -- Worker A (token velho) tenta armazenar -> ignorado (false), NAO
    -- sobrescreve o que B decidir depois.
    v_ok := public.fiscal_marcar_xml_armazenado(v_doc2, 'path/de/A.xml', v_hash1, v_claim_a.xml_lease_token);
    IF v_ok THEN RAISE EXCEPTION 'HOTFIX_XML_WORKER_A_COM_LEASE_VENCIDO_CONSEGUIU_ESCREVER'; END IF;
    IF (SELECT xml_storage_path FROM public.documentos_fiscais_pendentes WHERE id = v_doc2) IS NOT NULL THEN
      RAISE EXCEPTION 'HOTFIX_XML_PATH_DE_A_VAZOU_MESMO_COM_LEASE_VENCIDO';
    END IF;
    RAISE NOTICE 'PROVA (8) PASS: worker A com lease vencido nao consegue escrever depois que B reclamou o documento';

    -- Worker B (token novo, vigente) confirma normalmente.
    v_ok := public.fiscal_marcar_xml_armazenado(v_doc2, 'path/de/B.xml', v_hash2, v_claim_b.xml_lease_token);
    IF NOT v_ok THEN RAISE EXCEPTION 'HOTFIX_XML_WORKER_B_COM_LEASE_VIGENTE_FALHOU'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.documentos_fiscais_pendentes WHERE id = v_doc2 AND xml_status = 'ARMAZENADO' AND xml_storage_path = 'path/de/B.xml') THEN
      RAISE EXCEPTION 'HOTFIX_XML_RESULTADO_FINAL_DE_B_NAO_PERSISTIU';
    END IF;
    RAISE NOTICE 'PROVA (9) PASS: worker B (lease vigente) confirma normalmente; resultado final e o de B';

    DELETE FROM public.documentos_fiscais_eventos WHERE documento_id = v_doc2;
    DELETE FROM public.documentos_fiscais_pendentes WHERE id = v_doc2;
    DELETE FROM public.vendas WHERE id = v_venda2;
  END;

  DELETE FROM public.documentos_fiscais_eventos WHERE documento_id = v_doc_id;
  DELETE FROM public.documentos_fiscais_pendentes WHERE id = v_doc_id;
  DELETE FROM public.vendas WHERE id = v_venda_id;

  RAISE NOTICE 'HOTFIX_XML_CONCORRENCIA: TODAS AS PROVAS VIVAS PASSARAM (1-9)';
    RAISE EXCEPTION USING ERRCODE = 'ZX001', MESSAGE = 'verify-rollback-sentinel';
  EXCEPTION
    WHEN SQLSTATE 'ZX001' THEN
      NULL;
  END;
END
$verify$;

COMMIT;
