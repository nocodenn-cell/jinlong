-- Homologação/CI (20261028130000): sync-outbox legado validado + classificação de eventos offline de funcionário
-- inativado + fila de revisão (DONO/GERENTE) com trilha imutável. Fixture SINTÉTICA, transação com ROLLBACK.
-- Rodar: psql "$DB_URL" -v ON_ERROR_STOP=1 -f backend/scripts/sync-outbox-revisao-offline.test.sql
-- Observação: "recebido 1 h antes" é simulado recuando primeiro_recebimento_em (dentro da transação o now() é fixo).
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL client_min_messages = warning;
\o /dev/null
CREATE TEMP SEQUENCE _ok; CREATE TEMP SEQUENCE _falha;
GRANT USAGE, SELECT, UPDATE ON SEQUENCE _ok, _falha TO PUBLIC;
CREATE OR REPLACE FUNCTION pg_temp.reg(p_ok boolean, p_nome text, p_det text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(p_ok, false) THEN PERFORM nextval('_ok'); ELSE PERFORM nextval('_falha'); END IF;
  RAISE WARNING 'RES|%|%|%', CASE WHEN coalesce(p_ok, false) THEN 'ok' ELSE 'NOT OK' END, p_nome, coalesce(p_det, '');
END $$;
CREATE OR REPLACE FUNCTION pg_temp.a(p_nome text, p_cond boolean, p_det text DEFAULT '') RETURNS void LANGUAGE sql AS $$
  SELECT pg_temp.reg(p_cond, p_nome, p_det);
$$;
-- executa p_sql como p_uid (authenticated) ou como service (p_uid nulo); devolve 'OK' ou a mensagem de erro.
-- Efeitos só ficam quando p_manter = true.
CREATE OR REPLACE FUNCTION pg_temp.exec_como(p_uid uuid, p_sql text, p_manter boolean DEFAULT false) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_msg text;
BEGIN
  BEGIN
    IF p_uid IS NOT NULL THEN
      PERFORM set_config('request.jwt.claim.sub', p_uid::text, true);
      PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
      SET LOCAL ROLE authenticated;
    END IF;
    EXECUTE p_sql;
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', '', true); PERFORM set_config('request.jwt.claims', '', true);
    IF NOT p_manter THEN RAISE EXCEPTION 'DESFAZ_OK'; END IF;
    RETURN 'OK';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', '', true); PERFORM set_config('request.jwt.claims', '', true);
    RETURN CASE WHEN v_msg = 'DESFAZ_OK' THEN 'OK' ELSE v_msg END;
  END;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.conta_como(p_uid uuid, p_sql text) RETURNS int LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_uid::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  EXECUTE p_sql INTO n;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true); PERFORM set_config('request.jwt.claims', '', true);
  RETURN n;
END $$;

-- Fixture: Empresa X (X1, X2) e Empresa Y (Y1).
INSERT INTO public.empresas (id, nome) VALUES
  ('fe000001-0000-4000-8000-000000000001', 'Empresa X teste'), ('fe000002-0000-4000-8000-000000000002', 'Empresa Y teste');
INSERT INTO public.lojas (id, nome, codigo, empresa_id) VALUES
  ('fa000001-0000-4000-8000-000000000001', 'X1', 'TX1', 'fe000001-0000-4000-8000-000000000001'),
  ('fa000002-0000-4000-8000-000000000002', 'X2', 'TX2', 'fe000001-0000-4000-8000-000000000001'),
  ('fb000001-0000-4000-8000-000000000001', 'Y1', 'TY1', 'fe000002-0000-4000-8000-000000000002');
INSERT INTO auth.users (id, instance_id, aud, role, email)
SELECT x::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tso-' || x || '@t.local'
  FROM unnest(ARRAY['f1000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000002',
                    'f1000000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000004',
                    'f1000000-0000-4000-8000-000000000005','f2000000-0000-4000-8000-000000000001',
                    'f2000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000006']) x;
INSERT INTO public.usuarios (id, nome, perfil, loja_id) VALUES
  ('f1000000-0000-4000-8000-000000000001', 'Dono X', 'DONO', 'fa000001-0000-4000-8000-000000000001'),
  ('f1000000-0000-4000-8000-000000000002', 'Gerente X1', 'GERENTE', 'fa000001-0000-4000-8000-000000000001'),
  ('f1000000-0000-4000-8000-000000000003', 'Operador X1 (sera inativado)', 'OPERADOR', 'fa000001-0000-4000-8000-000000000001'),
  ('f1000000-0000-4000-8000-000000000004', 'Operador X1 b', 'OPERADOR', 'fa000001-0000-4000-8000-000000000001'),
  ('f1000000-0000-4000-8000-000000000005', 'Gerente X1 b', 'GERENTE', 'fa000001-0000-4000-8000-000000000001'),
  ('f2000000-0000-4000-8000-000000000001', 'Operador Y1', 'OPERADOR', 'fb000001-0000-4000-8000-000000000001'),
  ('f2000000-0000-4000-8000-000000000002', 'Gerente Y1', 'GERENTE', 'fb000001-0000-4000-8000-000000000001');
-- inativo desde antes do registro de perda de acesso (sem log)
INSERT INTO public.usuarios (id, nome, perfil, loja_id, ativo) VALUES
  ('f1000000-0000-4000-8000-000000000006', 'Operador X1 inativo antigo', 'OPERADOR', 'fa000001-0000-4000-8000-000000000001', false);
INSERT INTO public.produtos (id, nome, preco_varejo, loja_id, origem)
SELECT 'fd000001-0000-4000-8000-000000000001', 'Prod X1 teste', 10, 'fa000001-0000-4000-8000-000000000001', coalesce((SELECT origem FROM public.produtos LIMIT 1), 'china_manual');
UPDATE public.estoque SET quantidade_atual = 50 WHERE produto_id = 'fd000001-0000-4000-8000-000000000001';
INSERT INTO public.estoque (produto_id, quantidade_atual, loja_id)
SELECT 'fd000001-0000-4000-8000-000000000001', 50, 'fa000001-0000-4000-8000-000000000001'
 WHERE NOT EXISTS (SELECT 1 FROM public.estoque WHERE produto_id = 'fd000001-0000-4000-8000-000000000001');
INSERT INTO public.caixas (id, operador_id, valor_inicial, status, loja_id) VALUES
  ('fc000001-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000003', 100, 'ABERTO', 'fa000001-0000-4000-8000-000000000001');

\set X1 '''fa000001-0000-4000-8000-000000000001'''
\set X2 '''fa000002-0000-4000-8000-000000000002'''
\set Y1 '''fb000001-0000-4000-8000-000000000001'''
\set EX '''fe000001-0000-4000-8000-000000000001'''
\set EY '''fe000002-0000-4000-8000-000000000002'''
\set DONOX '''f1000000-0000-4000-8000-000000000001'''
\set GX1 '''f1000000-0000-4000-8000-000000000002'''
\set OX1 '''f1000000-0000-4000-8000-000000000003'''
\set OX1B '''f1000000-0000-4000-8000-000000000004'''
\set GX1B '''f1000000-0000-4000-8000-000000000005'''
\set OY1 '''f2000000-0000-4000-8000-000000000001'''
\set GY1 '''f2000000-0000-4000-8000-000000000002'''
\set OANT '''f1000000-0000-4000-8000-000000000006'''
\set CX1 '''fc000001-0000-4000-8000-000000000001'''

-- avalia evento: (event_id, operador, extra jsonb)
CREATE OR REPLACE FUNCTION pg_temp.av(p_ev text, p_op text, p_extra jsonb DEFAULT '{}'::jsonb) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.sync_avaliar_evento(jsonb_build_object('event_id', p_ev, 'tipo', 'VENDA_REGISTRADA', 'payload_sha256', 'sha-' || p_ev,
    'device_fingerprint', 'pdv-x1', 'loja_id', 'fa000001-0000-4000-8000-000000000001', 'caixa_id', 'fc000001-0000-4000-8000-000000000001',
    'operador_id', p_op) || p_extra);
$$;
CREATE OR REPLACE FUNCTION pg_temp.venda_payload(p_venda text, p_caixa text, p_op text) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('venda_id', p_venda, 'caixa_id', p_caixa, 'operador_id', p_op, 'forma_pagamento', 'DINHEIRO',
    'total_bruto', 10, 'total_desconto', 0, 'total_liquido', 10, 'loja_id', 'fa000001-0000-4000-8000-000000000001',
    'itens', jsonb_build_array(jsonb_build_object('produto_id', 'fd000001-0000-4000-8000-000000000001', 'quantidade', 1,
      'preco_original', 10, 'preco_unitario', 10, 'item_id', md5(p_venda)::uuid)));
$$;
CREATE OR REPLACE FUNCTION pg_temp.enf(p_ev text, p_tipo text, p_caixa text, p_op text, p_payload jsonb, p_venda text DEFAULT NULL) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.sync_enfileirar_revisao(jsonb_build_object('event_id', p_ev, 'tipo', p_tipo, 'payload', p_payload::text,
    'payload_sha256', 'sha-' || p_ev, 'origem', 'legado', 'device_fingerprint', 'pdv-x1', 'loja_id', 'fa000001-0000-4000-8000-000000000001',
    'caixa_id', p_caixa, 'venda_id', p_venda, 'operador_id', p_op, 'classificacao', 'NAO_COMPROVAVEL', 'motivo', 'TESTE',
    'evidencias', '{}'::jsonb));
$$;

-- ===== R. Recibos do servidor =====
SELECT public.sync_registrar_recebimento('R1', 'VENDA_REGISTRADA', 'sha-R1', 'legado', NULL, 'PDV-X1');
SELECT public.sync_registrar_recebimento('R1', 'VENDA_REGISTRADA', 'sha-R1', 'legado', NULL, 'pdv-x1');
SELECT pg_temp.a('R1 reenvio com o mesmo conteúdo conta recebimentos e não marca divergência',
  (SELECT recebimentos = 2 AND NOT payload_divergente FROM internal.sync_eventos_recebidos WHERE event_id = 'R1'));
SELECT public.sync_registrar_recebimento('R1', 'VENDA_REGISTRADA', 'sha-OUTRO', 'legado', NULL, 'pdv-x1');
SELECT pg_temp.a('R2 mesmo event_id com outro conteúdo fica marcado como divergente (não vale como prova)',
  (SELECT payload_divergente FROM internal.sync_eventos_recebidos WHERE event_id = 'R1'));
SELECT pg_temp.a('R3 authenticated não lê recibos nem chama as RPCs do sync',
  NOT has_table_privilege('authenticated', 'internal.sync_eventos_recebidos', 'SELECT')
  AND NOT has_function_privilege('authenticated', 'public.sync_avaliar_evento(jsonb)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.sync_enfileirar_revisao(jsonb)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.sync_registrar_recebimento(text,text,text,text,uuid,text)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.revisar_evento_offline(uuid,text,text)', 'EXECUTE'));

-- ===== S. Classificação =====
SELECT pg_temp.a('S1 operador ativo com vínculo na loja ⇒ PROCESSAR', pg_temp.av('S1', :OX1)->>'acao' = 'PROCESSAR');
SELECT pg_temp.a('S2 operador de OUTRA empresa (nunca teve vínculo) ⇒ REJEITAR EVENTO_OPERADOR_SEM_VINCULO',
  pg_temp.av('S2', :OY1) @> '{"acao":"REJEITAR","motivo":"EVENTO_OPERADOR_SEM_VINCULO"}');
SELECT pg_temp.a('S3 sem operador (PDV legado) ⇒ REVISAO NAO_COMPROVAVEL SEM_OPERADOR',
  pg_temp.av('S3', NULL) @> '{"acao":"REVISAO","classificacao":"NAO_COMPROVAVEL","motivo":"SEM_OPERADOR"}');
SELECT pg_temp.a('S4 inativo sem registro de perda de acesso ⇒ REVISAO NAO_COMPROVAVEL PERDA_DE_ACESSO_SEM_REGISTRO',
  pg_temp.av('S4', :OANT) @> '{"acao":"REVISAO","classificacao":"NAO_COMPROVAVEL","motivo":"PERDA_DE_ACESSO_SEM_REGISTRO"}');

-- recibos ANTES da inativação (S5a: mesmo conteúdo; S5b: conteúdo divergente; S5c: outro computador)
SELECT public.sync_registrar_recebimento('S5a', 'VENDA_REGISTRADA', 'sha-S5a', 'legado', NULL, 'pdv-x1');
SELECT public.sync_registrar_recebimento('S5b', 'VENDA_REGISTRADA', 'sha-S5b', 'legado', NULL, 'pdv-x1');
SELECT public.sync_registrar_recebimento('S5b', 'VENDA_REGISTRADA', 'sha-ALTERADO', 'legado', NULL, 'pdv-x1');
SELECT public.sync_registrar_recebimento('S5c', 'VENDA_REGISTRADA', 'sha-S5c', 'legado', NULL, 'pdv-OUTRO');
UPDATE internal.sync_eventos_recebidos SET primeiro_recebimento_em = now() - interval '1 hour' WHERE event_id IN ('S5a', 'S5b', 'S5c');
-- inativação (servidor registra a perda de acesso em tokens_revogacao_log)
UPDATE public.usuarios SET ativo = false WHERE id = :OX1;
SELECT pg_temp.a('S5 inativação grava a perda de acesso no servidor', internal.fp_usuario_perdeu_acesso_em(:OX1) IS NOT NULL);
SELECT pg_temp.a('S5a recebido pelo servidor ANTES da inativação (mesmo conteúdo e computador) ⇒ RECONCILIAR ANTES_INATIVACAO',
  pg_temp.av('S5a', :OX1) @> '{"acao":"RECONCILIAR","classificacao":"ANTES_INATIVACAO"}');
SELECT pg_temp.a('S5b recibo antigo com conteúdo divergente NÃO prova nada ⇒ NAO_COMPROVAVEL',
  pg_temp.av('S5b', :OX1) @> '{"acao":"REVISAO","classificacao":"NAO_COMPROVAVEL"}');
SELECT pg_temp.a('S5c recibo antigo de OUTRO computador NÃO prova nada ⇒ NAO_COMPROVAVEL',
  pg_temp.av('S5c', :OX1) @> '{"acao":"REVISAO","classificacao":"NAO_COMPROVAVEL"}');
SELECT pg_temp.a('S6 relógio do dispositivo diz DEPOIS da inativação ⇒ REVISAO APOS_INATIVACAO',
  pg_temp.av('S6', :OX1, jsonb_build_object('horario_dispositivo', now() + interval '1 minute'))
    @> '{"acao":"REVISAO","classificacao":"APOS_INATIVACAO","motivo":"HORARIO_DO_DISPOSITIVO_APOS_A_PERDA"}');
SELECT pg_temp.a('S7 relógio do dispositivo diz ANTES (sem prova do servidor) NÃO basta ⇒ NAO_COMPROVAVEL',
  pg_temp.av('S7', :OX1, jsonb_build_object('horario_dispositivo', now() - interval '2 hours'))
    @> '{"acao":"REVISAO","classificacao":"NAO_COMPROVAVEL","motivo":"SEM_PROVA_DO_SERVIDOR_ANTERIOR_A_PERDA"}');
SELECT pg_temp.a('S8 horário do dispositivo inválido/ausente ⇒ NAO_COMPROVAVEL',
  pg_temp.av('S8', :OX1, '{"horario_dispositivo":"lixo"}') @> '{"acao":"REVISAO","classificacao":"NAO_COMPROVAVEL"}');
UPDATE public.usuario_vinculos SET ativo = false WHERE usuario_id = :OX1B;
SELECT pg_temp.a('S9 vínculo desativado (usuário ativo) também é perda de acesso',
  pg_temp.av('S9', :OX1B) @> '{"acao":"REVISAO","classificacao":"NAO_COMPROVAVEL"}', pg_temp.av('S9', :OX1B)::text);
UPDATE public.usuario_vinculos SET ativo = true WHERE usuario_id = :OX1B;
SELECT pg_temp.a('S10 vínculo reativado ⇒ volta a PROCESSAR', pg_temp.av('S10', :OX1B)->>'acao' = 'PROCESSAR');

-- ===== T. Token de gerente =====
INSERT INTO public.tokens_desconto_gerente (token, loja_id, criado_por, aprovador_id, usado, expira_em, created_at) VALUES
  ('T-LEG', NULL, NULL, :GX1, false, now() + interval '5 minutes', now() - interval '1 hour'),
  ('T-LEG-SEM-APROV', NULL, NULL, NULL, false, now() + interval '5 minutes', now() - interval '1 hour'),
  ('T-X2', 'fa000002-0000-4000-8000-000000000002', :DONOX, :GX1, false, now() + interval '5 minutes', now() - interval '1 hour'),
  ('T-Y', NULL, :OY1, :GY1, false, now() + interval '5 minutes', now() - interval '1 hour');
SELECT pg_temp.a('T1 token legado (emissor PDV, aprovador gerente ativo) na empresa legada ⇒ PROCESSAR',
  pg_temp.av('T1', :OX1B, jsonb_build_object('exige_token', true, 'desconto_token', 'T-LEG', 'empresa_legado', :EX))->>'acao' = 'PROCESSAR');
SELECT pg_temp.a('T2 token legado em modo dispositivo (sem empresa legada) ⇒ REJEITAR',
  pg_temp.av('T2', :OX1B, jsonb_build_object('exige_token', true, 'desconto_token', 'T-LEG'))
    @> '{"acao":"REJEITAR","motivo":"GERENTE_TOKEN_LEGADO_FORA_DO_ESCOPO"}');
SELECT pg_temp.a('T3 token legado com empresa legada de OUTRA empresa ⇒ REJEITAR',
  pg_temp.av('T3', :OX1B, jsonb_build_object('exige_token', true, 'desconto_token', 'T-LEG', 'empresa_legado', :EY))->>'acao' = 'REJEITAR');
SELECT pg_temp.a('T4 token legado sem aprovador identificado ⇒ REJEITAR',
  pg_temp.av('T4', :OX1B, jsonb_build_object('exige_token', true, 'desconto_token', 'T-LEG-SEM-APROV', 'empresa_legado', :EX))->>'acao' = 'REJEITAR');
SELECT pg_temp.a('T5 token inexistente ⇒ REJEITAR',
  pg_temp.av('T5', :OX1B, jsonb_build_object('exige_token', true, 'desconto_token', 'NAO-EXISTE', 'empresa_legado', :EX))
    @> '{"acao":"REJEITAR","motivo":"GERENTE_TOKEN_INVALIDO_OU_REVOGADO"}');
SELECT pg_temp.a('T6 token gravado para a loja X2 usado na X1 ⇒ REJEITAR',
  pg_temp.av('T6', :OX1B, jsonb_build_object('exige_token', true, 'desconto_token', 'T-X2'))
    @> '{"acao":"REJEITAR","motivo":"GERENTE_TOKEN_DE_OUTRA_LOJA"}');
SELECT pg_temp.a('T7 token emitido/aprovado por usuários da Empresa Y usado na X1 ⇒ REJEITAR',
  pg_temp.av('T7', :OX1B, jsonb_build_object('exige_token', true, 'desconto_token', 'T-Y'))->>'acao' = 'REJEITAR');
SAVEPOINT t8;
UPDATE public.usuarios SET ativo = false WHERE id = :GX1;
SELECT pg_temp.a('T8 aprovador inativado: token revogado no servidor', (SELECT revogado_em IS NOT NULL FROM public.tokens_desconto_gerente WHERE token = 'T-LEG'));
SELECT pg_temp.a('T8 venda com token cujo aprovador foi inativado (sem prova) ⇒ REVISAO NAO_COMPROVAVEL',
  pg_temp.av('T8', :OX1B, jsonb_build_object('exige_token', true, 'desconto_token', 'T-LEG', 'empresa_legado', :EX))
    @> '{"acao":"REVISAO","classificacao":"NAO_COMPROVAVEL"}',
  pg_temp.av('T8', :OX1B, jsonb_build_object('exige_token', true, 'desconto_token', 'T-LEG', 'empresa_legado', :EX))::text);
INSERT INTO public.tokens_desconto_gerente (token, loja_id, criado_por, aprovador_id, usado, expira_em, created_at) VALUES
  ('T-DEPOIS', NULL, NULL, :GX1, false, now() + interval '1 hour', now() + interval '1 minute');
SELECT pg_temp.a('T9 token emitido (servidor) DEPOIS da perda de acesso ⇒ REVISAO APOS_INATIVACAO',
  pg_temp.av('T9', :OX1B, jsonb_build_object('exige_token', true, 'desconto_token', 'T-DEPOIS', 'empresa_legado', :EX))
    @> '{"acao":"REVISAO","classificacao":"APOS_INATIVACAO","motivo":"TOKEN_EMITIDO_APOS_A_PERDA"}');
ROLLBACK TO SAVEPOINT t8;

-- ===== F. Fila de revisão =====
SELECT pg_temp.a('F1 enfileirar cria PENDENTE', (pg_temp.enf('F1', 'VENDA_REGISTRADA', :CX1, :OX1,
  pg_temp.venda_payload('fd100001-0000-4000-8000-000000000001', 'fc000001-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000003'),
  'fd100001-0000-4000-8000-000000000001')) @> '{"status":"PENDENTE","novo":true}');
SELECT pg_temp.a('F2 reenvio do mesmo evento é idempotente (não duplica)',
  (pg_temp.enf('F1', 'VENDA_REGISTRADA', :CX1, :OX1, '{}'::jsonb)) @> '{"novo":false}'
  AND (SELECT count(*) = 1 FROM public.sync_eventos_revisao WHERE event_id = 'F1'));
SELECT pg_temp.a('F3 evento seguinte do MESMO caixa (operador ativo) espera a decisão ⇒ CAIXA_EM_REVISAO',
  pg_temp.av('F3', :OX1B) @> '{"acao":"REVISAO","motivo":"CAIXA_EM_REVISAO"}');
SELECT pg_temp.a('F3b caixa em revisão PRESERVA a classificação do próprio evento (APOS_INATIVACAO de quem foi inativado)',
  pg_temp.av('F3b', :OX1, jsonb_build_object('horario_dispositivo', now() + interval '1 hour'))
    @> '{"acao":"REVISAO","classificacao":"APOS_INATIVACAO","motivo":"CAIXA_EM_REVISAO:HORARIO_DO_DISPOSITIVO_APOS_A_PERDA"}');
SELECT pg_temp.a('F3c caixa em revisão não transforma recusa em revisão (operador de outra empresa continua REJEITAR)',
  pg_temp.av('F3c', :OY1) @> '{"acao":"REJEITAR","motivo":"EVENTO_OPERADOR_SEM_VINCULO"}');
SELECT pg_temp.enf('F4', 'VENDA_REGISTRADA', :CX1, :OX1,
  pg_temp.venda_payload('fd100002-0000-4000-8000-000000000002', 'fc000001-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000003'),
  'fd100002-0000-4000-8000-000000000002');
SELECT pg_temp.a('F5 RLS: gerente e dono da loja X1 veem a fila',
  pg_temp.conta_como(:GX1, 'SELECT count(*) FROM public.sync_eventos_revisao') = 2
  AND pg_temp.conta_como(:DONOX, 'SELECT count(*) FROM public.sync_eventos_revisao') = 2);
SELECT pg_temp.a('F6 RLS: gerente de outra empresa, operador e usuário inativo NÃO veem',
  pg_temp.conta_como(:GY1, 'SELECT count(*) FROM public.sync_eventos_revisao') = 0
  AND pg_temp.conta_como(:OX1B, 'SELECT count(*) FROM public.sync_eventos_revisao') = 0
  AND pg_temp.conta_como(:OX1, 'SELECT count(*) FROM public.sync_eventos_revisao') = 0);
SELECT pg_temp.a('F7 authenticated não insere/altera/apaga a fila direto',
  pg_temp.exec_como(:GX1, $q$INSERT INTO public.sync_eventos_revisao (event_id, tipo, payload, payload_sha256, origem, empresa_id, loja_id, classificacao, motivo) VALUES ('x','CAIXA_ABERTO','{}','x','legado','fe000001-0000-4000-8000-000000000001','fa000001-0000-4000-8000-000000000001','NAO_COMPROVAVEL','x')$q$) ~ 'permission denied'
  AND pg_temp.exec_como(:GX1, $q$UPDATE public.sync_eventos_revisao SET status = 'APROVADO'$q$) ~ 'permission denied'
  AND pg_temp.exec_como(:GX1, $q$DELETE FROM public.sync_eventos_revisao$q$) ~ 'permission denied');
SELECT pg_temp.a('F8 trilha imutável mesmo para o service/superusuário: DELETE e alteração de payload recusados',
  pg_temp.exec_como(NULL, $q$DELETE FROM public.sync_eventos_revisao WHERE event_id = 'F1'$q$) ~ 'SYNC_REVISAO_IMUTAVEL'
  AND pg_temp.exec_como(NULL, $q$UPDATE public.sync_eventos_revisao SET payload = '{}' WHERE event_id = 'F1'$q$) ~ 'SYNC_REVISAO_IMUTAVEL');

-- ===== V. Decisão (revisar_evento_offline) =====
\set F1ID '(SELECT id FROM public.sync_eventos_revisao WHERE event_id = ''F1'')'
\set F4ID '(SELECT id FROM public.sync_eventos_revisao WHERE event_id = ''F4'')'
SELECT pg_temp.a('V1 gerente de OUTRA empresa não decide (resposta igual a inexistente)',
  pg_temp.exec_como(:GY1, format('SELECT public.revisar_evento_offline(%L, ''APROVAR'', ''tentativa de fora'')', :F1ID)) ~ 'REVISAO_NAO_ENCONTRADA_OU_SEM_PERMISSAO');
SELECT pg_temp.a('V2 operador não decide',
  pg_temp.exec_como(:OX1B, format('SELECT public.revisar_evento_offline(%L, ''APROVAR'', ''sou operador'')', :F1ID)) ~ 'SEM_PERMISSAO');
SELECT pg_temp.a('V3 o próprio operador inativado não decide nem opera',
  pg_temp.exec_como(:OX1, format('SELECT public.revisar_evento_offline(%L, ''APROVAR'', ''minha venda'')', :F1ID)) ~ 'SEM_PERMISSAO');
SELECT pg_temp.a('V4 motivo obrigatório',
  pg_temp.exec_como(:GX1, format('SELECT public.revisar_evento_offline(%L, ''APROVAR'', ''ok'')', :F1ID)) ~ 'REVISAO_MOTIVO_OBRIGATORIO');
SELECT pg_temp.a('V5 fora de ordem: aprovar o 2º evento do caixa antes do 1º é recusado',
  pg_temp.exec_como(:GX1, format('SELECT public.revisar_evento_offline(%L, ''APROVAR'', ''pulando a ordem'')', :F4ID)) ~ 'REVISAO_FORA_DE_ORDEM');
CREATE TEMP TABLE _r (k text PRIMARY KEY, v text);
INSERT INTO _r SELECT 'V6', pg_temp.exec_como(:GX1, format('SELECT public.revisar_evento_offline(%L, ''APROVAR'', ''venda conferida no caixa físico'')', :F1ID), true);
SELECT pg_temp.a('V6 gerente da loja APROVA a venda: ela é registrada com o operador original e baixa estoque',
  (SELECT v FROM _r WHERE k = 'V6') = 'OK'
  AND EXISTS (SELECT 1 FROM public.vendas WHERE id = 'fd100001-0000-4000-8000-000000000001' AND operador_id = :OX1 AND total_liquido = 10)
  AND (SELECT quantidade_atual FROM public.estoque WHERE produto_id = 'fd000001-0000-4000-8000-000000000001') = 49,
  (SELECT v FROM _r WHERE k = 'V6') || ' estoque=' || (SELECT quantidade_atual FROM public.estoque WHERE produto_id = 'fd000001-0000-4000-8000-000000000001'));
SELECT pg_temp.a('V7 trilha: APROVADO, quem decidiu, quando e por quê',
  (SELECT status = 'APROVADO' AND decidido_por = :GX1 AND decidido_em IS NOT NULL AND decisao_motivo = 'venda conferida no caixa físico'
     FROM public.sync_eventos_revisao WHERE event_id = 'F1'));
SELECT pg_temp.a('V8 decisão é única (já decidido não muda)',
  pg_temp.exec_como(:GX1B, format('SELECT public.revisar_evento_offline(%L, ''REJEITAR'', ''mudei de ideia'')', :F1ID)) ~ 'REVISAO_JA_DECIDIDA');
INSERT INTO _r SELECT 'V9', pg_temp.exec_como(:GX1, format('SELECT public.revisar_evento_offline(%L, ''REJEITAR'', ''venda não encontrada no caixa'')', :F4ID), true);
SELECT pg_temp.a('V9 REJEITAR mantém o registro e não cria venda',
  (SELECT v FROM _r WHERE k = 'V9') = 'OK'
  AND NOT EXISTS (SELECT 1 FROM public.vendas WHERE id = 'fd100002-0000-4000-8000-000000000002')
  AND (SELECT status = 'REJEITADO' FROM public.sync_eventos_revisao WHERE event_id = 'F4'), (SELECT v FROM _r WHERE k = 'V9'));
-- autoaprovação: evento cujo operador é o próprio gerente (que perdeu e recuperou... aqui: gerente b como operador do evento)
SELECT pg_temp.enf('V10', 'CAIXA_ABERTO', 'fc000002-0000-4000-8000-000000000002', :GX1B,
  jsonb_build_object('id', 'fc000002-0000-4000-8000-000000000002', 'operador_id', :GX1B, 'valor_inicial', 50, 'loja_id', :X1));
SELECT pg_temp.a('V10 ninguém aprova o próprio evento',
  pg_temp.exec_como(:GX1B, format('SELECT public.revisar_evento_offline(%L, ''APROVAR'', ''meu caixa'')',
    (SELECT id FROM public.sync_eventos_revisao WHERE event_id = 'V10'))) ~ 'REVISAO_AUTOAPROVACAO_PROIBIDA');
-- sequência completa de um caixa offline: abertura → venda → sangria → fechamento, aprovadas em ordem pelo DONO
SELECT pg_temp.enf('C1', 'CAIXA_ABERTO', 'fc000003-0000-4000-8000-000000000003', :OANT,
  jsonb_build_object('id', 'fc000003-0000-4000-8000-000000000003', 'operador_id', :OANT, 'valor_inicial', 20, 'loja_id', :X1));
SELECT pg_temp.enf('C2', 'VENDA_REGISTRADA', 'fc000003-0000-4000-8000-000000000003', :OANT,
  pg_temp.venda_payload('fd100003-0000-4000-8000-000000000003', 'fc000003-0000-4000-8000-000000000003', 'f1000000-0000-4000-8000-000000000006'),
  'fd100003-0000-4000-8000-000000000003');
SELECT pg_temp.enf('C3', 'MOVIMENTO_CAIXA', 'fc000003-0000-4000-8000-000000000003', :OANT,
  jsonb_build_object('id', 'fd200003-0000-4000-8000-000000000003', 'caixa_id', 'fc000003-0000-4000-8000-000000000003', 'tipo', 'SUPRIMENTO', 'valor', 5));
SELECT pg_temp.enf('C4', 'CAIXA_FECHADO', 'fc000003-0000-4000-8000-000000000003', :OANT,
  jsonb_build_object('id', 'fc000003-0000-4000-8000-000000000003', 'data_fechamento', now(), 'valor_fechamento', 35));
CREATE OR REPLACE FUNCTION pg_temp.decide(p_ev text, p_uid uuid) RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.exec_como(p_uid, format('SELECT public.revisar_evento_offline(%L, ''APROVAR'', ''caixa offline conferido'')',
    (SELECT id FROM public.sync_eventos_revisao WHERE event_id = p_ev)), true);
$$;
SELECT pg_temp.a('C5 DONO aprova em ordem abertura → venda → suprimento → fechamento',
  pg_temp.decide('C1', :DONOX) = 'OK' AND pg_temp.decide('C2', :DONOX) = 'OK' AND pg_temp.decide('C3', :DONOX) = 'OK'
  AND pg_temp.decide('C4', :DONOX) = 'OK',
  concat_ws(' | ', pg_temp.decide('C1', :DONOX), pg_temp.decide('C2', :DONOX), pg_temp.decide('C3', :DONOX), pg_temp.decide('C4', :DONOX)));
SELECT pg_temp.a('C6 resultado: caixa na loja X1, FECHADO, com a venda e o suprimento',
  EXISTS (SELECT 1 FROM public.caixas WHERE id = 'fc000003-0000-4000-8000-000000000003' AND loja_id = :X1 AND status = 'FECHADO')
  AND EXISTS (SELECT 1 FROM public.vendas WHERE id = 'fd100003-0000-4000-8000-000000000003')
  AND EXISTS (SELECT 1 FROM public.movimentacoes_caixa WHERE caixa_id = 'fc000003-0000-4000-8000-000000000003'),
  (SELECT 'status=' || coalesce(status, '?') FROM public.caixas WHERE id = 'fc000003-0000-4000-8000-000000000003'));
SELECT pg_temp.a('C7 nenhum evento sumiu: todos os enfileirados continuam na trilha',
  (SELECT count(*) FROM public.sync_eventos_revisao WHERE event_id IN ('F1', 'F4', 'V10', 'C1', 'C2', 'C3', 'C4')) = 7);
SELECT public.sync_enfileirar_revisao(jsonb_build_object('event_id', 'A1', 'tipo', 'VENDA_REGISTRADA', 'payload', '{}', 'payload_sha256', 'x',
  'origem', 'legado', 'loja_id', :X1, 'classificacao', 'ANTES_INATIVACAO', 'motivo', 'RECEBIDO_PELO_SERVIDOR_ANTES_DA_PERDA_DE_ACESSO',
  'status', 'RECONCILIADO_AUTO'));
SELECT pg_temp.a('C8 reconciliação automática fica registrada como RECONCILIADO_AUTO (sem decisor humano)',
  (SELECT status = 'RECONCILIADO_AUTO' AND decidido_por IS NULL AND decidido_em IS NOT NULL FROM public.sync_eventos_revisao WHERE event_id = 'A1'));
SELECT pg_temp.a('C9 RECONCILIADO_AUTO não pode ser alterado depois',
  pg_temp.exec_como(NULL, $q$UPDATE public.sync_eventos_revisao SET status = 'REJEITADO', decidido_por = 'f1000000-0000-4000-8000-000000000001', decisao_motivo = 'xxxxxx' WHERE event_id = 'A1'$q$) ~ 'SYNC_REVISAO_IMUTAVEL');

\o
DO $$
DECLARE v_ok bigint; v_f bigint;
BEGIN
  SELECT CASE WHEN is_called THEN last_value ELSE 0 END INTO v_ok FROM _ok;
  SELECT CASE WHEN is_called THEN last_value ELSE 0 END INTO v_f FROM _falha;
  RAISE WARNING 'RESUMO|passou=%|falhou=%|total=%', v_ok, v_f, v_ok + v_f;
  IF v_f > 0 THEN RAISE EXCEPTION 'sync-outbox-revisao-offline: % FALHA(S)', v_f; END IF;
END $$;
ROLLBACK;
