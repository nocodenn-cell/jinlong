-- Sprint P0 Focus NFe — referências Focus, XML de autorização, cancelamento e
-- XML de cancelamento (migration 20261003120000).
--
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f backend/scripts/fiscal-focus-p0.test.sql
--
-- Dados sintéticos; tudo dentro de uma transação com ROLLBACK.

\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.assert(p_ok boolean, p_msg text) RETURNS void LANGUAGE plpgsql AS
$$ BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', p_msg; END IF;
  RAISE NOTICE 'OK   %', p_msg;
END $$;

-- Cria um documento EMITIDO via as RPCs reais (claim não é necessário aqui:
-- o caminho PENDENTE -> EM_PROCESSAMENTO -> EMITIDO é o mesmo do worker).
CREATE FUNCTION pg_temp.mk_doc(p_n int) RETURNS uuid LANGUAGE plpgsql AS
$$
DECLARE
  v_venda uuid := ('f9100000-0000-4000-8000-0000000000' || lpad(p_n::text, 2, '0'))::uuid;
  v_doc uuid;
BEGIN
  INSERT INTO public.vendas (id, operador_id, total_bruto, total_desconto, total_liquido, forma_pagamento, status)
  VALUES (v_venda, 'f9100001-0000-4000-8000-000000000001', 10, 0, 10, 'DINHEIRO', 'CONCLUIDA');
  INSERT INTO public.documentos_fiscais_pendentes (venda_id, tipo_doc, status, payload)
  VALUES (v_venda, 'NFC_E_STUB', 'PENDENTE', '{}'::jsonb)
  RETURNING id INTO v_doc;
  UPDATE public.documentos_fiscais_pendentes SET status = 'EM_PROCESSAMENTO' WHERE id = v_doc;
  RETURN v_doc;
END $$;

DO $setup$
BEGIN
  INSERT INTO public.lojas (id, nome, codigo, ativo)
  VALUES ('f9100002-0000-4000-8000-000000000001', 'P0 Focus Loja', 'P0FOCUS1', true)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO auth.users (id) VALUES ('f9100001-0000-4000-8000-000000000001') ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id)
  VALUES ('f9100001-0000-4000-8000-000000000001', 'P0 Focus Op', 'OPERADOR', true, 'f9100002-0000-4000-8000-000000000001')
  ON CONFLICT (id) DO NOTHING;
END
$setup$;

-- T1 — EMITIDO + referências Focus na mesma transação; referência imutável.
DO $t1$
DECLARE
  v_doc uuid := pg_temp.mk_doc(1);
  v record;
  v_erro boolean := false;
BEGIN
  PERFORM public.fiscal_marcar_emitido_focus(v_doc, repeat('1', 44), 'PROTO-T1', 'ref-t1',
    'https://focus.example/arquivos/t1.xml', '/arquivos/t1.pdf', 'https://qr.example/t1');
  SELECT * INTO v FROM public.documentos_fiscais_pendentes WHERE id = v_doc;
  PERFORM pg_temp.assert(v.status = 'EMITIDO', 'T1 status EMITIDO');
  PERFORM pg_temp.assert(v.focus_xml_path = 'https://focus.example/arquivos/t1.xml', 'T1 caminho_xml_nota_fiscal persistido como devolvido');
  PERFORM pg_temp.assert(v.focus_danfe_path = '/arquivos/t1.pdf' AND v.focus_qrcode_url = 'https://qr.example/t1', 'T1 caminho_danfe e qrcode_url persistidos');
  PERFORM pg_temp.assert(v.xml_status = 'PENDENTE', 'T1 XML de autorização entra na fila (PENDENTE)');
  PERFORM pg_temp.assert(v.payload = '{}'::jsonb, 'T1 snapshot congelado intacto (payload não sobrescrito)');

  BEGIN
    UPDATE public.documentos_fiscais_pendentes SET focus_xml_path = 'https://outro/t1.xml' WHERE id = v_doc;
  EXCEPTION WHEN OTHERS THEN
    v_erro := SQLERRM LIKE 'FISCAL_REFERENCIA_FOCUS_IMUTAVEL%';
  END;
  PERFORM pg_temp.assert(v_erro, 'T1 referência Focus imutável depois de gravada');

  PERFORM pg_temp.assert(NOT public.fiscal_registrar_referencias_focus(v_doc, 'https://outro/t1.xml'),
    'T1 registrar_referencias não sobrescreve referência existente');
END
$t1$;

-- T2 — fila do XML de autorização: claim devolve focus_xml_path, armazena com
-- auditoria XML_ARMAZENADO, idempotente, path/hash imutáveis.
DO $t2$
DECLARE
  v_doc uuid := pg_temp.mk_doc(2);
  v_claim record;
  v_ok boolean;
  v_erro boolean := false;
  v_eventos int;
BEGIN
  PERFORM public.fiscal_marcar_emitido_focus(v_doc, repeat('2', 44), 'PROTO-T2', NULL, 'https://focus.example/t2.xml', NULL, NULL);
  SELECT * INTO v_claim FROM public.fiscal_claim_documentos_xml(100) c WHERE c.id = v_doc;
  PERFORM pg_temp.assert(v_claim.id IS NOT NULL AND v_claim.focus_xml_path = 'https://focus.example/t2.xml', 'T2 claim devolve focus_xml_path');

  v_ok := public.fiscal_marcar_xml_armazenado(v_doc, 'focus/homologacao/l/NFC_E_STUB/' || v_doc || '.xml', repeat('a', 64), v_claim.xml_lease_token);
  PERFORM pg_temp.assert(v_ok, 'T2 XML_ARMAZENADO aplicado');
  SELECT count(*) INTO v_eventos FROM public.documentos_fiscais_eventos WHERE documento_id = v_doc AND evento_tipo = 'XML_ARMAZENADO';
  PERFORM pg_temp.assert(v_eventos = 1, 'T2 auditoria XML_ARMAZENADO registrada');
  PERFORM pg_temp.assert(
    (SELECT xml_status = 'ARMAZENADO' AND xml_sha256 = repeat('a', 64) AND xml_armazenado_em IS NOT NULL AND xml_ultimo_erro IS NULL
     FROM public.documentos_fiscais_pendentes WHERE id = v_doc), 'T2 xml_status/xml_sha256/xml_armazenado_em persistidos');

  v_ok := public.fiscal_marcar_xml_armazenado(v_doc, 'focus/homologacao/l/NFC_E_STUB/' || v_doc || '.xml', repeat('a', 64), gen_random_uuid());
  PERFORM pg_temp.assert(v_ok, 'T2 reconfirmação idêntica é idempotente');

  BEGIN
    PERFORM public.fiscal_marcar_xml_armazenado(v_doc, 'outro/path.xml', repeat('b', 64), gen_random_uuid());
  EXCEPTION WHEN OTHERS THEN
    v_erro := SQLERRM LIKE 'FISCAL_XML_JA_ARMAZENADO_IMUTAVEL%';
  END;
  PERFORM pg_temp.assert(v_erro, 'T2 XML armazenado é imutável (path/hash diferente rejeitado)');
END
$t2$;

-- T3 — cancelamento: lease único, justificativa validada, CANCELADO nunca volta
-- a EMITIDO, XML de autorização preservado, XML de cancelamento separado.
DO $t3$
DECLARE
  v_doc uuid := pg_temp.mk_doc(3);
  v_claim record;
  v_ini record;
  v_ini2 record;
  v_ok boolean;
  v_erro boolean := false;
  v_just text := 'Venda cancelada a pedido do cliente';
  v_xml_path_antes text;
  v_xml_hash_antes text;
  v record;
BEGIN
  PERFORM public.fiscal_marcar_emitido_focus(v_doc, repeat('3', 44), 'PROTO-T3', NULL, 'https://focus.example/t3.xml', NULL, NULL);
  SELECT * INTO v_claim FROM public.fiscal_claim_documentos_xml(100) c WHERE c.id = v_doc;
  PERFORM public.fiscal_marcar_xml_armazenado(v_doc, 'p/' || v_doc || '.xml', repeat('c', 64), v_claim.xml_lease_token);
  SELECT xml_storage_path, xml_sha256 INTO v_xml_path_antes, v_xml_hash_antes FROM public.documentos_fiscais_pendentes WHERE id = v_doc;

  BEGIN
    PERFORM * FROM public.fiscal_iniciar_cancelamento(v_doc, 'curta');
  EXCEPTION WHEN OTHERS THEN
    v_erro := SQLERRM LIKE 'FISCAL_CANCELAMENTO_JUSTIFICATIVA_INVALIDA%';
  END;
  PERFORM pg_temp.assert(v_erro, 'T3 justificativa < 15 caracteres rejeitada');

  SELECT * INTO v_ini FROM public.fiscal_iniciar_cancelamento(v_doc, v_just);
  PERFORM pg_temp.assert(v_ini.resultado = 'INICIADO' AND v_ini.cancelamento_lease_token IS NOT NULL AND v_ini.cancelamento_tentativas_anteriores = 0,
    'T3 1º pedido de cancelamento iniciado com lease');
  SELECT * INTO v_ini2 FROM public.fiscal_iniciar_cancelamento(v_doc, v_just);
  PERFORM pg_temp.assert(v_ini2.resultado = 'EM_ANDAMENTO' AND v_ini2.cancelamento_lease_token IS NULL,
    'T3 pedido concorrente não recebe lease (cancelamento não executa duas vezes)');

  -- erro com lease: libera; próxima tentativa sabe que já houve tentativa
  v_ok := public.fiscal_marcar_cancelamento_erro(v_doc, 'FOCUS_PROVIDER_TIMEOUT', v_ini.cancelamento_lease_token);
  PERFORM pg_temp.assert(v_ok, 'T3 erro de cancelamento registrado (doc continua EMITIDO)');
  PERFORM pg_temp.assert((SELECT status FROM public.documentos_fiscais_pendentes WHERE id = v_doc) = 'EMITIDO', 'T3 erro não altera status');
  SELECT * INTO v_ini FROM public.fiscal_iniciar_cancelamento(v_doc, v_just);
  PERFORM pg_temp.assert(v_ini.resultado = 'INICIADO' AND v_ini.cancelamento_tentativas_anteriores = 1,
    'T3 nova tentativa informa tentativa anterior (worker deve consultar antes)');

  -- lease obsoleto não confirma
  v_ok := public.fiscal_marcar_cancelado(v_doc, '135000000000001', 'https://focus.example/t3-canc.xml', gen_random_uuid());
  PERFORM pg_temp.assert(NOT v_ok, 'T3 confirmação com lease obsoleto ignorada');

  v_ok := public.fiscal_marcar_cancelado(v_doc, '135000000000001', 'https://focus.example/t3-canc.xml', v_ini.cancelamento_lease_token);
  SELECT * INTO v FROM public.documentos_fiscais_pendentes WHERE id = v_doc;
  PERFORM pg_temp.assert(v_ok AND v.status = 'CANCELADO' AND v.cancelado_em IS NOT NULL, 'T3 estado CANCELADO');
  PERFORM pg_temp.assert(v.cancelamento_protocolo = '135000000000001' AND v.focus_xml_cancelamento_path = 'https://focus.example/t3-canc.xml',
    'T3 numero_protocolo e caminho_xml_cancelamento persistidos');
  PERFORM pg_temp.assert(v.xml_status = 'ARMAZENADO' AND v.xml_storage_path = v_xml_path_antes AND v.xml_sha256 = v_xml_hash_antes,
    'T3 XML de autorização preservado (não sobrescrito)');
  PERFORM pg_temp.assert(v.xml_cancelamento_status = 'PENDENTE', 'T3 XML de cancelamento entra na fila própria');
  PERFORM pg_temp.assert(v.focus_xml_path = 'https://focus.example/t3.xml', 'T3 referência original da autorização preservada');
  PERFORM pg_temp.assert(
    (SELECT count(*) FROM public.documentos_fiscais_eventos WHERE documento_id = v_doc AND evento_tipo = 'CANCELADO') = 1
    AND (SELECT count(*) FROM public.documentos_fiscais_eventos WHERE documento_id = v_doc AND evento_tipo = 'CANCELAMENTO_SOLICITADO') = 2
    AND (SELECT count(*) FROM public.documentos_fiscais_eventos WHERE documento_id = v_doc AND evento_tipo = 'CANCELAMENTO_ERRO') = 1,
    'T3 auditoria: 2x CANCELAMENTO_SOLICITADO, 1x CANCELAMENTO_ERRO, 1x CANCELADO');

  -- CANCELADO nunca volta para EMITIDO (nem via RPC de emissão)
  v_erro := false;
  BEGIN
    PERFORM public.fiscal_marcar_emitido_focus(v_doc, repeat('3', 44), 'PROTO-T3', NULL, NULL, NULL, NULL);
  EXCEPTION WHEN OTHERS THEN
    v_erro := SQLERRM LIKE 'FISCAL_TRANSICAO_INVALIDA%';
  END;
  PERFORM pg_temp.assert(v_erro, 'T3 CANCELADO -> EMITIDO recusado');

  -- idempotência: novo pedido após cancelado
  SELECT * INTO v_ini FROM public.fiscal_iniciar_cancelamento(v_doc, v_just);
  PERFORM pg_temp.assert(v_ini.resultado = 'JA_CANCELADO', 'T3 pedido sobre documento já cancelado é idempotente');
  PERFORM pg_temp.assert(public.fiscal_marcar_cancelado(v_doc, '999', 'https://outro.xml', NULL)
    AND (SELECT cancelamento_protocolo FROM public.documentos_fiscais_pendentes WHERE id = v_doc) = '135000000000001',
    'T3 reconfirmação não troca protocolo/caminho já gravados');
END
$t3$;

-- T4 — fila do XML de cancelamento: separada, path próprio, auditoria.
DO $t4$
DECLARE
  v_doc uuid := pg_temp.mk_doc(4);
  v_claim record;
  v_ini record;
  v_ok boolean;
  v record;
BEGIN
  PERFORM public.fiscal_marcar_emitido_focus(v_doc, repeat('4', 44), 'PROTO-T4', NULL, 'https://focus.example/t4.xml', NULL, NULL);
  SELECT * INTO v_ini FROM public.fiscal_iniciar_cancelamento(v_doc, 'Erro de digitação na venda T4');
  PERFORM public.fiscal_marcar_cancelado(v_doc, '135000000000004', 'https://focus.example/t4-canc.xml', v_ini.cancelamento_lease_token);

  SELECT * INTO v_claim FROM public.fiscal_claim_documentos_xml_cancelamento(100) c WHERE c.id = v_doc;
  PERFORM pg_temp.assert(v_claim.id IS NOT NULL AND v_claim.focus_xml_cancelamento_path = 'https://focus.example/t4-canc.xml',
    'T4 claim do XML de cancelamento devolve caminho_xml_cancelamento');

  -- erro de download: backoff, sem regressão
  v_ok := public.fiscal_marcar_xml_cancelamento_erro(v_doc, 'DOWNLOAD_HTTP_503', v_claim.xml_cancelamento_lease_token);
  SELECT * INTO v FROM public.documentos_fiscais_pendentes WHERE id = v_doc;
  PERFORM pg_temp.assert(v_ok AND v.xml_cancelamento_status = 'ERRO' AND v.xml_cancelamento_tentativas = 1 AND v.xml_cancelamento_ultimo_erro = 'DOWNLOAD_HTTP_503',
    'T4 erro de download do XML de cancelamento registrado com backoff');

  UPDATE public.documentos_fiscais_pendentes SET xml_cancelamento_proxima_tentativa_em = now() - interval '1 second' WHERE id = v_doc;
  SELECT * INTO v_claim FROM public.fiscal_claim_documentos_xml_cancelamento(100) c WHERE c.id = v_doc;
  v_ok := public.fiscal_marcar_xml_cancelamento_armazenado(v_doc, 'p/' || v_doc || '-cancelamento.xml', repeat('d', 64), v_claim.xml_cancelamento_lease_token);
  SELECT * INTO v FROM public.documentos_fiscais_pendentes WHERE id = v_doc;
  PERFORM pg_temp.assert(v_ok AND v.xml_cancelamento_status = 'ARMAZENADO' AND v.xml_cancelamento_sha256 = repeat('d', 64),
    'T4 XML de cancelamento armazenado');
  PERFORM pg_temp.assert(v.xml_cancelamento_storage_path IS DISTINCT FROM v.xml_storage_path, 'T4 XML de cancelamento em path distinto do XML de autorização');
  PERFORM pg_temp.assert(
    (SELECT count(*) FROM public.documentos_fiscais_eventos WHERE documento_id = v_doc AND evento_tipo IN ('XML_CANCELAMENTO_ERRO', 'XML_CANCELAMENTO_ARMAZENADO')) = 2,
    'T4 auditoria XML_CANCELAMENTO_ERRO + XML_CANCELAMENTO_ARMAZENADO');

  -- XML de autorização de um documento já CANCELADO continua elegível
  SELECT * INTO v_claim FROM public.fiscal_claim_documentos_xml(100) c WHERE c.id = v_doc;
  PERFORM pg_temp.assert(v_claim.id IS NOT NULL, 'T4 XML de autorização continua na fila mesmo após cancelamento');
  v_ok := public.fiscal_marcar_xml_armazenado(v_doc, 'p/' || v_doc || '.xml', repeat('e', 64), v_claim.xml_lease_token);
  PERFORM pg_temp.assert(v_ok, 'T4 XML de autorização armazenado para documento CANCELADO');
END
$t4$;

-- T5 — cancelamento só para EMITIDO; Focus `cancelado` em reconciliação de
-- documento em processamento vira CANCELADO (nunca EMITIDO).
DO $t5$
DECLARE
  v_doc uuid := pg_temp.mk_doc(5);
  v_erro boolean := false;
BEGIN
  BEGIN
    PERFORM * FROM public.fiscal_iniciar_cancelamento(v_doc, 'Justificativa com tamanho ok');
  EXCEPTION WHEN OTHERS THEN
    v_erro := SQLERRM LIKE 'FISCAL_CANCELAMENTO_SO_PARA_DOCUMENTO_EMITIDO%';
  END;
  PERFORM pg_temp.assert(v_erro, 'T5 pedido de cancelamento recusado para documento não EMITIDO');

  PERFORM pg_temp.assert(public.fiscal_marcar_cancelado(v_doc, NULL, NULL, NULL), 'T5 reconciliação aplica cancelado sem lease');
  PERFORM pg_temp.assert(
    (SELECT status = 'CANCELADO' AND xml_status = 'NAO_APLICAVEL' AND xml_cancelamento_status = 'NAO_APLICAVEL'
     FROM public.documentos_fiscais_pendentes WHERE id = v_doc),
    'T5 sem caminho de XML não cria fila de XML');
END
$t5$;

-- T6 — reaper recupera EM_PROCESSAMENTO antigo (P0.4, sem regressão).
DO $t6$
DECLARE
  v_doc uuid := pg_temp.mk_doc(6);
  v_r record;
BEGIN
  UPDATE public.documentos_fiscais_pendentes SET ultima_tentativa_em = now() - interval '1 hour' WHERE id = v_doc;
  SELECT * INTO v_r FROM public.fiscal_reaper_documentos(15, 5);
  PERFORM pg_temp.assert(v_r.reenfileirados >= 1, 'T6 reaper reenfileira EM_PROCESSAMENTO antigo');
  PERFORM pg_temp.assert((SELECT status <> 'EM_PROCESSAMENTO' FROM public.documentos_fiscais_pendentes WHERE id = v_doc),
    'T6 documento sai de EM_PROCESSAMENTO');
END
$t6$;

-- T7 — exposição: nenhuma RPC nova executável por anon/authenticated; bucket privado.
DO $t7$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.fiscal_marcar_emitido_focus(uuid,text,text,text,text,text,text)',
    'public.fiscal_registrar_referencias_focus(uuid,text,text,text)',
    'public.fiscal_iniciar_cancelamento(uuid,text,integer)',
    'public.fiscal_marcar_cancelado(uuid,text,text,uuid)',
    'public.fiscal_marcar_cancelamento_erro(uuid,text,uuid)',
    'public.fiscal_claim_documentos_xml(integer,integer)',
    'public.fiscal_claim_documentos_xml_cancelamento(integer,integer)',
    'public.fiscal_marcar_xml_cancelamento_armazenado(uuid,text,text,uuid)',
    'public.fiscal_marcar_xml_cancelamento_bloqueado(uuid,text,uuid)',
    'public.fiscal_marcar_xml_cancelamento_erro(uuid,text,uuid)'
  ] LOOP
    PERFORM pg_temp.assert(
      NOT has_function_privilege('anon', f, 'EXECUTE') AND NOT has_function_privilege('authenticated', f, 'EXECUTE')
      AND has_function_privilege('service_role', f, 'EXECUTE'),
      'T7 só service_role executa ' || f);
  END LOOP;
  PERFORM pg_temp.assert((SELECT NOT public FROM storage.buckets WHERE id = 'documentos-fiscais-xml'), 'T7 bucket documentos-fiscais-xml é privado');
END
$t7$;

ROLLBACK;
