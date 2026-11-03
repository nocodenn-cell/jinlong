-- ============================================================================
-- ADR-008 Emenda 1 · T2 — bloqueio de preco_custo_medio. BEGIN … ROLLBACK, dados fictícios.
-- Regra de cada teste "bloqueado": o erro PRODUTO_CUSTO_MEDIO_LEGADO é esperado E o valor
-- permanece inalterado. Regra de cada teste "permitido": a escrita afeta a linha esperada.
-- Toda afirmação de "bloqueado" só vale se a linha-alvo for visível ao usuário (prova prévia
-- por escrita benigna com contagem de linhas), para não haver falso positivo por RLS.
-- ============================================================================
\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.ok(p_ok boolean, p_nome text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'CUSTO_MEDIO FAIL: %', p_nome; END IF;
  RAISE NOTICE 'CUSTO_MEDIO OK: %', p_nome;
END $$;

-- Executa um SQL como o papel/claims atuais e devolve 'ERRO:<mensagem>' ou 'LINHAS:<n>'.
CREATE FUNCTION pg_temp.exec_info(p_sql text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  EXECUTE p_sql;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN 'LINHAS:' || n;
EXCEPTION WHEN OTHERS THEN
  RETURN 'ERRO:' || SQLERRM;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.exec_info(text) TO authenticated, service_role;

SELECT set_config('request.jwt.claim.sub', '', true) \gset

-- ---------------------------------------------------------------- fixtures --
INSERT INTO public.empresas (nome) VALUES ('CM Empresa A') RETURNING id AS emp_a \gset
INSERT INTO public.empresas (nome) VALUES ('CM Empresa B') RETURNING id AS emp_b \gset
INSERT INTO public.lojas (nome, codigo, empresa_id) VALUES ('CM A1', 'CM-A1', :'emp_a') RETURNING id AS loja_a1 \gset
INSERT INTO public.lojas (nome, codigo, empresa_id) VALUES ('CM B1', 'CM-B1', :'emp_b') RETURNING id AS loja_b1 \gset
INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'ger.a1@cm.test') RETURNING id AS ger_a1 \gset
INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'dono.b@cm.test') RETURNING id AS dono_b \gset
INSERT INTO public.usuarios (id, nome, perfil, loja_id, ativo) VALUES
  (:'ger_a1', 'CM Ger A1', 'GERENTE', :'loja_a1', true),
  (:'dono_b', 'CM Dono B', 'DONO', :'loja_b1', true);
INSERT INTO public.categorias (nome, empresa_id) VALUES ('CM cat', :'emp_a') RETURNING id AS cat_a \gset
INSERT INTO public.categorias (nome, empresa_id) VALUES ('CM cat B', :'emp_b') RETURNING id AS cat_b \gset

-- Produtos criados como superusuário do teste (caminho de fixture, DEFAULT 0 em preco_custo_medio)
INSERT INTO public.produtos (codigo_barras, nome, categoria_id, preco_varejo, preco_custo, origem, tem_nf, ativo, status_publicacao, loja_id)
  VALUES ('7898888800001', 'CM Prod A', :'cat_a', 100, 10, 'brasil_nf', true, true, 'PUBLICADO', :'loja_a1') RETURNING id AS prod_a \gset
INSERT INTO public.produtos (codigo_barras, nome, categoria_id, preco_varejo, preco_custo, origem, tem_nf, ativo, status_publicacao, loja_id)
  VALUES ('7898888800002', 'CM Prod B', :'cat_b', 100, 10, 'brasil_nf', true, true, 'PUBLICADO', :'loja_b1') RETURNING id AS prod_b \gset

-- ============================================================ INSERT (fixture) ==
SELECT pg_temp.ok((SELECT preco_custo_medio = 0 FROM public.produtos WHERE id = :'prod_a'),
  'INSERT com default (0) continua permitido e grava 0');

SELECT pg_temp.exec_info(format('INSERT INTO public.produtos (codigo_barras, nome, categoria_id, preco_varejo, preco_custo, origem, tem_nf, ativo, status_publicacao, loja_id, preco_custo_medio) VALUES (%L, %L, %L, 50, 5, %L, true, true, %L, %L, 5)',
  '7898888800003', 'CM Inserir 5', :'cat_a', 'brasil_nf', 'PUBLICADO', :'loja_a1')) AS ins_5 \gset
SELECT pg_temp.exec_info(format('INSERT INTO public.produtos (codigo_barras, nome, categoria_id, preco_varejo, preco_custo, origem, tem_nf, ativo, status_publicacao, loja_id, preco_custo_medio) VALUES (%L, %L, %L, 50, 5, %L, true, true, %L, %L, NULL)',
  '7898888800004', 'CM Inserir NULL', :'cat_a', 'brasil_nf', 'PUBLICADO', :'loja_a1')) AS ins_null \gset
SELECT pg_temp.exec_info(format('INSERT INTO public.produtos (codigo_barras, nome, categoria_id, preco_varejo, preco_custo, origem, tem_nf, ativo, status_publicacao, loja_id, preco_custo_medio) VALUES (%L, %L, %L, 50, 5, %L, true, true, %L, %L, 0)',
  '7898888800005', 'CM Inserir 0', :'cat_a', 'brasil_nf', 'PUBLICADO', :'loja_a1')) AS ins_0 \gset
SELECT pg_temp.ok(:'ins_5' LIKE 'ERRO:PRODUTO_CUSTO_MEDIO_LEGADO%'
  AND :'ins_null' LIKE 'ERRO:%'
  AND :'ins_0' = 'LINHAS:1',
  'INSERT: valor diferente de zero e NULL bloqueados; zero explícito permitido');

-- ==================================================== autenticado: gerente da loja A ==
-- Prova prévia de visibilidade: escrita benigna de outra coluna afeta a linha
SELECT set_config('request.jwt.claim.sub', :'ger_a1', true) \gset
SET LOCAL ROLE authenticated;
SELECT pg_temp.exec_info(format('UPDATE public.produtos SET preco_varejo = 101 WHERE id = %L', :'prod_a')) AS benigno_a \gset
SELECT pg_temp.exec_info(format('UPDATE public.produtos SET preco_custo_medio = 0 WHERE id = %L', :'prod_a')) AS reenvio_zero \gset
SELECT pg_temp.exec_info(format('UPDATE public.produtos SET preco_custo_medio = 5 WHERE id = %L', :'prod_a')) AS auth_5 \gset
SELECT pg_temp.exec_info(format('UPDATE public.produtos SET preco_custo_medio = NULL WHERE id = %L', :'prod_a')) AS auth_null \gset
-- Reenvio com valor literal 0. A forma "= preco_custo_medio" não é possível para authenticated:
-- o privilégio N1 nega a leitura da coluna (ver asserção de privilégio abaixo).
SELECT pg_temp.exec_info(format('UPDATE public.produtos SET preco_custo_medio = 0, preco_varejo = 102 WHERE id = %L', :'prod_a')) AS outro_campo \gset
SELECT pg_temp.exec_info(format('UPDATE public.produtos SET preco_custo_medio = preco_custo_medio WHERE id = %L', :'prod_a')) AS eco_expressao \gset
RESET ROLE;
SELECT pg_temp.ok(:'benigno_a' = 'LINHAS:1', 'prova prévia: gerente da loja A enxerga e atualiza o próprio produto');
SELECT pg_temp.ok(:'reenvio_zero' = 'LINHAS:1',
  'UPDATE reenviando o valor atual (0) é permitido');
SELECT pg_temp.ok(:'eco_expressao' LIKE 'ERRO:permission denied%',
  'privilégio N1: authenticated não lê preco_custo_medio, então não pode reenviá-lo por expressão');
SELECT pg_temp.ok(:'auth_5' LIKE 'ERRO:PRODUTO_CUSTO_MEDIO_LEGADO%' AND :'auth_null' LIKE 'ERRO:%',
  'UPDATE para valor diferente do atual (5 e NULL) é bloqueado para o gerente');
SELECT pg_temp.ok(:'outro_campo' = 'LINHAS:1',
  'UPDATE de outro campo, com o campo legado reenviado, é permitido: ' || :'outro_campo');
SELECT pg_temp.ok((SELECT preco_custo_medio = 0 AND preco_varejo = 102 FROM public.produtos WHERE id = :'prod_a'),
  'após tentativas bloqueadas, o valor legado permanece 0 e a atualização legítima foi aplicada');

-- ============================================================== service_role e owner ==
SELECT set_config('request.jwt.claim.sub', '', true) \gset
SET LOCAL ROLE service_role;
SELECT pg_temp.exec_info(format('UPDATE public.produtos SET preco_custo_medio = 5 WHERE id = %L', :'prod_a')) AS svc_5 \gset
RESET ROLE;
SELECT pg_temp.ok(:'svc_5' LIKE 'ERRO:PRODUTO_CUSTO_MEDIO_LEGADO%', 'service_role também é bloqueado (regra vale para todos os roles)');

-- ============================================================ isolamento entre empresas ==
-- Gerente da loja A tenta o produto da empresa B: a RLS não enxerga a linha (0 linhas, sem efeito)
SELECT set_config('request.jwt.claim.sub', :'ger_a1', true) \gset
SET LOCAL ROLE authenticated;
SELECT pg_temp.exec_info(format('UPDATE public.produtos SET preco_custo_medio = 5 WHERE id = %L', :'prod_b')) AS cross_tenant \gset
RESET ROLE;
SELECT pg_temp.ok(:'cross_tenant' = 'LINHAS:0' AND (SELECT preco_custo_medio = 0 FROM public.produtos WHERE id = :'prod_b'),
  'isolamento: gerente de A não altera o campo de produto de B (0 linhas, valor inalterado)');

-- Dono da empresa B: prova prévia benigna e depois a tentativa bloqueada no próprio tenant
SELECT set_config('request.jwt.claim.sub', :'dono_b', true) \gset
SET LOCAL ROLE authenticated;
SELECT pg_temp.exec_info(format('UPDATE public.produtos SET preco_varejo = 103 WHERE id = %L', :'prod_b')) AS dono_b_benigno \gset
SELECT pg_temp.exec_info(format('UPDATE public.produtos SET preco_custo_medio = 5 WHERE id = %L', :'prod_b')) AS dono_b_5 \gset
RESET ROLE;
SELECT pg_temp.ok(:'dono_b_benigno' = 'LINHAS:1' AND :'dono_b_5' LIKE 'ERRO:PRODUTO_CUSTO_MEDIO_LEGADO%',
  'dono da empresa B: no próprio tenant a tentativa é bloqueada (prova prévia com linha visível)');

-- ============================================================ valor legado não zero ==
-- Simula legado (linha gravada antes do bloqueio) desabilitando o trigger só nesta transação
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE public.produtos DISABLE TRIGGER trg_produtos_custo_medio_legado_bloqueio;
UPDATE public.produtos SET preco_custo_medio = 7 WHERE id = :'prod_a';
ALTER TABLE public.produtos ENABLE TRIGGER trg_produtos_custo_medio_legado_bloqueio;

SELECT set_config('request.jwt.claim.sub', :'ger_a1', true) \gset
SET LOCAL ROLE authenticated;
SELECT pg_temp.exec_info(format('UPDATE public.produtos SET preco_varejo = 104 WHERE id = %L', :'prod_a')) AS legado_outro \gset
SELECT pg_temp.exec_info(format('UPDATE public.produtos SET preco_custo_medio = 7 WHERE id = %L', :'prod_a')) AS legado_reenvio \gset
SELECT pg_temp.exec_info(format('UPDATE public.produtos SET preco_custo_medio = 8 WHERE id = %L', :'prod_a')) AS legado_8 \gset
SELECT pg_temp.exec_info(format('UPDATE public.produtos SET preco_custo_medio = 0 WHERE id = %L', :'prod_a')) AS legado_0 \gset
RESET ROLE;
SELECT pg_temp.ok(:'legado_outro' = 'LINHAS:1' AND :'legado_reenvio' = 'LINHAS:1',
  'legado não zero: outro campo e reenvio do valor atual (7) são permitidos');
SELECT pg_temp.ok(:'legado_8' LIKE 'ERRO:PRODUTO_CUSTO_MEDIO_LEGADO%' AND :'legado_0' LIKE 'ERRO:PRODUTO_CUSTO_MEDIO_LEGADO%',
  'legado não zero: trocar para outro valor (8) ou para zero é bloqueado');

-- ============================================================ efeitos colaterais ==
-- Nenhuma tentativa bloqueada gera histórico de preço nem altera custo publicado
SELECT pg_temp.ok(
  (SELECT count(*) FROM public.historico_precos_produto WHERE produto_id = :'prod_a' AND preco_custo_anterior IS DISTINCT FROM preco_custo_novo) = 0
  AND (SELECT preco_custo FROM public.produtos WHERE id = :'prod_a') = 10,
  'tentativas bloqueadas não geram histórico de custo nem alteram preco_custo publicado');

-- Catálogo de funções: a função do trigger não é executável por anon
SELECT pg_temp.ok(NOT has_function_privilege('anon', 'public.trg_produtos_custo_medio_legado_bloqueio()', 'EXECUTE'),
  'função do trigger não executável por anon');

ROLLBACK;
