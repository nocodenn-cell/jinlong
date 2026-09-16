-- SEC-04 (P0) — finalizar_venda_transacional_canonica_v2: token de gerente sem
-- vínculo de loja. Correção por convergência com produção, não por remendo.
--
-- ESTADO REAL
-- -----------
-- Produção (leitura de pg_proc em 2026-09-16): TODOS os overloads de
-- `finalizar_venda_transacional_canonica_v2` e `_v3` têm corpo
-- `RAISE EXCEPTION 'LEGACY_DISABLED_USE_V4'` e nenhum é executável por
-- anon/authenticated. Nenhum consumidor no app, Edge Functions ou PDV local.
--
-- DRIFT NO REPOSITÓRIO
-- --------------------
-- A ordem das migrations NÃO reproduz esse estado: 20260619234314 e
-- 20260620020436 bloqueiam a v2, mas 20260621002500_229 e 20260621003100_235
-- (posteriores) recriam `v2(uuid,uuid,uuid,text,numeric,numeric,numeric,jsonb,
-- jsonb,text,numeric,boolean,text)` com corpo VIVO — SECURITY DEFINER,
-- consumindo `tokens_desconto_gerente` só por token/usado/expiração, sem loja.
-- Um banco reconstruído a partir do repositório (CI, staging, novo cliente)
-- sobe com o P0 do SEC-04 ativo para service_role.
--
-- CORREÇÃO
-- --------
-- Reaplica o stub LEGACY_DISABLED_USE_V4 em todo overload v2/v3 cujo corpo não
-- seja o stub, preservando assinatura, nomes/defaults de parâmetros e tipo de
-- retorno (lidos do catálogo — CREATE OR REPLACE exige que batam). Remove
-- EXECUTE de PUBLIC/anon/authenticated. Em produção é no-op de comportamento.
-- Não faz DROP: `database.types.ts` e o teste de negação em test:rls-scope
-- continuam válidos.
--
-- Idempotente e determinística: depende só do catálogo, não da ordem histórica.

BEGIN;

DO $converge$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid,
           p.oid::regprocedure AS sig,
           pg_get_function_arguments(p.oid) AS args,
           pg_get_function_result(p.oid) AS result,
           position('LEGACY_DISABLED_USE_V4' IN p.prosrc) > 0 AS ja_stub
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('finalizar_venda_transacional_canonica_v2',
                         'finalizar_venda_transacional_canonica_v3')
  LOOP
    IF NOT r.ja_stub THEN
      EXECUTE format(
        'CREATE OR REPLACE FUNCTION public.%I(%s) RETURNS %s LANGUAGE plpgsql '
        'SECURITY INVOKER SET search_path TO ''public'' AS '
        '$stub$ BEGIN RAISE EXCEPTION ''LEGACY_DISABLED_USE_V4''; END; $stub$',
        (SELECT proname FROM pg_proc WHERE oid = r.oid), r.args, r.result
      );
      RAISE NOTICE 'SEC-04: % convertida para stub LEGACY_DISABLED_USE_V4', r.sig;
    END IF;

    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;
END
$converge$;

DO $verify$
DECLARE
  v_vivos text;
BEGIN
  SELECT string_agg(p.oid::regprocedure::text, ', ')
    INTO v_vivos
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.proname IN ('finalizar_venda_transacional_canonica_v2',
                       'finalizar_venda_transacional_canonica_v3')
     AND (position('LEGACY_DISABLED_USE_V4' IN p.prosrc) = 0
          OR position('tokens_desconto_gerente' IN p.prosrc) > 0
          OR has_function_privilege('authenticated', p.oid, 'EXECUTE')
          OR has_function_privilege('anon', p.oid, 'EXECUTE'));

  IF v_vivos IS NOT NULL THEN
    RAISE EXCEPTION 'SEC04_V2_V3_AINDA_VIVAS: %', v_vivos;
  END IF;
END
$verify$;

NOTIFY pgrst, 'reload schema';

COMMIT;
