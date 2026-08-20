-- ============================================================================
-- P1-2 (conclusão): fecha o furo de RLS que sobrou em
-- `relatorio_consistencia_vendas(uuid, uuid, timestamptz, timestamptz)` e em
-- `verificar_consistencia_venda(uuid)`.
--
-- ---------------------------------------------------------------------------
-- O que estava errado
--
-- `20260818000001_revoke_relatorio_consistencia_vendas.sql` executou apenas
--
--   REVOKE EXECUTE ON FUNCTION ... FROM authenticated;
--
-- No PostgreSQL toda função nasce com EXECUTE concedido a PUBLIC. Revogar de
-- `authenticated` não remove a concessão de PUBLIC, e `authenticated` continua
-- executando a função POR HERANÇA de PUBLIC. O REVOKE não teve efeito prático.
--
-- Provado no banco local, comparando as duas sobrecargas:
--
--   3 args → proacl = {postgres=X/postgres, service_role=X/postgres}
--   4 args → proacl = {=X/postgres,         postgres=X/postgres}
--                      ^^ entrada com grantee vazio = PUBLIC
--
--   has_function_privilege('authenticated', <4 args>, 'EXECUTE') = true
--
-- ---------------------------------------------------------------------------
-- Por que isso importa
--
-- É a mesma classe de vazamento documentada na 20260814015032: a função é
-- SECURITY DEFINER, não valida ator, perfil nem loja, e devolve agregados de
-- vendas. Com EXECUTE via PUBLIC, um GERENTE da loja B — que enxerga 0 linhas
-- em `vendas` pela RLS — lê os agregados da loja A sem precisar de UUID algum.
--
-- Em `verificar_consistencia_venda(uuid)` o alcance é mais estreito (exige o
-- UUID da venda) mas a classe é a mesma: SECURITY DEFINER sem guarda de ator,
-- perfil ou loja, lendo `vendas` por id.
--
-- Detectado pelo GATE 9 de `financial-adversarial-gates.test.sql`
-- (`GATE9_DIAGNOSTICO_EXPOSTO`), que ficou sem rodar enquanto os GATES 12–23
-- estiveram truncados no repositório.
--
-- ---------------------------------------------------------------------------
-- Por que os alvos são guardados por `to_regprocedure`
--
-- A versão anterior deste arquivo executava os REVOKE diretamente. Isso
-- ABORTAVA A MIGRATION INTEIRA em produção, porque a sobrecarga de 3 args
--
--   public.relatorio_consistencia_vendas(uuid, timestamptz, timestamptz)
--
-- NÃO EXISTE em produção — e `REVOKE EXECUTE ON FUNCTION` não aceita
-- `IF EXISTS`. O primeiro REVOKE que não encontra o alvo derruba o bloco todo,
-- e nenhum dos outros dois chega a rodar: o furo continuaria aberto.
--
-- A ausência dessa sobrecarga em produção é drift real, não um detalhe de
-- ambiente: ela é criada pelas migrations `20260621004000` e `20260707020000`,
-- ambas presentes no ledger de produção, e nenhuma migration do repositório a
-- remove. Está catalogada em
-- `docs/AUDITORIA_CATALOGO_PROD_VS_REPO_2026-08.md` §3.3.
--
-- O guard não mascara o drift — ele impede que um drift já conhecido bloqueie
-- uma correção de segurança. O drift é tratado na trilha de reconciliação.
--
-- ---------------------------------------------------------------------------
-- Segurança de reaplicação
--
-- REVOKE de privilégio ausente é no-op no PostgreSQL, e o GRANT é idempotente.
-- Com o guard, alvo ausente também é no-op (emite NOTICE). Seguro em produção
-- mesmo que o REVOKE já tenha sido feito à mão, e seguro de reaplicar.
--
-- ---------------------------------------------------------------------------
-- ROLLBACK
--
-- Reverter reabre o vazamento; só faça se um consumidor legítimo quebrar, e
-- registre QUEM chamava a função como `authenticated` antes de decidir.
--
--   GRANT EXECUTE ON FUNCTION
--     public.relatorio_consistencia_vendas(uuid, uuid, timestamptz, timestamptz)
--     TO authenticated;
--   GRANT EXECUTE ON FUNCTION public.verificar_consistencia_venda(uuid)
--     TO authenticated;
--
-- Restaurar a concessão a PUBLIC não é necessário nem desejável em nenhum
-- cenário de rollback.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  alvo   text;
  alvos  text[] := ARRAY[
    'public.relatorio_consistencia_vendas(uuid, uuid, timestamptz, timestamptz)',
    'public.relatorio_consistencia_vendas(uuid, timestamptz, timestamptz)',
    'public.verificar_consistencia_venda(uuid)'
  ];
  achados int := 0;
BEGIN
  FOREACH alvo IN ARRAY alvos LOOP
    IF to_regprocedure(alvo) IS NULL THEN
      RAISE NOTICE 'alvo ausente neste banco, ignorado: %', alvo;
      CONTINUE;
    END IF;

    achados := achados + 1;
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', alvo);
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION %s TO service_role', alvo);
  END LOOP;

  -- Rede de segurança: se NENHUM alvo existir, algo está muito errado com o
  -- banco e passar em silêncio seria pior do que falhar.
  IF achados = 0 THEN
    RAISE EXCEPTION
      'nenhuma das funções de diagnóstico existe neste banco; verifique o alvo da conexão';
  END IF;

  RAISE NOTICE 'diagnósticos fechados para PUBLIC/anon/authenticated: % de %',
    achados, array_length(alvos, 1);
END
$$;

DO $$
BEGIN
  IF to_regprocedure(
       'public.relatorio_consistencia_vendas(uuid, uuid, timestamptz, timestamptz)'
     ) IS NOT NULL THEN
    COMMENT ON FUNCTION
      public.relatorio_consistencia_vendas(uuid, uuid, timestamptz, timestamptz) IS
      'Diagnostico administrativo (service_role). Sem guarda interna de loja: '
      'NAO pode ser exposta a authenticated nem a PUBLIC.';
  END IF;

  IF to_regprocedure('public.verificar_consistencia_venda(uuid)') IS NOT NULL THEN
    COMMENT ON FUNCTION public.verificar_consistencia_venda(uuid) IS
      'Diagnostico administrativo (service_role). SECURITY DEFINER sem guarda '
      'de ator/perfil/loja: NAO pode ser exposta a authenticated nem a PUBLIC.';
  END IF;
END
$$;

COMMIT;
