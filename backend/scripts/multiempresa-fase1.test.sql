-- Multiempresa — Fase 1 (aditiva). Spec: docs/architecture/ESPEC_MULTIEMPRESA_V1.md
--
-- Prova, numa transação com ROLLBACK (não persiste nada):
--   T1 estrutura e exposição das tabelas novas (RLS ligada, sem policy, sem grant público);
--   T2 comportamento existente inalterado (loja e usuário sem empresa/vínculo continuam válidos;
--      policies/RPCs não leem as tabelas novas; authenticated segue lendo `lojas`);
--   T3 backfill: espelho exato de `usuarios`, ADMIN legado ignorado, idempotente;
--   T4 constraints de vínculo e isolamento estrutural Empresa A × Empresa B;
--   T5 rollback do backfill e da migration.
--
-- Uso: psql "$DB_URL" -v ON_ERROR_STOP=1 -f backend/scripts/multiempresa-fase1.test.sql

\set ON_ERROR_STOP on
BEGIN;

-- ---------------------------------------------------------------------------
-- Fixtures sintéticas (tenant único, como produção hoje)
-- ---------------------------------------------------------------------------
DO $setup$
DECLARE
  v_matriz uuid := 'a0000001-0000-4000-8000-000000000001';
BEGIN
  INSERT INTO public.lojas (id, nome, codigo, ativo)
  VALUES (v_matriz, 'Matriz', 'MATRIZ', true)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO auth.users (id) VALUES
    ('f1000000-0000-4000-8000-000000000001'),
    ('f1000000-0000-4000-8000-000000000002'),
    ('f1000000-0000-4000-8000-000000000003'),
    ('f1000000-0000-4000-8000-000000000004'),
    ('f1000000-0000-4000-8000-000000000005')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id) VALUES
    ('f1000000-0000-4000-8000-000000000001', 'F1 Dono',            'DONO',     true,  v_matriz),
    ('f1000000-0000-4000-8000-000000000002', 'F1 Gerente',         'GERENTE',  true,  v_matriz),
    ('f1000000-0000-4000-8000-000000000003', 'F1 Operador',        'OPERADOR', true,  v_matriz),
    ('f1000000-0000-4000-8000-000000000004', 'F1 Operador inativo','OPERADOR', false, v_matriz),
    ('f1000000-0000-4000-8000-000000000005', 'F1 Admin legado',    'ADMIN',    false, v_matriz)
  ON CONFLICT (id) DO UPDATE SET perfil = EXCLUDED.perfil, ativo = EXCLUDED.ativo, loja_id = EXCLUDED.loja_id;
END
$setup$;

-- ---------------------------------------------------------------------------
-- T1 — estrutura e exposição
-- ---------------------------------------------------------------------------
DO $t1$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['empresas', 'usuario_vinculos', 'plataforma_admins'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION 'T1: tabela % ausente', t;
    END IF;
    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || t)::regclass) THEN
      RAISE EXCEPTION 'T1: RLS desligada em %', t;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t) THEN
      RAISE EXCEPTION 'T1: % não deveria ter policy na Fase 1', t;
    END IF;
    IF has_table_privilege('anon', 'public.' || t, 'SELECT')
       OR has_table_privilege('authenticated', 'public.' || t, 'SELECT')
       OR has_table_privilege('authenticated', 'public.' || t, 'INSERT')
       OR has_table_privilege('authenticated', 'public.' || t, 'UPDATE')
       OR has_table_privilege('authenticated', 'public.' || t, 'DELETE') THEN
      RAISE EXCEPTION 'T1: % exposta para anon/authenticated', t;
    END IF;
  END LOOP;

  IF (SELECT is_nullable FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'lojas' AND column_name = 'empresa_id') <> 'YES' THEN
    RAISE EXCEPTION 'T1: lojas.empresa_id deveria ser anulável na Fase 1';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.lojas'::regclass AND conname = 'lojas_codigo_key') THEN
    RAISE EXCEPTION 'T1: UNIQUE global lojas_codigo_key não pode ser removida na Fase 1 (D11)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.lojas'::regclass AND conname = 'lojas_empresa_codigo_key') THEN
    RAISE EXCEPTION 'T1: UNIQUE (empresa_id, codigo) ausente';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'lojas' AND indexname = 'idx_lojas_empresa_id') THEN
    RAISE EXCEPTION 'T1: índice idx_lojas_empresa_id ausente';
  END IF;

  RAISE NOTICE 'T1 OK — estrutura e exposição';
END
$t1$;

-- ---------------------------------------------------------------------------
-- T2 — comportamento existente inalterado
-- ---------------------------------------------------------------------------
DO $t2$
BEGIN
  -- Criação de loja sem empresa (fluxo atual de provisionamento) continua válida.
  INSERT INTO public.lojas (id, nome, codigo, ativo)
  VALUES ('f1000000-0000-4000-8000-0000000000a1', 'F1 Loja sem empresa', 'F1-SEM-EMPRESA', true);

  -- Usuário sem vínculo (fluxo atual de funcionários) continua válido.
  INSERT INTO auth.users (id) VALUES ('f1000000-0000-4000-8000-000000000006');
  INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id)
  VALUES ('f1000000-0000-4000-8000-000000000006', 'F1 Sem vínculo', 'OPERADOR', true,
          'a0000001-0000-4000-8000-000000000001');

  IF EXISTS (SELECT 1 FROM pg_policies
             WHERE coalesce(qual, '') || coalesce(with_check, '') ~ '(usuario_vinculos|plataforma_admins|empresas)') THEN
    RAISE EXCEPTION 'T2: alguma policy passou a ler tabelas novas';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname IN ('public', 'internal')
               AND p.prosrc ~ '(usuario_vinculos|plataforma_admins|public\.empresas)') THEN
    RAISE EXCEPTION 'T2: alguma função passou a ler tabelas novas';
  END IF;

  RAISE NOTICE 'T2 OK — escrita legada aceita; nada lê as tabelas novas';
END
$t2$;

-- Leitura de `lojas` e bloqueio das tabelas novas como usuário autenticado real.
-- Os dois formatos de claim (JSON atual e legado por chave) para valer em qualquer versão do auth.
SELECT set_config('request.jwt.claims',
  '{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
SELECT set_config('request.jwt.claim.sub', 'f1000000-0000-4000-8000-000000000002', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

DO $t2b$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.lojas WHERE id = 'a0000001-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'T2b: GERENTE deixou de ler lojas (policy atual alterada?)';
  END IF;

  BEGIN
    PERFORM 1 FROM public.usuario_vinculos;
    RAISE EXCEPTION 'T2b: authenticated conseguiu ler usuario_vinculos';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM 1 FROM public.empresas;
    RAISE EXCEPTION 'T2b: authenticated conseguiu ler empresas';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  RAISE NOTICE 'T2b OK — authenticated: lojas legível; tabelas novas negadas';
END
$t2b$;

RESET ROLE;

-- ---------------------------------------------------------------------------
-- T3 — backfill (script real), equivalência, idempotência
-- ---------------------------------------------------------------------------
\set empresa_nome 'F1 Empresa Teste'
\ir ../supabase/scripts/multiempresa_fase1/20_backfill.sql

DO $t3$
DECLARE
  c_e1 constant uuid := 'e0000001-0000-4000-8000-000000000001';
BEGIN
  IF (SELECT nome FROM public.empresas WHERE id = c_e1) <> 'F1 Empresa Teste' THEN
    RAISE EXCEPTION 'T3: Empresa 1 não criada com o nome informado';
  END IF;
  IF EXISTS (SELECT 1 FROM public.lojas WHERE empresa_id IS DISTINCT FROM c_e1) THEN
    RAISE EXCEPTION 'T3: loja ficou fora da Empresa 1';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.usuario_vinculos
                 WHERE usuario_id = 'f1000000-0000-4000-8000-000000000001'
                   AND papel = 'DONO' AND loja_id IS NULL AND empresa_id = c_e1 AND ativo) THEN
    RAISE EXCEPTION 'T3: DONO deveria ter vínculo (E1, loja NULL)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.usuario_vinculos
                 WHERE usuario_id = 'f1000000-0000-4000-8000-000000000002'
                   AND papel = 'GERENTE' AND loja_id = 'a0000001-0000-4000-8000-000000000001') THEN
    RAISE EXCEPTION 'T3: GERENTE deveria ter vínculo (E1, MATRIZ)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.usuario_vinculos
                 WHERE usuario_id = 'f1000000-0000-4000-8000-000000000004' AND papel = 'OPERADOR' AND NOT ativo) THEN
    RAISE EXCEPTION 'T3: operador inativo deveria ter vínculo inativo (espelho)';
  END IF;
  IF EXISTS (SELECT 1 FROM public.usuario_vinculos WHERE usuario_id = 'f1000000-0000-4000-8000-000000000005') THEN
    RAISE EXCEPTION 'T3: ADMIN legado não pode receber vínculo (D9)';
  END IF;
  IF EXISTS (SELECT 1 FROM public.plataforma_admins) THEN
    RAISE EXCEPTION 'T3: plataforma_admins deveria continuar vazia';
  END IF;

  -- Fonte de verdade intacta.
  IF (SELECT perfil FROM public.usuarios WHERE id = 'f1000000-0000-4000-8000-000000000005') <> 'ADMIN'
     OR (SELECT loja_id FROM public.usuarios WHERE id = 'f1000000-0000-4000-8000-000000000001')
        <> 'a0000001-0000-4000-8000-000000000001' THEN
    RAISE EXCEPTION 'T3: backfill alterou usuarios';
  END IF;

  RAISE NOTICE 'T3 OK — backfill espelha usuarios; ADMIN ignorado';
END
$t3$;

CREATE TEMP TABLE t3_contagem AS SELECT count(*) AS n FROM public.usuario_vinculos;
\ir ../supabase/scripts/multiempresa_fase1/20_backfill.sql
DO $t3b$
BEGIN
  IF (SELECT count(*) FROM public.usuario_vinculos) <> (SELECT n FROM t3_contagem) THEN
    RAISE EXCEPTION 'T3b: backfill não é idempotente';
  END IF;
  RAISE NOTICE 'T3b OK — reexecução não duplica';
END
$t3b$;

-- 30_verify.sql aborta (RAISE) se qualquer checagem falhar.
\ir ../supabase/scripts/multiempresa_fase1/30_verify.sql

-- ---------------------------------------------------------------------------
-- T4 — constraints de vínculo e isolamento estrutural A × B
-- ---------------------------------------------------------------------------
DO $t4$
DECLARE
  c_e1  constant uuid := 'e0000001-0000-4000-8000-000000000001';
  c_e2  constant uuid := 'f1000000-0000-4000-8000-0000000000e2';
  c_a1  constant uuid := 'a0000001-0000-4000-8000-000000000001';
  c_a2  constant uuid := 'f1000000-0000-4000-8000-0000000000a2';
  c_b1  constant uuid := 'f1000000-0000-4000-8000-0000000000b1';
  c_ger constant uuid := 'f1000000-0000-4000-8000-000000000002';
  c_op  constant uuid := 'f1000000-0000-4000-8000-000000000003';
  c_don constant uuid := 'f1000000-0000-4000-8000-000000000001';
BEGIN
  INSERT INTO public.empresas (id, nome) VALUES (c_e2, 'F1 Empresa B');
  INSERT INTO public.lojas (id, nome, codigo, ativo, empresa_id) VALUES
    (c_a2, 'F1 Loja A2', 'F1-A2', true, c_e1),
    (c_b1, 'F1 Loja B1', 'F1-B1', true, c_e2);

  -- GERENTE em 2 lojas da mesma empresa: permitido (D3).
  INSERT INTO public.usuario_vinculos (usuario_id, empresa_id, loja_id, papel)
  VALUES (c_ger, c_e1, c_a2, 'GERENTE');

  -- Vínculo da Empresa A apontando para loja da Empresa B: proibido.
  BEGIN
    INSERT INTO public.usuario_vinculos (usuario_id, empresa_id, loja_id, papel)
    VALUES (c_ger, c_e1, c_b1, 'GERENTE');
    RAISE EXCEPTION 'T4: vínculo A → loja de B foi aceito';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  -- DONO com loja: proibido.
  BEGIN
    INSERT INTO public.usuario_vinculos (usuario_id, empresa_id, loja_id, papel)
    VALUES (c_don, c_e1, c_a2, 'DONO');
    RAISE EXCEPTION 'T4: DONO com loja foi aceito';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- GERENTE/OPERADOR sem loja: proibido.
  BEGIN
    INSERT INTO public.usuario_vinculos (usuario_id, empresa_id, loja_id, papel)
    VALUES (c_ger, c_e1, NULL, 'GERENTE');
    RAISE EXCEPTION 'T4: GERENTE sem loja foi aceito';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- OPERADOR em 2 lojas ativas da mesma empresa: proibido.
  BEGIN
    INSERT INTO public.usuario_vinculos (usuario_id, empresa_id, loja_id, papel)
    VALUES (c_op, c_e1, c_a2, 'OPERADOR');
    RAISE EXCEPTION 'T4: OPERADOR em 2 lojas foi aceito';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- Vínculo duplicado (DONO, loja NULL): proibido (NULLS NOT DISTINCT).
  BEGIN
    INSERT INTO public.usuario_vinculos (usuario_id, empresa_id, loja_id, papel)
    VALUES (c_don, c_e1, NULL, 'DONO');
    RAISE EXCEPTION 'T4: DONO duplicado foi aceito';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- Papel ADMIN não existe em vínculo.
  BEGIN
    INSERT INTO public.usuario_vinculos (usuario_id, empresa_id, loja_id, papel)
    VALUES (c_don, c_e1, NULL, 'ADMIN');
    RAISE EXCEPTION 'T4: papel ADMIN aceito em vínculo';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Mover loja de empresa com vínculo pendurado: proibido (FK composta).
  BEGIN
    UPDATE public.lojas SET empresa_id = c_e2 WHERE id = c_a2;
    RAISE EXCEPTION 'T4: loja com vínculos trocou de empresa';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;

  -- Código repetido na mesma empresa: proibido.
  BEGIN
    INSERT INTO public.lojas (nome, codigo, ativo, empresa_id) VALUES ('dup', 'F1-A2', true, c_e1);
    RAISE EXCEPTION 'T4: código repetido na mesma empresa aceito';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- Código igual em outra empresa: AINDA proibido pela UNIQUE global (transição D11).
  BEGIN
    INSERT INTO public.lojas (nome, codigo, ativo, empresa_id) VALUES ('B com código de A', 'F1-A2', true, c_e2);
    RAISE EXCEPTION 'T4: UNIQUE global de lojas.codigo deveria seguir ativa na Fase 1';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- Status/vigência/limites inválidos.
  BEGIN
    INSERT INTO public.empresas (nome, status) VALUES ('x', 'ATIVO');
    RAISE EXCEPTION 'T4: status inválido aceito';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.empresas (nome, vigencia_inicio, vigencia_fim) VALUES ('x', '2026-10-02', '2026-10-01');
    RAISE EXCEPTION 'T4: vigência invertida aceita';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.empresas (nome, cnpj) VALUES ('x', '12.345.678/0001-90');
    RAISE EXCEPTION 'T4: CNPJ com pontuação aceito';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- Limpa o cenário A×B para o teste de rollback (que exige tenant único).
  DELETE FROM public.usuario_vinculos WHERE loja_id = c_a2;
  DELETE FROM public.lojas WHERE id IN (c_a2, c_b1);
  DELETE FROM public.empresas WHERE id = c_e2;

  RAISE NOTICE 'T4 OK — constraints de vínculo e isolamento estrutural A × B';
END
$t4$;

-- ---------------------------------------------------------------------------
-- T5 — rollback do backfill e da migration
-- ---------------------------------------------------------------------------
\ir ../supabase/scripts/multiempresa_fase1/80_rollback_backfill.sql

DO $t5$
BEGIN
  IF EXISTS (SELECT 1 FROM public.usuario_vinculos) OR EXISTS (SELECT 1 FROM public.empresas)
     OR EXISTS (SELECT 1 FROM public.lojas WHERE empresa_id IS NOT NULL) THEN
    RAISE EXCEPTION 'T5: rollback do backfill incompleto';
  END IF;
  IF (SELECT count(*) FROM public.usuarios WHERE id::text LIKE 'f1000000-%') <> 6 THEN
    RAISE EXCEPTION 'T5: rollback do backfill tocou usuarios';
  END IF;
  RAISE NOTICE 'T5 OK — rollback do backfill';
END
$t5$;

\ir ../supabase/scripts/multiempresa_fase1/90_rollback_migration.sql

DO $t5b$
BEGIN
  IF to_regclass('public.usuario_vinculos') IS NOT NULL OR to_regclass('public.empresas') IS NOT NULL
     OR to_regclass('public.plataforma_admins') IS NOT NULL
     OR EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'lojas' AND column_name = 'empresa_id') THEN
    RAISE EXCEPTION 'T5b: rollback da migration incompleto';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.lojas'::regclass AND conname = 'lojas_codigo_key') THEN
    RAISE EXCEPTION 'T5b: rollback removeu a UNIQUE global original';
  END IF;
  RAISE NOTICE 'T5b OK — rollback da migration';
END
$t5b$;

ROLLBACK;
