-- ============================================================================
-- F3 — salvaguardas de NF-e (migration 20261010150000). BEGIN … ROLLBACK. Banco LOCAL.
--   D7: trava de recebimento duplicado OC × NF-e (rollout por empresa)
--   D5: relatório de vínculos (somente leitura)
-- ============================================================================
\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.f3_check(p_ok boolean, p_nome text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'F3 FAIL: %', p_nome; END IF;
  RAISE NOTICE 'F3 OK: %', p_nome;
END $$;

SELECT set_config('request.jwt.claim.sub', '', true) \gset

-- ---------------------------------------------------------------- fixtures --
INSERT INTO public.empresas (nome) VALUES ('F3 Empresa') RETURNING id AS emp \gset
INSERT INTO public.lojas (nome, codigo, empresa_id) VALUES ('F3 Loja', 'F3-L', :'emp') RETURNING id AS loja \gset
INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'gerente.f3@f3.test') RETURNING id AS ger \gset
INSERT INTO public.usuarios (id, nome, perfil, loja_id, ativo) VALUES (:'ger', 'F3 Gerente', 'GERENTE', :'loja', true);
INSERT INTO public.categorias (nome) VALUES ('F3 cat') RETURNING id AS cat \gset
INSERT INTO public.produtos (codigo_barras, nome, categoria_id, preco_varejo, preco_custo, origem, tem_nf, ativo, status_publicacao, loja_id)
  VALUES ('7899999944001', 'F3 Produto', :'cat', 100, 10, 'brasil_nf', true, true, 'PUBLICADO', :'loja') RETURNING id AS prod \gset
INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual, estoque_minimo, version) VALUES (:'prod', :'loja', 0, 0, 0);
INSERT INTO public.fornecedores (nome, cnpj, loja_id) VALUES ('F3 Fornecedor', '11222333000181', :'loja') RETURNING id AS forn \gset

-- OC recebida fisicamente (entrada de 10 un), sem documento fiscal
INSERT INTO public.ordens_compra (loja_id, fornecedor_id, fornecedor_nome, status) VALUES (:'loja', :'forn', 'F3 Fornecedor', 'RECEBIDA') RETURNING id AS oc \gset
INSERT INTO public.ordens_compra_itens (ordem_id, produto_id, descricao, quantidade, preco_unitario, quantidade_recebida)
  VALUES (:'oc', :'prod', 'F3 Produto', 10, 10, 10) RETURNING id AS oc_item \gset
INSERT INTO public.ordens_compra_recebimentos (loja_id, ordem_id, ordem_item_id, origem, entrada_id, produto_id, quantidade_esperada, quantidade)
  VALUES (:'loja', :'oc', :'oc_item', 'ORDEM_COMPRA', gen_random_uuid(), :'prod', 10, 10);
UPDATE public.estoque SET quantidade_atual = 10 WHERE produto_id = :'prod' AND loja_id = :'loja';

-- NF-e do mesmo fornecedor, mesmos produtos, SEM vínculo com a OC (cenário A-05), já conferida
CREATE FUNCTION pg_temp.nova_nfe(p_chave text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v uuid;
BEGIN
  INSERT INTO public.importacoes_nfe (chave_acesso, numero_nf, fornecedor_id, loja_id, usuario_id, status)
  VALUES (p_chave, '1', current_setting('f3.forn')::uuid, current_setting('f3.loja')::uuid, current_setting('f3.ger')::uuid, 'EM_CONFERENCIA')
  RETURNING id INTO v;
  INSERT INTO public.importacoes_nfe_itens (importacao_nfe_id, produto_id, quantidade_nfe, custo_unitario, atualizar_custo,
                                            status_conferencia, quantidade_conferida)
  VALUES (v, current_setting('f3.prod')::uuid, 10, 0, false, 'CONFERIDO', 10);
  RETURN v;
END $$;
SELECT set_config('f3.forn', :'forn', true), set_config('f3.loja', :'loja', true),
       set_config('f3.ger', :'ger', true), set_config('f3.prod', :'prod', true), set_config('f3.emp', :'emp', true) \gset

-- ========================================================= D7: rollout OFF ==
SELECT pg_temp.nova_nfe(repeat('1', 44)) AS nfe_off \gset
SELECT count(*) AS n_susp FROM public._nfe_recebimentos_suspeitos(:'nfe_off') \gset
SELECT pg_temp.f3_check(:n_susp = 1, 'D7-1 detecção: recebimento de OC sem documento é suspeito para a NF-e sem vínculo');

SELECT set_config('request.jwt.claim.sub', :'ger', true) \gset
SAVEPOINT s_off;
SELECT public.confirmar_importacao_nfe(:'nfe_off');
SELECT quantidade_atual AS est_off FROM public.estoque WHERE produto_id = :'prod' AND loja_id = :'loja' \gset
ROLLBACK TO SAVEPOINT s_off;
SELECT set_config('request.jwt.claim.sub', '', true) \gset
SELECT pg_temp.f3_check(:est_off = 20,
  'D7-2 rollout DESLIGADO: comportamento atual inalterado (NF-e conclui e credita, 10 → 20)');

-- ========================================================== D7: rollout ON ==
SET LOCAL ROLE service_role;
SELECT public.ops_definir_modulo_empresa(:'emp', 'ROLLOUT_NFE_TRAVA_RECEBIMENTO', true, 'teste F3',
  'ativa a trava D7 só para a empresa de teste', 'teste-f3');
RESET ROLE;

SELECT set_config('request.jwt.claim.sub', :'ger', true) \gset
DO $$
BEGIN
  BEGIN
    PERFORM public.confirmar_importacao_nfe((SELECT id FROM public.importacoes_nfe WHERE chave_acesso = repeat('1', 44)));
    RAISE EXCEPTION 'F3 FAIL: NF-e sem vínculo concluiu com recebimento anterior suspeito';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'NFE_POSSIVEL_RECEBIMENTO_DUPLICADO' THEN RAISE; END IF;
  END;
END $$;
SELECT set_config('request.jwt.claim.sub', '', true) \gset
SELECT pg_temp.f3_check(
  (SELECT quantidade_atual FROM public.estoque WHERE produto_id = :'prod' AND loja_id = :'loja') = 10
  AND (SELECT status FROM public.importacoes_nfe WHERE id = :'nfe_off') = 'EM_CONFERENCIA',
  'D7-3 rollout LIGADO: conclusão bloqueada, estoque intacto (10), documento continua pendente (registrável)');

-- conferência humana: justificativa curta recusada; válida libera
SELECT set_config('request.jwt.claim.sub', :'ger', true) \gset
DO $$
BEGIN
  BEGIN
    PERFORM public.nfe_registrar_conferencia_recebimento_anterior(
      (SELECT id FROM public.importacoes_nfe WHERE chave_acesso = repeat('1', 44)), 'curta');
    RAISE EXCEPTION 'F3 FAIL: justificativa curta aceita';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'NFE_CONFERENCIA_JUSTIFICATIVA_OBRIGATORIA' THEN RAISE; END IF;
  END;
END $$;
SELECT count(*) AS n_tela FROM public.nfe_recebimentos_anteriores_suspeitos(:'nfe_off') \gset
SELECT public.nfe_registrar_conferencia_recebimento_anterior(:'nfe_off',
  'Mercadoria diferente: segunda remessa paga à parte, conferida fisicamente');
SAVEPOINT s_conf;
SELECT public.confirmar_importacao_nfe(:'nfe_off');
SELECT quantidade_atual AS est_conf FROM public.estoque WHERE produto_id = :'prod' AND loja_id = :'loja' \gset
ROLLBACK TO SAVEPOINT s_conf;
SELECT set_config('request.jwt.claim.sub', '', true) \gset
SELECT pg_temp.f3_check(:n_tela = 1 AND :est_conf = 20
  AND (SELECT conferencia_recebimento_anterior ->> 'por' FROM public.importacoes_nfe WHERE id = :'nfe_off') = :'ger',
  'D7-4 conferência registrada (quem, quando, justificativa, suspeitos) libera a conclusão');

-- vínculo explícito com a OC: segue o fluxo canônico (que recusa OC já RECEBIDA — não duplica)
SELECT pg_temp.nova_nfe(repeat('2', 44)) AS nfe_oc \gset
UPDATE public.importacoes_nfe SET ordem_compra_id = :'oc' WHERE id = :'nfe_oc';
SELECT set_config('request.jwt.claim.sub', :'ger', true) \gset
DO $$
BEGIN
  BEGIN
    PERFORM public.confirmar_importacao_nfe((SELECT id FROM public.importacoes_nfe WHERE chave_acesso = repeat('2', 44)));
    RAISE EXCEPTION 'F3 FAIL: NF-e vinculada a OC já recebida concluiu';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'OC_STATUS_INVALIDO' THEN RAISE; END IF;
  END;
END $$;
SELECT set_config('request.jwt.claim.sub', '', true) \gset
SELECT pg_temp.f3_check((SELECT quantidade_atual FROM public.estoque WHERE produto_id = :'prod' AND loja_id = :'loja') = 10,
  'D7-5 NF-e vinculada à OC já recebida: fluxo canônico recusa (OC_STATUS_INVALIDO), sem crédito duplicado');

-- sem recebimento anterior: nada a travar
SELECT set_config('request.jwt.claim.sub', '', true) \gset
DELETE FROM public.importacoes_nfe_itens WHERE importacao_nfe_id = :'nfe_oc';
UPDATE public.importacoes_nfe SET ordem_compra_id = NULL WHERE id = :'nfe_oc';
INSERT INTO public.produtos (codigo_barras, nome, categoria_id, preco_varejo, preco_custo, origem, tem_nf, ativo, status_publicacao, loja_id)
  VALUES ('7899999944002', 'F3 Outro', :'cat', 100, 10, 'brasil_nf', true, true, 'PUBLICADO', :'loja') RETURNING id AS prod2 \gset
INSERT INTO public.importacoes_nfe_itens (importacao_nfe_id, produto_id, quantidade_nfe, custo_unitario, atualizar_custo, status_conferencia, quantidade_conferida)
  VALUES (:'nfe_oc', :'prod2', 5, 0, false, 'CONFERIDO', 5);
SELECT set_config('request.jwt.claim.sub', :'ger', true) \gset
SELECT public.confirmar_importacao_nfe(:'nfe_oc');
SELECT set_config('request.jwt.claim.sub', '', true) \gset
SELECT pg_temp.f3_check((SELECT status FROM public.importacoes_nfe WHERE id = :'nfe_oc') = 'CONCLUIDA',
  'D7-6 rollout ligado, produtos sem recebimento anterior: conclui normalmente (sem falso positivo)');

-- identidade e cerca na consulta da tela
SELECT set_config('request.jwt.claim.sub', '', true) \gset
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.nfe_recebimentos_anteriores_suspeitos((SELECT id FROM public.importacoes_nfe WHERE chave_acesso = repeat('1', 44)));
    RAISE EXCEPTION 'F3 FAIL: consulta sem identidade';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
SELECT pg_temp.f3_check(true, 'D7-7 consulta de suspeitos exige identidade e loja autorizada');

-- ============================================================ D5: relatório ==
INSERT INTO public.vinculos_fornecedor_produto (loja_id, fornecedor_id, ref_fornecedor, produto_id) VALUES
  (:'loja', :'forn', '123', :'prod'),          -- numérico: possivelmente normalizado
  (:'loja', :'forn', '0123', :'prod2'),        -- igual sem zeros, OUTRO produto: colisão
  (:'loja', :'forn', '00777', :'prod'),
  (:'loja', :'forn', '777', :'prod'),          -- igual sem zeros, MESMO produto: equivalente
  (:'loja', :'forn', '12345678901234567890', :'prod2'),  -- 20 dígitos: provável corrupção
  (:'loja', :'forn', 'ABC-1', :'prod');
SELECT string_agg(classe || ':' || ref_fornecedor, ',' ORDER BY classe, ref_fornecedor) AS rel
  FROM public.ops_relatorio_vinculos_d5() WHERE loja_id = :'loja' AND classe <> 'GTIN_POSSIVELMENTE_NORMALIZADO' \gset
SELECT pg_temp.f3_check(
  :'rel' = 'COLISAO_PRODUTOS_DIFERENTES:0123,COLISAO_PRODUTOS_DIFERENTES:123,EQUIVALENTE_MESMO_PRODUTO:00777,EQUIVALENTE_MESMO_PRODUTO:777,POSSIVELMENTE_NORMALIZADA:123,POSSIVELMENTE_NORMALIZADA:12345678901234567890,POSSIVELMENTE_NORMALIZADA:777,REFERENCIA_CORROMPIDA_PROVAVEL:12345678901234567890',
  'D5 relatório classifica normalizadas, colisões, equivalentes e corrompidas; ABC-1 fora');
SELECT pg_temp.f3_check(
  NOT has_function_privilege('authenticated', 'public.ops_relatorio_vinculos_d5()', 'EXECUTE')
  AND (SELECT count(*) FROM public.vinculos_fornecedor_produto WHERE loja_id = :'loja') = 6,
  'D5 relatório só para service_role e não altera vínculos');

ROLLBACK;
