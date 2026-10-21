-- PIN do operador (P0): RLS/grants, definir/resetar/status, cache por loja, bloqueio 5/10. Dados fictícios, ROLLBACK no fim.
BEGIN;
CREATE TEMP TABLE _ctx (k text PRIMARY KEY, v uuid);
GRANT ALL ON _ctx TO authenticated, service_role;
DO $setup$
DECLARE
  ea uuid := 'd0000000-0000-4000-8000-00000000000a'; eb uuid := 'd0000000-0000-4000-8000-00000000000b';
  la uuid := 'd1000000-0000-4000-8000-00000000000a'; lb uuid := 'd1000000-0000-4000-8000-00000000000b';
  dona uuid := 'd2000000-0000-4000-8000-000000000001'; gea uuid := 'd2000000-0000-4000-8000-000000000002';
  opa uuid := 'd2000000-0000-4000-8000-000000000003'; geb uuid := 'd2000000-0000-4000-8000-000000000004';
  opb uuid := 'd2000000-0000-4000-8000-000000000005'; u record;
BEGIN
  INSERT INTO public.empresas (id, nome, plano, status, vigencia_inicio) VALUES (ea,'PIN Teste A','basico','ATIVA',now()),(eb,'PIN Teste B','basico','ATIVA',now());
  INSERT INTO public.lojas (id, nome, codigo, ativo, empresa_id) VALUES (la,'PIN Loja A','PINA',true,ea),(lb,'PIN Loja B','PINB',true,eb);
  INSERT INTO auth.users (id) VALUES (dona),(gea),(opa),(geb),(opb) ON CONFLICT DO NOTHING;
  INSERT INTO public.usuarios (id,nome,perfil,ativo,loja_id) VALUES (dona,'Dona A','DONO',true,la),(gea,'Gerente A','GERENTE',true,la),
    (opa,'Caixa A','OPERADOR',true,la),(geb,'Gerente B','GERENTE',true,lb),(opb,'Caixa B','OPERADOR',true,lb);
  FOR u IN SELECT * FROM (VALUES (dona,ea,la,'DONO'),(gea,ea,la,'GERENTE'),(opa,ea,la,'OPERADOR'),(geb,eb,lb,'GERENTE'),(opb,eb,lb,'OPERADOR')) t(us,em,lo,pa) LOOP
    DELETE FROM public.usuario_vinculos WHERE usuario_id = u.us;
    INSERT INTO public.usuario_vinculos (usuario_id, empresa_id, loja_id, papel, ativo) VALUES (u.us, u.em, CASE WHEN u.pa='DONO' THEN NULL ELSE u.lo END, u.pa, true);
  END LOOP;
  INSERT INTO _ctx VALUES ('la',la),('lb',lb),('dona',dona),('gea',gea),('opa',opa),('geb',geb),('opb',opb);
END $setup$;
CREATE FUNCTION pg_temp.c(k text) RETURNS uuid LANGUAGE sql AS $f$ SELECT v FROM _ctx WHERE _ctx.k = $1 $f$;
CREATE FUNCTION pg_temp.ok(cond boolean, rotulo text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN IF cond IS NOT TRUE THEN RAISE EXCEPTION 'FALHOU: %', rotulo; END IF; RAISE NOTICE 'ok: %', rotulo; END $f$;
CREATE FUNCTION pg_temp.como(u text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN PERFORM set_config('request.jwt.claim.sub', coalesce(pg_temp.c(u)::text, ''), true);
      PERFORM set_config('request.jwt.claims', json_build_object('sub', pg_temp.c(u), 'role', 'authenticated')::text, true); END $f$;

GRANT EXECUTE ON FUNCTION pg_temp.c(text), pg_temp.ok(boolean,text), pg_temp.como(text) TO PUBLIC;
SELECT pg_temp.ok(public.pdv_pin_obvio('1234') AND public.pdv_pin_obvio('0000') AND public.pdv_pin_obvio('12a4')
  AND public.pdv_pin_obvio('12345') AND NOT public.pdv_pin_obvio('7391'), 'PINs óbvios/formato recusados; 7391 aceito');
SELECT pg_temp.ok(coalesce((SELECT exigir_pin_operador FROM public.pdv_config LIMIT 1), false) = false, 'flag exigir_pin_operador nasce desligada');

-- operador define o próprio PIN (hash vindo do servidor)
SELECT pg_temp.como('opa');
SET LOCAL ROLE authenticated;
SELECT public.definir_meu_pin_pdv(repeat('a',64), repeat('b',32), 120000);
DO $$ BEGIN PERFORM public.definir_meu_pin_pdv(repeat('a',64), repeat('b',32), 1000); RAISE EXCEPTION 'FALHOU: aceitou 1000 iterações';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok: < 100k iterações recusado'; END $$;
DO $$ BEGIN PERFORM 1 FROM public.usuario_pin; RAISE EXCEPTION 'FALHOU: authenticated leu usuario_pin';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok: authenticated não lê usuario_pin (hash)'; END $$;
DO $$ BEGIN PERFORM 1 FROM public.pdv_operadores_da_loja(pg_temp.c('la')); RAISE EXCEPTION 'FALHOU: authenticated chamou cache';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok: authenticated não chama pdv_operadores_da_loja'; END $$;
SELECT pg_temp.ok((SELECT tem_pin AND eu FROM public.status_pin_equipe_pdv() WHERE usuario_id = pg_temp.c('opa')), 'status do próprio PIN');
SELECT pg_temp.ok((SELECT count(*) FROM public.status_pin_equipe_pdv()) = 1, 'operador só vê o próprio status');
DO $$ BEGIN PERFORM public.resetar_pin_operador_pdv(pg_temp.c('opb')); RAISE EXCEPTION 'FALHOU: operador resetou PIN';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok: operador não reseta PIN'; END $$;
RESET ROLE;

-- gerente de OUTRA empresa não reseta; gerente da loja reseta
SELECT pg_temp.como('geb');
SET LOCAL ROLE authenticated;
DO $$ BEGIN PERFORM public.resetar_pin_operador_pdv(pg_temp.c('opa')); RAISE EXCEPTION 'FALHOU: gerente B resetou PIN da loja A';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok: gerente de outra empresa não reseta'; END $$;
RESET ROLE;

-- cache (service_role): só a loja; dono (vínculo de empresa) entra; sem PIN = hash nulo
SET LOCAL ROLE service_role;
SELECT pg_temp.ok((SELECT count(*) FROM public.pdv_operadores_da_loja(pg_temp.c('la'))) = 3, 'cache loja A: dona+gerente+caixa');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.pdv_operadores_da_loja(pg_temp.c('la')) WHERE usuario_id IN (pg_temp.c('geb'), pg_temp.c('opb'))), 'cache sem gente da empresa B');
SELECT pg_temp.ok((SELECT pin_hash IS NOT NULL FROM public.pdv_operadores_da_loja(pg_temp.c('la')) WHERE usuario_id = pg_temp.c('opa')), 'cache traz hash de quem tem PIN');
-- bloqueio: 4 erros ok, 5º bloqueia 5 min, acerto zera, 10 erros = só gerente
SELECT public.pdv_pin_registrar_tentativa(pg_temp.c('opa'), false) FROM generate_series(1,4);
SELECT pg_temp.ok((SELECT pin_bloqueado_ate IS NULL FROM public.usuario_pin WHERE usuario_id = pg_temp.c('opa')), '4 erros: ainda livre');
SELECT pg_temp.ok((SELECT bloqueado_ate > now() + interval '4 minutes' AND bloqueado_ate < now() + interval '6 minutes' FROM public.pdv_pin_registrar_tentativa(pg_temp.c('opa'), false)), '5º erro: bloqueio de 5 min');
SELECT pg_temp.ok((SELECT tentativas = 0 AND bloqueado_ate IS NULL FROM public.pdv_pin_registrar_tentativa(pg_temp.c('opa'), true)), 'acerto zera');
SELECT public.pdv_pin_registrar_tentativa(pg_temp.c('opa'), false) FROM generate_series(1,9);
SELECT pg_temp.ok((SELECT bloqueado_ate = 'infinity' FROM public.pdv_pin_registrar_tentativa(pg_temp.c('opa'), false)), '10 erros: bloqueado até o gerente');
RESET ROLE;

SELECT pg_temp.como('gea');
SET LOCAL ROLE authenticated;
SELECT pg_temp.ok((SELECT bloqueado FROM public.status_pin_equipe_pdv() WHERE usuario_id = pg_temp.c('opa')), 'gerente vê bloqueio do caixa');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM public.status_pin_equipe_pdv() WHERE usuario_id IN (pg_temp.c('geb'), pg_temp.c('opb'))), 'gerente A não vê equipe da empresa B');
SELECT public.resetar_pin_operador_pdv(pg_temp.c('opa'));
SELECT pg_temp.ok(NOT (SELECT tem_pin FROM public.status_pin_equipe_pdv() WHERE usuario_id = pg_temp.c('opa')), 'reset do gerente apaga PIN e bloqueio');
RESET ROLE;
SELECT pg_temp.ok((SELECT count(*) FROM public.pdv_operador_eventos WHERE usuario_id = pg_temp.c('opa') AND tipo IN ('PIN_DEFINIDO','PIN_RESETADO')) = 2, 'auditoria PIN_DEFINIDO + PIN_RESETADO');
ROLLBACK;
