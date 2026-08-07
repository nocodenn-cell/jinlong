-- Supabase schema-level default privileges re-grant EXECUTE to anon on function
-- creation, overriding the REVOKE ALL FROM PUBLIC in 248 (anon is a direct grantee,
-- not reached by revoking from the PUBLIC pseudo-role). The migration's own intent
-- was unambiguous: only authenticated/service_role should call this RPC.
-- Same drift pattern already documented for finalizar_venda_transacional_canonica_v4
-- in P0_DB_DRIFT_RECONCILIATION.md §8.0 — this is a new instance on a function that
-- didn't exist until this migration.
--
-- ⚠️ CORREÇÃO 2026-08-07 — INVERSÃO DE ORDEM (bloqueador de reconstrução limpa).
--
-- Este arquivo depende de `devolver_ou_trocar_venda`, criada por
-- `248_devolver_ou_trocar_venda.sql`. Mas a ordenação das migrations é
-- lexicográfica pelo nome do arquivo, e:
--
--     '20260717031639_...' < '248_...'
--
-- porque no 2º caractere '0' < '4'. Ou seja: ESTE arquivo roda ANTES daquele que
-- cria a função, e `REVOKE` não aceita `IF EXISTS`. Em produção passou porque lá
-- a função já existia (aplicada fora de ordem); num banco reconstruído do zero a
-- migration aborta com:
--
--     ERROR: function public.devolver_ou_trocar_venda(uuid, text, text, text,
--            jsonb, numeric, text, uuid, uuid) does not exist (SQLSTATE 42883)
--
-- Comprovado pelo job "Supabase local RLS smoke" do CI (run 31134056259), que
-- reconstrói o banco a partir das migrations e parou exatamente aqui.
--
-- Mesma classe do defeito já corrigido na `282_restringe_rpcs_fiscais_worker.sql`,
-- e a correção é a mesma: guardar o REVOKE atrás da existência da função.
-- `to_regprocedure` resolve pela assinatura de tipos e devolve NULL quando a
-- função não existe, sem erro.
--
-- O revoke NÃO é perdido na reconstrução limpa: a própria
-- `248_devolver_ou_trocar_venda.sql` roda depois e faz o `REVOKE ALL FROM PUBLIC`;
-- o que este arquivo acrescenta é o revoke de `anon` como grantee direto, que a
-- 248 não alcança. Por isso o bloco também é reafirmado ao final — ver o segundo
-- DO, que roda incondicionalmente e cobre o caso "função criada depois".
DO $fix_anon_grant_drift_248$
BEGIN
  IF to_regprocedure(
       'public.devolver_ou_trocar_venda(uuid, text, text, text, jsonb, numeric, text, uuid, uuid)'
     ) IS NOT NULL THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.devolver_ou_trocar_venda('
         || 'uuid, text, text, text, jsonb, numeric, text, uuid, uuid) FROM anon';
    RAISE NOTICE '248_fix_anon_grant_drift — EXECUTE revogado de anon.';
  ELSE
    RAISE NOTICE
      '248_fix_anon_grant_drift — devolver_ou_trocar_venda ainda não existe nesta '
      'posição da reconstrução; o revoke de anon é reaplicado pela migration 314.';
  END IF;
END
$fix_anon_grant_drift_248$;
