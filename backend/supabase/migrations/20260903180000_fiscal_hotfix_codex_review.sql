-- Hotfix — 3 achados reais da revisão automática (Codex) sobre o PR de
-- prontidão fiscal, verificados individualmente contra o código real antes
-- de qualquer correção (nenhum aplicado por confiança cega no bot).
--
-- 1. TOCTOU nas RPCs de XML (migration 20260903170000): cada uma fazia
--    `SELECT ... INTO v_atual` (sem lock) e só DEPOIS um `UPDATE ... WHERE
--    id = p_documento_id` cujo WHERE não repetia a condição de posse do
--    lease — nada impedia OUTRA transação de mudar xml_status/lease_token
--    desta mesma linha entre o SELECT e o UPDATE desta. Confirmado por
--    leitura: o WHERE do UPDATE só filtrava por id. Corrigido: a checagem
--    de posse (status/xml_status/lease_token) agora é parte do PRÓPRIO
--    WHERE do UPDATE — a instrução inteira é atômica (Postgres garante
--    isolamento dentro de uma única instrução), sem nenhuma janela entre
--    "ler o estado" e "escrever". O SELECT que sobra roda só DEPOIS de uma
--    tentativa de UPDATE que não aplicou nada, e só para relatar o motivo
--    exato (idempotência/imutabilidade/documento ausente) — não decide
--    mais se a escrita pode acontecer.
--
-- 2. Documentos já EMITIDO antes desta migration (nenhum nesta missão —
--    stack sempre reconstruído do zero — mas relevante para qualquer
--    ambiente com histórico real) nunca entrariam na fila de XML: a coluna
--    nova nasce NAO_APLICAVEL para TODAS as linhas existentes (inclusive
--    já EMITIDO), e o trigger só inicializa PENDENTE na transição EM_
--    PROCESSAMENTO->EMITIDO — que só acontece no FUTURO, nunca retroage.
--    Corrigido com um backfill único, idempotente (roda uma vez; se
--    reaplicado, não encontra mais nenhuma linha para tocar).
--
-- 3. REVOKE de INSERT em documentos_fiscais_pendentes (migration
--    20260903110000, achado C2.9 P0-7) tinha escopo maior que o problema
--    que resolvia: o achado original era DELETE direto; revogar INSERT/
--    UPDATE junto quebrou `enfileirarDocFiscalStub` (pdv-importados/app/
--    gerente/financeiro/actions.ts), que insere diretamente como
--    `authenticated` (a policy de INSERT com escopo de loja continuava lá,
--    intacta — só faltava o GRANT). Restaurado só o INSERT (o motivo real
--    do achado, DELETE, continua revogado; UPDATE também continua
--    revogado — não há nenhum caminho legítimo de UPDATE direto por
--    authenticated confirmado nesta auditoria).

BEGIN;

-- 1a. fiscal_marcar_xml_armazenado — atômico.
DROP FUNCTION IF EXISTS public.fiscal_marcar_xml_armazenado(uuid, text, text, uuid);

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
$function$;

REVOKE ALL ON FUNCTION public.fiscal_marcar_xml_armazenado(uuid, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fiscal_marcar_xml_armazenado(uuid, text, text, uuid) TO service_role;

COMMENT ON FUNCTION public.fiscal_marcar_xml_armazenado(uuid, text, text, uuid) IS
  'Hotfix Codex: escrita atômica (posse do lease dentro do WHERE do UPDATE, sem janela de corrida entre '
  'checar e escrever). Retorna true se ARMAZENADO com este path+hash (aplicado agora ou já idempotente); '
  'false se ignorado (lease obsoleto ou já BLOCKED_EXTERNAL). Nunca toca status/provider/chave_fiscal/'
  'protocolo/tentativas.';

-- 1b. fiscal_marcar_xml_bloqueado — atômico.
DROP FUNCTION IF EXISTS public.fiscal_marcar_xml_bloqueado(uuid, text, uuid);

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
$function$;

REVOKE ALL ON FUNCTION public.fiscal_marcar_xml_bloqueado(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fiscal_marcar_xml_bloqueado(uuid, text, uuid) TO service_role;

COMMENT ON FUNCTION public.fiscal_marcar_xml_bloqueado(uuid, text, uuid) IS
  'Hotfix Codex: escrita atômica (posse do lease dentro do WHERE do UPDATE). Terminal (ARMAZENADO/'
  'BLOCKED_EXTERNAL) nunca regride. Retorna true se aplicado, false se ignorado.';

-- 1c. fiscal_marcar_xml_erro — atômico. É o ponto exato do achado original
--     do Codex (sprint anterior): ARMAZENADO->ERRO por um worker atrasado.
DROP FUNCTION IF EXISTS public.fiscal_marcar_xml_erro(uuid, text, uuid);

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
$function$;

REVOKE ALL ON FUNCTION public.fiscal_marcar_xml_erro(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fiscal_marcar_xml_erro(uuid, text, uuid) TO service_role;

COMMENT ON FUNCTION public.fiscal_marcar_xml_erro(uuid, text, uuid) IS
  'Hotfix Codex: escrita atômica (posse do lease dentro do WHERE do UPDATE) — fecha o TOCTOU entre checar '
  'e escrever que ainda existia mesmo após o hotfix de concorrência anterior. Nunca regride ARMAZENADO/'
  'BLOCKED_EXTERNAL. Retorna true se aplicado, false se ignorado.';

-- 2. Backfill: documentos já EMITIDO antes desta missão (xml_status ainda
--    NAO_APLICAVEL) entram na fila de XML — mesma inicialização que o
--    trigger já faz para transições futuras. Idempotente (WHERE já filtra
--    exatamente o que falta tocar).
UPDATE public.documentos_fiscais_pendentes
SET xml_status = 'PENDENTE'
WHERE status = 'EMITIDO' AND xml_status = 'NAO_APLICAVEL';

-- 3. Restaura INSERT para authenticated (achado C2.9 P0-7 tinha escopo
--    maior que o necessário — o problema real era DELETE direto, não
--    INSERT; a RLS de INSERT com escopo de loja nunca foi removida).
GRANT INSERT ON public.documentos_fiscais_pendentes TO authenticated;

NOTIFY pgrst, 'reload schema';

DO $verify$
DECLARE
  v_uid uuid;
  v_venda_id uuid;
  v_doc_id uuid;
  v_claim record;
  v_ok boolean;
  v_hash1 text := repeat('a', 64);
  v_backfill_count integer;
BEGIN
  -- Estrutural: grant de INSERT restaurado.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'documentos_fiscais_pendentes'
      AND grantee = 'authenticated' AND privilege_type = 'INSERT'
  ) THEN
    RAISE EXCEPTION 'HOTFIX_CODEX_GRANT_INSERT_AUSENTE';
  END IF;
  -- DELETE continua revogado (não reabre o achado original C2.9 P0-7).
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'documentos_fiscais_pendentes'
      AND grantee = 'authenticated' AND privilege_type = 'DELETE'
  ) THEN
    RAISE EXCEPTION 'HOTFIX_CODEX_DELETE_REGRESSAO';
  END IF;
  RAISE NOTICE 'PROVA (ESTRUTURAL) PASS: INSERT restaurado, DELETE continua revogado para authenticated';

  SELECT id INTO v_uid FROM public.usuarios LIMIT 1;
  IF v_uid IS NULL THEN
    RAISE NOTICE 'HOTFIX_CODEX: sem usuário para prova viva; verificação estrutural OK';
    RETURN;
  END IF;

  -- (A) Backfill: cria um doc "já EMITIDO antes da migration" simulando o
  -- estado pré-existente (xml_status volta a NAO_APLICAVEL manualmente,
  -- simulando o que a migration 20260903150000 teria deixado num ambiente
  -- com histórico real), roda o MESMO backfill isoladamente e confirma.
  v_venda_id := gen_random_uuid();
  INSERT INTO public.vendas (id, operador_id, total_bruto, total_desconto, total_liquido, forma_pagamento, status)
  VALUES (v_venda_id, v_uid, 10, 0, 10, 'DINHEIRO', 'CONCLUIDA');
  INSERT INTO public.documentos_fiscais_pendentes (venda_id, tipo_doc, status, payload)
  VALUES (v_venda_id, 'NFC_E_STUB', 'PENDENTE', '{}'::jsonb) RETURNING id INTO v_doc_id;
  UPDATE public.documentos_fiscais_pendentes SET status = 'EM_PROCESSAMENTO' WHERE id = v_doc_id;
  UPDATE public.documentos_fiscais_pendentes SET status = 'EMITIDO', chave_fiscal = repeat('9', 44), protocolo = 'PROTO-BACKFILL', processado_em = now() WHERE id = v_doc_id;
  -- Simula "pré-existente": força de volta para NAO_APLICAVEL. O trigger
  -- de monotonicidade (corretamente) recusa essa transição pelo caminho
  -- normal — desabilitado só para ESTA instrução, só para reproduzir em
  -- teste um estado que só podia existir antes da migration (nenhum
  -- fluxo real de aplicação faz isso).
  SET LOCAL session_replication_role = replica;
  UPDATE public.documentos_fiscais_pendentes SET xml_status = 'NAO_APLICAVEL' WHERE id = v_doc_id;
  SET LOCAL session_replication_role = DEFAULT;

  UPDATE public.documentos_fiscais_pendentes
  SET xml_status = 'PENDENTE'
  WHERE status = 'EMITIDO' AND xml_status = 'NAO_APLICAVEL' AND id = v_doc_id;
  GET DIAGNOSTICS v_backfill_count = ROW_COUNT;
  IF v_backfill_count <> 1 OR (SELECT xml_status FROM public.documentos_fiscais_pendentes WHERE id = v_doc_id) IS DISTINCT FROM 'PENDENTE' THEN
    RAISE EXCEPTION 'HOTFIX_CODEX_BACKFILL_FALHOU';
  END IF;
  RAISE NOTICE 'PROVA (A) PASS: backfill traz documento EMITIDO pré-existente de volta para a fila de XML';

  -- (B) TOCTOU fechado: reproduz o achado original do Codex (worker
  -- atrasado tenta marcar ERRO depois de outro ter armazenado) com as
  -- NOVAS RPCs atômicas — continua fechado.
  SELECT * INTO v_claim FROM public.fiscal_claim_documentos_xml(10) WHERE id = v_doc_id;
  v_ok := public.fiscal_marcar_xml_armazenado(v_doc_id, 'p1', v_hash1, v_claim.xml_lease_token);
  IF NOT v_ok THEN RAISE EXCEPTION 'HOTFIX_CODEX_ARMAZENAR_ATOMICO_FALHOU'; END IF;
  v_ok := public.fiscal_marcar_xml_erro(v_doc_id, 'erro tardio', v_claim.xml_lease_token);
  IF v_ok THEN RAISE EXCEPTION 'HOTFIX_CODEX_ERRO_TARDIO_NAO_IGNORADO_APOS_FIX_ATOMICO'; END IF;
  IF (SELECT xml_status FROM public.documentos_fiscais_pendentes WHERE id = v_doc_id) IS DISTINCT FROM 'ARMAZENADO' THEN
    RAISE EXCEPTION 'HOTFIX_CODEX_REGREDIU_APOS_FIX_ATOMICO';
  END IF;
  RAISE NOTICE 'PROVA (B) PASS: RPCs atômicas continuam fechando o achado original (ARMAZENADO nunca regride)';

  DELETE FROM public.documentos_fiscais_eventos WHERE documento_id = v_doc_id;
  DELETE FROM public.documentos_fiscais_pendentes WHERE id = v_doc_id;
  DELETE FROM public.vendas WHERE id = v_venda_id;
  RAISE NOTICE 'HOTFIX_CODEX_REVIEW: TODAS AS PROVAS VIVAS PASSARAM (A,B)';
END
$verify$;

COMMIT;
