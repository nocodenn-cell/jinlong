-- ============================================================================
-- F4 — persistência do Import Intelligence (migration 20261021130100 (portada da F4 do PR #537)). BEGIN … ROLLBACK.
-- Isolamento A×B, módulo desabilitado por padrão, tenant derivado, papéis, versionamento,
-- imutabilidade, aprovação só pelo servidor, documentos e ausência de efeito no ERP.
-- (O cálculo real com o motor é exercitado no teste de integração TypeScript.)
-- ============================================================================
\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.f4_check(p_ok boolean, p_nome text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'F4 FAIL: %', p_nome; END IF;
  RAISE NOTICE 'F4 OK: %', p_nome;
END $$;

-- Espera erro com um código (SQLERRM começa pelo código) executando um SQL como o papel atual.
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
INSERT INTO public.empresas (nome) VALUES ('F4 Empresa A') RETURNING id AS emp_a \gset
INSERT INTO public.empresas (nome) VALUES ('F4 Empresa B') RETURNING id AS emp_b \gset
INSERT INTO public.lojas (nome, codigo, empresa_id) VALUES ('F4 A1', 'F4-A1', :'emp_a') RETURNING id AS loja_a1 \gset
INSERT INTO public.lojas (nome, codigo, empresa_id) VALUES ('F4 A2', 'F4-A2', :'emp_a') RETURNING id AS loja_a2 \gset
INSERT INTO public.lojas (nome, codigo, empresa_id) VALUES ('F4 B1', 'F4-B1', :'emp_b') RETURNING id AS loja_b1 \gset
INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'dono.a@f4.test') RETURNING id AS dono_a \gset
INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'gerente.a1@f4.test') RETURNING id AS ger_a1 \gset
INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'gerente.a2@f4.test') RETURNING id AS ger_a2 \gset
INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'operador.a1@f4.test') RETURNING id AS op_a1 \gset
INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'dono.b@f4.test') RETURNING id AS dono_b \gset
INSERT INTO public.usuarios (id, nome, perfil, loja_id, ativo) VALUES
  (:'dono_a', 'F4 Dono A', 'DONO', :'loja_a1', true), (:'ger_a1', 'F4 Ger A1', 'GERENTE', :'loja_a1', true),
  (:'ger_a2', 'F4 Ger A2', 'GERENTE', :'loja_a2', true), (:'op_a1', 'F4 Op A1', 'OPERADOR', :'loja_a1', true),
  (:'dono_b', 'F4 Dono B', 'DONO', :'loja_b1', true);
INSERT INTO public.categorias (nome, empresa_id) VALUES ('F4 cat', :'emp_a') RETURNING id AS cat \gset
INSERT INTO public.produtos (codigo_barras, nome, categoria_id, preco_varejo, preco_custo, origem, tem_nf, ativo, status_publicacao, loja_id)
  VALUES ('7899999955001', 'F4 Prod A', :'cat', 100, 10, 'brasil_nf', true, true, 'PUBLICADO', :'loja_a1') RETURNING id AS prod_a \gset
INSERT INTO public.produtos (codigo_barras, nome, categoria_id, preco_varejo, preco_custo, origem, tem_nf, ativo, status_publicacao, loja_id)
  VALUES ('7899999955002', 'F4 Prod B', :'cat', 100, 10, 'brasil_nf', true, true, 'PUBLICADO', :'loja_b1') RETURNING id AS prod_b \gset
INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual, estoque_minimo, version) VALUES (:'prod_a', :'loja_a1', 7, 0, 0);

-- Fotografia do ERP para provar ausência de efeito
SELECT (SELECT coalesce(sum(quantidade_atual), 0) FROM public.estoque) AS erp_estoque,
       (SELECT count(*) FROM public.contas_pagar) AS erp_ap,
       (SELECT md5(string_agg(id::text || preco_varejo::text || coalesce(preco_custo::text, ''), ',' ORDER BY id)) FROM public.produtos) AS erp_precos,
       (SELECT count(*) FROM public.movimentos_estoque_log) AS erp_kardex \gset

-- =========================================================== módulo OFF ==
SELECT set_config('request.jwt.claim.sub', :'dono_a', true) \gset
SET LOCAL ROLE authenticated;
SELECT pg_temp.espera_erro(format('SELECT public.import_criar_operacao(%L, %L)', :'loja_a1', 'OFF-1'), 'IMPORT_NAO_AUTORIZADO') AS off_criar \gset
RESET ROLE;
SELECT pg_temp.f4_check((:'off_criar')::boolean, 'F4-01 módulo desabilitado por padrão: DONO não cria operação');

SELECT set_config('request.jwt.claim.sub', '', true) \gset
SET LOCAL ROLE service_role;
SELECT public.ops_definir_modulo_empresa(:'emp_a', 'IMPORT_INTELLIGENCE', true, 'contrato F4', 'homologação F4 empresa A', 'teste-f4');
SELECT public.ops_definir_modulo_empresa(:'emp_b', 'IMPORT_INTELLIGENCE', true, 'contrato F4', 'homologação F4 empresa B', 'teste-f4');
RESET ROLE;

-- ===================================================== criação e tenant ==
SELECT set_config('request.jwt.claim.sub', :'dono_a', true) \gset
SET LOCAL ROLE authenticated;
SELECT public.import_criar_operacao(:'loja_a1', 'IMP-2026-001', 'Container 40HC Ningbo') AS op \gset
RESET ROLE;
SELECT pg_temp.f4_check((SELECT empresa_id FROM public.import_operacoes WHERE id = :'op') = :'emp_a'::uuid,
  'F4-02 tenant derivado da loja (empresa A), sem empresa_id vindo do cliente');

SELECT set_config('request.jwt.claim.sub', :'dono_b', true) \gset
SET LOCAL ROLE authenticated;
SELECT pg_temp.espera_erro(format('SELECT public.import_criar_operacao(%L, %L)', :'loja_a1', 'X-B'), 'IMPORT_NAO_AUTORIZADO') AS b_cria_em_a,
       pg_temp.espera_erro(format('SELECT public.import_salvar_item(%L, %L::jsonb)', :'op', '{"descricao":"x"}'), 'IMPORT_NAO_AUTORIZADO') AS b_escreve_a,
       (SELECT count(*) FROM public.import_operacoes) AS b_le_ops \gset
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', :'op_a1', true) \gset
SET LOCAL ROLE authenticated;
SELECT pg_temp.espera_erro(format('SELECT public.import_criar_operacao(%L, %L)', :'loja_a1', 'X-OP'), 'IMPORT_NAO_AUTORIZADO') AS op_cria,
       (SELECT count(*) FROM public.import_operacoes) AS op_le \gset
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', :'ger_a2', true) \gset
SET LOCAL ROLE authenticated;
SELECT pg_temp.espera_erro(format('SELECT public.import_salvar_item(%L, %L::jsonb)', :'op', '{"descricao":"x"}'), 'IMPORT_NAO_AUTORIZADO') AS g2_escreve,
       (SELECT count(*) FROM public.import_operacoes) AS g2_le \gset
RESET ROLE;
SELECT pg_temp.f4_check((:'b_cria_em_a')::boolean AND (:'b_escreve_a')::boolean AND :b_le_ops = 0
  AND (:'op_cria')::boolean AND :op_le = 0 AND (:'g2_escreve')::boolean AND :g2_le = 0,
  'F4-03 isolamento: DONO de B (mesmo licenciado), OPERADOR e GERENTE de outra loja não leem nem escrevem');

-- ============================================================= rascunho ==
SELECT set_config('request.jwt.claim.sub', :'ger_a1', true) \gset
SET LOCAL ROLE authenticated;
SELECT pg_temp.espera_erro(format('SELECT public.import_salvar_item(%L, %L::jsonb)', :'op', jsonb_build_object(
  'produto_id', :'prod_b', 'descricao', 'invasor', 'moeda', 'USD', 'valor_mercadoria_moeda', '1', 'quantidade_comercial', '1',
  'unidade_comercial', 'UN', 'fator_para_estoque', '1', 'quantidade_estoque', '1')), 'IMPORT_PRODUTO_FORA_DA_EMPRESA') AS prod_fora \gset
SELECT public.import_salvar_item(:'op', jsonb_build_object('produto_id', :'prod_a', 'descricao', 'Parafuso M6', 'moeda', 'USD',
  'valor_mercadoria_moeda', '1000.000000', 'valor_aduaneiro_brl', '5400.000000', 'quantidade_comercial', '100.000',
  'unidade_comercial', 'CX', 'fator_para_estoque', '50.000000', 'quantidade_estoque', '5000.000',
  'peso_liquido_kg', '200.000', 'peso_bruto_kg', '210.000', 'volume_m3', '1.200')) AS item1 \gset
SELECT public.import_salvar_item(:'op', jsonb_build_object('descricao', 'Arruela', 'moeda', 'USD',
  'valor_mercadoria_moeda', '500.000000', 'quantidade_comercial', '10.000', 'unidade_comercial', 'CX',
  'fator_para_estoque', '100.000000', 'quantidade_estoque', '1000.000', 'peso_bruto_kg', '90.000')) AS item2 \gset
SELECT public.import_salvar_lancamento(:'op', 'CAMBIO', jsonb_build_object('moeda', 'USD', 'taxa', '5.4321098765', 'fonte', 'DECLARADA_DI', 'data', '2026-10-01'));
SELECT public.import_salvar_lancamento(:'op', 'DESPESA', jsonb_build_object('tipo', 'FRETE_INTERNACIONAL', 'moeda', 'USD', 'valor', '300.000000',
  'incorporavel', 'SIM', 'atribuicao_modo', 'RATEIO', 'criterio', 'PESO_BRUTO', 'justificativa', 'Frete marítimo rateado pelo peso bruto (BL)'));
SELECT public.import_salvar_lancamento(:'op', 'TRIBUTO', jsonb_build_object('tributo_codigo', 'II', 'status_recuperabilidade', 'NAO_RECUPERAVEL',
  'valor_apurado_brl', '972.00', 'item_id', :'item1', 'regra_id', 'II-NCM-7318', 'regra_incorpora_custo', true,
  'regra_vigencia_inicio', '2026-01-01', 'data_fato_gerador', '2026-10-01'));
SELECT public.import_montar_entrada(:'op') AS ent \gset
RESET ROLE;
SELECT pg_temp.f4_check((:'prod_fora')::boolean
  AND jsonb_array_length((:'ent'::jsonb) -> 'entrada' -> 'itens') = 2
  AND (:'ent'::jsonb) -> 'entrada' -> 'cambios' -> 0 ->> 'taxa' = '5.4321098765'
  AND (:'ent'::jsonb) -> 'entrada' -> 'despesas' -> 0 -> 'atribuicao' ->> 'criterio' = 'PESO_BRUTO'
  AND (:'ent'::jsonb) -> 'entrada' -> 'despesas' -> 0 -> 'incorporavel' = 'true'::jsonb
  AND (:'ent'::jsonb) -> 'entrada' -> 'tributos' -> 0 -> 'regra' ->> 'vigencia_inicio' = '2026-01-01'
  AND ((:'ent'::jsonb) ->> 'versao_dados')::int = 6,
  'F4-04 rascunho salvo; entrada do motor montada pelo banco com escalas exatas (taxa 10 casas); versao_dados 6');

-- ============================================================ apuração ==
-- Saída sintética no formato do motor (o motor real é exercitado no teste TS)
SELECT jsonb_build_object('schema_version', '1', 'engine_version', 'landed-cost/0.1.0', 'status', 'OK',
  'divergencias', '[]'::jsonb, 'rateios', '[]'::jsonb, 'despesas_nao_incorporadas', '[]'::jsonb,
  'creditos', jsonb_build_object('potencial_brl', '0.0000', 'reconhecido_brl', '0.0000'),
  'conservacao', jsonb_build_object('entradas_brl', '1', 'descontos_brl', '0', 'saidas_brl', '1', 'diferenca_brl', '0', 'ok', true),
  'itens', (SELECT jsonb_agg(jsonb_build_object('item_id', i.id::text, 'produto_id', i.produto_id::text,
             'quantidade_estoque', i.quantidade_estoque::text, 'custo_total_brl', '100.0000', 'custo_unitario_brl', '0.020000',
             'residuo_unitario_brl', '0.0000000000', 'residuo_total_brl', '0.0000000000',
             'componentes_brl', jsonb_build_object('mercadoria', '100', 'despesas_incorporadas', '0', 'tributos_nao_recuperaveis', '0', 'descontos', '0'),
             'memoria', '[]'::jsonb)) FROM public.import_itens i WHERE i.operacao_id = :'op')) AS saida \gset
SELECT repeat('a', 64) AS sha_e, repeat('b', 64) AS sha_s \gset

-- D-06: sessão de usuário não registra apuração (nem o DONO); só o servidor (service_role) registra.
SELECT set_config('request.jwt.claim.sub', :'ger_a1', true) \gset
SET LOCAL ROLE authenticated;
SELECT pg_temp.espera_erro(format('SELECT public.import_registrar_apuracao(%L, %L, %L, %s, %L::jsonb, %L)', :'op', :'ger_a1', 'APURACAO', 6, :'saida', :'sha_s'),
         'permission denied') AS sessao_bloqueada \gset
RESET ROLE;
-- service_role sem identidade de sessão: o ator é o parâmetro, autorizado no banco
SELECT set_config('request.jwt.claim.sub', '', true) \gset
SET LOCAL ROLE service_role;
SELECT pg_temp.espera_erro(format('SELECT public.import_registrar_apuracao(%L, %L, %L, %s, %L::jsonb, %L)', :'op', :'ger_a1', 'APURACAO', 5, :'saida', :'sha_s'),
         'IMPORT_DADOS_ALTERADOS_DURANTE_CALCULO') AS conc,
       pg_temp.espera_erro(format('SELECT public.import_registrar_apuracao(%L, %L, %L, %s, %L::jsonb, %L)', :'op', :'ger_a1', 'APURACAO', 6,
         jsonb_set(:'saida'::jsonb, '{itens}', ((:'saida'::jsonb) -> 'itens') - 0)::text, :'sha_s'), 'IMPORT_SAIDA_NAO_CORRESPONDE_AOS_ITENS') AS itens_div,
       pg_temp.espera_erro(format('SELECT public.import_registrar_apuracao(%L, %L, %L, %s, %L::jsonb, %L)', :'op', :'op_a1', 'APURACAO', 6, :'saida', :'sha_s'),
         'IMPORT_NAO_AUTORIZADO') AS ator_sem_papel \gset
SELECT public.import_registrar_apuracao(:'op', :'ger_a1', 'SIMULACAO', 6, :'saida', :'sha_s') AS sim \gset
SELECT public.import_registrar_apuracao(:'op', :'ger_a1', 'APURACAO', 6, :'saida', :'sha_s') AS apu \gset
RESET ROLE;
SELECT (SELECT count(*) FROM public.import_apuracao_itens WHERE apuracao_id = :'apu') AS apu_itens,
       (SELECT versao FROM public.import_apuracoes WHERE id = :'apu') AS apu_versao,
       (SELECT entrada = public._import_montar_entrada(:'op') FROM public.import_apuracoes WHERE id = :'apu') AS apu_entrada_igual \gset
RESET ROLE;
SELECT pg_temp.f4_check((:'sessao_bloqueada')::boolean AND (:'conc')::boolean AND (:'itens_div')::boolean AND (:'ator_sem_papel')::boolean
  AND :apu_itens = 2 AND :apu_versao = 2 AND (:'apu_entrada_igual')::boolean,
  'F4-05 apuração versionada; entrada guardada = entrada do banco; sessão de usuário, concorrência, itens divergentes e ator sem papel recusados');

SELECT pg_temp.f4_check(
  pg_temp.espera_erro(format('UPDATE public.import_apuracoes SET status_calculo = %L WHERE id = %L', 'OK', :'apu'), 'HISTORICO_IMUTAVEL')
  AND pg_temp.espera_erro(format('DELETE FROM public.import_apuracao_itens WHERE apuracao_id = %L', :'apu'), 'HISTORICO_IMUTAVEL')
  AND pg_temp.espera_erro(format('DELETE FROM public.import_auditoria WHERE operacao_id = %L', :'op'), 'HISTORICO_IMUTAVEL'),
  'F4-06 apuração, itens apurados e auditoria imutáveis (inclusive para o dono do banco)');

-- ============================================================ aprovação ==
-- Com a F5 aplicada, a aprovação exige despesas e tributos conferidos. A regra é provada no
-- teste da F5; aqui os lançamentos são marcados conferidos para isolar as regras da F4.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'import_despesas' AND column_name = 'status_conferencia') THEN
    EXECUTE 'UPDATE public.import_despesas SET status_conferencia = ''CONFERIDO''';
    EXECUTE 'UPDATE public.import_tributos SET status_conferencia = ''CONFERIDO''';
  END IF;
END $$;
SELECT set_config('request.jwt.claim.sub', :'dono_a', true) \gset
SET LOCAL ROLE authenticated;
SELECT pg_temp.espera_erro(format('SELECT public.import_aprovar_apuracao(%L, %L, %L, %L::jsonb)', :'apu', :'dono_a', 'aprovação direta via API', '{"recalculo_confere":true}'),
       'permission denied') AS ap_auth \gset
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT pg_temp.espera_erro(format('SELECT public.import_aprovar_apuracao(%L, %L, %L, %L::jsonb)', :'apu', :'dono_a', 'service com identidade', '{"recalculo_confere":true}'),
       'IMPORT_APROVACAO_SOMENTE_SERVIDOR') AS ap_ident \gset
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true) \gset
SET LOCAL ROLE service_role;
SELECT pg_temp.espera_erro(format('SELECT public.import_aprovar_apuracao(%L, %L, %L, %L::jsonb)', :'apu', :'ger_a1', 'gerente tenta aprovar', '{"recalculo_confere":true}'),
         'IMPORT_APROVADOR_NAO_AUTORIZADO') AS ap_ger,
       pg_temp.espera_erro(format('SELECT public.import_aprovar_apuracao(%L, %L, %L, %L::jsonb)', :'apu', :'dono_b', 'dono de outra empresa', '{"recalculo_confere":true}'),
         'IMPORT_APROVADOR_NAO_AUTORIZADO') AS ap_b,
       pg_temp.espera_erro(format('SELECT public.import_aprovar_apuracao(%L, %L, %L, %L::jsonb)', :'apu', :'dono_a', 'sem conferência de recálculo', '{}'),
         'IMPORT_RECALCULO_NAO_CONFERIDO') AS ap_sem_rec,
       pg_temp.espera_erro(format('SELECT public.import_aprovar_apuracao(%L, %L, %L, %L::jsonb)', :'sim', :'dono_a', 'aprovar uma simulação', '{"recalculo_confere":true}'),
         'IMPORT_SIMULACAO_NAO_APROVAVEL') AS ap_sim \gset
SELECT public.import_aprovar_apuracao(:'apu', :'dono_a', 'Custos conferidos com DI e invoice', format('{"recalculo_confere":true,"saida_sha256":"%s"}', :'sha_s')::jsonb);
RESET ROLE;
SELECT pg_temp.f4_check((:'ap_auth')::boolean AND (:'ap_ident')::boolean AND (:'ap_ger')::boolean AND (:'ap_b')::boolean
  AND (:'ap_sem_rec')::boolean AND (:'ap_sim')::boolean
  AND (SELECT status = 'APROVADA' AND apuracao_aprovada_id = :'apu'::uuid FROM public.import_operacoes WHERE id = :'op'),
  'F4-07 aprovação só pelo servidor, só DONO da empresa, só apuração conferida; simulação não aprova');

SELECT set_config('request.jwt.claim.sub', :'ger_a1', true) \gset
SET LOCAL ROLE authenticated;
SELECT pg_temp.espera_erro(format('SELECT public.import_salvar_item(%L, %L::jsonb)', :'op', '{"descricao":"x"}'), 'IMPORT_OPERACAO_NAO_EDITAVEL') AS bloq_edit,
       pg_temp.espera_erro(format('SELECT public.import_mudar_estado(%L, %L, %L)', :'op', 'REABRIR', 'gerente tenta reabrir'), 'IMPORT_NAO_AUTORIZADO') AS ger_reabre \gset
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', :'dono_a', true) \gset
SET LOCAL ROLE authenticated;
SELECT public.import_mudar_estado(:'op', 'REABRIR', 'Frete complementar recebido após aprovação');
SELECT (SELECT status FROM public.import_operacoes WHERE id = :'op') AS st_reaberta,
       (SELECT count(*) FROM public.import_aprovacoes WHERE operacao_id = :'op') AS n_aprov,
       (SELECT count(*) FROM public.import_apuracoes WHERE operacao_id = :'op') AS n_apur \gset
RESET ROLE;
SELECT pg_temp.f4_check((:'bloq_edit')::boolean AND (:'ger_reabre')::boolean AND :'st_reaberta' = 'RASCUNHO' AND :n_aprov = 2 AND :n_apur = 2,
  'F4-08 aprovada não é editável; só DONO reabre; histórico de aprovação e apurações preservado');

-- ============================================================ documentos ==
SELECT set_config('request.jwt.claim.sub', :'ger_a1', true) \gset
SET LOCAL ROLE authenticated;
SELECT pg_temp.espera_erro(format('SELECT public.import_registrar_documento(%L, %L, %L, %L, %L, %L, %s, %L)', :'op', 'INVOICE', 'INV-1', '2026-09-20',
         :'emp_b' || '/' || :'op' || '/inv.pdf', repeat('c', 64), 1000, 'application/pdf'), 'new row for relation "import_documentos" violates check constraint') AS doc_tenant \gset
SELECT public.import_registrar_documento(:'op', 'INVOICE', 'INV-1', '2026-09-20', :'emp_a' || '/' || :'op' || '/inv-v1.pdf',
  repeat('d', 64), 1000, 'application/pdf') AS doc1 \gset
SELECT public.import_registrar_documento(:'op', 'INVOICE', 'INV-1', '2026-09-20', :'emp_a' || '/' || :'op' || '/inv-v2.pdf',
  repeat('e', 64), 1200, 'application/pdf', :'doc1') AS doc2 \gset
SELECT public.fp_import_pode_objeto('import-documentos', :'emp_a' || '/' || :'op' || '/inv-v1.pdf') AS obj_ok,
       public.fp_import_pode_objeto('produto-imagens', :'emp_a' || '/' || :'op' || '/x.png') AS obj_outro_bucket,
       public.fp_import_pode_objeto('import-documentos', 'nao-uuid/x.pdf') AS obj_malformado,
       public.fp_import_pode_objeto('import-documentos', :'emp_b' || '/' || :'op' || '/x.pdf') AS obj_tenant_errado \gset
RESET ROLE;
SELECT pg_temp.f4_check((:'doc_tenant')::boolean
  AND (SELECT versao FROM public.import_documentos WHERE id = :'doc2') = 2
  AND pg_temp.espera_erro(format('DELETE FROM public.import_documentos WHERE id = %L', :'doc1'), 'HISTORICO_IMUTAVEL')
  AND (:'obj_ok')::boolean AND NOT (:'obj_outro_bucket')::boolean AND NOT (:'obj_malformado')::boolean AND NOT (:'obj_tenant_errado')::boolean,
  'F4-09 documentos: caminho preso ao tenant, sha256, versão por substituição, sem exclusão; storage por empresa/operação');

-- ===================================================== licença revogada ==
SELECT set_config('request.jwt.claim.sub', '', true) \gset
SET LOCAL ROLE service_role;
SELECT public.ops_definir_modulo_empresa(:'emp_a', 'IMPORT_INTELLIGENCE', false, NULL, 'fim do contrato de teste F4', 'teste-f4');
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', :'dono_a', true) \gset
SET LOCAL ROLE authenticated;
SELECT (SELECT count(*) FROM public.import_operacoes) AS rev_ops, (SELECT count(*) FROM public.import_documentos) AS rev_docs \gset
RESET ROLE;
SELECT pg_temp.f4_check(:rev_ops = 0 AND :rev_docs = 0 AND (SELECT count(*) FROM public.import_operacoes WHERE id = :'op') = 1,
  'F4-10 módulo desabilitado: dados inacessíveis ao cliente, preservados no banco');

-- ======================================================== ERP intocado ==
SELECT set_config('request.jwt.claim.sub', '', true) \gset
SELECT pg_temp.f4_check(
  (SELECT coalesce(sum(quantidade_atual), 0) FROM public.estoque) = :erp_estoque
  AND (SELECT count(*) FROM public.contas_pagar) = :erp_ap
  AND (SELECT md5(string_agg(id::text || preco_varejo::text || coalesce(preco_custo::text, ''), ',' ORDER BY id)) FROM public.produtos) = :'erp_precos'
  AND (SELECT count(*) FROM public.movimentos_estoque_log) = :erp_kardex,
  'F4-11 nenhum efeito em estoque, kardex, contas a pagar ou preços');

ROLLBACK;
