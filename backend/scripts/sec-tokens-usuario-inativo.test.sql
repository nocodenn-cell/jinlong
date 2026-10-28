-- Homologação/CI (20261028120000 + 20261028121000 + 20261028122000 + corte ADMIN): tokens de usuário inativo, revogação por
-- inativação/remoção de vínculo, isolamento entre empresas, RLS imediata e provisionamento fail-closed.
-- Fixture SINTÉTICA própria, numa transação com ROLLBACK (não deixa dados). Rodar: psql "$DB_URL" -v ON_ERROR_STOP=1 -f
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL client_min_messages = warning;
\o /dev/null

-- Resultados sobrevivem a ROLLBACK TO SAVEPOINT: contadores em SEQUENCE (não transacional) + WARNING por teste.
CREATE TEMP SEQUENCE _ok; CREATE TEMP SEQUENCE _falha;
GRANT USAGE, SELECT, UPDATE ON SEQUENCE _ok, _falha TO PUBLIC;
CREATE OR REPLACE FUNCTION pg_temp.reg(p_ok boolean, p_nome text, p_det text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(p_ok, false) THEN PERFORM nextval('_ok'); ELSE PERFORM nextval('_falha'); END IF;
  RAISE WARNING 'RES|%|%|%', CASE WHEN coalesce(p_ok, false) THEN 'ok' ELSE 'NOT OK' END, p_nome, coalesce(p_det, '');
END $$;

-- Fixture: Empresa X (lojas X1, X2) e Empresa Y (loja Y1).
INSERT INTO public.empresas (id, nome) VALUES
  ('fe000001-0000-4000-8000-000000000001', 'Empresa X teste'), ('fe000002-0000-4000-8000-000000000002', 'Empresa Y teste');
INSERT INTO public.lojas (id, nome, codigo, empresa_id) VALUES
  ('fa000001-0000-4000-8000-000000000001', 'X1', 'TX1', 'fe000001-0000-4000-8000-000000000001'),
  ('fa000002-0000-4000-8000-000000000002', 'X2', 'TX2', 'fe000001-0000-4000-8000-000000000001'),
  ('fb000001-0000-4000-8000-000000000001', 'Y1', 'TY1', 'fe000002-0000-4000-8000-000000000002');
INSERT INTO auth.users (id, instance_id, aud, role, email)
SELECT x::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tst-' || x || '@t.local'
  FROM unnest(ARRAY['f1000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000002',
                    'f1000000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-000000000004',
                    'f1000000-0000-4000-8000-000000000005','f2000000-0000-4000-8000-000000000001',
                    'f2000000-0000-4000-8000-000000000002','f3000000-0000-4000-8000-000000000001']) x;
-- X: dono, gerente X1, operador X1, operador X2, gerente X2 | Y: dono, gerente Y1
INSERT INTO public.usuarios (id, nome, perfil, loja_id) VALUES
  ('f1000000-0000-4000-8000-000000000001', 'Dono X', 'DONO', 'fa000001-0000-4000-8000-000000000001'),
  ('f1000000-0000-4000-8000-000000000002', 'Gerente X1', 'GERENTE', 'fa000001-0000-4000-8000-000000000001'),
  ('f1000000-0000-4000-8000-000000000003', 'Operador X1', 'OPERADOR', 'fa000001-0000-4000-8000-000000000001'),
  ('f1000000-0000-4000-8000-000000000004', 'Operador X2', 'OPERADOR', 'fa000002-0000-4000-8000-000000000002'),
  ('f1000000-0000-4000-8000-000000000005', 'Gerente X2', 'GERENTE', 'fa000002-0000-4000-8000-000000000002'),
  ('f2000000-0000-4000-8000-000000000001', 'Dono Y', 'DONO', 'fb000001-0000-4000-8000-000000000001'),
  ('f2000000-0000-4000-8000-000000000002', 'Gerente Y1', 'GERENTE', 'fb000001-0000-4000-8000-000000000001');
INSERT INTO public.produtos (nome, preco_varejo, loja_id, origem)
SELECT 'Prod ' || l, 10, l::uuid, (SELECT origem FROM public.produtos LIMIT 1)
  FROM unnest(ARRAY['fa000001-0000-4000-8000-000000000001','fa000002-0000-4000-8000-000000000002','fb000001-0000-4000-8000-000000000001']) l
 WHERE EXISTS (SELECT 1 FROM public.produtos);

CREATE OR REPLACE FUNCTION pg_temp.tok(p_tok text, p_loja text, p_emissor uuid, p_aprov uuid) RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.tokens_desconto_gerente (token, loja_id, criado_por, aprovador_id, usado, expira_em)
  VALUES (p_tok, p_loja, p_emissor, p_aprov, false, now() + interval '5 minutes');
$$;
CREATE OR REPLACE FUNCTION pg_temp.optok(p_tok text, p_loja uuid, p_ger uuid, p_sol uuid) RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.tokens_autorizacao_operacao (token, finalidade, alvo_id, loja_id, gerente_id, solicitante_id, expira_em)
  VALUES (p_tok, 'SANGRIA', 'alvo-' || p_tok, p_loja, p_ger, p_sol, now() + interval '5 minutes');
$$;
-- registra resultado; p_sql deve FALHAR com p_erro (se p_erro não nulo) ou PASSAR (p_erro nulo)
CREATE OR REPLACE FUNCTION pg_temp.t(p_nome text, p_sql text, p_erro text DEFAULT NULL) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_msg text;
BEGIN
  BEGIN
    EXECUTE p_sql;
    IF p_erro IS NULL THEN PERFORM pg_temp.reg(true, p_nome, 'passou');
    ELSE PERFORM pg_temp.reg(false, p_nome, 'esperava erro ' || p_erro || ', passou'); END IF;
    RAISE EXCEPTION 'ROLLBACK_SAVEPOINT_OK';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    IF v_msg = 'ROLLBACK_SAVEPOINT_OK' THEN RETURN; END IF;
    IF p_erro IS NOT NULL AND v_msg ~ p_erro THEN PERFORM pg_temp.reg(true, p_nome, 'erro esperado: ' || v_msg);
    ELSE PERFORM pg_temp.reg(false, p_nome, 'erro: ' || v_msg); END IF;
  END;
END $$;
-- asserção booleana (efeitos ficam: usar dentro de um SAVEPOINT quando mudar estado)
CREATE OR REPLACE FUNCTION pg_temp.a(p_nome text, p_cond boolean, p_det text DEFAULT '') RETURNS void LANGUAGE sql AS $$
  SELECT pg_temp.reg(p_cond, p_nome, p_det);
$$;
CREATE OR REPLACE FUNCTION pg_temp.como_visiveis(p_uid uuid, p_lojas uuid[] DEFAULT ARRAY['fa000001-0000-4000-8000-000000000001','fa000002-0000-4000-8000-000000000002','fb000001-0000-4000-8000-000000000001']::uuid[]) RETURNS int LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_uid::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.produtos WHERE loja_id = ANY (p_lojas);
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN n;
END $$;

\set X1 '''fa000001-0000-4000-8000-000000000001'''
\set X2 '''fa000002-0000-4000-8000-000000000002'''
\set Y1 '''fb000001-0000-4000-8000-000000000001'''
\set DONOX '''f1000000-0000-4000-8000-000000000001'''
\set GX1 '''f1000000-0000-4000-8000-000000000002'''
\set OX1 '''f1000000-0000-4000-8000-000000000003'''
\set OX2 '''f1000000-0000-4000-8000-000000000004'''
\set GX2 '''f1000000-0000-4000-8000-000000000005'''
\set DONOY '''f2000000-0000-4000-8000-000000000001'''
\set GY1 '''f2000000-0000-4000-8000-000000000002'''

-- ===== A. Linha de base (todos ativos) =====
SELECT pg_temp.tok('A1', :X1, :OX1, :GX1);
SELECT pg_temp.a('A1 token válido: operador X1 + aprovador gerente X1 vale em X1', public.fp_token_gerente_vale_na_loja('A1', :X1));
SELECT pg_temp.t('A2 consumo (usado=true) com emissor/aprovador ativos passa', $$UPDATE public.tokens_desconto_gerente SET usado = true WHERE token = 'A1'$$);
SELECT pg_temp.a('A3 aprovador DONO/GERENTE da MESMA empresa vale em outra loja dela (X2, gerente X1)',
  (SELECT internal.fp_aprovador_ativo_na_empresa(:GX1, :X2)));
SELECT pg_temp.optok('A4', :X1::uuid, :GX1, :OX1);
SELECT pg_temp.t('A4 consumir_token_autorizacao_operacao com tudo ativo devolve o gerente',
  $$SELECT public.consumir_token_autorizacao_operacao('A4', 'SANGRIA', 'alvo-A4', 'fa000001-0000-4000-8000-000000000001')$$);

-- ===== B. Isolamento entre empresas =====
SELECT pg_temp.tok('B1', :Y1, :DONOY, :GY1);
SELECT pg_temp.a('B1 token da Empresa Y não vale na loja X1', internal.token_gerente_fora_da_loja('B1', :X1));
SELECT pg_temp.a('B2 aprovador da Empresa Y não aprova na Empresa X', NOT internal.fp_aprovador_ativo_na_empresa(:GY1, :X1));
SELECT pg_temp.tok('B3', :X1, :OX1, :GY1);
SELECT pg_temp.a('B3 token de X1 com aprovador de outra empresa: fora da loja', internal.token_gerente_fora_da_loja('B3', :X1));
SELECT pg_temp.t('B3b consumo desse token aborta (TOKEN_GERENTE_REVOGADO)', $$UPDATE public.tokens_desconto_gerente SET usado = true WHERE token = 'B3'$$, 'TOKEN_GERENTE_REVOGADO');
SELECT pg_temp.optok('B4', :X1::uuid, :GY1, :OX1);
SELECT pg_temp.t('B4 token tipado com gerente de outra empresa é negado',
  $$SELECT public.consumir_token_autorizacao_operacao('B4', 'SANGRIA', 'alvo-B4', 'fa000001-0000-4000-8000-000000000001')$$, 'AUTORIZACAO_GERENTE_INVALIDO');

-- ===== C. Inativação do EMISSOR revoga tokens pendentes =====
SAVEPOINT c;
SELECT pg_temp.tok('C1', :X1, :OX1, :GX1);
SELECT pg_temp.optok('C2', :X1::uuid, :GX1, :OX1);
UPDATE public.usuarios SET ativo = false WHERE id = :OX1;
SELECT pg_temp.a('C1 inativar operador ⇒ token de gerente pendente revogado (usado + revogado_em)',
  (SELECT usado AND revogado_em IS NOT NULL AND revogado_motivo = 'USUARIO_INATIVADO' FROM public.tokens_desconto_gerente WHERE token = 'C1'));
SELECT pg_temp.a('C2 inativar operador ⇒ token tipado (solicitante) revogado',
  (SELECT usado AND revogado_em IS NOT NULL FROM public.tokens_autorizacao_operacao WHERE token = 'C2'));
SELECT pg_temp.a('C3 trilha em internal.tokens_revogacao_log', EXISTS (SELECT 1 FROM internal.tokens_revogacao_log
  WHERE usuario_id = :OX1 AND motivo = 'USUARIO_INATIVADO' AND tokens_gerente >= 1 AND tokens_operacao >= 1));
SELECT pg_temp.a('C4 token do inativo é "fora da loja" e não vale', internal.token_gerente_fora_da_loja('C1', :X1) AND NOT public.fp_token_gerente_vale_na_loja('C1', :X1));
SELECT pg_temp.t('C5 consumir token tipado revogado falha', $$SELECT public.consumir_token_autorizacao_operacao('C2', 'SANGRIA', 'alvo-C2', 'fa000001-0000-4000-8000-000000000001')$$, 'AUTORIZACAO_TOKEN_INVALIDO');
-- token gravado DEPOIS da inativação (sem gatilho de revogação): o gatilho de consumo barra
SELECT pg_temp.tok('C6', :X1, :OX1, :GX1);
SELECT pg_temp.t('C6 token emitido p/ usuário já inativo: consumo aborta', $$UPDATE public.tokens_desconto_gerente SET usado = true WHERE token = 'C6'$$, 'TOKEN_GERENTE_REVOGADO');
ROLLBACK TO SAVEPOINT c;

-- ===== D. Inativação do APROVADOR =====
SAVEPOINT d;
SELECT pg_temp.tok('D1', :X1, :OX1, :GX1);
SELECT pg_temp.optok('D2', :X1::uuid, :GX1, :OX1);
UPDATE public.usuarios SET ativo = false WHERE id = :GX1;
SELECT pg_temp.a('D1 inativar gerente ⇒ token de desconto aprovado por ele revogado', (SELECT revogado_em IS NOT NULL FROM public.tokens_desconto_gerente WHERE token = 'D1'));
SELECT pg_temp.a('D2 inativar gerente ⇒ token tipado (aprovador) revogado', (SELECT revogado_em IS NOT NULL FROM public.tokens_autorizacao_operacao WHERE token = 'D2'));
SELECT pg_temp.optok('D3', :X1::uuid, :GX1, :OX1);
SELECT pg_temp.t('D3 token tipado novo com aprovador inativo é negado no consumo',
  $$SELECT public.consumir_token_autorizacao_operacao('D3', 'SANGRIA', 'alvo-D3', 'fa000001-0000-4000-8000-000000000001')$$, 'AUTORIZACAO_GERENTE_INVALIDO');
ROLLBACK TO SAVEPOINT d;

-- ===== E. Remoção / desativação de VÍNCULO =====
SAVEPOINT e;
SELECT pg_temp.tok('E1', :X1, :OX1, :GX1);
UPDATE public.usuario_vinculos SET ativo = false WHERE usuario_id = :OX1;
SELECT pg_temp.a('E1 desativar vínculo do operador ⇒ token revogado (VINCULO_DESATIVADO)',
  (SELECT revogado_motivo = 'VINCULO_DESATIVADO' FROM public.tokens_desconto_gerente WHERE token = 'E1'));
SELECT pg_temp.tok('E2', :X1, :OX1, :GX1);
SELECT pg_temp.a('E2 usuário ativo SEM vínculo: token fora da loja', internal.token_gerente_fora_da_loja('E2', :X1));
SELECT pg_temp.t('E3 consumo por usuário ativo sem vínculo aborta', $$UPDATE public.tokens_desconto_gerente SET usado = true WHERE token = 'E2'$$, 'TOKEN_GERENTE_REVOGADO');
ROLLBACK TO SAVEPOINT e;
SAVEPOINT e2;
SELECT pg_temp.tok('E4', :X1, :OX1, :GX1);
DELETE FROM public.usuario_vinculos WHERE usuario_id = :GX1;
SELECT pg_temp.a('E4 remover (DELETE) vínculo do gerente ⇒ token revogado (VINCULO_REMOVIDO)',
  (SELECT revogado_motivo = 'VINCULO_REMOVIDO' FROM public.tokens_desconto_gerente WHERE token = 'E4'));
SELECT pg_temp.optok('E5', :X1::uuid, :GX1, :OX1);
SELECT pg_temp.t('E5 gerente sem vínculo não aprova token tipado',
  $$SELECT public.consumir_token_autorizacao_operacao('E5', 'SANGRIA', 'alvo-E5', 'fa000001-0000-4000-8000-000000000001')$$, 'AUTORIZACAO_GERENTE_INVALIDO');
ROLLBACK TO SAVEPOINT e2;

-- ===== F. Perfil atual (rebaixamento) =====
SAVEPOINT f;
SELECT pg_temp.tok('F1', :X1, :OX1, :GX1);
UPDATE public.usuarios SET perfil = 'OPERADOR' WHERE id = :GX1;
SELECT pg_temp.a('F1 gerente rebaixado a OPERADOR ⇒ tokens que aprovou revogados', (SELECT revogado_em IS NOT NULL FROM public.tokens_desconto_gerente WHERE token = 'F1'));
SELECT pg_temp.a('F2 rebaixado não é mais aprovador', NOT internal.fp_aprovador_ativo_na_empresa(:GX1, :X1));
ROLLBACK TO SAVEPOINT f;

-- ===== G. Usuário que AGE (auth.uid) precisa estar ativo e vinculado =====
SAVEPOINT g;
SELECT pg_temp.tok('G1', :X1, :OX1, :GX1);
UPDATE public.usuarios SET ativo = false WHERE id = :OX2;
SELECT set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000004', true);
SELECT pg_temp.t('G1 consumo com auth.uid() de usuário inativo aborta', $$UPDATE public.tokens_desconto_gerente SET usado = true WHERE token = 'G1'$$, 'TOKEN_GERENTE_REVOGADO');
SELECT set_config('request.jwt.claim.sub', 'f2000000-0000-4000-8000-000000000001', true);
SELECT pg_temp.t('G2 consumo com auth.uid() de outra empresa (Dono Y) aborta', $$UPDATE public.tokens_desconto_gerente SET usado = true WHERE token = 'G1'$$, 'TOKEN_GERENTE_REVOGADO');
SELECT set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000001', true);
SELECT pg_temp.t('G3 consumo com auth.uid() do Dono X (mesma empresa) passa', $$UPDATE public.tokens_desconto_gerente SET usado = true WHERE token = 'G1'$$);
SELECT set_config('request.jwt.claim.sub', '', true);
ROLLBACK TO SAVEPOINT g;

-- ===== H. RLS/guardas: revogação imediata por inativação e remoção de vínculo =====
SAVEPOINT h;
SELECT pg_temp.a('H1 operador X1 ativo vê produtos só da própria loja (1)', pg_temp.como_visiveis(:OX1) = 1, pg_temp.como_visiveis(:OX1)::text);
SELECT pg_temp.a('H2 Dono X vê produtos da Empresa X e NADA da Empresa Y', pg_temp.como_visiveis(:DONOX) >= 1 AND pg_temp.como_visiveis(:DONOX, ARRAY[:Y1]::uuid[]) = 0, pg_temp.como_visiveis(:DONOX)::text || ' / Y=' || pg_temp.como_visiveis(:DONOX, ARRAY[:Y1]::uuid[]));
SELECT pg_temp.a('H2b Dono Y não vê nada da Empresa X', pg_temp.como_visiveis(:DONOY, ARRAY[:X1, :X2]::uuid[]) = 0);
UPDATE public.usuarios SET ativo = false WHERE id = :OX1;
SELECT pg_temp.a('H3 após inativar operador X1: 0 linhas (JWT antigo não serve)', pg_temp.como_visiveis(:OX1) = 0, pg_temp.como_visiveis(:OX1)::text);
UPDATE public.usuario_vinculos SET ativo = false WHERE usuario_id = :DONOX;
SELECT pg_temp.a('H4 após desativar vínculo do Dono X (usuário ainda ativo): 0 linhas', pg_temp.como_visiveis(:DONOX) = 0, pg_temp.como_visiveis(:DONOX)::text);
ROLLBACK TO SAVEPOINT h;

-- ===== I. ADMIN legado sem poder =====
SELECT pg_temp.t('I1 criar usuário ADMIN novo é bloqueado',
  $$INSERT INTO public.usuarios (id, nome, perfil, loja_id) VALUES ('f1000000-0000-4000-8000-000000000001', 'x', 'ADMIN', 'fa000001-0000-4000-8000-000000000001') ON CONFLICT (id) DO UPDATE SET perfil = 'ADMIN'$$, 'PERFIL_ADMIN_DESCONTINUADO');
SELECT pg_temp.a('I2 fp_admin_legado() e auth_usuario_eh_admin() = false', NOT public.fp_admin_legado() AND NOT public.auth_usuario_eh_admin());
SAVEPOINT i;
SET LOCAL fp.permitir_admin_legado = 'on';
UPDATE public.usuarios SET perfil = 'ADMIN' WHERE id = :GY1;
SET LOCAL fp.permitir_admin_legado = 'off';
SELECT pg_temp.a('I3 ADMIN ativo (forçado) não vê produtos de nenhuma empresa sem vínculo', pg_temp.como_visiveis(:GY1) = 0, pg_temp.como_visiveis(:GY1)::text);
ROLLBACK TO SAVEPOINT i;

-- ===== J. Provisionamento automático bloqueado (fail closed) =====
SELECT pg_temp.a('J1 parâmetro provisionamento_automatico = bloqueado', (SELECT valor FROM saas.parametros WHERE chave = 'provisionamento_automatico') = 'bloqueado');
SELECT pg_temp.t('J2 plataforma_provisionar_empresa bloqueada', $$SELECT public.plataforma_provisionar_empresa('{"empresa":{"nome":"Nova"},"lojas":[{"chave":"l1","nome":"N1"}],"usuarios":[]}'::jsonb, NULL)$$, 'PROVISIONAMENTO_AUTOMATICO_BLOQUEADO');
SELECT pg_temp.t('J3 plataforma_iniciar_trial bloqueado pelo mesmo interruptor', $$SELECT public.plataforma_iniciar_trial('{"empresa":{"nome":"Trial"},"lojas":[{"nome":"T"}],"usuarios":[{"id":"f1000000-0000-4000-8000-0000000000ff","nome":"x","papel":"DONO"}]}'::jsonb, NULL)$$, 'PROVISIONAMENTO_AUTOMATICO_BLOQUEADO');
SELECT pg_temp.t('J4 contingência sem responsável é recusada', $$SELECT set_config('fp.provisionamento_contingencia', 'CHAMADO-1', true), public.plataforma_provisionar_empresa('{"empresa":{"nome":"Nova"},"lojas":[{"chave":"l1","nome":"N1"}],"usuarios":[]}'::jsonb, NULL)$$, 'PROVISIONAMENTO_CONTINGENCIA_SEM_RESPONSAVEL');
SELECT set_config('fp.provisionamento_contingencia', '', true);
SAVEPOINT j;
SELECT set_config('fp.provisionamento_contingencia', 'CHAMADO-TESTE-1', true), set_config('fp.provisionamento_responsavel', 'homologacao@teste', true);
CREATE TEMP TABLE _prov ON COMMIT DROP AS
SELECT public.plataforma_provisionar_empresa('{"empresa":{"nome":"Empresa Contingencia"},"lojas":[{"chave":"l1","nome":"C1"}],"usuarios":[{"id":"f3000000-0000-4000-8000-000000000001","nome":"Dono Contingencia","papel":"DONO"}]}'::jsonb, NULL) AS r;
SELECT pg_temp.a('J5 contingência registrada provisiona (empresa + DONO) e grava trilha (chamado, responsável, sha256)',
  (SELECT r ? 'empresa_id' FROM _prov)
  AND EXISTS (SELECT 1 FROM internal.provisionamento_contingencia_log WHERE chamado = 'CHAMADO-TESTE-1' AND responsavel = 'homologacao@teste' AND length(payload_sha256) = 64)
  AND EXISTS (SELECT 1 FROM public.usuario_vinculos v, _prov WHERE v.usuario_id = 'f3000000-0000-4000-8000-000000000001' AND v.papel = 'DONO' AND v.empresa_id = (r->>'empresa_id')::uuid));
ROLLBACK TO SAVEPOINT j;
SELECT set_config('fp.provisionamento_contingencia', '', true), set_config('fp.provisionamento_responsavel', '', true);
SELECT pg_temp.a('J6 anon/authenticated não executam provisionamento nem o núcleo',
  NOT has_function_privilege('authenticated', 'public.plataforma_provisionar_empresa(jsonb,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.plataforma_provisionar_empresa(jsonb,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'internal.plataforma_provisionar_empresa_nucleo(jsonb,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('service_role', 'internal.plataforma_provisionar_empresa_nucleo(jsonb,uuid)', 'EXECUTE'));
SELECT pg_temp.a('J7 authenticated não executa helpers de revogação/consumo',
  NOT has_function_privilege('authenticated', 'public.fp_token_gerente_vale_na_loja(text,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.consumir_token_autorizacao_operacao(text,text,text,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'internal.fp_revogar_tokens_usuario(uuid,text,uuid)', 'EXECUTE'));

-- K) 20261028122000: funções gerenciais residuais exigem ativo + vínculo, sem ADMIN global.
CREATE OR REPLACE FUNCTION pg_temp.como_bool(p_uid uuid, p_sql text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE r boolean;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_uid::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  EXECUTE p_sql INTO r;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN r;
END $$;
INSERT INTO public.caixas (id, loja_id, operador_id, status)
VALUES ('fc000001-0000-4000-8000-000000000001', 'fa000001-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000003', 'ABERTO');
SELECT pg_temp.a('K1 gerente X1 ativo: gerencial na X1, não na Y1',
  pg_temp.como_bool('f1000000-0000-4000-8000-000000000002', $q$SELECT public.auth_usuario_gerencial_loja('fa000001-0000-4000-8000-000000000001')$q$)
  AND NOT pg_temp.como_bool('f1000000-0000-4000-8000-000000000002', $q$SELECT public.auth_usuario_gerencial_loja('fb000001-0000-4000-8000-000000000001')$q$));
SELECT pg_temp.a('K2 gerente X1 vê caixa aberto da X1 (desembolso)',
  pg_temp.como_bool('f1000000-0000-4000-8000-000000000002', $q$SELECT EXISTS (SELECT 1 FROM public.listar_caixas_elegiveis_desembolso() WHERE id = 'fc000001-0000-4000-8000-000000000001')$q$));
SAVEPOINT k;
UPDATE public.usuarios SET ativo = false WHERE id = 'f1000000-0000-4000-8000-000000000002';
SELECT pg_temp.a('K3 gerente INATIVADO: perde gerencial, custos e caixas na hora',
  NOT pg_temp.como_bool('f1000000-0000-4000-8000-000000000002', $q$SELECT public.auth_usuario_gerencial_loja('fa000001-0000-4000-8000-000000000001')$q$)
  AND pg_temp.como_bool('f1000000-0000-4000-8000-000000000002', $q$SELECT NOT EXISTS (SELECT 1 FROM public.listar_caixas_elegiveis_desembolso())$q$)
  AND pg_temp.como_bool('f1000000-0000-4000-8000-000000000002', $q$SELECT NOT EXISTS (SELECT 1 FROM public.produtos_custos_autorizados(NULL))$q$));
ROLLBACK TO SAVEPOINT k;
SAVEPOINT k2;
UPDATE public.usuario_vinculos SET ativo = false WHERE usuario_id = 'f1000000-0000-4000-8000-000000000003';
SELECT pg_temp.a('K4 operador SEM vínculo ativo não lista o próprio caixa',
  pg_temp.como_bool('f1000000-0000-4000-8000-000000000003', $q$SELECT NOT EXISTS (SELECT 1 FROM public.listar_caixas_elegiveis_desembolso())$q$));
ROLLBACK TO SAVEPOINT k2;
SAVEPOINT k3;
SELECT set_config('fp.permitir_admin_legado', 'on', true);
UPDATE public.usuarios SET perfil = 'ADMIN' WHERE id = 'f2000000-0000-4000-8000-000000000002';
SELECT set_config('fp.permitir_admin_legado', '', true);
SELECT pg_temp.a('K5 ADMIN FORÇADO (contorno de manutenção) não ganha gerencial, custos nem caixas de outra empresa',
  NOT pg_temp.como_bool('f2000000-0000-4000-8000-000000000002', $q$SELECT public.auth_usuario_gerencial_loja('fa000001-0000-4000-8000-000000000001')$q$)
  AND pg_temp.como_bool('f2000000-0000-4000-8000-000000000002', $q$SELECT NOT EXISTS (SELECT 1 FROM public.produtos_custos_autorizados(NULL) WHERE loja_id <> 'fb000001-0000-4000-8000-000000000001')$q$)
  AND pg_temp.como_bool('f2000000-0000-4000-8000-000000000002', $q$SELECT NOT EXISTS (SELECT 1 FROM public.listar_caixas_elegiveis_desembolso() WHERE id = 'fc000001-0000-4000-8000-000000000001')$q$));
ROLLBACK TO SAVEPOINT k3;

\o
DO $$
DECLARE v_ok bigint; v_f bigint;
BEGIN
  SELECT CASE WHEN is_called THEN last_value ELSE 0 END INTO v_ok FROM _ok;
  SELECT CASE WHEN is_called THEN last_value ELSE 0 END INTO v_f FROM _falha;
  RAISE WARNING 'RESUMO|passou=%|falhou=%|total=%', v_ok, v_f, v_ok + v_f;
  IF v_f > 0 THEN RAISE EXCEPTION 'sec-tokens-usuario-inativo: % FALHA(S)', v_f; END IF;
END $$;
ROLLBACK;
