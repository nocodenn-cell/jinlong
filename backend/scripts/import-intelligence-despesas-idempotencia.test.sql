-- ============================================================================
-- D-05 (idempotency_key em lançamentos de despesa). BEGIN … ROLLBACK, dados fictícios.
-- ============================================================================
\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.ok(p_ok boolean, p_nome text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'D05 FAIL: %', p_nome; END IF;
  RAISE NOTICE 'D05 OK: %', p_nome;
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
INSERT INTO public.empresas (nome) VALUES ('D05 Empresa A') RETURNING id AS emp_a \gset
INSERT INTO public.empresas (nome) VALUES ('D05 Empresa B') RETURNING id AS emp_b \gset
INSERT INTO public.lojas (nome, codigo, empresa_id) VALUES ('D05 A1', 'D05-A1', :'emp_a') RETURNING id AS loja_a1 \gset
INSERT INTO public.lojas (nome, codigo, empresa_id) VALUES ('D05 B1', 'D05-B1', :'emp_b') RETURNING id AS loja_b1 \gset
INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'dono.a@d05.test') RETURNING id AS dono_a \gset
INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'ger.a1@d05.test') RETURNING id AS ger_a1 \gset
INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'op.a1@d05.test') RETURNING id AS op_a1 \gset
INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'dono.b@d05.test') RETURNING id AS dono_b \gset
INSERT INTO public.usuarios (id, nome, perfil, loja_id, ativo) VALUES
  (:'dono_a', 'D05 Dono A', 'DONO', :'loja_a1', true), (:'ger_a1', 'D05 Ger A1', 'GERENTE', :'loja_a1', true),
  (:'op_a1', 'D05 Op A1', 'OPERADOR', :'loja_a1', true), (:'dono_b', 'D05 Dono B', 'DONO', :'loja_b1', true);

SET LOCAL ROLE service_role;
SELECT public.ops_definir_modulo_empresa(:'emp_a', 'IMPORT_INTELLIGENCE', true, 'contrato d05', 'homologação d05 A', 'teste-d05');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', :'dono_a', true) \gset
SET LOCAL ROLE authenticated;
SELECT public.import_criar_operacao(:'loja_a1', 'D05-001', 'Operação 1') AS op1 \gset
SELECT public.import_criar_operacao(:'loja_a1', 'D05-002', 'Operação 2') AS op2 \gset
RESET ROLE;

SELECT gen_random_uuid() AS k1 \gset
SELECT gen_random_uuid() AS k2 \gset

-- Conteúdo de uma despesa (rateio por peso bruto, sem item)
SELECT jsonb_build_object('tipo', 'FRETE_INTERNACIONAL', 'moeda', 'USD', 'valor', '300.000000', 'incorporavel', 'SIM',
  'atribuicao_modo', 'RATEIO', 'criterio', 'PESO_BRUTO', 'justificativa', 'Frete marítimo (BL)') AS conteudo \gset

-- ============================================================ criação e retry ==
SELECT set_config('request.jwt.claim.sub', :'dono_a', true) \gset
SET LOCAL ROLE authenticated;
SELECT public.import_salvar_lancamento(:'op1', 'DESPESA', (:'conteudo'::jsonb) || jsonb_build_object('idempotency_key', :'k1')) AS d1 \gset
SELECT versao_dados AS vd_antes FROM public.import_operacoes WHERE id = :'op1' \gset
SELECT public.import_salvar_lancamento(:'op1', 'DESPESA', (:'conteudo'::jsonb) || jsonb_build_object('idempotency_key', :'k1')) AS d1_retry \gset
SELECT versao_dados AS vd_depois FROM public.import_operacoes WHERE id = :'op1' \gset
RESET ROLE;
SELECT pg_temp.ok((:'d1') = (:'d1_retry')
  AND (SELECT count(*) FROM public.import_despesas WHERE operacao_id = :'op1') = 1,
  'D-05 retry idêntico (mesma chave e conteúdo) devolve o original; uma única despesa');
SELECT pg_temp.ok(:vd_depois = :vd_antes,
  'D-05 retry não incrementa versao_dados (não invalida apurações)');

-- ============================================================ conteúdo divergente ==
SELECT set_config('request.jwt.claim.sub', :'dono_a', true) \gset
SET LOCAL ROLE authenticated;
SELECT pg_temp.espera_erro(format('SELECT public.import_salvar_lancamento(%L, %L, %L::jsonb)', :'op1', 'DESPESA',
         ((:'conteudo'::jsonb) || jsonb_build_object('idempotency_key', :'k1', 'valor', '999.000000'))::text), 'IMPORT_IDEMPOTENCIA_CONFLITO') AS conflito \gset
RESET ROLE;
SELECT pg_temp.ok((:'conflito')::boolean
  AND (SELECT valor = 300 FROM public.import_despesas WHERE id = :'d1')
  AND (SELECT count(*) FROM public.import_despesas WHERE operacao_id = :'op1') = 1,
  'D-05 mesma chave com conteúdo diferente: conflito explícito, original preservado');

-- ============================================================ despesa legítima ==
-- Mesmo conteúdo, chave nova: é outra despesa (ex.: segundo embarque do mesmo tipo)
SELECT set_config('request.jwt.claim.sub', :'dono_a', true) \gset
SET LOCAL ROLE authenticated;
SELECT public.import_salvar_lancamento(:'op1', 'DESPESA', (:'conteudo'::jsonb) || jsonb_build_object('idempotency_key', :'k2')) AS d2 \gset
SELECT public.import_salvar_lancamento(:'op1', 'DESPESA', :'conteudo'::jsonb) AS d_sem_chave \gset
RESET ROLE;
SELECT pg_temp.ok((:'d2') <> (:'d1') AND (:'d_sem_chave') <> (:'d1')
  AND (SELECT count(*) FROM public.import_despesas WHERE operacao_id = :'op1') = 3,
  'D-05 despesa legítima com chave nova, e lançamento sem chave (compatibilidade), são registros distintos');

-- ============================================================ escopo por operação ==
-- A mesma chave em outra operação não colide, e não expõe a despesa da operação 1
SELECT set_config('request.jwt.claim.sub', :'dono_a', true) \gset
SET LOCAL ROLE authenticated;
SELECT public.import_salvar_lancamento(:'op2', 'DESPESA', (:'conteudo'::jsonb) || jsonb_build_object('idempotency_key', :'k1')) AS d_op2 \gset
RESET ROLE;
SELECT pg_temp.ok((:'d_op2') <> (:'d1')
  AND (SELECT count(*) FROM public.import_despesas WHERE operacao_id = :'op2') = 1,
  'D-05 chave é única por operação: mesma chave em outra operação cria registro próprio');

-- ============================================================ autorização não cede à chave ==
SELECT set_config('request.jwt.claim.sub', :'op_a1', true) \gset
SET LOCAL ROLE authenticated;
SELECT pg_temp.espera_erro(format('SELECT public.import_salvar_lancamento(%L, %L, %L::jsonb)', :'op1', 'DESPESA',
         (:'conteudo'::jsonb) || jsonb_build_object('idempotency_key', :'k1')), 'IMPORT_NAO_AUTORIZADO') AS operador_retry \gset
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', :'dono_b', true) \gset
SET LOCAL ROLE authenticated;
SELECT pg_temp.espera_erro(format('SELECT public.import_salvar_lancamento(%L, %L, %L::jsonb)', :'op1', 'DESPESA',
         (:'conteudo'::jsonb) || jsonb_build_object('idempotency_key', :'k1')), 'IMPORT_NAO_AUTORIZADO') AS outra_empresa_retry \gset
RESET ROLE;
SELECT pg_temp.ok((:'operador_retry')::boolean AND (:'outra_empresa_retry')::boolean
  AND (SELECT count(*) FROM public.import_despesas WHERE operacao_id = :'op1') = 3,
  'D-05 chave conhecida não concede acesso: operador e DONO de outra empresa recusados, sem efeito');

-- ============================================================ atualização continua funcionando ==
SELECT set_config('request.jwt.claim.sub', :'dono_a', true) \gset
SET LOCAL ROLE authenticated;
SELECT public.import_salvar_lancamento(:'op1', 'DESPESA', (:'conteudo'::jsonb) || jsonb_build_object('id', :'d1', 'justificativa', 'Frete corrigido (BL 2)')) AS d1_upd \gset
RESET ROLE;
SELECT pg_temp.ok((:'d1_upd') = (:'d1') AND (SELECT justificativa FROM public.import_despesas WHERE id = :'d1') = 'Frete corrigido (BL 2)',
  'D-05 edição por id continua atualizando o mesmo registro');

ROLLBACK;
