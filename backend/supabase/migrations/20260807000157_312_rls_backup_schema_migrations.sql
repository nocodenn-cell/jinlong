-- Migration 312 — Fecha a exposição residual de RLS em
-- `public._backup_schema_migrations_20260802`.
--
-- EVIDÊNCIA (produção, 2026-08-06): varredura de todas as tabelas de `public`
-- sem RLS. Apenas três aparecem, e só uma está exposta:
--
--   relname                             rls    anon_select  auth_select  policies
--   _backup_schema_migrations_20260802  false  TRUE         TRUE         0
--   sync_request_nonces                 false  false        false        0
--   venda_engine_shadow_runs            false  false        false        0
--
-- As outras duas não têm RLS mas também não têm GRANT para anon/authenticated —
-- só service_role as alcança, que é o desenho pretendido. A tabela de backup é
-- a única legível por `anon` via PostgREST, sem policy nenhuma.
--
-- O conteúdo NÃO é apagado: são as 100 linhas de
-- `supabase_migrations.schema_migrations` anteriores ao
-- `supabase migration repair` de 2026-08-02, e é justamente essa cópia que
-- permitiu provar quais migrations foram marcadas como aplicadas sem terem sido
-- executadas (base das migrations 306, 309, 310 e 311). É evidência forense da
-- auditoria e precisa continuar existindo.
--
-- Correção mínima: revogar o acesso de anon/authenticated e habilitar RLS sem
-- policy alguma. service_role e postgres seguem lendo (BYPASSRLS), que é o
-- necessário para consulta de auditoria.
--
-- TODO O CORPO É CONDICIONAL: a tabela de backup foi criada à mão em produção e
-- não existe em nenhuma migration do repositório. Sem a guarda, esta migration
-- quebraria a reconstrução limpa do banco — exatamente o defeito que a 282 tinha
-- e que já foi corrigido com este mesmo padrão.

DO $rls_backup_312$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = '_backup_schema_migrations_20260802'
      AND c.relkind = 'r'
  ) THEN
    RAISE NOTICE 'MIGRATION_312: _backup_schema_migrations_20260802 não existe neste banco (reconstrução limpa) — nada a fazer.';
    RETURN;
  END IF;

  EXECUTE 'REVOKE ALL ON TABLE public._backup_schema_migrations_20260802 FROM PUBLIC';
  EXECUTE 'REVOKE ALL ON TABLE public._backup_schema_migrations_20260802 FROM anon';
  EXECUTE 'REVOKE ALL ON TABLE public._backup_schema_migrations_20260802 FROM authenticated';
  EXECUTE 'ALTER TABLE public._backup_schema_migrations_20260802 ENABLE ROW LEVEL SECURITY';
  EXECUTE $c$COMMENT ON TABLE public._backup_schema_migrations_20260802 IS
    'Cópia de supabase_migrations.schema_migrations anterior ao `supabase migration repair` de 2026-08-02 (100 linhas). Evidência forense: comparar com o ledger atual mostra quais versões foram marcadas como aplicadas sem execução. Somente service_role — RLS habilitada sem policy, sem GRANT para anon/authenticated.'$c$;

  -- Prova viva, no mesmo bloco (só roda onde a tabela existe).
  IF has_table_privilege('anon', 'public._backup_schema_migrations_20260802', 'SELECT') THEN
    RAISE EXCEPTION 'MIGRATION_312: anon ainda lê a tabela de backup';
  END IF;
  IF has_table_privilege('authenticated', 'public._backup_schema_migrations_20260802', 'SELECT') THEN
    RAISE EXCEPTION 'MIGRATION_312: authenticated ainda lê a tabela de backup';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = '_backup_schema_migrations_20260802'
      AND c.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'MIGRATION_312: RLS não habilitada na tabela de backup';
  END IF;
END;
$rls_backup_312$;

NOTIFY pgrst, 'reload schema';
