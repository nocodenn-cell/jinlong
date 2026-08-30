-- Revoga grants residuais de SELECT/INSERT/UPDATE/DELETE em três tabelas RLS
-- deny-all (RLS habilitado, 0 policies) para `anon`/`authenticated`.
--
-- ESCOPO — só REVOKE nas 3 tabelas abaixo, papéis `anon`/`authenticated`,
-- os quatro privilégios de DML (SELECT/INSERT/UPDATE/DELETE). Nenhuma função
-- alterada, nenhuma policy criada, `service_role` intocado. Não relacionado
-- às Fases 1–5 do plano de remediação Jīn Lóng (#336–#340), já mergeadas —
-- este item ficou de fora daquele escopo e é tratado isoladamente aqui.
--
-- ATUALIZAÇÃO (revisão de segurança pós-#344): a versão original desta
-- migration revogava só SELECT/INSERT, deixando UPDATE/DELETE de
-- `authenticated` intocados nas 3 tabelas. Investigação de código (021, 022
-- — únicas migrations que concedem grant nestas tabelas na criação —
-- concedem SELECT/INSERT/UPDATE só a `service_role`, nunca a
-- `authenticated`) e busca exaustiva por consumidores confirmaram: nenhum
-- caminho de código faz UPDATE ou DELETE nestas tabelas via cliente
-- `authenticated`/`anon` — só via `service_role` (Edge Functions
-- `validar-gerente`/`sync-outbox`) ou dentro de `SECURITY DEFINER`
-- (`criar_produto_com_estoque_inicial`, que nem tem UPDATE em nenhuma
-- versão). UPDATE/DELETE de `authenticated` são resíduo do mesmo grant
-- retroativo de `255`, não uma concessão intencional — ampliado o escopo
-- para fechá-los junto, mesma raiz e mesmos objetos da correção original.
--
-- Tabelas:
--   public.gerente_auth_attempts    (021_validar_gerente_rate_limit.sql)
--   public.gerente_auth_rate_limits (022_validar_gerente_rate_limit_scopes.sql)
--   public.produto_create_requests  (20260731200300_criar_produto_com_estoque_inicial.sql)
--
-- Origem do grant (investigada antes desta migration, não é acidente de
-- uma migration específica destas 3 tabelas):
--   - `authenticated` tem SELECT/INSERT/UPDATE/DELETE nas 3 por causa da
--     regra de schema `20260621005300_255_grant_baseline_tabelas_authenticated.sql`
--     (`GRANT ... ON ALL TABLES IN SCHEMA public TO authenticated` +
--     `ALTER DEFAULT PRIVILEGES ... GRANT ... TO authenticated` para tabelas
--     futuras). `produto_create_requests` foi criada depois dessa regra e
--     herdou o grant na criação; as duas tabelas `gerente_auth_*` (mais
--     antigas) foram cobertas pelo `GRANT ... ON ALL TABLES` retroativo.
--   - `anon` tem só SELECT (nunca INSERT) nas 3 por causa de
--     `20260621001500_219_revoke_anon_dml_grants.sql`, que revogou
--     INSERT/UPDATE/DELETE/TRUNCATE de `anon` em todas as tabelas (presentes
--     e futuras, via ALTER DEFAULT PRIVILEGES) mas manteve SELECT
--     deliberadamente — decisão documentada naquela migration, não descuido.
--
-- IMPORTANTE — isto NÃO reforma a regra de schema. `ALTER DEFAULT PRIVILEGES`
-- só se aplica no momento de CREATE; revogar aqui, nestas 3 tabelas já
-- existentes, é definitivo (não será desfeito por essas regras a menos que
-- as tabelas sejam recriadas via DROP+CREATE, o que não é o padrão deste
-- repositório). A regra de schema em si (toda tabela nova nasce com esses
-- grants) continua valendo para qualquer tabela futura — fora do escopo
-- autorizado desta migration.
--
-- Consumidores legítimos confirmados (nenhum depende de anon/authenticated
-- terem grant direto na tabela):
--   - gerente_auth_attempts / gerente_auth_rate_limits: lidos/escritos só por
--     backend/supabase/functions/_shared/gerente-auth.ts, chamado a partir de
--     Edge Functions com client service_role — nunca via PostgREST direto.
--   - produto_create_requests: lida/escrita só dentro de
--     criar_produto_com_estoque_inicial (todas as versões: 020260718135138,
--     20260731200300, 20260805151822, 20260816141000) — todas SECURITY
--     DEFINER, dono `postgres`. O acesso interno independe do grant da role
--     que chamou a RPC.
--
-- RLS das 3 tabelas: habilitado, 0 policies (deny-all efetivo hoje,
-- independente deste GRANT). Este REVOKE fecha a camada de superfície
-- (defesa em profundidade), não uma exploração ativa.
--
-- ROLLBACK
-- --------
-- Inverso exato do PRE observado em produção — `anon` só tinha SELECT,
-- nunca INSERT/UPDATE/DELETE (219_revoke_anon_dml_grants.sql); só
-- `authenticated` tinha os quatro. Uma única linha `GRANT ... TO anon,
-- authenticated` concederia INSERT/UPDATE/DELETE a `anon`, que ele nunca
-- teve — por isso os papéis são restaurados separadamente:
--   GRANT SELECT ON TABLE public.gerente_auth_attempts TO anon;
--   GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.gerente_auth_attempts TO authenticated;
--   GRANT SELECT ON TABLE public.gerente_auth_rate_limits TO anon;
--   GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.gerente_auth_rate_limits TO authenticated;
--   GRANT SELECT ON TABLE public.produto_create_requests TO anon;
--   GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.produto_create_requests TO authenticated;
--   (nenhuma coluna, linha ou dado muda em nenhuma direção — é só DDL de
--   privilégio)

BEGIN;

DO $revoke_residuais$
BEGIN
  IF to_regclass('public.gerente_auth_attempts') IS NOT NULL THEN
    REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public.gerente_auth_attempts FROM anon, authenticated;
  END IF;

  IF to_regclass('public.gerente_auth_rate_limits') IS NOT NULL THEN
    REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public.gerente_auth_rate_limits FROM anon, authenticated;
  END IF;

  IF to_regclass('public.produto_create_requests') IS NOT NULL THEN
    REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLE public.produto_create_requests FROM anon, authenticated;
  END IF;
END
$revoke_residuais$;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO — falha a transação se algum revoke não pegou
-- ═══════════════════════════════════════════════════════════════════════════

DO $verify$
BEGIN
  IF to_regclass('public.gerente_auth_attempts') IS NOT NULL THEN
    IF has_table_privilege('anon', 'public.gerente_auth_attempts', 'SELECT')
       OR has_table_privilege('anon', 'public.gerente_auth_attempts', 'INSERT')
       OR has_table_privilege('anon', 'public.gerente_auth_attempts', 'UPDATE')
       OR has_table_privilege('anon', 'public.gerente_auth_attempts', 'DELETE')
       OR has_table_privilege('authenticated', 'public.gerente_auth_attempts', 'SELECT')
       OR has_table_privilege('authenticated', 'public.gerente_auth_attempts', 'INSERT')
       OR has_table_privilege('authenticated', 'public.gerente_auth_attempts', 'UPDATE')
       OR has_table_privilege('authenticated', 'public.gerente_auth_attempts', 'DELETE') THEN
      RAISE EXCEPTION 'REVOKE_RESIDUAIS_REMANESCENTE: gerente_auth_attempts';
    END IF;
  END IF;

  IF to_regclass('public.gerente_auth_rate_limits') IS NOT NULL THEN
    IF has_table_privilege('anon', 'public.gerente_auth_rate_limits', 'SELECT')
       OR has_table_privilege('anon', 'public.gerente_auth_rate_limits', 'INSERT')
       OR has_table_privilege('anon', 'public.gerente_auth_rate_limits', 'UPDATE')
       OR has_table_privilege('anon', 'public.gerente_auth_rate_limits', 'DELETE')
       OR has_table_privilege('authenticated', 'public.gerente_auth_rate_limits', 'SELECT')
       OR has_table_privilege('authenticated', 'public.gerente_auth_rate_limits', 'INSERT')
       OR has_table_privilege('authenticated', 'public.gerente_auth_rate_limits', 'UPDATE')
       OR has_table_privilege('authenticated', 'public.gerente_auth_rate_limits', 'DELETE') THEN
      RAISE EXCEPTION 'REVOKE_RESIDUAIS_REMANESCENTE: gerente_auth_rate_limits';
    END IF;
  END IF;

  IF to_regclass('public.produto_create_requests') IS NOT NULL THEN
    IF has_table_privilege('anon', 'public.produto_create_requests', 'SELECT')
       OR has_table_privilege('anon', 'public.produto_create_requests', 'INSERT')
       OR has_table_privilege('anon', 'public.produto_create_requests', 'UPDATE')
       OR has_table_privilege('anon', 'public.produto_create_requests', 'DELETE')
       OR has_table_privilege('authenticated', 'public.produto_create_requests', 'SELECT')
       OR has_table_privilege('authenticated', 'public.produto_create_requests', 'INSERT')
       OR has_table_privilege('authenticated', 'public.produto_create_requests', 'UPDATE')
       OR has_table_privilege('authenticated', 'public.produto_create_requests', 'DELETE') THEN
      RAISE EXCEPTION 'REVOKE_RESIDUAIS_REMANESCENTE: produto_create_requests';
    END IF;
  END IF;

  -- service_role precisa continuar com acesso total — se isto falhar, o
  -- ambiente já estava errado antes desta migration (não é efeito dela).
  IF to_regclass('public.gerente_auth_rate_limits') IS NOT NULL
     AND NOT has_table_privilege('service_role', 'public.gerente_auth_rate_limits', 'INSERT') THEN
    RAISE EXCEPTION 'REVOKE_RESIDUAIS_SERVICE_ROLE_PERDIDO: gerente_auth_rate_limits';
  END IF;

  RAISE NOTICE 'REVOKE de grants residuais OK — anon/authenticated sem SELECT/INSERT/UPDATE/DELETE nas 3 tabelas, service_role preservado';
END
$verify$;

NOTIFY pgrst, 'reload schema';

COMMIT;
