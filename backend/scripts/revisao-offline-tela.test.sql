-- 20261028150000: leitura da tela da fila de revisão offline e decisão idempotente.
-- Fixture SINTÉTICA (Empresa X com X1/X2, Empresa Y com Y1), transação com ROLLBACK.
-- psql "$DB_URL" -v ON_ERROR_STOP=1 -f backend/scripts/revisao-offline-tela.test.sql
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL client_min_messages = notice;
\pset tuples_only on
\pset format unaligned
CREATE OR REPLACE FUNCTION pg_temp.como(p_uid uuid, p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_msg text; v_res text;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claim.sub', p_uid::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    EXECUTE p_sql INTO v_res;
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', '', true); PERFORM set_config('request.jwt.claims', '', true);
    RETURN coalesce(v_res, 'NULL');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
    RESET ROLE;
    PERFORM set_config('request.jwt.claim.sub', '', true); PERFORM set_config('request.jwt.claims', '', true);
    RETURN 'ERRO:' || v_msg;
  END;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.espera(p_nome text, p_ok boolean, p_det text DEFAULT '') RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT coalesce(p_ok, false) THEN RAISE EXCEPTION 'FALHOU %: %', p_nome, p_det; END IF;
  RAISE NOTICE 'ok - %', p_nome;
END $$;

INSERT INTO public.empresas (id, nome) VALUES
  ('de000001-0000-4000-8000-000000000001', 'Empresa RX teste'), ('de000002-0000-4000-8000-000000000002', 'Empresa RY teste');
INSERT INTO public.lojas (id, nome, codigo, empresa_id) VALUES
  ('da000001-0000-4000-8000-000000000001', 'RX1', 'RX1T', 'de000001-0000-4000-8000-000000000001'),
  ('da000002-0000-4000-8000-000000000002', 'RX2', 'RX2T', 'de000001-0000-4000-8000-000000000001'),
  ('db000001-0000-4000-8000-000000000001', 'RY1', 'RY1T', 'de000002-0000-4000-8000-000000000002');
INSERT INTO auth.users (id, instance_id, aud, role, email)
SELECT x::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rv-' || x || '@t.local'
  FROM unnest(ARRAY['d1000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000002',
                    'd1000000-0000-4000-8000-000000000003','d1000000-0000-4000-8000-000000000004',
                    'd1000000-0000-4000-8000-000000000005','d2000000-0000-4000-8000-000000000001',
                    'd1000000-0000-4000-8000-000000000006']) x;
INSERT INTO public.usuarios (id, nome, perfil, loja_id) VALUES
  ('d1000000-0000-4000-8000-000000000001', 'Dono RX', 'DONO', 'da000001-0000-4000-8000-000000000001'),
  ('d1000000-0000-4000-8000-000000000002', 'Gerente RX1', 'GERENTE', 'da000001-0000-4000-8000-000000000001'),
  ('d1000000-0000-4000-8000-000000000004', 'Gerente RX2', 'GERENTE', 'da000002-0000-4000-8000-000000000002'),
  ('d1000000-0000-4000-8000-000000000005', 'Operador RX1 ativo', 'OPERADOR', 'da000001-0000-4000-8000-000000000001'),
  ('d2000000-0000-4000-8000-000000000001', 'Gerente RY1', 'GERENTE', 'db000001-0000-4000-8000-000000000001');
INSERT INTO public.usuarios (id, nome, perfil, loja_id, ativo) VALUES
  ('d1000000-0000-4000-8000-000000000003', 'Operador RX1 inativado', 'OPERADOR', 'da000001-0000-4000-8000-000000000001', false),
  ('d1000000-0000-4000-8000-000000000006', 'Gerente RX1 inativado', 'GERENTE', 'da000001-0000-4000-8000-000000000001', false);
-- vínculos (fase 1): dono na empresa, gerentes/operadores na loja
INSERT INTO public.usuario_vinculos (usuario_id, empresa_id, loja_id, papel, ativo)
SELECT u.id, l.empresa_id, CASE WHEN u.perfil = 'DONO' THEN NULL ELSE u.loja_id END, u.perfil, u.ativo
  FROM public.usuarios u JOIN public.lojas l ON l.id = u.loja_id
 WHERE u.id::text LIKE 'd%' ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION pg_temp.enf(p_ev text, p_loja uuid, p_caixa uuid, p_op uuid, p_payload jsonb) RETURNS uuid LANGUAGE sql AS $$
  SELECT (public.sync_enfileirar_revisao(jsonb_build_object('event_id', p_ev, 'tipo', 'CAIXA_ABERTO', 'payload', p_payload::text,
    'payload_sha256', 'sha-' || p_ev, 'origem', 'legado', 'loja_id', p_loja, 'caixa_id', p_caixa, 'operador_id', p_op,
    'classificacao', 'APOS_INATIVACAO', 'motivo', 'OPERADOR_SEM_ACESSO_NO_RECEBIMENTO', 'evidencias', '{"perdeu_acesso_em":"2026-10-28T10:00:00Z"}'::jsonb))->>'id')::uuid;
$$;
SELECT set_config('t.e1', pg_temp.enf('TELA-X1-A', 'da000001-0000-4000-8000-000000000001', 'dc000001-0000-4000-8000-000000000001',
  'd1000000-0000-4000-8000-000000000003', '{"valor_inicial": 50, "segredo_do_payload": "nao-deve-sair"}')::text, true);
SELECT set_config('t.e2', pg_temp.enf('TELA-X2-A', 'da000002-0000-4000-8000-000000000002', 'dc000002-0000-4000-8000-000000000002',
  'd1000000-0000-4000-8000-000000000003', '{"valor_inicial": 10}')::text, true);
SELECT set_config('t.e3', pg_temp.enf('TELA-Y1-A', 'db000001-0000-4000-8000-000000000001', 'dc000003-0000-4000-8000-000000000003',
  NULL, '{"valor_inicial": 20}')::text, true);
-- evento em que o próprio gerente RX1 é o operador (tentativa de autoaprovação)
SELECT set_config('t.e4', pg_temp.enf('TELA-X1-B', 'da000001-0000-4000-8000-000000000001', 'dc000004-0000-4000-8000-000000000004',
  'd1000000-0000-4000-8000-000000000002', '{"valor_inicial": 5}')::text, true);

-- ===== Leitura =====
SELECT pg_temp.espera('gerente RX1 vê só a própria loja (2 eventos de RX1)',
  pg_temp.como('d1000000-0000-4000-8000-000000000002', $q$SELECT string_agg(event_id, ',' ORDER BY event_id) FROM public.listar_revisoes_offline('PENDENTE', 100)$q$)
  = 'TELA-X1-A,TELA-X1-B');
SELECT pg_temp.espera('dono RX vê as lojas da empresa X, nada da Y',
  pg_temp.como('d1000000-0000-4000-8000-000000000001', $q$SELECT string_agg(event_id, ',' ORDER BY event_id) FROM public.listar_revisoes_offline('PENDENTE', 100)$q$)
  = 'TELA-X1-A,TELA-X1-B,TELA-X2-A');
SELECT pg_temp.espera('gerente RY1 (outra empresa) vê só a Y',
  pg_temp.como('d2000000-0000-4000-8000-000000000001', $q$SELECT string_agg(event_id, ',') FROM public.listar_revisoes_offline('TODOS', 100)$q$)
  = 'TELA-Y1-A');
SELECT pg_temp.espera('operador ativo não vê a fila',
  pg_temp.como('d1000000-0000-4000-8000-000000000005', $q$SELECT count(*)::text FROM public.listar_revisoes_offline('TODOS', 100)$q$) = '0');
SELECT pg_temp.espera('gerente inativado não vê a fila',
  pg_temp.como('d1000000-0000-4000-8000-000000000006', $q$SELECT count(*)::text FROM public.listar_revisoes_offline('TODOS', 100)$q$) = '0');
SELECT pg_temp.espera('anônimo/sem sub: recusado',
  (SELECT r FROM (SELECT pg_temp.como(NULL, $q$SELECT count(*)::text FROM public.listar_revisoes_offline()$q$) r) z) LIKE 'ERRO:%');
SELECT pg_temp.espera('anon não tem EXECUTE', NOT has_function_privilege('anon', 'public.listar_revisoes_offline(text,integer)', 'EXECUTE'));
SELECT pg_temp.espera('filtro inválido recusado',
  pg_temp.como('d1000000-0000-4000-8000-000000000002', $q$SELECT count(*)::text FROM public.listar_revisoes_offline('X', 1)$q$) LIKE 'ERRO:REVISAO_FILTRO_INVALIDO%');
SELECT pg_temp.espera('resumo sem payload completo, com nome do operador INATIVO e marca e_meu_evento',
  pg_temp.como('d1000000-0000-4000-8000-000000000002', $q$SELECT (resumo::text NOT LIKE '%segredo%' AND resumo->>'valor_inicial' = '50'
      AND operador_nome = 'Operador RX1 inativado' AND operador_ativo = false AND NOT e_meu_evento)::text
    FROM public.listar_revisoes_offline('PENDENTE', 100) WHERE event_id = 'TELA-X1-A'$q$) = 'true');
SELECT pg_temp.espera('evento do próprio gerente vem marcado e_meu_evento',
  pg_temp.como('d1000000-0000-4000-8000-000000000002', $q$SELECT e_meu_evento::text FROM public.listar_revisoes_offline('PENDENTE', 100) WHERE event_id = 'TELA-X1-B'$q$) = 'true');

-- ===== Decisão =====
SELECT pg_temp.espera('gerente da Y não decide evento da X (mesma resposta de inexistente)',
  pg_temp.como('d2000000-0000-4000-8000-000000000001', format($q$SELECT public.revisar_evento_offline(%L, 'APROVAR', 'tentativa cruzada')::text$q$, current_setting('t.e1')))
  LIKE 'ERRO:REVISAO_NAO_ENCONTRADA_OU_SEM_PERMISSAO%');
SELECT pg_temp.espera('gerente RX2 não decide evento da loja RX1',
  pg_temp.como('d1000000-0000-4000-8000-000000000004', format($q$SELECT public.revisar_evento_offline(%L, 'APROVAR', 'outra loja mesma empresa')::text$q$, current_setting('t.e1')))
  LIKE 'ERRO:REVISAO_NAO_ENCONTRADA_OU_SEM_PERMISSAO%');
SELECT pg_temp.espera('autoaprovação proibida (e também autorrejeição)',
  pg_temp.como('d1000000-0000-4000-8000-000000000002', format($q$SELECT public.revisar_evento_offline(%L, 'APROVAR', 'eu mesmo aprovo')::text$q$, current_setting('t.e4')))
  LIKE 'ERRO:REVISAO_AUTOAPROVACAO_PROIBIDA%'
  AND pg_temp.como('d1000000-0000-4000-8000-000000000002', format($q$SELECT public.revisar_evento_offline(%L, 'REJEITAR', 'eu mesmo rejeito')::text$q$, current_setting('t.e4')))
  LIKE 'ERRO:REVISAO_AUTOAPROVACAO_PROIBIDA%');
SELECT pg_temp.espera('justificativa curta recusada',
  pg_temp.como('d1000000-0000-4000-8000-000000000002', format($q$SELECT public.revisar_evento_offline(%L, 'APROVAR', ' ok ')::text$q$, current_setting('t.e1')))
  LIKE 'ERRO:REVISAO_MOTIVO_OBRIGATORIO%');
SELECT pg_temp.espera('justificativa > 500 recusada',
  pg_temp.como('d1000000-0000-4000-8000-000000000002', format($q$SELECT public.revisar_evento_offline(%L, 'APROVAR', %L)::text$q$, current_setting('t.e1'), repeat('x', 501)))
  LIKE 'ERRO:REVISAO_MOTIVO_LONGO%');
SELECT pg_temp.espera('gerente inativado não decide',
  pg_temp.como('d1000000-0000-4000-8000-000000000006', format($q$SELECT public.revisar_evento_offline(%L, 'APROVAR', 'inativo tentando')::text$q$, current_setting('t.e1')))
  LIKE 'ERRO:REVISAO_NAO_ENCONTRADA_OU_SEM_PERMISSAO%');
-- aprovação válida: aplica o CAIXA_ABERTO uma vez
-- (ação e conferência em comandos separados: o snapshot do comando não enxerga o que a função gravou)
SELECT set_config('t.r1', pg_temp.como('d1000000-0000-4000-8000-000000000002', format($q$SELECT (public.revisar_evento_offline(%L, 'APROVAR', 'conferido com a gaveta')->>'status')$q$, current_setting('t.e1'))), true);
SELECT pg_temp.espera('aprovação do gerente RX1 aplica o evento',
  current_setting('t.r1') = 'APROVADO' AND (SELECT count(*) FROM public.caixas WHERE id = 'dc000001-0000-4000-8000-000000000001') = 1,
  current_setting('t.r1'));
SELECT set_config('t.r2', pg_temp.como('d1000000-0000-4000-8000-000000000002', format($q$SELECT (public.revisar_evento_offline(%L, 'APROVAR', 'duplo clique')->>'idempotente')$q$, current_setting('t.e1'))), true);
SELECT pg_temp.espera('repetição da MESMA decisão pelo MESMO usuário é idempotente (não aplica de novo)',
  current_setting('t.r2') = 'true'
  AND (SELECT count(*) FROM public.caixas WHERE id = 'dc000001-0000-4000-8000-000000000001') = 1
  AND (SELECT decisao_motivo FROM public.sync_eventos_revisao WHERE event_id = 'TELA-X1-A') = 'conferido com a gaveta',
  current_setting('t.r2'));
SELECT pg_temp.espera('decisão diferente depois de decidido: JA_DECIDIDA',
  pg_temp.como('d1000000-0000-4000-8000-000000000002', format($q$SELECT public.revisar_evento_offline(%L, 'REJEITAR', 'mudei de ideia')::text$q$, current_setting('t.e1')))
  LIKE 'ERRO:REVISAO_JA_DECIDIDA%');
SELECT pg_temp.espera('outro gestor (dono) depois de decidido: JA_DECIDIDA',
  pg_temp.como('d1000000-0000-4000-8000-000000000001', format($q$SELECT public.revisar_evento_offline(%L, 'APROVAR', 'aprovando de novo')::text$q$, current_setting('t.e1')))
  LIKE 'ERRO:REVISAO_JA_DECIDIDA%');
SELECT pg_temp.espera('histórico registra quem/quando/motivo e nome de quem decidiu',
  pg_temp.como('d1000000-0000-4000-8000-000000000001', $q$SELECT (status = 'APROVADO' AND decidido_por_nome = 'Gerente RX1' AND decidido_em IS NOT NULL
     AND decisao_motivo = 'conferido com a gaveta')::text FROM public.listar_revisoes_offline('DECIDIDOS', 100) WHERE event_id = 'TELA-X1-A'$q$) = 'true');
SELECT set_config('t.r3', pg_temp.como('d1000000-0000-4000-8000-000000000001', format($q$SELECT (public.revisar_evento_offline(%L, 'REJEITAR', 'venda não reconhecida')->>'status')$q$, current_setting('t.e2'))), true);
SELECT pg_temp.espera('rejeição pelo dono do evento da RX2 (não aplica)',
  current_setting('t.r3') = 'REJEITADO' AND (SELECT count(*) FROM public.caixas WHERE id = 'dc000002-0000-4000-8000-000000000002') = 0);
SELECT pg_temp.espera('trilha não pode ser apagada nem por quem decide (sem grant de DELETE)',
  pg_temp.como('d1000000-0000-4000-8000-000000000001', $q$WITH d AS (DELETE FROM public.sync_eventos_revisao RETURNING 1) SELECT count(*)::text FROM d$q$) LIKE 'ERRO:%permission denied%');
SELECT pg_temp.espera('nada foi apagado', (SELECT count(*) FROM public.sync_eventos_revisao WHERE event_id LIKE 'TELA-%') = 4);
DO $$ BEGIN
  BEGIN
    DELETE FROM public.sync_eventos_revisao WHERE event_id = 'TELA-Y1-A';
    RAISE EXCEPTION 'FALHOU: DELETE como postgres passou';
  EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok - DELETE como postgres recusado (trilha imutável)';
  END;
END $$;
\echo 'revisao-offline-tela: casos ok'
ROLLBACK;
