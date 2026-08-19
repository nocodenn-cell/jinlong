-- ============================================================================
-- P1-2 (conclusão): fecha o furo de RLS que sobrou em
-- `relatorio_consistencia_vendas(uuid, uuid, timestamptz, timestamptz)`.
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
-- A sobrecarga de 3 args está correta porque
-- `20260814015032_harden_diagnostics_and_ap_idempotency.sql` revogou
-- `FROM PUBLIC, anon, authenticated` — a forma completa.
--
-- ---------------------------------------------------------------------------
-- Por que isso importa
--
-- É a mesma classe de vazamento documentada na 20260814015032: a função é
-- SECURITY DEFINER, não valida ator, perfil nem loja, e devolve agregados de
-- vendas. Com EXECUTE via PUBLIC, um GERENTE da loja B — que enxerga 0 linhas
-- em `vendas` pela RLS — lê os agregados da loja A sem precisar de UUID algum.
--
-- Detectado pelo GATE 9 de `financial-adversarial-gates.test.sql`
-- (`GATE9_DIAGNOSTICO_EXPOSTO`), que ficou sem rodar enquanto os GATES 12–23
-- estiveram truncados no repositório.
--
-- ---------------------------------------------------------------------------
-- Segurança de reaplicação
--
-- REVOKE de privilégio ausente é no-op no PostgreSQL, e o GRANT é idempotente.
-- Seguro em produção mesmo que o REVOKE já tenha sido feito à mão.
-- ============================================================================

BEGIN;

REVOKE EXECUTE ON FUNCTION
  public.relatorio_consistencia_vendas(uuid, uuid, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.relatorio_consistencia_vendas(uuid, uuid, timestamptz, timestamptz)
  TO service_role;

-- A sobrecarga de 3 args já foi tratada na 20260814015032; repetido aqui de
-- forma idempotente para que este arquivo sozinho deixe as DUAS assinaturas
-- num estado conhecido.
REVOKE EXECUTE ON FUNCTION
  public.relatorio_consistencia_vendas(uuid, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION
  public.relatorio_consistencia_vendas(uuid, timestamptz, timestamptz)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.verificar_consistencia_venda(uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.verificar_consistencia_venda(uuid)
  TO service_role;

COMMENT ON FUNCTION
  public.relatorio_consistencia_vendas(uuid, uuid, timestamptz, timestamptz) IS
  'Diagnostico administrativo (service_role). Sem guarda interna de loja: '
  'NAO pode ser exposta a authenticated nem a PUBLIC.';

COMMIT;
