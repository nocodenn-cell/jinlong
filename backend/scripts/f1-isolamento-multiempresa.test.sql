-- ============================================================================
-- F1 — isolamento entre empresas (migration 20261010130000).
-- Executa dentro de BEGIN … ROLLBACK: nada persiste. Banco LOCAL apenas.
--   psql -v ON_ERROR_STOP=1 -f backend/scripts/f1-isolamento-multiempresa.test.sql
--
-- Cobertura:
--   S*  sincronização usuarios → usuario_vinculos (LEGADO/DIRETO)
--   L*  lojas: criação, edição, titularidade, leitura
--   C*  cerca de empresa A × B (RLS e RPC SECURITY DEFINER)
--   P*  administradores de plataforma (D2) e provisionamento (D1)
--   M*  habilitação comercial e contexto do módulo (D3)
--   E*  equivalência para o cliente atual (empresa legada)
-- ============================================================================
\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.f1_check(p_ok boolean, p_nome text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF p_ok IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'F1 FAIL: %', p_nome;
  END IF;
  RAISE NOTICE 'F1 OK: %', p_nome;
END $$;

-- Fixtures sem identidade simulada.
SELECT set_config('request.jwt.claim.sub', '', true) \gset

-- ---------------------------------------------------------------- fixtures --
INSERT INTO public.empresas (nome, status) VALUES ('F1 Empresa A', 'ATIVA') RETURNING id AS emp_a \gset
INSERT INTO public.empresas (nome, status) VALUES ('F1 Empresa B', 'ATIVA') RETURNING id AS emp_b \gset
SELECT id AS emp_legada FROM public.empresas WHERE origem = 'LEGADA_M1' \gset

INSERT INTO public.lojas (nome, codigo, ativo, empresa_id) VALUES ('F1 A1', 'F1-A1', true, :'emp_a') RETURNING id AS loja_a1 \gset
INSERT INTO public.lojas (nome, codigo, ativo, empresa_id) VALUES ('F1 A2', 'F1-A2', true, :'emp_a') RETURNING id AS loja_a2 \gset
INSERT INTO public.lojas (nome, codigo, ativo, empresa_id) VALUES ('F1 B1', 'F1-B1', true, :'emp_b') RETURNING id AS loja_b1 \gset
INSERT INTO public.lojas (nome, codigo, ativo, empresa_id) VALUES ('F1 Legada', 'F1-LEG', true, :'emp_legada') RETURNING id AS loja_leg \gset

INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'dono.a@f1.test')      RETURNING id AS dono_a \gset
INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'gerente.a1@f1.test')  RETURNING id AS gerente_a1 \gset
INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'operador.a1@f1.test') RETURNING id AS operador_a1 \gset
INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'dono.b@f1.test')      RETURNING id AS dono_b \gset
INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'gerente.b1@f1.test')  RETURNING id AS gerente_b1 \gset
INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'admin.leg@f1.test')   RETURNING id AS admin_leg \gset
INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'dono.leg@f1.test')    RETURNING id AS dono_leg \gset
INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'gerente.leg@f1.test') RETURNING id AS gerente_leg \gset
INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'plat.prov@f1.test')   RETURNING id AS plat_prov \gset
INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'plat.com@f1.test')    RETURNING id AS plat_com \gset
INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'sem.vinculo@f1.test') RETURNING id AS sem_vinculo \gset

INSERT INTO public.usuarios (id, nome, perfil, loja_id, ativo) VALUES
  (:'dono_a', 'F1 Dono A', 'DONO', :'loja_a1', true),
  (:'gerente_a1', 'F1 Gerente A1', 'GERENTE', :'loja_a1', true),
  (:'operador_a1', 'F1 Operador A1', 'OPERADOR', :'loja_a1', true),
  (:'dono_b', 'F1 Dono B', 'DONO', :'loja_b1', true),
  (:'gerente_b1', 'F1 Gerente B1', 'GERENTE', :'loja_b1', true),
  (:'admin_leg', 'F1 Admin legado', 'ADMIN', :'loja_leg', true),
  (:'dono_leg', 'F1 Dono legado', 'DONO', :'loja_leg', true),
  (:'gerente_leg', 'F1 Gerente legado', 'GERENTE', :'loja_leg', true),
  (:'plat_prov', 'F1 Plataforma provisionamento', 'ADMIN', :'loja_leg', true),
  (:'plat_com', 'F1 Plataforma comercial', 'ADMIN', :'loja_leg', true);

INSERT INTO public.categorias (nome) VALUES ('F1 Categoria') RETURNING id AS cat \gset
INSERT INTO public.produtos (codigo_barras, nome, categoria_id, preco_varejo, preco_custo, origem, tem_nf, ativo, status_publicacao, loja_id)
  VALUES ('7899999911001', 'F1 Produto A', :'cat', 200.00, 50.00, 'brasil_nf', true, true, 'PUBLICADO', :'loja_a1') RETURNING id AS prod_a \gset
INSERT INTO public.produtos (codigo_barras, nome, categoria_id, preco_varejo, preco_custo, origem, tem_nf, ativo, status_publicacao, loja_id)
  VALUES ('7899999911002', 'F1 Produto B', :'cat', 200.00, 50.00, 'brasil_nf', true, true, 'PUBLICADO', :'loja_b1') RETURNING id AS prod_b \gset
INSERT INTO public.produtos (codigo_barras, nome, categoria_id, preco_varejo, preco_custo, origem, tem_nf, ativo, status_publicacao, loja_id)
  VALUES ('7899999911003', 'F1 Produto Legado', :'cat', 200.00, 50.00, 'brasil_nf', true, true, 'PUBLICADO', :'loja_leg') RETURNING id AS prod_leg \gset
INSERT INTO public.estoque (produto_id, loja_id, quantidade_atual, estoque_minimo, version) VALUES
  (:'prod_a', :'loja_a1', 10, 0, 0), (:'prod_b', :'loja_b1', 10, 0, 0), (:'prod_leg', :'loja_leg', 10, 0, 0);
INSERT INTO public.caixas (loja_id, operador_id, status, valor_inicial, data_abertura)
  VALUES (:'loja_a1', :'gerente_a1', 'ABERTO', 0, now()) RETURNING id AS caixa_a \gset
INSERT INTO public.caixas (loja_id, operador_id, status, valor_inicial, data_abertura)
  VALUES (:'loja_b1', :'gerente_b1', 'ABERTO', 0, now()) RETURNING id AS caixa_b \gset

-- Variáveis para blocos DO (psql não interpola dentro de dollar quotes)
SELECT set_config('f1.loja_a1', :'loja_a1', true), set_config('f1.loja_b1', :'loja_b1', true),
       set_config('f1.prod_b', :'prod_b', true), set_config('f1.emp_a', :'emp_a', true),
       set_config('f1.emp_b', :'emp_b', true), set_config('f1.dono_a', :'dono_a', true),
       set_config('f1.dono_b', :'dono_b', true), set_config('f1.plat_prov', :'plat_prov', true),
       set_config('f1.loja_leg', :'loja_leg', true) \gset

-- ======================================================= S: sincronização ==
SELECT pg_temp.f1_check(
  (SELECT count(*) FROM public.usuario_vinculos v WHERE v.usuario_id = :'gerente_a1'
      AND v.origem = 'LEGADO' AND v.ativo AND v.papel = 'GERENTE' AND v.loja_id = :'loja_a1' AND v.empresa_id = :'emp_a') = 1
  AND (SELECT count(*) FROM public.usuario_vinculos v WHERE v.usuario_id = :'dono_a'
      AND v.origem = 'LEGADO' AND v.ativo AND v.papel = 'DONO' AND v.loja_id IS NULL AND v.empresa_id = :'emp_a') = 1,
  'S1 INSERT em usuarios cria vínculo LEGADO (GERENTE na loja; DONO na empresa)');

SELECT pg_temp.f1_check(
  NOT EXISTS (SELECT 1 FROM public.usuario_vinculos WHERE usuario_id IN (:'admin_leg', :'plat_prov', :'plat_com'))
  AND NOT EXISTS (SELECT 1 FROM public.plataforma_admins
                   WHERE usuario_id IN (:'admin_leg', :'plat_prov', :'plat_com', :'dono_a', :'dono_b')),
  'S2 ADMIN legado não recebe vínculo nem vira plataforma (D2)');

-- Vínculo DIRETO independente para o gerente A1 (loja A2)
INSERT INTO public.usuario_vinculos (usuario_id, empresa_id, loja_id, papel, ativo, origem)
  VALUES (:'gerente_a1', :'emp_a', :'loja_a2', 'GERENTE', true, 'DIRETO');

-- Promoção legada GERENTE → DONO (fluxo admin/provisionamento)
UPDATE public.usuarios SET perfil = 'DONO' WHERE id = :'gerente_a1';
SELECT pg_temp.f1_check(
  NOT EXISTS (SELECT 1 FROM public.usuario_vinculos WHERE usuario_id = :'gerente_a1' AND origem = 'LEGADO' AND papel = 'GERENTE' AND ativo)
  AND EXISTS (SELECT 1 FROM public.usuario_vinculos WHERE usuario_id = :'gerente_a1' AND origem = 'LEGADO' AND papel = 'GERENTE' AND NOT ativo)
  AND EXISTS (SELECT 1 FROM public.usuario_vinculos WHERE usuario_id = :'gerente_a1' AND origem = 'LEGADO' AND papel = 'DONO' AND ativo)
  AND EXISTS (SELECT 1 FROM public.usuario_vinculos WHERE usuario_id = :'gerente_a1' AND origem = 'DIRETO' AND loja_id = :'loja_a2' AND ativo),
  'S3 mudança de papel: LEGADO anterior desativado (não apagado), novo criado, DIRETO intocado');

UPDATE public.usuarios SET perfil = 'GERENTE' WHERE id = :'gerente_a1';
SELECT pg_temp.f1_check(
  (SELECT count(*) FROM public.usuario_vinculos WHERE usuario_id = :'gerente_a1' AND origem = 'LEGADO' AND ativo) = 1
  AND EXISTS (SELECT 1 FROM public.usuario_vinculos WHERE usuario_id = :'gerente_a1' AND origem = 'LEGADO' AND papel = 'GERENTE' AND loja_id = :'loja_a1' AND ativo),
  'S4 volta ao papel anterior reativa o mesmo vínculo (sem duplicar)');

-- Troca de loja (OPERADOR A1 → A2) e desativação
UPDATE public.usuarios SET loja_id = :'loja_a2' WHERE id = :'operador_a1';
SELECT pg_temp.f1_check(
  EXISTS (SELECT 1 FROM public.usuario_vinculos WHERE usuario_id = :'operador_a1' AND loja_id = :'loja_a2' AND ativo)
  AND NOT EXISTS (SELECT 1 FROM public.usuario_vinculos WHERE usuario_id = :'operador_a1' AND loja_id = :'loja_a1' AND ativo),
  'S5 troca de loja move a autorização (a loja anterior deixa de valer)');
UPDATE public.usuarios SET loja_id = :'loja_a1' WHERE id = :'operador_a1';

UPDATE public.usuarios SET ativo = false WHERE id = :'operador_a1';
SELECT pg_temp.f1_check(
  NOT EXISTS (SELECT 1 FROM public.usuario_vinculos WHERE usuario_id = :'operador_a1' AND ativo),
  'S6 desativação do usuário desativa os vínculos LEGADO');
UPDATE public.usuarios SET ativo = true WHERE id = :'operador_a1';

-- Usuário passa a ADMIN: perde vínculos LEGADO, não ganha plataforma
UPDATE public.usuarios SET perfil = 'ADMIN' WHERE id = :'gerente_b1';
SELECT pg_temp.f1_check(
  NOT EXISTS (SELECT 1 FROM public.usuario_vinculos WHERE usuario_id = :'gerente_b1' AND ativo)
  AND NOT EXISTS (SELECT 1 FROM public.plataforma_admins WHERE usuario_id = :'gerente_b1'),
  'S7 virar ADMIN legado desativa vínculos e não promove à plataforma');
UPDATE public.usuarios SET perfil = 'GERENTE' WHERE id = :'gerente_b1';

SELECT count(*) AS n_div FROM public.fp_divergencias_vinculos_legados()
 WHERE usuario_id IN (:'dono_a', :'gerente_a1', :'operador_a1', :'dono_b', :'gerente_b1', :'dono_leg', :'gerente_leg', :'admin_leg') \gset
SELECT pg_temp.f1_check(:n_div = 0, 'S8 equivalência legado × vínculos: zero divergências após as alterações');

-- ============================================================ P: plataforma ==
-- P1: authenticated não executa o procedimento; não lê nem escreve plataforma_admins
SELECT set_config('request.jwt.claim.sub', :'dono_a', true) \gset
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.ops_definir_plataforma_admin(auth.uid(), true, ARRAY['COMERCIAL'], 'autopromoção de teste', 'eu');
    RAISE EXCEPTION 'F1 FAIL: authenticated executou ops_definir_plataforma_admin';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.plataforma_admins (usuario_id, ativo, capacidades) VALUES (auth.uid(), true, ARRAY['COMERCIAL']);
    RAISE EXCEPTION 'F1 FAIL: authenticated inseriu em plataforma_admins';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.plataforma_definir_modulo_empresa(auth.uid(), 'IMPORT_INTELLIGENCE', true, 'x', 'autoatendimento comercial');
    RAISE EXCEPTION 'F1 FAIL: DONO habilitou o próprio módulo';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
SELECT pg_temp.f1_check(true, 'P1 sem autopromoção: authenticated não cadastra plataforma nem habilita módulo');

-- P2: service_role com identidade de usuário também é recusado (procedimento é sem identidade)
SET LOCAL ROLE service_role;
DO $$
BEGIN
  BEGIN
    PERFORM public.ops_definir_plataforma_admin(current_setting('f1.dono_a')::uuid, true, ARRAY['COMERCIAL'], 'tentativa com identidade', 'teste');
    RAISE EXCEPTION 'F1 FAIL: procedimento aceitou identidade de usuário';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
SELECT pg_temp.f1_check(true, 'P2 procedimento de plataforma recusa sessão com identidade de usuário');

-- P3: escrita direta (mesmo service_role, sem identidade) é bloqueada fora do procedimento
SELECT set_config('request.jwt.claim.sub', '', true) \gset
SET LOCAL ROLE service_role;
DO $$
BEGIN
  BEGIN
    INSERT INTO public.plataforma_admins (usuario_id, ativo, capacidades)
      VALUES (current_setting('f1.plat_prov')::uuid, true, ARRAY['PROVISIONAMENTO']);
    RAISE EXCEPTION 'F1 FAIL: escrita direta em plataforma_admins aceita';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
-- P4: procedimento registra com histórico
SELECT public.ops_definir_plataforma_admin(:'plat_prov', true, ARRAY['PROVISIONAMENTO'], 'homologação F1: identidade fictícia', 'runbook-teste');
SELECT public.ops_definir_plataforma_admin(:'plat_com', true, ARRAY['COMERCIAL'], 'homologação F1: identidade fictícia', 'runbook-teste');
RESET ROLE;
SELECT pg_temp.f1_check(true, 'P3 escrita direta em plataforma_admins bloqueada mesmo para service_role');
SELECT pg_temp.f1_check(
  (SELECT count(*) FROM public.plataforma_admins_historico WHERE usuario_id IN (:'plat_prov', :'plat_com') AND acao = 'CONCEDER' AND executado_por = 'runbook-teste') = 2,
  'P4 cadastro explícito de plataforma com histórico (CONCEDER, executor, motivo)');

-- ================================================================ L: lojas ==
-- L1: nenhum usuário de empresa cria loja (D1)
SELECT set_config('request.jwt.claim.sub', :'dono_a', true) \gset
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    INSERT INTO public.lojas (nome, ativo, empresa_id) VALUES ('Criada pelo DONO', true, current_setting('f1.emp_a')::uuid);
    RAISE EXCEPTION 'F1 FAIL: DONO criou loja';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.plataforma_provisionar_loja(current_setting('f1.emp_a')::uuid, 'Via RPC', 'F1-DONO');
    RAISE EXCEPTION 'F1 FAIL: DONO usou o provisionamento de plataforma';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
SELECT pg_temp.f1_check(true, 'L1 DONO/GERENTE não criam loja (nem direto, nem via RPC de plataforma)');

-- L2: sem empresa explícita a loja não nasce (service_role, sem contexto SQL)
SET LOCAL jinlong.empresa_contexto_sql = '';
SELECT set_config('request.jwt.claim.sub', '', true) \gset
SET LOCAL ROLE service_role;
DO $$
BEGIN
  BEGIN
    INSERT INTO public.lojas (nome, ativo) VALUES ('Sem empresa', true);
    RAISE EXCEPTION 'F1 FAIL: loja sem empresa criada';
  EXCEPTION WHEN not_null_violation THEN NULL;
  END;
END $$;
RESET ROLE;
SELECT pg_temp.f1_check(true, 'L2 loja sem empresa é recusada (LOJA_SEM_EMPRESA)');

-- L3: edição — GERENTE só a própria loja; DONO as lojas da empresa; ninguém as de outra empresa
SELECT set_config('request.jwt.claim.sub', :'gerente_a1', true) \gset
SET LOCAL ROLE authenticated;
WITH u AS (UPDATE public.lojas SET telefone = '1100000001' WHERE id = :'loja_a1' RETURNING 1) SELECT count(*) AS g_a1 FROM u \gset
WITH u AS (UPDATE public.lojas SET telefone = '1100000002' WHERE id = :'loja_b1' RETURNING 1) SELECT count(*) AS g_b1 FROM u \gset
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', :'operador_a1', true) \gset
SET LOCAL ROLE authenticated;
WITH u AS (UPDATE public.lojas SET telefone = '1100000003' WHERE id = :'loja_a1' RETURNING 1) SELECT count(*) AS o_a1 FROM u \gset
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', :'dono_a', true) \gset
SET LOCAL ROLE authenticated;
WITH u AS (UPDATE public.lojas SET telefone = '1100000004' WHERE id = :'loja_a2' RETURNING 1) SELECT count(*) AS d_a2 FROM u \gset
WITH u AS (UPDATE public.lojas SET telefone = '1100000005' WHERE id = :'loja_b1' RETURNING 1) SELECT count(*) AS d_b1 FROM u \gset
RESET ROLE;
SELECT pg_temp.f1_check(:g_a1 = 1 AND :g_b1 = 0 AND :o_a1 = 0 AND :d_a2 = 1 AND :d_b1 = 0,
  'L3 edição de loja: GERENTE só a própria, OPERADOR nenhuma, DONO as da empresa, nunca outra empresa');
SELECT pg_temp.f1_check((SELECT telefone FROM public.lojas WHERE id = :'loja_b1') IS NULL,
  'L3b loja de B intacta após tentativas de A');

-- L4: transferência de titularidade (empresa_id) é negada, inclusive para o DONO
SELECT set_config('request.jwt.claim.sub', :'dono_a', true) \gset
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    UPDATE public.lojas SET empresa_id = current_setting('f1.emp_b')::uuid WHERE id = current_setting('f1.loja_a1')::uuid;
    RAISE EXCEPTION 'F1 FAIL: titularidade transferida';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
DO $$
BEGIN
  BEGIN
    UPDATE public.lojas SET empresa_id = current_setting('f1.emp_b')::uuid WHERE id = current_setting('f1.loja_a1')::uuid;
    RAISE EXCEPTION 'F1 FAIL: titularidade transferida por sessão SQL';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
SELECT pg_temp.f1_check(true, 'L4 empresa_id imutável (DONO e sessão SQL não transferem titularidade)');

-- L5: leitura de lojas
SELECT set_config('request.jwt.claim.sub', :'operador_a1', true) \gset
SET LOCAL ROLE authenticated;
SELECT count(*) FILTER (WHERE id IN (:'loja_a1', :'loja_a2')) AS op_a, count(*) FILTER (WHERE id = :'loja_b1') AS op_b,
       count(*) FILTER (WHERE id = :'loja_leg') AS op_leg FROM public.lojas \gset
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', :'sem_vinculo', true) \gset
SET LOCAL ROLE authenticated;
SELECT count(*) AS sv_n FROM public.lojas \gset
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', :'plat_prov', true) \gset
SET LOCAL ROLE authenticated;
SELECT count(*) FILTER (WHERE id IN (:'loja_a1', :'loja_b1')) AS plat_n FROM public.lojas \gset
RESET ROLE;
SELECT pg_temp.f1_check(:op_a = 2 AND :op_b = 0 AND :op_leg = 0 AND :sv_n = 0 AND :plat_n = 2,
  'L5 leitura de lojas: só as da própria empresa; sem vínculo nada; plataforma vê todas');

-- ======================================================== C: cerca A × B ==
-- C1: DONO de B (DONO é global no legado, "Padrão A") não lê dados de A
SELECT set_config('request.jwt.claim.sub', :'dono_b', true) \gset
SET LOCAL ROLE authenticated;
SELECT (SELECT count(*) FROM public.produtos WHERE loja_id = :'loja_a1') AS b_prod_a,
       (SELECT count(*) FROM public.estoque WHERE loja_id = :'loja_a1') AS b_est_a,
       (SELECT count(*) FROM public.caixas WHERE loja_id = :'loja_a1') AS b_cx_a,
       (SELECT count(*) FROM public.usuarios WHERE loja_id = :'loja_a1') AS b_usr_a,
       (SELECT count(*) FROM public.produtos WHERE loja_id = :'loja_b1') AS b_prod_b \gset
RESET ROLE;
SELECT pg_temp.f1_check(:b_prod_a = 0 AND :b_est_a = 0 AND :b_cx_a = 0 AND :b_usr_a = 0 AND :b_prod_b = 1,
  'C1 RLS: DONO de B não lê produtos, estoque, caixas nem usuários de A; lê os de B');

-- C2: DONO de A lê os próprios dados (comportamento legítimo preservado)
SELECT set_config('request.jwt.claim.sub', :'dono_a', true) \gset
SET LOCAL ROLE authenticated;
SELECT (SELECT count(*) FROM public.produtos WHERE loja_id = :'loja_a1') AS a_prod_a,
       (SELECT count(*) FROM public.estoque WHERE loja_id = :'loja_a1') AS a_est_a,
       (SELECT count(*) FROM public.produtos WHERE loja_id = :'loja_b1') AS a_prod_b \gset
RESET ROLE;
SELECT pg_temp.f1_check(:a_prod_a = 1 AND :a_est_a = 1 AND :a_prod_b = 0,
  'C2 RLS: DONO de A lê os próprios produtos e estoque; nada de B');

-- C3: escrita direta cruzada (UPDATE/DELETE) não afeta B
SELECT set_config('request.jwt.claim.sub', :'dono_a', true) \gset
SET LOCAL ROLE authenticated;
WITH u AS (UPDATE public.produtos SET nome = 'invadido' WHERE loja_id = :'loja_b1' RETURNING 1) SELECT count(*) AS w_upd FROM u \gset
WITH u AS (DELETE FROM public.fornecedores WHERE loja_id = :'loja_b1' RETURNING 1) SELECT count(*) AS w_del FROM u \gset
DO $$
BEGIN
  BEGIN
    DELETE FROM public.estoque WHERE loja_id = current_setting('f1.loja_b1')::uuid;
  EXCEPTION WHEN insufficient_privilege THEN NULL;  -- estoque já não tem DELETE para authenticated (PR1C)
  END;
  BEGIN
    INSERT INTO public.fornecedores (nome, loja_id) VALUES ('Fornecedor invasor', current_setting('f1.loja_b1')::uuid);
    RAISE EXCEPTION 'F1 FAIL: INSERT cruzado aceito';
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL;
  END;
END $$;
RESET ROLE;
SELECT pg_temp.f1_check(:w_upd = 0 AND :w_del = 0 AND (SELECT nome FROM public.produtos WHERE id = :'prod_b') = 'F1 Produto B',
  'C3 escrita direta de A em B: UPDATE/DELETE sem efeito, INSERT recusado');

-- C4: RPC SECURITY DEFINER (ignora RLS) — DONO de A não ajusta estoque de B
SELECT set_config('request.jwt.claim.sub', :'dono_a', true) \gset
DO $$
BEGIN
  BEGIN
    PERFORM public.ajustar_estoque_manual_seguro(
      current_setting('f1.prod_b')::uuid, current_setting('f1.loja_b1')::uuid, 99, 0, 'ACERTO_INVENTARIO', null, null, 10, 0);
    RAISE EXCEPTION 'F1 FAIL: RPC ajustou estoque de outra empresa';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'F1 FAIL%' THEN RAISE; END IF;
  END;
END $$;
SELECT set_config('request.jwt.claim.sub', '', true) \gset
SELECT pg_temp.f1_check((SELECT quantidade_atual FROM public.estoque WHERE produto_id = :'prod_b' AND loja_id = :'loja_b1') = 10,
  'C4 RPC SECURITY DEFINER: DONO de A não altera estoque de B (cerca de escrita)');

-- C5: RPC de leitura com escopo global legado
SELECT set_config('request.jwt.claim.sub', :'dono_a', true) \gset
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.obter_estoque_disponivel_transferencia(current_setting('f1.loja_b1')::uuid, current_setting('f1.prod_b')::uuid);
    RAISE EXCEPTION 'F1 FAIL: leu estoque de outra empresa';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM * FROM public.relatorio_consistencia_vendas_gerente(NULL);
    RAISE EXCEPTION 'F1 FAIL: relatório global com outra empresa existente';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
SELECT count(*) AS rel_a FROM public.relatorio_consistencia_vendas_gerente(:'caixa_a') \gset
SELECT count(*) AS tr_a FROM public.obter_estoque_disponivel_transferencia(:'loja_a1', :'prod_a') \gset
SELECT set_config('request.jwt.claim.sub', '', true) \gset
SELECT pg_temp.f1_check(:rel_a = 1 AND :tr_a = 1,
  'C5 RPCs de leitura: B negado (estoque e relatório global); caixa e estoque de A permitidos');

-- C6: vendas (tenant pelo caixa)
INSERT INTO public.vendas (caixa_id, operador_id, total_bruto, total_liquido, forma_pagamento)
  VALUES (:'caixa_b', :'gerente_b1', 10, 10, 'DINHEIRO');
SELECT set_config('request.jwt.claim.sub', :'dono_a', true) \gset
SET LOCAL ROLE authenticated;
SELECT count(*) AS a_vendas_b FROM public.vendas WHERE caixa_id = :'caixa_b' \gset
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', :'dono_b', true) \gset
SET LOCAL ROLE authenticated;
SELECT count(*) AS b_vendas_b FROM public.vendas WHERE caixa_id = :'caixa_b' \gset
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true) \gset
SELECT pg_temp.f1_check(:a_vendas_b = 0 AND :b_vendas_b = 1,
  'C6 vendas: cerca pelo caixa (A não enxerga a venda de B; B enxerga)');

-- C6b: views definer — custo de A invisível ao ADMIN legado; vendas agregadas respeitam RLS
UPDATE public.vendas SET status = 'CONCLUIDA' WHERE caixa_id = :'caixa_b';
SELECT set_config('request.jwt.claim.sub', :'admin_leg', true) \gset
SET LOCAL ROLE authenticated;
SELECT (SELECT count(*) FROM public.produtos_custos WHERE produto_id IN (:'prod_a', :'prod_b')) AS adm_custo_ab,
       (SELECT count(*) FROM public.produtos_custos WHERE produto_id = :'prod_leg') AS adm_custo_leg \gset
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', :'dono_a', true) \gset
SET LOCAL ROLE authenticated;
SELECT coalesce(sum(num_vendas), 0) AS a_vendas_dia FROM public.v_vendas_dia \gset
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true) \gset
SELECT pg_temp.f1_check(:adm_custo_ab = 0 AND :adm_custo_leg = 1 AND :a_vendas_dia = 0
  AND (SELECT bool_and(coalesce(array_to_string(reloptions, ','), '') LIKE '%security_invoker=true%')
         FROM pg_class WHERE relname IN ('v_top_produtos', 'v_vendas_dia', 'v_venda_consistencia_anomalias')),
  'C6b views: produtos_custos com cerca (ADMIN legado só na legada); agregados de vendas respeitam RLS');

-- C7: helper legado auth_usuario_gerencial_loja agora exige a cerca
SELECT set_config('request.jwt.claim.sub', :'admin_leg', true) \gset
SELECT public.auth_usuario_gerencial_loja(:'loja_leg') AS adm_leg, public.auth_usuario_gerencial_loja(:'loja_b1') AS adm_b,
       public.fp_pode_loja(:'loja_leg') AS adm_pode_leg, public.fp_pode_loja(:'loja_a1') AS adm_pode_a \gset
SELECT set_config('request.jwt.claim.sub', '', true) \gset
SELECT pg_temp.f1_check((:'adm_leg')::boolean AND NOT (:'adm_b')::boolean AND (:'adm_pode_leg')::boolean AND NOT (:'adm_pode_a')::boolean,
  'C7 ADMIN legado: global só dentro da empresa legada (não alcança A nem B)');

-- ====================================================== P: provisionamento ==
SELECT set_config('request.jwt.claim.sub', :'plat_prov', true) \gset
SET LOCAL ROLE authenticated;
SELECT loja_id AS nova_a3, nova AS foi_nova FROM public.plataforma_provisionar_loja(:'emp_a', 'F1 A3', 'f1-a3') \gset
SELECT nova AS repetida FROM public.plataforma_provisionar_loja(:'emp_a', 'F1 A3', 'F1-A3') \gset
DO $$
BEGIN
  BEGIN
    PERFORM public.plataforma_provisionar_loja(current_setting('f1.emp_b')::uuid, 'Colisão', 'F1-A3');
    RAISE EXCEPTION 'F1 FAIL: código de outra empresa reaproveitado';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.plataforma_provisionar_loja(NULL, 'Sem empresa', 'F1-SEM');
    RAISE EXCEPTION 'F1 FAIL: provisionamento sem empresa';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'F1 FAIL%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.plataforma_criar_empresa('Empresa C');
    RAISE EXCEPTION 'F1 FAIL: segunda empresa criada pelo produto';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
SELECT pg_temp.f1_check((:'foi_nova')::boolean AND NOT (:'repetida')::boolean
  AND (SELECT empresa_id FROM public.lojas WHERE id = :'nova_a3') = :'emp_a'::uuid
  AND EXISTS (SELECT 1 FROM public.plataforma_auditoria WHERE alvo_id = :'nova_a3' AND acao = 'PROVISIONAR_LOJA' AND executado_por = :'plat_prov'),
  'P5 provisionamento: empresa explícita, idempotente, auditado; código de outra empresa, empresa nula e 2ª empresa negados');

-- plataforma sem capacidade COMERCIAL não habilita módulo
SELECT set_config('request.jwt.claim.sub', :'plat_prov', true) \gset
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.plataforma_definir_modulo_empresa(current_setting('f1.emp_a')::uuid, 'IMPORT_INTELLIGENCE', true, 'contrato', 'sem capacidade comercial');
    RAISE EXCEPTION 'F1 FAIL: provisionamento habilitou módulo';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
SELECT pg_temp.f1_check(true, 'P6 capacidade PROVISIONAMENTO não habilita módulo (separação de funções)');

-- ================================================================ M: módulo ==
SELECT set_config('request.jwt.claim.sub', :'plat_com', true) \gset
SET LOCAL ROLE authenticated;
SELECT public.plataforma_definir_modulo_empresa(:'emp_a', 'IMPORT_INTELLIGENCE', true, 'contrato F1-TESTE-001',
  'homologação F1 — cliente contratante fictício', current_date, current_date + 365);
RESET ROLE;
SELECT pg_temp.f1_check(
  EXISTS (SELECT 1 FROM public.empresa_modulos_historico h
           WHERE h.empresa_id = :'emp_a' AND h.acao = 'HABILITAR' AND h.responsavel_id = :'plat_com'
             AND h.autorizado_por = 'contrato F1-TESTE-001' AND h.vigencia_inicio = current_date
             AND h.vigencia_fim = current_date + 365 AND h.origem = 'plataforma_definir_modulo_empresa'
             AND h.motivo LIKE 'homologação F1%'),
  'M1 habilitação comercial registra cliente, módulo, responsável, data, motivo, vigência e histórico');

-- M2: acesso cumulativo — DONO de A sim; GERENTE A por padrão não; DONO de B não; sem vínculo não
SELECT set_config('request.jwt.claim.sub', :'dono_a', true) \gset
SET LOCAL ROLE authenticated;
SELECT coalesce(public.fp_empresa_contexto_modulo('IMPORT_INTELLIGENCE')::text, '') AS ctx_dono_a,
       coalesce(public.fp_empresa_contexto_modulo('IMPORT_INTELLIGENCE', ARRAY['DONO'], :'emp_b')::text, '') AS ctx_dono_a_em_b \gset
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', :'gerente_a1', true) \gset
SET LOCAL ROLE authenticated;
SELECT coalesce(public.fp_empresa_contexto_modulo('IMPORT_INTELLIGENCE')::text, '') AS ctx_ger_a \gset
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', :'dono_b', true) \gset
SET LOCAL ROLE authenticated;
SELECT coalesce(public.fp_empresa_contexto_modulo('IMPORT_INTELLIGENCE')::text, '') AS ctx_dono_b,
       coalesce(public.fp_empresa_contexto_modulo('IMPORT_INTELLIGENCE', ARRAY['DONO'], :'emp_a')::text, '') AS ctx_dono_b_em_a \gset
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', :'sem_vinculo', true) \gset
SET LOCAL ROLE authenticated;
SELECT coalesce(public.fp_empresa_contexto_modulo('IMPORT_INTELLIGENCE')::text, '') AS ctx_sv \gset
RESET ROLE;
SELECT pg_temp.f1_check(:'ctx_dono_a' = :'emp_a' AND :'ctx_dono_a_em_b' = '' AND :'ctx_ger_a' = ''
  AND :'ctx_dono_b' = '' AND :'ctx_dono_b_em_a' = '' AND :'ctx_sv' = '',
  'M2 contexto do módulo: só DONO de A resolve A; B, GERENTE (padrão), sem vínculo e empresa forjada negados');

-- M3: vigência futura ou encerrada desativa o módulo
SELECT set_config('request.jwt.claim.sub', '', true) \gset
SET LOCAL ROLE service_role;
SELECT public.ops_definir_modulo_empresa(:'emp_a', 'IMPORT_INTELLIGENCE', true, 'contrato F1-TESTE-001',
  'vigência começa no futuro (teste)', 'runbook-teste', current_date + 1, NULL);
RESET ROLE;
SELECT public.fp_modulo_ativo(:'emp_a', 'IMPORT_INTELLIGENCE') AS mod_futuro \gset
SET LOCAL ROLE service_role;
SELECT public.ops_definir_modulo_empresa(:'emp_a', 'IMPORT_INTELLIGENCE', true, 'contrato F1-TESTE-001',
  'vigência encerrada ontem (teste)', 'runbook-teste', current_date - 30, current_date - 1);
RESET ROLE;
SELECT public.fp_modulo_ativo(:'emp_a', 'IMPORT_INTELLIGENCE') AS mod_vencido \gset
SELECT pg_temp.f1_check(NOT (:'mod_futuro')::boolean AND NOT (:'mod_vencido')::boolean
  AND (SELECT count(*) FROM public.empresa_modulos_historico WHERE empresa_id = :'emp_a') = 3,
  'M3 vigência futura/encerrada desativa o módulo; cada mudança gera histórico');

-- M4: procedimento operacional exige responsável
SET LOCAL ROLE service_role;
DO $$
BEGIN
  BEGIN
    PERFORM public.ops_definir_modulo_empresa(current_setting('f1.emp_b')::uuid, 'IMPORT_INTELLIGENCE', true, 'contrato', 'sem responsável informado', '');
    RAISE EXCEPTION 'F1 FAIL: habilitação sem responsável';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'F1 FAIL%' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;
SELECT pg_temp.f1_check(NOT public.fp_modulo_ativo(:'emp_b', 'IMPORT_INTELLIGENCE'), 'M4 habilitação exige responsável; B continua sem módulo');

-- M5: usuário com DONO em duas empresas com módulo: sem empresa explícita é ambíguo ⇒ nega
SET LOCAL ROLE service_role;
SELECT public.ops_definir_modulo_empresa(:'emp_a', 'IMPORT_INTELLIGENCE', true, 'contrato A', 'reabilita A para teste M5', 'runbook-teste');
SELECT public.ops_definir_modulo_empresa(:'emp_b', 'IMPORT_INTELLIGENCE', true, 'contrato B', 'habilita B para teste M5', 'runbook-teste');
RESET ROLE;
INSERT INTO public.usuario_vinculos (usuario_id, empresa_id, loja_id, papel, ativo, origem)
  VALUES (:'dono_a', :'emp_b', NULL, 'DONO', true, 'DIRETO');
SELECT set_config('request.jwt.claim.sub', :'dono_a', true) \gset
SET LOCAL ROLE authenticated;
SELECT coalesce(public.fp_empresa_contexto_modulo('IMPORT_INTELLIGENCE')::text, '') AS ctx_ambiguo,
       coalesce(public.fp_empresa_contexto_modulo('IMPORT_INTELLIGENCE', ARRAY['DONO'], :'emp_b')::text, '') AS ctx_explicito \gset
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true) \gset
SELECT pg_temp.f1_check(:'ctx_ambiguo' = '' AND :'ctx_explicito' = :'emp_b',
  'M5 contexto ambíguo (duas empresas) nega; empresa explícita e autorizada resolve');

-- ============================================== E: cliente atual (legado) ==
SELECT set_config('request.jwt.claim.sub', :'dono_leg', true) \gset
SET LOCAL ROLE authenticated;
SELECT (SELECT count(*) FROM public.produtos WHERE id = :'prod_leg') AS dl_prod,
       (SELECT count(*) FROM public.lojas WHERE id = :'loja_leg') AS dl_loja,
       (SELECT count(*) FROM public.lojas WHERE id IN (:'loja_a1', :'loja_b1')) AS dl_outras \gset
WITH u AS (UPDATE public.lojas SET telefone = '1199999999' WHERE id = :'loja_leg' RETURNING 1) SELECT count(*) AS dl_upd FROM u \gset
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', :'gerente_leg', true) \gset
SET LOCAL ROLE authenticated;
SELECT (SELECT count(*) FROM public.produtos WHERE id = :'prod_leg') AS gl_prod \gset
WITH u AS (UPDATE public.lojas SET telefone = '1188888888' WHERE id = :'loja_leg' RETURNING 1) SELECT count(*) AS gl_upd FROM u \gset
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', :'dono_leg', true) \gset
SELECT public.ajustar_estoque_manual_seguro(:'prod_leg', :'loja_leg', 12, 0, 'ACERTO_INVENTARIO', null, null, 10, 0);
SELECT set_config('request.jwt.claim.sub', '', true) \gset
SELECT pg_temp.f1_check(:dl_prod = 1 AND :dl_loja = 1 AND :dl_outras = 0 AND :dl_upd = 1 AND :gl_prod = 1 AND :gl_upd = 1
  AND (SELECT quantidade_atual FROM public.estoque WHERE produto_id = :'prod_leg' AND loja_id = :'loja_leg') = 12,
  'E1 cliente atual: DONO e GERENTE legados mantêm leitura, edição da loja e RPC de estoque na própria empresa');

SELECT pg_temp.f1_check(
  (SELECT count(*) FROM public.lojas WHERE empresa_id IS NULL) = 0,
  'E2 nenhuma loja órfã no banco de teste após F1');

ROLLBACK;
