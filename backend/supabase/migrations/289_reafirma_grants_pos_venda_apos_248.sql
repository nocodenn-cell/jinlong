-- Migration 289 (era 314) — Reafirma o estado final de grants das RPCs criadas
-- pela `248_devolver_ou_trocar_venda.sql`, numa posição que roda DEPOIS dela.
--
-- ⚠️ RENOMEADA EM 2026-08-07. Nasceu como `20260807002147_314_...` e caiu no
-- MESMO defeito que existe para corrigir: prefixo de timestamp ordena ANTES de
-- '248_' ('2026' < '248' no 2º caractere), então ela rodava antes das funções
-- existirem e abortava a reconstrução na própria guarda:
--
--     MIGRATION_314: devolver_ou_trocar_venda ausente — a 248 deveria ter
--     rodado antes desta migration
--
-- Renomeada para o prefixo numérico 289, que ordena depois de 248, 269, 270,
-- 288 E de qualquer timestamp '2026...'. O ledger de produção foi atualizado
-- na mesma operação (version '20260807002147' → '289'); o conteúdo é idêntico e
-- idempotente, e já estava aplicado.
--
-- POR QUE ESTA MIGRATION EXISTE
--
-- A ordenação das migrations é lexicográfica pelo nome do arquivo. Três arquivos
-- de grant nasceram com prefixo de timestamp e, por isso, ordenam ANTES da
-- migration que cria as funções que eles restringem — '2026...' < '248_' porque
-- no 2º caractere '0' < '4':
--
--   20260717031639_248_fix_anon_grant_drift.sql            → devolver_ou_trocar_venda
--   20260717031919_248_fix_quantidade_devolvida_grant.sql  → quantidade_devolvida_item_venda
--   20260717031938_248_fix_quantidade_devolvida_anon_grant.sql → idem
--
-- Como REVOKE/GRANT não aceitam `IF EXISTS`, a reconstrução limpa abortava:
--
--   ERROR: function public.devolver_ou_trocar_venda(uuid, text, text, text,
--          jsonb, numeric, text, uuid, uuid) does not exist (SQLSTATE 42883)
--
-- Comprovado pelo job "Supabase local RLS smoke" (run 31134056259), que
-- reconstrói o banco a partir das migrations. Em produção nunca falhou porque lá
-- as funções já existiam — aplicadas fora de ordem.
--
-- Os três arquivos passaram a guardar suas operações atrás de `to_regprocedure`,
-- virando no-op na posição em que a função ainda não existe. Esta migration é a
-- outra metade da correção: sem ela, a reconstrução limpa terminaria com as
-- funções criadas e SEM as restrições de acesso — trocando um erro barulhento por
-- uma brecha silenciosa. `anon` poderia executar RPC de devolução.
--
-- Não altera o comportamento em produção: lá os grants já estão neste estado.

DO $reafirma_grants_314$
DECLARE
  v_devolver text :=
    'public.devolver_ou_trocar_venda(uuid, text, text, text, jsonb, numeric, text, uuid, uuid)';
  v_quantidade text := 'public.quantidade_devolvida_item_venda(uuid)';
BEGIN
  IF to_regprocedure(v_devolver) IS NULL THEN
    RAISE EXCEPTION
      'MIGRATION_314: devolver_ou_trocar_venda ausente — a 248 deveria ter rodado antes desta migration';
  END IF;
  IF to_regprocedure(v_quantidade) IS NULL THEN
    RAISE EXCEPTION
      'MIGRATION_314: quantidade_devolvida_item_venda ausente — a 248 deveria ter rodado antes desta migration';
  END IF;

  -- devolver_ou_trocar_venda: apenas authenticated/service_role.
  EXECUTE 'REVOKE ALL ON FUNCTION ' || v_devolver || ' FROM PUBLIC';
  EXECUTE 'REVOKE EXECUTE ON FUNCTION ' || v_devolver || ' FROM anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION ' || v_devolver || ' TO authenticated, service_role';

  -- quantidade_devolvida_item_venda: idem.
  EXECUTE 'REVOKE ALL ON FUNCTION ' || v_quantidade || ' FROM PUBLIC';
  EXECUTE 'REVOKE EXECUTE ON FUNCTION ' || v_quantidade || ' FROM anon';
  EXECUTE 'GRANT EXECUTE ON FUNCTION ' || v_quantidade || ' TO authenticated, service_role';
END
$reafirma_grants_314$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Prova viva: anon fora, authenticated dentro — nas duas RPCs.
-- ═══════════════════════════════════════════════════════════════════════════
DO $verify_314$
DECLARE
  v_devolver text :=
    'public.devolver_ou_trocar_venda(uuid, text, text, text, jsonb, numeric, text, uuid, uuid)';
  v_quantidade text := 'public.quantidade_devolvida_item_venda(uuid)';
BEGIN
  IF has_function_privilege('anon', v_devolver, 'EXECUTE') THEN
    RAISE EXCEPTION 'MIGRATION_314: anon ainda executa devolver_ou_trocar_venda';
  END IF;
  IF has_function_privilege('anon', v_quantidade, 'EXECUTE') THEN
    RAISE EXCEPTION 'MIGRATION_314: anon ainda executa quantidade_devolvida_item_venda';
  END IF;
  IF NOT has_function_privilege('authenticated', v_devolver, 'EXECUTE') THEN
    RAISE EXCEPTION 'MIGRATION_314: authenticated perdeu EXECUTE em devolver_ou_trocar_venda';
  END IF;
  IF NOT has_function_privilege('authenticated', v_quantidade, 'EXECUTE') THEN
    RAISE EXCEPTION 'MIGRATION_314: authenticated perdeu EXECUTE em quantidade_devolvida_item_venda';
  END IF;
END
$verify_314$;

NOTIFY pgrst, 'reload schema';
