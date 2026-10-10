-- ============================================================================
-- Teste da F2 (pendente). Rodar SOMENTE em banco local com a F2 aplicada.
-- BEGIN … ROLLBACK: nada persiste.
-- ============================================================================
\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.f2_check(p_ok boolean, p_nome text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'F2 FAIL: %', p_nome; END IF;
  RAISE NOTICE 'F2 OK: %', p_nome;
END $$;

SELECT set_config('request.jwt.claim.sub', '', true) \gset

-- T1 tipos
SELECT pg_temp.f2_check(
  (SELECT string_agg(table_name || '.' || column_name || '=' || numeric_precision || ',' || numeric_scale, ' ' ORDER BY table_name, column_name)
     FROM information_schema.columns
    WHERE table_schema = 'public'
      AND ((table_name = 'produtos' AND column_name IN ('preco_custo', 'preco_custo_medio'))
        OR (table_name = 'importacoes_nfe_itens' AND column_name = 'custo_unitario')
        OR (table_name = 'itens_venda' AND column_name = 'custo_unitario_snap')))
  = 'importacoes_nfe_itens.custo_unitario=14,6 itens_venda.custo_unitario_snap=10,2 produtos.preco_custo=14,6 produtos.preco_custo_medio=14,6',
  'T1 custo unitário em numeric(14,6); histórico de vendas (custo_unitario_snap) intocado');

-- T2 view, grants e trigger recriados
SELECT pg_temp.f2_check(
  has_table_privilege('authenticated', 'public.produtos_custos', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.produtos_custos', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.produtos_custos', 'INSERT,UPDATE,DELETE')
  AND NOT has_column_privilege('authenticated', 'public.produtos', 'preco_custo', 'SELECT')
  AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_produtos_margem_bu')
  AND pg_get_viewdef('public.produtos_custos'::regclass) LIKE '%fp_lojas_cerca%',
  'T2 produtos_custos (com cerca e grants) e trg_produtos_margem_bu recriados; preco_custo segue sem SELECT direto');

-- Fixtures
SELECT id AS emp FROM public.empresas WHERE origem = 'LEGADA_M1' \gset
INSERT INTO public.lojas (nome, codigo, empresa_id) VALUES ('F2 loja', 'F2-L', :'emp') RETURNING id AS loja \gset
INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'dono.f2@f2.test') RETURNING id AS dono \gset
INSERT INTO public.usuarios (id, nome, perfil, loja_id, ativo) VALUES (:'dono', 'F2 Dono', 'DONO', :'loja', true);
INSERT INTO public.categorias (nome) VALUES ('F2 cat') RETURNING id AS cat \gset
INSERT INTO public.produtos (codigo_barras, nome, categoria_id, preco_varejo, preco_custo, origem, tem_nf, ativo, status_publicacao, loja_id)
  VALUES ('7899999933001', 'F2 parafuso', :'cat', 0.10, 0.0345, 'brasil_nf', true, true, 'PUBLICADO', :'loja') RETURNING id AS prod \gset
INSERT INTO public.produtos (codigo_barras, nome, categoria_id, preco_varejo, preco_custo, origem, tem_nf, ativo, status_publicacao, loja_id)
  VALUES ('7899999933002', 'F2 arruela', :'cat', 0.05, 0.005, 'brasil_nf', true, true, 'PUBLICADO', :'loja') RETURNING id AS prod2 \gset

-- T3 sem perda: 0,0345 e 0,005 (antes: 0,03 e 0,01 — erro de −13% e +100%, doc 10 T-RND-03)
SELECT set_config('request.jwt.claim.sub', :'dono', true) \gset
SET LOCAL ROLE authenticated;
SELECT (SELECT preco_custo FROM public.produtos_custos WHERE produto_id = :'prod')::text AS c1,
       (SELECT preco_custo FROM public.produtos_custos WHERE produto_id = :'prod2')::text AS c2 \gset
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true) \gset
SELECT pg_temp.f2_check(:'c1' = '0.034500' AND :'c2' = '0.005000',
  'T3 custo 0,0345 e 0,005 gravados e lidos sem perda (via produtos_custos)');

-- T4 margem de atacado compara com o custo exato (antes: custo arredondado para 0,03)
DO $$
BEGIN
  BEGIN
    INSERT INTO public.precos_atacado (produto_id, quantidade_minima, preco_unitario, loja_id)
      SELECT id, 10, 0.034, loja_id FROM public.produtos WHERE codigo_barras = '7899999933001';
    RAISE EXCEPTION 'F2 FAIL: atacado abaixo do custo aceito';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'F2 FAIL%' THEN RAISE; END IF;
    IF SQLERRM <> 'PRECO_ATACADO_ABAIXO_CUSTO' THEN RAISE; END IF;
  END;
END $$;
SELECT pg_temp.f2_check(true, 'T4 atacado 0,034 < custo 0,0345 é recusado (sem arredondamento prematuro)');

-- T5 trigger de margem de produto continua ativo (varejo abaixo do custo)
DO $$
BEGIN
  BEGIN
    UPDATE public.produtos SET preco_varejo = 0.03 WHERE codigo_barras = '7899999933001';
    RAISE EXCEPTION 'F2 FAIL: varejo abaixo do custo aceito';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'F2 FAIL%' THEN RAISE; END IF;
  END;
END $$;
SELECT pg_temp.f2_check(true, 'T5 trg_produtos_margem_bu segue barrando varejo abaixo do custo');

-- T6 gravador de NF-e inalterado nesta etapa (ativação de 6 casas é a etapa seguinte)
SELECT pg_temp.f2_check(
  (SELECT prosrc FROM pg_proc WHERE proname = 'importar_nfe_transacao') LIKE '%ROUND(v_custo_unit, 2)%',
  'T6 importar_nfe_transacao continua gravando custo em 2 casas (sem mudança de comportamento)');

ROLLBACK;
