-- ============================================================================
-- M1 — testes de autorização multiempresa (executar em banco LOCAL isolado).
-- Uso: psql -v ON_ERROR_STOP=1 -f backend/scripts/m1-multiempresa.test.sql
-- Tudo roda em transação e termina em ROLLBACK: nenhum dado persiste.
-- Acesso é testado com claims de sessão (authenticated / service_role), ou seja,
-- pela mesma camada que uma chamada direta de API/RPC usaria. Nenhuma UI.
-- ============================================================================
\set ON_ERROR_STOP 1
BEGIN;

CREATE FUNCTION pg_temp.m1_check(ok boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT coalesce(ok, false) THEN RAISE EXCEPTION 'M1 FAIL: %', msg; END IF;
  RAISE NOTICE 'M1 OK: %', msg;
END $$;

-- ---------------------------------------------------------------- fixtures --
INSERT INTO public.empresas (nome, status) VALUES ('Empresa A (teste M1)', 'ATIVA') RETURNING id AS empresa_a_id \gset
INSERT INTO public.empresas (nome, status) VALUES ('Empresa B (teste M1)', 'ATIVA') RETURNING id AS empresa_b_id \gset

INSERT INTO public.lojas (nome, ativo, numero_serie_nfce, numero_serie_nfe, empresa_id)
  VALUES ('A1 (teste)', true, 1, 1, :'empresa_a_id') RETURNING id AS loja_a1 \gset
INSERT INTO public.lojas (nome, ativo, numero_serie_nfce, numero_serie_nfe, empresa_id)
  VALUES ('A2 (teste)', true, 2, 2, :'empresa_a_id') RETURNING id AS loja_a2 \gset
INSERT INTO public.lojas (nome, ativo, numero_serie_nfce, numero_serie_nfe, empresa_id)
  VALUES ('B1 (teste)', true, 3, 3, :'empresa_b_id') RETURNING id AS loja_b1 \gset
-- Loja SEM empresa, criada após o corte (como o provisionamento fazia antes da F1).
-- Desde a F1 o trigger lojas_empresa_obrigatoria impede isso; aqui ele é desligado só
-- dentro desta transação (ROLLBACK) para simular um dado legado órfão.
ALTER TABLE public.lojas DISABLE TRIGGER lojas_empresa_obrigatoria;
INSERT INTO public.lojas (nome, ativo, numero_serie_nfce, numero_serie_nfe)
  VALUES ('L0 sem empresa (teste)', true, 4, 4) RETURNING id AS loja_l0 \gset
ALTER TABLE public.lojas ENABLE TRIGGER lojas_empresa_obrigatoria;
SELECT l.id AS loja_legada FROM public.lojas l JOIN public.empresas e ON e.id = l.empresa_id
 WHERE e.origem = 'LEGADA_M1' ORDER BY l.created_at LIMIT 1 \gset

INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'dono.a@m1.test') RETURNING id AS dono_a \gset
INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'gerente.a1@m1.test') RETURNING id AS gerente_a1 \gset
INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'operador.a1@m1.test') RETURNING id AS operador_a1 \gset
INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'dono.b@m1.test') RETURNING id AS dono_b \gset
INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'operador.l0@m1.test') RETURNING id AS operador_l0 \gset
INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'admin.tecnico@m1.test') RETURNING id AS admin_t \gset

INSERT INTO public.usuarios (id, nome, perfil, loja_id, ativo) VALUES
  (:'dono_a', 'Dono A', 'DONO', :'loja_a1', true),
  (:'gerente_a1', 'Gerente A1', 'GERENTE', :'loja_a1', true),
  (:'operador_a1', 'Operador A1', 'OPERADOR', :'loja_a1', true),
  (:'dono_b', 'Dono B', 'DONO', :'loja_b1', true),
  (:'operador_l0', 'Operador L0', 'OPERADOR', :'loja_l0', true),
  (:'admin_t', 'Admin técnico (Anexo A)', 'ADMIN', :'loja_a1', true);

-- ----------------------------------------------- backfill (re-execução) -----
SELECT public.m1_backfill_empresa_legada() AS backfill_1 \gset

-- ----------------------------------------- T9: usuários antigos preservados --
-- Equivalência legado × vínculos: a ÚNICA divergência deve ser o operador de loja
-- sem empresa (fail closed). Qualquer outra é regressão.
SELECT count(*) AS n_div, string_agg(motivo || ':' || usuario_id::text, ',') AS lista
  FROM public.fp_divergencias_vinculos_legados() \gset
SELECT pg_temp.m1_check(:n_div = 1 AND :'lista' = ('VINCULO_AUSENTE:' || :'operador_l0'),
  'T9 equivalência: legados cobertos; única divergência é operador em loja sem empresa');

SELECT pg_temp.m1_check(
  NOT EXISTS (SELECT 1 FROM public.usuario_vinculos WHERE usuario_id = :'operador_l0')
  AND EXISTS (SELECT 1 FROM public.m1_backfill_excecoes WHERE usuario_id = :'operador_l0' AND motivo = 'LOJA_SEM_EMPRESA_POS_CORTE'),
  'backfill: loja pós-corte não é associada automaticamente e vira exceção explícita');

SELECT pg_temp.m1_check(
  NOT EXISTS (SELECT 1 FROM public.usuario_vinculos WHERE usuario_id = :'admin_t')
  AND EXISTS (SELECT 1 FROM public.m1_backfill_excecoes WHERE usuario_id = :'admin_t' AND motivo = 'ADMIN_SEM_VINCULO'),
  'D9: ADMIN legado não recebe vínculo nem é promovido a plataforma');

-- DONO de A: lojas de A, nunca B1
SELECT set_config('request.jwt.claim.sub', :'dono_a', true) \gset
SET LOCAL ROLE authenticated;
SELECT (SELECT count(*) FROM public.fp_lojas_permitidas()) AS n_dono_a,
       (SELECT count(*) FROM public.fp_lojas_permitidas() x WHERE x IN (:'loja_a1', :'loja_a2')) AS n_dono_a_em_a,
       public.fp_pode_loja(:'loja_b1') AS dono_a_b1 \gset
RESET ROLE;
SELECT pg_temp.m1_check(:n_dono_a = 2 AND :n_dono_a_em_a = 2 AND (:'dono_a_b1')::boolean = false,
  'T1 Empresa A: DONO vê as lojas de A e não vê B1');

-- Gerente legado: mesmo acesso de antes (somente a própria loja)
SELECT set_config('request.jwt.claim.sub', :'gerente_a1', true) \gset
SET LOCAL ROLE authenticated;
SELECT (SELECT count(*) FROM public.fp_lojas_permitidas()) AS n_ger,
       public.fp_pode_loja(:'loja_a1') AS ger_a1, public.fp_pode_loja(:'loja_b1') AS ger_b1 \gset
RESET ROLE;
SELECT pg_temp.m1_check(:n_ger = 1 AND (:'ger_a1')::boolean = true AND (:'ger_b1')::boolean = false,
  'T9 legado GERENTE: mesmo acesso de antes (somente a própria loja)');

-- Operador: só a própria loja, não é dono, não enxerga vínculo alheio
SELECT set_config('request.jwt.claim.sub', :'operador_a1', true) \gset
SET LOCAL ROLE authenticated;
SELECT public.fp_pode_loja(:'loja_a1') AS op_a1, public.fp_pode_loja(:'loja_a2') AS op_a2,
       public.fp_pode_loja(:'loja_a1', ARRAY['DONO']) AS op_dono,
       public.fp_eh_dono_da_empresa(:'empresa_a_id') AS op_eh_dono,
       (SELECT count(*) FROM public.usuario_vinculos WHERE usuario_id <> auth.uid()) AS op_outros_vinculos \gset
RESET ROLE;
SELECT pg_temp.m1_check((:'op_a1')::boolean = true AND (:'op_a2')::boolean = false AND (:'op_dono')::boolean = false AND (:'op_eh_dono')::boolean = false AND :op_outros_vinculos = 0,
  'T3 operador: acessa só a própria loja, não é dono, não enxerga vínculo alheio');

-- Admin técnico: ramo de compatibilidade legado, nunca plataforma
SELECT set_config('request.jwt.claim.sub', :'admin_t', true) \gset
SET LOCAL ROLE authenticated;
SELECT public.fp_eh_plataforma() AS admin_plat, public.fp_pode_loja(:'loja_b1') AS admin_b1,
       public.fp_pode_loja(:'loja_legada') AS admin_legada \gset
RESET ROLE;
-- F1: o ramo de compatibilidade do ADMIN legado vale só para a empresa legada.
SELECT pg_temp.m1_check((:'admin_plat')::boolean = false AND (:'admin_b1')::boolean = false AND (:'admin_legada')::boolean = true,
  'D9/F1: ADMIN legado mantém compatibilidade só na empresa legada; fp_eh_plataforma é falso');

-- ---------------------------------------------- fixtures adversariais --------
-- Fixtures sem identidade simulada (F1: a cerca de escrita vale para qualquer auth.uid()).
SELECT set_config('request.jwt.claim.sub', '', true) \gset
-- Gerente multi-loja: vínculo adicional em A2 (novidade da M1; a divergência acima já foi medida)
INSERT INTO public.usuario_vinculos (usuario_id, empresa_id, loja_id, papel, ativo)
  VALUES (:'gerente_a1', :'empresa_a_id', :'loja_a2', 'GERENTE', true);
-- Usuário sem vínculo correspondente
-- Identidade SEM registro legado nem vínculo (auth.users apenas). Um GERENTE legado sem
-- vínculo seria corrigido pelo backfill, por isso o caso de negação usa identidade sem usuário.
INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'sem.vinculo@m1.test') RETURNING id AS sem_vinculo \gset
-- Usuário inativo: vínculo ativo, identidade inativa
INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'inativo.a@m1.test') RETURNING id AS inativo_a \gset
INSERT INTO public.usuarios (id, nome, perfil, loja_id, ativo) VALUES (:'inativo_a', 'Inativo A', 'DONO', :'loja_a1', false);
-- F1: o vínculo LEGADO já nasceu pelo trigger (inativo); força-se ativo para simular vínculo obsoleto.
UPDATE public.usuario_vinculos SET ativo = true WHERE usuario_id = :'inativo_a';

-- T2: usuário sem vínculo não obtém autorização
SELECT set_config('request.jwt.claim.sub', :'sem_vinculo', true) \gset
SET LOCAL ROLE authenticated;
SELECT (SELECT count(*) FROM public.fp_lojas_permitidas()) AS n_sv,
       public.fp_pode_loja(:'loja_a1') AS sv_a1, public.fp_pode_operar_loja(:'loja_a1') AS sv_op \gset
RESET ROLE;
SELECT pg_temp.m1_check(:n_sv = 0 AND (:'sv_a1')::boolean = false AND (:'sv_op')::boolean = false,
  'T2 usuário sem vínculo: nenhuma loja autorizada');

-- T4: gerente só acessa lojas autorizadas (A1 e A2, nunca B1)
SELECT set_config('request.jwt.claim.sub', :'gerente_a1', true) \gset
SET LOCAL ROLE authenticated;
SELECT (SELECT count(*) FROM public.fp_lojas_permitidas()) AS n_g2,
       public.fp_pode_loja(:'loja_a2') AS g_a2, public.fp_pode_loja(:'loja_b1') AS g_b1,
       public.fp_pode_loja(:'loja_a1', ARRAY['DONO']) AS g_dono_a1 \gset
RESET ROLE;
SELECT pg_temp.m1_check(:n_g2 = 2 AND (:'g_a2')::boolean = true AND (:'g_b1')::boolean = false AND (:'g_dono_a1')::boolean = false,
  'T4 gerente multi-loja: A1 e A2 sim, B1 não, e não é dono');

-- T6: DONO de outra empresa não opera em A
SELECT set_config('request.jwt.claim.sub', :'dono_b', true) \gset
SET LOCAL ROLE authenticated;
SELECT public.fp_pode_operar_loja(:'loja_a1') AS b_em_a, public.fp_pode_operar_loja(:'loja_b1') AS b_em_b,
       public.fp_eh_dono_da_empresa(:'empresa_a_id') AS b_dono_a \gset
RESET ROLE;
SELECT pg_temp.m1_check((:'b_em_a')::boolean = false AND (:'b_em_b')::boolean = true AND (:'b_dono_a')::boolean = false,
  'T6 DONO de B não opera nem é dono em A; opera em B');

-- T1 (RLS): DONO de A não lê empresa nem vínculo de B
SELECT set_config('request.jwt.claim.sub', :'dono_a', true) \gset
SET LOCAL ROLE authenticated;
SELECT (SELECT count(*) FROM public.empresas) AS rls_emp,
       (SELECT count(*) FROM public.usuario_vinculos WHERE empresa_id = :'empresa_b_id') AS rls_vinc_b \gset
RESET ROLE;
SELECT pg_temp.m1_check(:rls_emp = 1 AND :rls_vinc_b = 0,
  'T1 RLS: DONO de A vê só a própria empresa e nenhum vínculo de B');

-- T5: empresa suspensa não permite novas operações protegidas (leitura continua)
UPDATE public.empresas SET status = 'SUSPENSA' WHERE id = :'empresa_a_id';
SELECT set_config('request.jwt.claim.sub', :'dono_a', true) \gset
SET LOCAL ROLE authenticated;
SELECT public.fp_pode_operar_loja(:'loja_a1') AS susp_op, public.fp_pode_loja(:'loja_a1') AS susp_leitura \gset
RESET ROLE;
SELECT pg_temp.m1_check((:'susp_op')::boolean = false AND (:'susp_leitura')::boolean = true,
  'T5 empresa SUSPENSA: operação bloqueada, autorização de leitura preservada');
UPDATE public.empresas SET status = 'ATIVA' WHERE id = :'empresa_a_id';

-- T5b: vigência encerrada também bloqueia operação
UPDATE public.empresas SET vigencia_inicio = current_date - 10, vigencia_fim = current_date - 1 WHERE id = :'empresa_a_id';
SELECT set_config('request.jwt.claim.sub', :'dono_a', true) \gset
SET LOCAL ROLE authenticated;
SELECT public.fp_pode_operar_loja(:'loja_a1') AS venc_op \gset
RESET ROLE;
SELECT pg_temp.m1_check((:'venc_op')::boolean = false, 'T5b vigência encerrada bloqueia operação');
UPDATE public.empresas SET vigencia_fim = NULL WHERE id = :'empresa_a_id';

-- T7: falta de identidade provoca negação (authenticated sem claim)
SELECT set_config('request.jwt.claim.sub', '', true) \gset
SET LOCAL ROLE authenticated;
SELECT public.fp_usuario_ativo() AS id_ativo, public.fp_eh_plataforma() AS id_plat,
       public.fp_pode_loja(:'loja_a1') AS id_loja, public.fp_pode_operar_loja(:'loja_a1') AS id_op,
       (SELECT count(*) FROM public.fp_lojas_permitidas()) AS id_n,
       public.fp_pode_modulo(:'empresa_a_id', 'IMPORT_INTELLIGENCE') AS id_mod \gset
RESET ROLE;
SELECT pg_temp.m1_check((:'id_ativo')::boolean = false AND (:'id_plat')::boolean = false AND (:'id_loja')::boolean = false AND (:'id_op')::boolean = false AND :id_n = 0 AND (:'id_mod')::boolean = false,
  'T7 sem identidade: tudo negado (authenticated)');

-- T11 (parte): service_role sem identidade não ganha acesso pelo papel
SET LOCAL ROLE service_role;
SELECT public.fp_pode_loja(:'loja_a1') AS sr_loja, public.fp_pode_operar_loja(:'loja_a1') AS sr_op,
       public.fp_eh_plataforma() AS sr_plat \gset
RESET ROLE;
SELECT pg_temp.m1_check((:'sr_loja')::boolean = false AND (:'sr_op')::boolean = false AND (:'sr_plat')::boolean = false,
  'T11 service_role sem identidade: helpers não concedem acesso (sem bypass por papel)');

-- T7b: vínculo ativo com identidade inativa é negado
SELECT set_config('request.jwt.claim.sub', :'inativo_a', true) \gset
SET LOCAL ROLE authenticated;
SELECT public.fp_pode_loja(:'loja_a1') AS in_loja, (SELECT count(*) FROM public.fp_empresas_do_usuario()) AS in_emp \gset
RESET ROLE;
SELECT pg_temp.m1_check((:'in_loja')::boolean = false AND :in_emp = 0, 'T7b identidade inativa: negada apesar de vínculo ativo');

-- ---------------------------------------- T8: backfill repetido não duplica --
SELECT count(*) AS v_antes FROM public.usuario_vinculos \gset
SELECT count(*) AS e_antes FROM public.empresas \gset
SELECT coalesce(sum(quantidade_atual), 0) AS saldo_antes FROM public.estoque \gset
SELECT public.m1_backfill_empresa_legada() AS backfill_2 \gset
SELECT count(*) AS v_depois FROM public.usuario_vinculos \gset
SELECT count(*) AS e_depois FROM public.empresas \gset
SELECT coalesce(sum(quantidade_atual), 0) AS saldo_depois FROM public.estoque \gset
SELECT pg_temp.m1_check(:v_antes = :v_depois AND :e_antes = :e_depois AND :saldo_antes = :saldo_depois,
  'T8 backfill repetido: sem vínculo, empresa ou saldo duplicado/alterado');
SELECT pg_temp.m1_check(
  (:'backfill_2'::jsonb ->> 'vinculos_criados') = '0'
  AND (:'backfill_2'::jsonb ->> 'empresa_criada') = '0'
  AND (:'backfill_2'::jsonb ->> 'lojas_associadas') = '0',
  'T8b segunda execução retorna zero criações');
SELECT pg_temp.m1_check((SELECT empresa_id IS NULL FROM public.lojas WHERE id = :'loja_l0'),
  'T8c backfill repetido não associa loja pós-corte à empresa legada (fail closed)');

-- ----------------------- T11: SECURITY DEFINER e acesso direto sem bypass ----
-- Variáveis de sessão para os blocos DO (psql não interpola dentro de dollar quotes)
SELECT set_config('m1.empresa', :'empresa_a_id', true) \gset
SELECT set_config('m1.empresa_b', :'empresa_b_id', true) \gset
SELECT set_config('request.jwt.claim.sub', :'dono_a', true) \gset
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.ops_definir_modulo_empresa(current_setting('m1.empresa')::uuid, 'IMPORT_INTELLIGENCE', true, 'x', 'autoatendimento de teste', 'teste');
    RAISE EXCEPTION 'M1 FAIL: authenticated executou ops_definir_modulo_empresa';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM 1 FROM public.plataforma_admins;
    RAISE EXCEPTION 'M1 FAIL: authenticated leu plataforma_admins';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.plataforma_admins (usuario_id) VALUES (auth.uid());
    RAISE EXCEPTION 'M1 FAIL: authenticated escreveu plataforma_admins';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.usuario_vinculos SET papel = 'DONO' WHERE false;
    RAISE EXCEPTION 'M1 FAIL: authenticated tem UPDATE em vínculos';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.m1_backfill_empresa_legada();
    RAISE EXCEPTION 'M1 FAIL: authenticated executou backfill';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM 1 FROM public.fp_divergencias_vinculos_legados();
    RAISE EXCEPTION 'M1 FAIL: authenticated leu divergências de todos os usuários';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
SELECT pg_temp.m1_check(true, 'T11 authenticated: sem ops, backfill ou divergências; sem leitura/escrita de plataforma ou de vínculos');

-- ------------------------------------------------- T12: módulo por padrão ----
SELECT public.fp_modulo_ativo(:'empresa_a_id', 'IMPORT_INTELLIGENCE') AS mod_default \gset
SELECT pg_temp.m1_check((:'mod_default')::boolean = false, 'T12 módulo IMPORT_INTELLIGENCE desabilitado por padrão');

-- T12a: habilitação com motivo curto é recusada
SELECT set_config('request.jwt.claim.sub', '', true) \gset
SET LOCAL ROLE service_role;
DO $$
BEGIN
  BEGIN
    PERFORM public.ops_definir_modulo_empresa(current_setting('m1.empresa')::uuid, 'IMPORT_INTELLIGENCE', true, 'comercial-1', 'curto', 'operador-teste');
    RAISE EXCEPTION 'M1 FAIL: motivo curto aceito';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'M1 FAIL%' THEN RAISE; END IF;
  END;
END $$;
RESET ROLE;
SELECT pg_temp.m1_check(true, 'T12a habilitação exige motivo com 10+ caracteres');

-- T12f: habilitação sem autorização comercial é recusada (check_violation pela constraint)
DO $$
BEGIN
  BEGIN
    INSERT INTO public.empresa_modulos (empresa_id, modulo_codigo, habilitado)
      VALUES (current_setting('m1.empresa_b')::uuid, 'IMPORT_INTELLIGENCE', true);
    RAISE EXCEPTION 'M1 FAIL: habilitado sem autorização';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
SELECT pg_temp.m1_check(true, 'T12f habilitação sem autorização comercial é recusada');

-- T12b: service_role habilita com autorização e motivo registrados
SELECT set_config('request.jwt.claim.sub', '', true) \gset
SET LOCAL ROLE service_role;
SELECT public.ops_definir_modulo_empresa(:'empresa_a_id', 'IMPORT_INTELLIGENCE', true, 'contrato-teste-m1', 'habilitação de teste M1 (rollback)', 'operador-teste');
RESET ROLE;
SELECT public.fp_modulo_ativo(:'empresa_a_id', 'IMPORT_INTELLIGENCE') AS mod_on \gset
SELECT pg_temp.m1_check((:'mod_on')::boolean = true, 'T12b service_role habilita com autorização registrada');

-- T12c: só DONO da empresa habilitada acessa; GERENTE e OPERADOR não; DONO de outra empresa não vê nada
SELECT set_config('request.jwt.claim.sub', :'dono_a', true) \gset
SET LOCAL ROLE authenticated;
SELECT public.fp_pode_modulo(:'empresa_a_id', 'IMPORT_INTELLIGENCE') AS mod_dono,
       (SELECT count(*) FROM public.empresa_modulos) AS mod_status_visivel \gset
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', :'gerente_a1', true) \gset
SET LOCAL ROLE authenticated;
SELECT public.fp_pode_modulo(:'empresa_a_id', 'IMPORT_INTELLIGENCE') AS mod_ger,
       public.fp_pode_modulo(:'empresa_a_id', 'IMPORT_INTELLIGENCE', ARRAY['GERENTE']) AS mod_ger_explicito \gset
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', :'dono_b', true) \gset
SET LOCAL ROLE authenticated;
SELECT public.fp_pode_modulo(:'empresa_a_id', 'IMPORT_INTELLIGENCE') AS mod_b_em_a,
       (SELECT count(*) FROM public.empresa_modulos WHERE empresa_id = :'empresa_a_id') AS mod_b_status \gset
RESET ROLE;
SELECT pg_temp.m1_check((:'mod_dono')::boolean = true AND :mod_status_visivel = 1 AND (:'mod_ger')::boolean = false AND (:'mod_ger_explicito')::boolean = true
  AND (:'mod_b_em_a')::boolean = false AND :mod_b_status = 0,
  'T12c módulo: só DONO da empresa habilitada acessa; DONO de outra empresa não vê o status');

-- T12d: desabilitar mantém histórico; histórico é imutável
SELECT set_config('request.jwt.claim.sub', '', true) \gset
SET LOCAL ROLE service_role;
SELECT public.ops_definir_modulo_empresa(:'empresa_a_id', 'IMPORT_INTELLIGENCE', false, NULL, 'desabilitação de teste M1 (rollback)', 'operador-teste');
RESET ROLE;
SELECT public.fp_modulo_ativo(:'empresa_a_id', 'IMPORT_INTELLIGENCE') AS mod_off \gset
SELECT count(*) AS hist_n FROM public.empresa_modulos_historico WHERE empresa_id = :'empresa_a_id' \gset
SELECT pg_temp.m1_check((:'mod_off')::boolean = false AND :hist_n = 2, 'T12d desabilitar mantém histórico (HABILITAR + DESABILITAR)');

DO $$
BEGIN
  BEGIN
    UPDATE public.empresa_modulos_historico SET motivo = 'alterado' WHERE true;
    RAISE EXCEPTION 'M1 FAIL: histórico alterado';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'M1 FAIL%' THEN RAISE; END IF;
  END;
  BEGIN
    DELETE FROM public.empresa_modulos_historico WHERE true;
    RAISE EXCEPTION 'M1 FAIL: histórico apagado';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM LIKE 'M1 FAIL%' THEN RAISE; END IF;
  END;
END $$;
SELECT pg_temp.m1_check(true, 'T12e histórico de habilitação é imutável (UPDATE e DELETE bloqueados)');

-- T11b: oráculos entre tenants não são chamáveis por authenticated (não vazam dados de outra empresa)
SELECT set_config('m1.loja_a1', :'loja_a1', true) \gset
SELECT set_config('m1.loja_b1', :'loja_b1', true) \gset
SELECT set_config('request.jwt.claim.sub', :'dono_b', true) \gset
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  BEGIN
    PERFORM public.fp_empresa_da_loja(current_setting('m1.loja_a1')::uuid);
    RAISE EXCEPTION 'M1 FAIL: authenticated consultou empresa de loja alheia';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.fp_empresa_operacional(current_setting('m1.empresa')::uuid);
    RAISE EXCEPTION 'M1 FAIL: authenticated consultou licença alheia';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.fp_mesma_empresa(current_setting('m1.loja_a1')::uuid, current_setting('m1.loja_b1')::uuid);
    RAISE EXCEPTION 'M1 FAIL: authenticated comparou empresas entre tenants';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.fp_modulo_ativo(current_setting('m1.empresa')::uuid, 'IMPORT_INTELLIGENCE');
    RAISE EXCEPTION 'M1 FAIL: authenticated consultou módulo de empresa alheia';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
SELECT pg_temp.m1_check(true, 'T11b oráculos entre tenants (empresa da loja, licença, mesma empresa, módulo) negados a authenticated');

-- fim
SELECT pg_temp.m1_check(true, 'fim dos testes M1 (rollback ao final)');

ROLLBACK;
