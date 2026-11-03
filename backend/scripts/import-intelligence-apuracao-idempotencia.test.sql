-- ============================================================================
-- D-04 (idempotência da apuração) e D-06 (registro e aprovação só pelo servidor).
-- BEGIN … ROLLBACK, dados fictícios. Concorrência real (duas sessões simultâneas) fica em
-- import-intelligence-apuracao-concorrencia.sh, porque exige transações confirmadas.
-- ============================================================================
\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.ok(p_ok boolean, p_nome text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'IDEMP FAIL: %', p_nome; END IF;
  RAISE NOTICE 'IDEMP OK: %', p_nome;
END $$;

CREATE FUNCTION pg_temp.espera_erro(p_sql text, p_codigo text) RETURNS boolean
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE p_sql;
  RETURN false;
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE p_codigo || '%' THEN RETURN true; END IF;
  RAISE NOTICE 'erro inesperado para %: %', p_codigo, SQLERRM;
  RETURN false;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.espera_erro(text, text) TO authenticated, service_role;

SELECT set_config('request.jwt.claim.sub', '', true) \gset

-- ---------------------------------------------------------------- fixtures --
INSERT INTO public.empresas (nome) VALUES ('IDEMP Empresa A') RETURNING id AS emp_a \gset
INSERT INTO public.empresas (nome) VALUES ('IDEMP Empresa B') RETURNING id AS emp_b \gset
INSERT INTO public.lojas (nome, codigo, empresa_id) VALUES ('IDEMP A1', 'IDEMP-A1', :'emp_a') RETURNING id AS loja_a1 \gset
INSERT INTO public.lojas (nome, codigo, empresa_id) VALUES ('IDEMP B1', 'IDEMP-B1', :'emp_b') RETURNING id AS loja_b1 \gset
INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'dono.a@idemp.test') RETURNING id AS dono_a \gset
INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'ger.a1@idemp.test') RETURNING id AS ger_a1 \gset
INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'op.a1@idemp.test') RETURNING id AS op_a1 \gset
INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'dono.b@idemp.test') RETURNING id AS dono_b \gset
INSERT INTO public.usuarios (id, nome, perfil, loja_id, ativo) VALUES
  (:'dono_a', 'IDEMP Dono A', 'DONO', :'loja_a1', true), (:'ger_a1', 'IDEMP Ger A1', 'GERENTE', :'loja_a1', true),
  (:'op_a1', 'IDEMP Op A1', 'OPERADOR', :'loja_a1', true), (:'dono_b', 'IDEMP Dono B', 'DONO', :'loja_b1', true);

SELECT set_config('request.jwt.claim.sub', '', true) \gset
SET LOCAL ROLE service_role;
SELECT public.ops_definir_modulo_empresa(:'emp_a', 'IMPORT_INTELLIGENCE', true, 'contrato idemp', 'homologação idemp A', 'teste-idemp');
SELECT public.ops_definir_modulo_empresa(:'emp_b', 'IMPORT_INTELLIGENCE', true, 'contrato idemp', 'homologação idemp B', 'teste-idemp');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', :'dono_a', true) \gset
SET LOCAL ROLE authenticated;
SELECT public.import_criar_operacao(:'loja_a1', 'IDEMP-001', 'Operação de idempotência') AS op \gset
SELECT public.import_salvar_lancamento(:'op', 'CAMBIO', jsonb_build_object('moeda', 'USD', 'taxa', '5.0000000000', 'fonte', 'MANUAL', 'data', '2026-10-01')) AS cambio1 \gset
RESET ROLE;

-- Saída sintética no formato do motor, sem itens (a operação não tem itens)
SELECT jsonb_build_object('schema_version', '1', 'engine_version', 'landed-cost/0.1.0', 'status', 'OK',
  'divergencias', '[]'::jsonb, 'rateios', '[]'::jsonb, 'despesas_nao_incorporadas', '[]'::jsonb,
  'conservacao', jsonb_build_object('entradas_brl', '0', 'descontos_brl', '0', 'saidas_brl', '0', 'diferenca_brl', '0', 'ok', true),
  'itens', '[]'::jsonb) AS saida \gset
SELECT repeat('b', 64) AS sha_s, repeat('c', 64) AS sha_outro \gset

-- ============================================================ D-06: permissões ==
-- Sessão de usuário (inclusive DONO) não executa o registro
SELECT set_config('request.jwt.claim.sub', :'dono_a', true) \gset
SET LOCAL ROLE authenticated;
SELECT pg_temp.espera_erro(format('SELECT public.import_registrar_apuracao(%L, %L, %L, %s, %L::jsonb, %L)', :'op', :'dono_a', 'APURACAO', 2, :'saida', :'sha_s'),
         'permission denied') AS dono_sessao \gset
RESET ROLE;
-- service_role com identidade de sessão é recusado
SET LOCAL ROLE service_role;
SELECT pg_temp.espera_erro(format('SELECT public.import_registrar_apuracao(%L, %L, %L, %s, %L::jsonb, %L)', :'op', :'dono_a', 'APURACAO', 2, :'saida', :'sha_s'),
         'IMPORT_REGISTRO_SOMENTE_SERVIDOR') AS servico_com_sessao \gset
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true) \gset
SET LOCAL ROLE service_role;
SELECT pg_temp.espera_erro(format('SELECT public.import_registrar_apuracao(%L, %L, %L, %s, %L::jsonb, %L)', :'op', :'op_a1', 'APURACAO', 2, :'saida', :'sha_s'),
         'IMPORT_NAO_AUTORIZADO') AS operador_nao_registra,
       pg_temp.espera_erro(format('SELECT public.import_registrar_apuracao(%L, %L, %L, %s, %L::jsonb, %L)', :'op', :'dono_b', 'APURACAO', 2, :'saida', :'sha_s'),
         'IMPORT_NAO_AUTORIZADO') AS dono_outra_empresa_nao_registra,
       pg_temp.espera_erro(format('SELECT public.import_registrar_apuracao(%L, NULL, %L, %s, %L::jsonb, %L)', :'op', 'APURACAO', 2, :'saida', :'sha_s'),
         'IMPORT_NAO_AUTORIZADO') AS ator_nulo \gset
RESET ROLE;
SELECT pg_temp.ok((:'dono_sessao')::boolean AND (:'servico_com_sessao')::boolean AND (:'operador_nao_registra')::boolean
  AND (:'dono_outra_empresa_nao_registra')::boolean AND (:'ator_nulo')::boolean,
  'D-06 registro: sessão (inclusive DONO) recusada; ator sem papel, de outra empresa ou nulo recusado');

-- ============================================================ D-04: idempotência ==
-- 1. Primeiro registro (versao_dados atual da operação)
SELECT versao_dados AS vd0 FROM public.import_operacoes WHERE id = :'op' \gset
SET LOCAL ROLE service_role;
SELECT public.import_registrar_apuracao(:'op', :'ger_a1', 'APURACAO', :vd0, :'saida', :'sha_s') AS apu1 \gset
-- 2. Reenvio idêntico (retry) devolve o mesmo id
SELECT public.import_registrar_apuracao(:'op', :'ger_a1', 'APURACAO', :vd0, :'saida', :'sha_s') AS apu1_replay \gset
RESET ROLE;
SELECT pg_temp.ok(:'apu1' = :'apu1_replay'
  AND (SELECT count(*) FROM public.import_apuracoes WHERE operacao_id = :'op' AND tipo = 'APURACAO') = 1,
  'D-04 reenvio idêntico retorna o mesmo id e não cria nova versão');

-- 3. Mesma identidade, conteúdo divergente: conflito explícito
SET LOCAL ROLE service_role;
SELECT pg_temp.espera_erro(format('SELECT public.import_registrar_apuracao(%L, %L, %L, %s, %L::jsonb, %L)', :'op', :'ger_a1', 'APURACAO', :vd0, :'saida', :'sha_outro'),
         'IMPORT_APURACAO_CONFLITO_CONTEUDO') AS conflito \gset
RESET ROLE;
SELECT pg_temp.ok((:'conflito')::boolean
  AND (SELECT count(*) FROM public.import_apuracoes WHERE operacao_id = :'op' AND tipo = 'APURACAO') = 1
  AND (SELECT saida_sha256 FROM public.import_apuracoes WHERE id = :'apu1') = :'sha_s',
  'D-04 mesma identidade com conteúdo divergente: conflito, sem alterar a apuração guardada');

-- 4. Alteração legítima dos dados: nova versão_dados, nova apuração
SELECT set_config('request.jwt.claim.sub', :'dono_a', true) \gset
SET LOCAL ROLE authenticated;
SELECT public.import_salvar_lancamento(:'op', 'CAMBIO', jsonb_build_object('moeda', 'EUR', 'taxa', '5.5000000000', 'fonte', 'MANUAL', 'data', '2026-10-02')) AS cambio2 \gset
RESET ROLE;
SELECT versao_dados AS vd1 FROM public.import_operacoes WHERE id = :'op' \gset
SELECT pg_temp.ok(:vd1 = :vd0 + 1, 'D-04 alteração legítima incrementa versao_dados');
SELECT set_config('request.jwt.claim.sub', '', true) \gset
SET LOCAL ROLE service_role;
SELECT public.import_registrar_apuracao(:'op', :'ger_a1', 'APURACAO', :vd1, :'saida', :'sha_s') AS apu2 \gset
RESET ROLE;
SELECT pg_temp.ok(:'apu2' <> :'apu1'
  AND (SELECT versao FROM public.import_apuracoes WHERE id = :'apu2') = 2
  AND (SELECT versao FROM public.import_apuracoes WHERE id = :'apu1') = 1,
  'D-04 alteração legítima gera nova versão; a anterior é preservada');

-- 5. A restrição não bloqueia apuração válida com motor diferente (outra identidade)
SET LOCAL ROLE service_role;
SELECT public.import_registrar_apuracao(:'op', :'ger_a1', 'APURACAO', :vd1,
  jsonb_set(:'saida'::jsonb, '{engine_version}', '"landed-cost/0.2.0"'), :'sha_outro') AS apu_motor_novo \gset
RESET ROLE;
SELECT pg_temp.ok((SELECT versao FROM public.import_apuracoes WHERE id = :'apu_motor_novo') = 3,
  'D-04 mesma versão de dados com motor diferente é outra identidade válida (versão 3)');

-- 6. Ausência de versões duplicadas
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.import_apuracoes WHERE operacao_id = :'op') = 3
  AND (SELECT count(DISTINCT versao) FROM public.import_apuracoes WHERE operacao_id = :'op') = 3
  AND (SELECT count(*) FROM pg_indexes WHERE indexname = 'import_apuracoes_identidade_uidx') = 1,
  'D-04 sem versões duplicadas: 3 apurações, 3 versões distintas, índice de identidade presente');

-- 7. entrada_sha256 é calculado no banco a partir da entrada guardada
SELECT pg_temp.ok(
  (SELECT entrada_sha256 = encode(sha256(convert_to(entrada::text, 'UTF8')), 'hex') FROM public.import_apuracoes WHERE id = :'apu2')
  AND (SELECT entrada = public._import_montar_entrada(:'op') FROM public.import_apuracoes WHERE id = :'apu2'),
  'D-04 entrada_sha256 derivado no banco e entrada guardada igual à entrada do banco');

-- ============================================================ D-06: aprovação ==
-- A evidência precisa citar a saída guardada desta apuração (a apuração apu2 é a atual)
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claim.sub', '', true) \gset
SELECT pg_temp.espera_erro(format('SELECT public.import_aprovar_apuracao(%L, %L, %L, %L::jsonb)', :'apu2', :'dono_a', 'evidência com hash de outra saída', format('{"recalculo_confere":true,"saida_sha256":"%s"}', :'sha_outro')),
         'IMPORT_SAIDA_NAO_CONFERE') AS ap_hash_errado \gset
SELECT public.import_aprovar_apuracao(:'apu2', :'dono_a', 'Custos conferidos em homologação', format('{"recalculo_confere":true,"saida_sha256":"%s"}', :'sha_s')::jsonb);
RESET ROLE;
SELECT pg_temp.ok((:'ap_hash_errado')::boolean
  AND (SELECT status = 'APROVADA' AND apuracao_aprovada_id = :'apu2'::uuid FROM public.import_operacoes WHERE id = :'op'),
  'D-06 aprovação recusada com hash de outra saída; aceita com a saída guardada');

-- ============================================================ histórico ==
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.import_auditoria WHERE operacao_id = :'op' AND acao = 'APURAR') = 3,
  'D-04 auditoria: uma linha APURAR por apuração nova (replays e conflitos não geram linha)');

ROLLBACK;
