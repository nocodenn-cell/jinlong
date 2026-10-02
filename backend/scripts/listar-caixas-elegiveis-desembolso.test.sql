-- PR-2D / C3 — public.listar_caixas_elegiveis_desembolso(): escopo, perfis e EQUIVALÊNCIA com o resolvedor.
--
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f backend/scripts/listar-caixas-elegiveis-desembolso.test.sql
--
-- Dados sintéticos (3 lojas); tudo dentro de uma transação com ROLLBACK.
--   loja 1: gerente, dono, admin, operadores 11/12/13 (11 e 12 ABERTO, 13 FECHADO)
--   loja 2: gerente + operador 24 (ABERTO) — nunca pode aparecer para a loja 1
--   loja 3: gerente, sem nenhum caixa (conjunto vazio)

\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.lid(l int) RETURNS uuid LANGUAGE sql AS $$ SELECT ('f8000001-0000-4000-8000-0000000000' || lpad(l::text, 2, '0'))::uuid $$;
CREATE FUNCTION pg_temp.uid(n int) RETURNS uuid LANGUAGE sql AS $$ SELECT ('f8000002-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid $$;

CREATE FUNCTION pg_temp.assert(p_ok boolean, p_msg text) RETURNS void LANGUAGE plpgsql AS
$$ BEGIN
  IF p_ok IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', p_msg; END IF;
  RAISE NOTICE 'OK   %', p_msg;
END $$;

CREATE FUNCTION pg_temp.mk_user(n int, p_nome text, p_perfil text, l int) RETURNS void LANGUAGE plpgsql AS
$$ BEGIN
  INSERT INTO auth.users (id) VALUES (pg_temp.uid(n)) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.usuarios (id, nome, perfil, ativo, loja_id) VALUES (pg_temp.uid(n), p_nome, p_perfil, true, pg_temp.lid(l))
  ON CONFLICT (id) DO UPDATE SET nome = p_nome, perfil = p_perfil, ativo = true, loja_id = pg_temp.lid(l);
END $$;

DO $setup$
DECLARE l int;
BEGIN
  FOR l IN 1..3 LOOP
    INSERT INTO public.lojas (id, nome, codigo, ativo) VALUES (pg_temp.lid(l), 'LCE Loja ' || l, 'LCEL' || l, true)
    ON CONFLICT (id) DO UPDATE SET ativo = true;
  END LOOP;
  PERFORM pg_temp.mk_user(1,  'LCE Gerente 1',  'GERENTE',  1);
  PERFORM pg_temp.mk_user(2,  'LCE Dono 1',     'DONO',     1);
  PERFORM pg_temp.mk_user(3,  'LCE Admin 1',    'ADMIN',    1);
  PERFORM pg_temp.mk_user(11, 'LCE Op 11',      'OPERADOR', 1);
  PERFORM pg_temp.mk_user(12, 'LCE Op 12',      'OPERADOR', 1);
  PERFORM pg_temp.mk_user(13, 'LCE Op 13',      'OPERADOR', 1);
  PERFORM pg_temp.mk_user(21, 'LCE Gerente 2',  'GERENTE',  2);
  PERFORM pg_temp.mk_user(24, 'LCE Op 24',      'OPERADOR', 2);
  PERFORM pg_temp.mk_user(31, 'LCE Gerente 3',  'GERENTE',  3);
END
$setup$;

-- Datas de abertura distintas só para a ordem de exibição ser verificável.
INSERT INTO public.caixas (operador_id, status, data_abertura, valor_inicial, loja_id) VALUES
  (pg_temp.uid(11), 'ABERTO', now() - interval '3 hours', 10, pg_temp.lid(1)),
  (pg_temp.uid(12), 'ABERTO', now() - interval '2 hours', 10, pg_temp.lid(1)),
  (pg_temp.uid(13), 'ABERTO', now() - interval '4 hours', 10, pg_temp.lid(1)),
  (pg_temp.uid(24), 'ABERTO', now() - interval '1 hours', 10, pg_temp.lid(2));
UPDATE public.caixas
   SET status = 'FECHADO', data_fechamento = now(), valor_fechamento = 10, fechamento_diferenca = 0
 WHERE operador_id = pg_temp.uid(13);

CREATE FUNCTION pg_temp.cx(n int) RETURNS uuid LANGUAGE sql AS
$$ SELECT id FROM public.caixas WHERE operador_id = pg_temp.uid(n) $$;

-- Lista como o usuário n (identidade só por auth.uid()); NULL = sem sessão.
CREATE FUNCTION pg_temp.lista(n int) RETURNS uuid[] LANGUAGE plpgsql AS
$$ DECLARE v uuid[];
BEGIN
  PERFORM set_config('request.jwt.claim.sub', COALESCE(pg_temp.uid(n)::text, ''), true);
  SELECT COALESCE(array_agg(id ORDER BY id), ARRAY[]::uuid[]) INTO v FROM public.listar_caixas_elegiveis_desembolso();
  RETURN v;
END $$;

-- Conjunto que o resolvedor aceita: testa CADA caixa do universo de teste como `p_caixa_id` explícito.
CREATE FUNCTION pg_temp.aceitos(n int) RETURNS uuid[] LANGUAGE plpgsql AS
$$ DECLARE r record; v uuid[] := ARRAY[]::uuid[];
BEGIN
  FOR r IN SELECT id FROM public.caixas WHERE loja_id IN (pg_temp.lid(1), pg_temp.lid(2), pg_temp.lid(3)) ORDER BY id LOOP
    BEGIN
      PERFORM internal.resolver_caixa_pagador(r.id, pg_temp.uid(n), 'LCE');
      v := v || r.id;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END LOOP;
  RETURN v;
END $$;

CREATE FUNCTION pg_temp.ord(a uuid[]) RETURNS uuid[] LANGUAGE sql AS
$$ SELECT COALESCE(array_agg(x ORDER BY x), ARRAY[]::uuid[]) FROM unnest(a) x $$;

-- 1) operador vê apenas o seu caixa elegível
SELECT pg_temp.assert(pg_temp.lista(11) = ARRAY[pg_temp.cx(11)], '1. operador 11 vê só o próprio caixa');
SELECT pg_temp.assert(pg_temp.lista(12) = ARRAY[pg_temp.cx(12)], '1. operador 12 vê só o próprio caixa');

-- 2/6) gerente vê os caixas elegíveis da própria loja (múltiplos)
SELECT pg_temp.assert(pg_temp.lista(1) = pg_temp.ord(ARRAY[pg_temp.cx(11), pg_temp.cx(12)]),
  '2/6. gerente da loja 1 vê os 2 caixas abertos da loja (múltiplos elegíveis)');

-- 3) DONO/ADMIN respeitam a loja do usuário
SELECT pg_temp.assert(pg_temp.lista(2) = pg_temp.lista(1), '3. DONO da loja 1 vê exatamente o conjunto da loja 1');
SELECT pg_temp.assert(pg_temp.lista(3) = pg_temp.lista(1), '3. ADMIN da loja 1 vê exatamente o conjunto da loja 1');

-- 4) outra loja nunca aparece
SELECT pg_temp.assert(NOT (pg_temp.cx(24) = ANY (pg_temp.lista(1))), '4. caixa da loja 2 nunca aparece para a loja 1');
SELECT pg_temp.assert(pg_temp.lista(21) = ARRAY[pg_temp.cx(24)], '4. gerente da loja 2 vê só o caixa da loja 2');
SELECT pg_temp.assert(pg_temp.lista(24) = ARRAY[pg_temp.cx(24)], '4. operador 24 vê só o próprio caixa');

-- 5) caixa FECHADO nunca aparece
SELECT pg_temp.assert(NOT (pg_temp.cx(13) = ANY (pg_temp.lista(1))), '5. caixa FECHADO fora da lista do gerente');
SELECT pg_temp.assert(pg_temp.lista(13) = ARRAY[]::uuid[], '5. operador com caixa FECHADO recebe vazio');

-- 7) zero caixas → vazio
SELECT pg_temp.assert(pg_temp.lista(31) = ARRAY[]::uuid[], '7. gerente de loja sem caixas recebe conjunto vazio');

-- 8) sem sessão → vazio (identidade ausente e identidade sem linha em usuarios)
SELECT pg_temp.assert(pg_temp.lista(NULL) = ARRAY[]::uuid[], '8. sem sessão (auth.uid() nulo) retorna vazio');
DO $$ DECLARE v int; BEGIN
  PERFORM set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  SELECT count(*) INTO v FROM public.listar_caixas_elegiveis_desembolso();
  PERFORM pg_temp.assert(v = 0, '8. identidade sem linha em usuarios retorna vazio');
END $$;

-- ordem de exibição: abertura ASC (op11 abriu antes de op12)
DO $$ DECLARE v uuid[]; BEGIN
  PERFORM set_config('request.jwt.claim.sub', pg_temp.uid(1)::text, true);
  SELECT array_agg(id) INTO v FROM public.listar_caixas_elegiveis_desembolso();
  PERFORM pg_temp.assert(v = ARRAY[pg_temp.cx(11), pg_temp.cx(12)], 'ordem: data_abertura ASC');
END $$;

-- nome do operador: usuarios.nome (mesmo valor que a action usava)
DO $$ DECLARE v text; BEGIN
  PERFORM set_config('request.jwt.claim.sub', pg_temp.uid(1)::text, true);
  SELECT operador_nome INTO v FROM public.listar_caixas_elegiveis_desembolso() WHERE id = pg_temp.cx(11);
  PERFORM pg_temp.assert(v = 'LCE Op 11', 'operador_nome = usuarios.nome do operador do caixa');
END $$;

-- 9) ACL
SELECT pg_temp.assert(NOT has_function_privilege('anon', 'public.listar_caixas_elegiveis_desembolso()', 'EXECUTE'), '9. anon não possui EXECUTE');
SELECT pg_temp.assert(NOT has_function_privilege('public', 'public.listar_caixas_elegiveis_desembolso()', 'EXECUTE'), '9. PUBLIC não possui EXECUTE');
SELECT pg_temp.assert(has_function_privilege('authenticated', 'public.listar_caixas_elegiveis_desembolso()', 'EXECUTE'), '9. authenticated possui EXECUTE');
SELECT pg_temp.assert(has_function_privilege('service_role', 'public.listar_caixas_elegiveis_desembolso()', 'EXECUTE'), '9. service_role possui EXECUTE');
SELECT pg_temp.assert(
  (SELECT p.prosecdef FROM pg_proc p WHERE p.oid = 'public.listar_caixas_elegiveis_desembolso()'::regprocedure),
  '9. SECURITY DEFINER');

-- 10) EQUIVALÊNCIA com internal.resolver_caixa_pagador, para todos os perfis/lojas do teste.
DO $eq$
DECLARE n int; v_rpc uuid[]; v_res uuid[];
BEGIN
  FOREACH n IN ARRAY ARRAY[1, 2, 3, 11, 12, 13, 21, 24, 31] LOOP
    v_rpc := pg_temp.lista(n);
    v_res := pg_temp.aceitos(n);
    PERFORM pg_temp.assert(v_rpc <@ v_res, format('10. usuário %s: todo caixa da RPC é aceito pelo resolvedor', n));
    PERFORM pg_temp.assert(v_res <@ v_rpc, format('10. usuário %s: nenhum caixa aceito pelo resolvedor falta na RPC (nem rejeitado aparece)', n));
  END LOOP;
END
$eq$;

ROLLBACK;
