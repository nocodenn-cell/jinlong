-- Recuperação de acesso após revogação de tokens (tranche 20261028120100 / 122000), com sincronização offline.
--
-- Cenário: gerente e operador de uma loja. Um token de desconto é emitido pelo operador e aprovado pelo gerente.
--   1. token válido vale na loja;
--   2. gerente é INATIVADO  ⇒ token revogado (usado=true, revogado_em), trilha em tokens_revogacao_log;
--   3. gerente é REATIVADO  ⇒ o token revogado NÃO volta (revogação é definitiva);
--   4. recuperação: gerente reativado aprova NOVO token ⇒ vale e pode ser consumido UMA vez;
--   5. reuso de token consumido é bloqueado (replay);
--   6. operador é INATIVADO ⇒ tokens dele revogados; reativado, emite novo token e volta a operar;
--   7. sincronização offline: token revogado é recusado pela regra que o sync-outbox usa
--      (fp_token_gerente_vale_na_loja = false ⇒ GERENTE_TOKEN_INVALIDO_OU_REVOGADO), e o token novo passa.
--
-- Dados sintéticos, transação com ROLLBACK. Falha ⇒ RAISE EXCEPTION; sucesso ⇒ mensagem final.

\set ON_ERROR_STOP on
BEGIN;

-- Fixture: empresa R, loja R1, DONO, GERENTE e OPERADOR. Ids 0c… (sintéticos).
INSERT INTO public.empresas (id, nome) VALUES ('0c000001-0000-4000-8000-0000000000e1', 'REC Empresa');
INSERT INTO public.lojas (id, nome, codigo, empresa_id) VALUES
  ('0c000001-0000-4000-8000-0000000000a1', 'REC Loja 1', 'REC1', '0c000001-0000-4000-8000-0000000000e1');
INSERT INTO auth.users (id, aud, role, email) VALUES
  ('0c000002-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'rec-dono@t.local'),
  ('0c000002-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'rec-ger@t.local'),
  ('0c000002-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'rec-op@t.local');
INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id) VALUES
  ('0c000002-0000-4000-8000-000000000001', 'REC Dono', 'DONO', true, '0c000001-0000-4000-8000-0000000000a1'),
  ('0c000002-0000-4000-8000-000000000002', 'REC Gerente', 'GERENTE', true, '0c000001-0000-4000-8000-0000000000a1'),
  ('0c000002-0000-4000-8000-000000000003', 'REC Operador', 'OPERADOR', true, '0c000001-0000-4000-8000-0000000000a1');
INSERT INTO public.usuario_vinculos (usuario_id, empresa_id, loja_id, papel, ativo) VALUES
  ('0c000002-0000-4000-8000-000000000001', '0c000001-0000-4000-8000-0000000000e1', NULL, 'DONO', true),
  ('0c000002-0000-4000-8000-000000000002', '0c000001-0000-4000-8000-0000000000e1', '0c000001-0000-4000-8000-0000000000a1', 'GERENTE', true),
  ('0c000002-0000-4000-8000-000000000003', '0c000001-0000-4000-8000-0000000000e1', '0c000001-0000-4000-8000-0000000000a1', 'OPERADOR', true)
  ON CONFLICT DO NOTHING;  -- o gatilho de usuarios já cria vínculos a partir do perfil/loja

DO $rec$
DECLARE
  v_loja  text := '0c000001-0000-4000-8000-0000000000a1';
  v_dono  uuid := '0c000002-0000-4000-8000-000000000001';
  v_ger   uuid := '0c000002-0000-4000-8000-000000000002';
  v_op    uuid := '0c000002-0000-4000-8000-000000000003';
  v_log0 int; v_log1 int; v_usado boolean; v_n int; v_ok boolean; v_msg text;
BEGIN
  -- 1. token válido
  INSERT INTO public.tokens_desconto_gerente (token, loja_id, criado_por, aprovador_id, usado, expira_em)
  VALUES ('REC-T1', v_loja, v_op, v_ger, false, now() + interval '30 minutes');
  IF NOT public.fp_token_gerente_vale_na_loja('REC-T1', v_loja::uuid) THEN RAISE EXCEPTION 'REC-1: token válido não vale'; END IF;

  -- 2. gerente inativado ⇒ revoga
  SELECT count(*) INTO v_log0 FROM internal.tokens_revogacao_log;
  UPDATE public.usuarios SET ativo = false WHERE id = v_ger;
  IF public.fp_token_gerente_vale_na_loja('REC-T1', v_loja::uuid) THEN RAISE EXCEPTION 'REC-2: token do gerente inativado ainda vale'; END IF;
  SELECT usado INTO v_usado FROM public.tokens_desconto_gerente WHERE token = 'REC-T1';
  IF NOT v_usado THEN RAISE EXCEPTION 'REC-2: token não marcado como usado após revogação'; END IF;
  SELECT count(*) INTO v_log1 FROM internal.tokens_revogacao_log;
  IF v_log1 <= v_log0 THEN RAISE EXCEPTION 'REC-2: trilha de revogação não gravada'; END IF;

  -- 3. reativação NÃO ressuscita o token revogado
  UPDATE public.usuarios SET ativo = true WHERE id = v_ger;
  IF public.fp_token_gerente_vale_na_loja('REC-T1', v_loja::uuid) THEN RAISE EXCEPTION 'REC-3: token revogado voltou a valer após reativação'; END IF;

  -- 4. recuperação: gerente reativado aprova NOVO token
  INSERT INTO public.tokens_desconto_gerente (token, loja_id, criado_por, aprovador_id, usado, expira_em)
  VALUES ('REC-T2', v_loja, v_op, v_ger, false, now() + interval '30 minutes');
  IF NOT public.fp_token_gerente_vale_na_loja('REC-T2', v_loja::uuid) THEN RAISE EXCEPTION 'REC-4: novo token após reativação não vale'; END IF;

  -- 5. consumo único (trigger de consumo) e reabertura bloqueada para o papel da aplicação (authenticated).
  --    Revalidado: a policy tenant_guard é RESTRICTIVE e não há policy PERMISSIVE de escrita, então
  --    authenticated não consegue reabrir token (0 linhas afetadas, sem alterar o estado).
  UPDATE public.tokens_desconto_gerente SET usado = true WHERE token = 'REC-T2';
  SET LOCAL ROLE authenticated;
  UPDATE public.tokens_desconto_gerente SET usado = false WHERE token = 'REC-T2';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RESET ROLE;
  IF v_n <> 0 THEN RAISE EXCEPTION 'REC-5: authenticated reabriu token consumido (linhas=%)', v_n; END IF;
  SELECT usado INTO v_usado FROM public.tokens_desconto_gerente WHERE token = 'REC-T2';
  IF NOT v_usado THEN RAISE EXCEPTION 'REC-5: token consumido voltou a não usado'; END IF;

  -- 6. operador inativado ⇒ token pendente revogado; reativado, emite novo e opera
  INSERT INTO public.tokens_desconto_gerente (token, loja_id, criado_por, aprovador_id, usado, expira_em)
  VALUES ('REC-T3', v_loja, v_op, v_ger, false, now() + interval '30 minutes');
  UPDATE public.usuarios SET ativo = false WHERE id = v_op;
  IF public.fp_token_gerente_vale_na_loja('REC-T3', v_loja::uuid) THEN RAISE EXCEPTION 'REC-6: token do operador inativado ainda vale'; END IF;
  UPDATE public.usuarios SET ativo = true WHERE id = v_op;
  IF public.fp_token_gerente_vale_na_loja('REC-T3', v_loja::uuid) THEN RAISE EXCEPTION 'REC-6: token revogado voltou após reativar operador'; END IF;
  INSERT INTO public.tokens_desconto_gerente (token, loja_id, criado_por, aprovador_id, usado, expira_em)
  VALUES ('REC-T4', v_loja, v_op, v_ger, false, now() + interval '30 minutes');
  IF NOT public.fp_token_gerente_vale_na_loja('REC-T4', v_loja::uuid) THEN RAISE EXCEPTION 'REC-6: operador reativado não emite token novo válido'; END IF;

  -- 7. sincronização offline: o token antigo (REC-T1) é recusado; o novo (REC-T4) passa
  IF public.fp_token_gerente_vale_na_loja('REC-T1', v_loja::uuid) THEN RAISE EXCEPTION 'REC-7: sync aceitaria token revogado'; END IF;

  RAISE NOTICE 'RECUPERAÇÃO OK: revogação definitiva; token novo do gerente e do operador reativados valem; replay bloqueado; sync recusa token revogado';
END
$rec$;

SELECT 'RECUPERAÇÃO DE ACESSO (tokens): OK' AS resultado;
ROLLBACK;
