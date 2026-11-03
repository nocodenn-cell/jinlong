-- ============================================================================
-- F5 — campos do hub de Importações (migration 20261010170000). BEGIN … ROLLBACK. Banco LOCAL.
-- ============================================================================
\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.f5_check(p_ok boolean, p_nome text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'F5 FAIL: %', p_nome; END IF;
  RAISE NOTICE 'F5 OK: %', p_nome;
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

INSERT INTO public.empresas (nome) VALUES ('F5 A') RETURNING id AS emp_a \gset
INSERT INTO public.empresas (nome) VALUES ('F5 B') RETURNING id AS emp_b \gset
INSERT INTO public.lojas (nome, codigo, empresa_id) VALUES ('F5 A1', 'F5-A1', :'emp_a') RETURNING id AS loja_a \gset
INSERT INTO public.lojas (nome, codigo, empresa_id) VALUES ('F5 B1', 'F5-B1', :'emp_b') RETURNING id AS loja_b \gset
INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'dono.a@f5.test') RETURNING id AS dono_a \gset
INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'dono.b@f5.test') RETURNING id AS dono_b \gset
INSERT INTO public.usuarios (id, nome, perfil, loja_id, ativo) VALUES
  (:'dono_a', 'F5 Dono A', 'DONO', :'loja_a', true), (:'dono_b', 'F5 Dono B', 'DONO', :'loja_b', true);
INSERT INTO public.fornecedores (nome, loja_id) VALUES ('F5 Forn A', :'loja_a') RETURNING id AS forn_a \gset
INSERT INTO public.fornecedores (nome, loja_id) VALUES ('F5 Forn B', :'loja_b') RETURNING id AS forn_b \gset

SET LOCAL ROLE service_role;
SELECT public.ops_definir_modulo_empresa(:'emp_a', 'IMPORT_INTELLIGENCE', true, 'contrato F5', 'homologação F5 empresa A', 'teste-f5');
SELECT public.ops_definir_modulo_empresa(:'emp_b', 'IMPORT_INTELLIGENCE', true, 'contrato F5', 'homologação F5 empresa B', 'teste-f5');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', :'dono_a', true) \gset
SET LOCAL ROLE authenticated;
SELECT public.import_criar_operacao(:'loja_a', 'F5-INV-1') AS op \gset
SELECT pg_temp.espera_erro(format('SELECT public.import_atualizar_operacao(%L, %L::jsonb)', :'op',
         jsonb_build_object('referencia', 'F5-INV-1', 'fornecedor_id', :'forn_b')), 'IMPORT_FORNECEDOR_FORA_DA_EMPRESA') AS forn_fora \gset
SELECT public.import_atualizar_operacao(:'op', jsonb_build_object('referencia', 'F5-INV-1', 'fornecedor_id', :'forn_a',
  'moeda', 'usd', 'data_invoice', '2026-09-18', 'data_embarque', '2026-09-20', 'data_desembaraco', '2026-10-05', 'observacoes', 'Container fictício'));
SELECT public.import_salvar_item(:'op', jsonb_build_object('descricao', 'Parafuso', 'codigo_fornecedor', '000123', 'ncm', '01012100',
  'moeda', 'USD', 'valor_mercadoria_moeda', '1000', 'quantidade_comercial', '1', 'unidade_comercial', 'CX',
  'fator_para_estoque', '1', 'quantidade_estoque', '1')) AS item \gset
SELECT pg_temp.espera_erro(format('SELECT public.import_salvar_item(%L, %L::jsonb)', :'op', jsonb_build_object('descricao', 'x', 'ncm', '123',
  'moeda', 'USD', 'valor_mercadoria_moeda', '1', 'quantidade_comercial', '1', 'unidade_comercial', 'UN', 'fator_para_estoque', '1',
  'quantidade_estoque', '1')), 'new row for relation "import_itens" violates check constraint') AS ncm_invalido \gset
SELECT public.import_salvar_lancamento(:'op', 'DESPESA', jsonb_build_object('tipo', 'FRETE', 'moeda', 'USD', 'valor', '100',
  'incorporavel', 'SIM', 'atribuicao_modo', 'RATEIO', 'criterio', 'VALOR_ADUANEIRO', 'justificativa', 'frete fictício')) AS desp \gset
RESET ROLE;

SELECT pg_temp.f5_check((:'forn_fora')::boolean AND (:'ncm_invalido')::boolean
  AND (SELECT fornecedor_id = :'forn_a'::uuid AND moeda = 'USD' AND data_desembaraco = '2026-10-05' AND descricao = 'Container fictício'
         FROM public.import_operacoes WHERE id = :'op')
  AND (SELECT codigo_fornecedor = '000123' AND ncm = '01012100' FROM public.import_itens WHERE id = :'item'),
  'F5-01 cabeçalho (fornecedor da empresa, moeda, datas), código do fornecedor com zeros e NCM de 8 dígitos');

SELECT pg_temp.f5_check(
  NOT (public._import_montar_entrada(:'op') -> 'itens' -> 0 ? 'codigo_fornecedor')
  AND NOT (public._import_montar_entrada(:'op') -> 'itens' -> 0 ? 'ncm'),
  'F5-02 entrada do motor inalterada (campos documentais não entram no cálculo)');

-- conferência não altera versao_dados; edição do lançamento volta para PENDENTE
SELECT versao_dados AS v_antes FROM public.import_operacoes WHERE id = :'op' \gset
SELECT set_config('request.jwt.claim.sub', :'dono_a', true) \gset
SET LOCAL ROLE authenticated;
SELECT public.import_conferir_lancamento(:'op', 'DESPESA', :'desp', 'CONFERIDO');
RESET ROLE;
SELECT versao_dados AS v_depois FROM public.import_operacoes WHERE id = :'op' \gset
SELECT status_conferencia AS st1 FROM public.import_despesas WHERE id = :'desp' \gset
SET LOCAL ROLE authenticated;
SELECT public.import_salvar_lancamento(:'op', 'DESPESA', jsonb_build_object('id', :'desp', 'tipo', 'FRETE', 'moeda', 'USD', 'valor', '120',
  'incorporavel', 'SIM', 'atribuicao_modo', 'RATEIO', 'criterio', 'VALOR_ADUANEIRO', 'justificativa', 'frete corrigido'));
RESET ROLE;
SELECT status_conferencia AS st2 FROM public.import_despesas WHERE id = :'desp' \gset
SELECT pg_temp.f5_check(:v_antes = :v_depois AND :'st1' = 'CONFERIDO' AND :'st2' = 'PENDENTE',
  'F5-03 conferir não invalida a apuração (versao_dados igual); alterar valor conferido volta para "a conferir"');

-- aprovação exige lançamentos conferidos (saída sintética no formato do motor)
SELECT versao_dados AS vd FROM public.import_operacoes WHERE id = :'op' \gset
SELECT jsonb_build_object('schema_version', '1', 'engine_version', 'landed-cost/0.1.0', 'status', 'OK',
  'divergencias', '[]'::jsonb, 'rateios', '[]'::jsonb, 'despesas_nao_incorporadas', '[]'::jsonb,
  'creditos', jsonb_build_object('potencial_brl', '0', 'reconhecido_brl', '0'),
  'conservacao', jsonb_build_object('entradas_brl', '1', 'descontos_brl', '0', 'saidas_brl', '1', 'diferenca_brl', '0', 'ok', true),
  'itens', jsonb_build_array(jsonb_build_object('item_id', :'item', 'produto_id', null, 'quantidade_estoque', '1.000',
    'custo_total_brl', '5432.1099', 'custo_unitario_brl', '5432.109900', 'residuo_unitario_brl', '0', 'residuo_total_brl', '0',
    'componentes_brl', '{}'::jsonb, 'memoria', '[]'::jsonb))) AS saida \gset
-- D-06: o registro é do servidor (service_role), com o ator identificado e reautorizado no banco
SELECT set_config('request.jwt.claim.sub', '', true) \gset
SET LOCAL ROLE service_role;
SELECT public.import_registrar_apuracao(:'op', :'dono_a', 'APURACAO', :vd, :'saida', repeat('b', 64)) AS apu \gset
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true) \gset
SET LOCAL ROLE service_role;
SELECT pg_temp.espera_erro(format('SELECT public.import_aprovar_apuracao(%L, %L, %L, %L::jsonb)', :'apu', :'dono_a',
         'aprovação com despesa a conferir', '{"recalculo_confere":true}'), 'IMPORT_LANCAMENTOS_NAO_CONFERIDOS') AS bloq_conf \gset
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', :'dono_a', true) \gset
SET LOCAL ROLE authenticated;
SELECT public.import_conferir_lancamento(:'op', 'DESPESA', :'desp', 'CONFERIDO');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true) \gset
SET LOCAL ROLE service_role;
SELECT public.import_aprovar_apuracao(:'apu', :'dono_a', 'aprovação após conferência', format('{"recalculo_confere":true,"saida_sha256":"%s"}', repeat('b', 64))::jsonb);
RESET ROLE;
SELECT pg_temp.f5_check((:'bloq_conf')::boolean AND (SELECT status = 'APROVADA' FROM public.import_operacoes WHERE id = :'op'),
  'F5-04 aprovação recusada com lançamento a conferir; aceita depois da conferência (versão continua válida)');

-- listagem: só da própria empresa, somas como texto exato, exige identidade
SELECT set_config('request.jwt.claim.sub', :'dono_b', true) \gset
SET LOCAL ROLE authenticated;
SELECT count(*) AS b_lista FROM public.import_listar_operacoes() \gset
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', :'dono_a', true) \gset
SET LOCAL ROLE authenticated;
SELECT count(*) AS a_lista, max(aprovada_custo_total) AS a_custo, max(fornecedor_nome) AS a_forn, max(n_itens) AS a_itens
  FROM public.import_listar_operacoes() WHERE id = :'op' \gset
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true) \gset
SET LOCAL ROLE authenticated;
SELECT pg_temp.espera_erro('SELECT * FROM public.import_listar_operacoes()', 'IMPORT_AUTH') AS lista_sem_ident \gset
RESET ROLE;
SELECT pg_temp.f5_check(:b_lista = 0 AND :a_lista = 1 AND :'a_custo' = '5432.1099' AND :'a_forn' = 'F5 Forn A' AND :a_itens = 1
  AND (:'lista_sem_ident')::boolean,
  'F5-05 lista: empresa B não vê A; custo como texto exato; exige identidade');

-- produtos para vínculo: via RPC do módulo, só da própria empresa, só id e nome
INSERT INTO public.categorias (nome, empresa_id) VALUES ('F5 cat', :'emp_a') RETURNING id AS cat \gset
INSERT INTO public.produtos (codigo_barras, nome, categoria_id, preco_varejo, preco_custo, origem, tem_nf, ativo, status_publicacao, loja_id)
  VALUES ('7899999966001', 'F5 Parafuso A', :'cat', 10, 1, 'brasil_nf', true, true, 'PUBLICADO', :'loja_a') RETURNING id AS prod_a \gset
INSERT INTO public.produtos (codigo_barras, nome, categoria_id, preco_varejo, preco_custo, origem, tem_nf, ativo, status_publicacao, loja_id)
  VALUES ('7899999966002', 'F5 Parafuso B', :'cat', 10, 1, 'brasil_nf', true, true, 'PUBLICADO', :'loja_b') RETURNING id AS prod_b \gset
SELECT set_config('request.jwt.claim.sub', :'dono_a', true) \gset
SET LOCAL ROLE authenticated;
SELECT string_agg(nome, ',' ORDER BY nome) AS a_busca FROM public.import_buscar_produtos('F5 Parafuso') \gset
SELECT count(*) AS a_ids FROM public.import_buscar_produtos(NULL, ARRAY[:'prod_a', :'prod_b']::uuid[]) \gset
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true) \gset
SET LOCAL ROLE authenticated;
SELECT pg_temp.espera_erro('SELECT * FROM public.import_buscar_produtos(''F5'')', 'IMPORT_AUTH') AS busca_sem_ident \gset
RESET ROLE;
SELECT pg_temp.f5_check(:'a_busca' = 'F5 Parafuso A' AND :a_ids = 1 AND (:'busca_sem_ident')::boolean
  AND pg_get_function_result('public.import_buscar_produtos(text,uuid[])'::regprocedure) = 'TABLE(id uuid, nome text)',
  'F5-06 produtos para vínculo: só da própria empresa (B fica de fora, até por id), exige identidade');

ROLLBACK;
