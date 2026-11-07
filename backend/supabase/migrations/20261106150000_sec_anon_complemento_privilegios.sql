-- SEC-ANON-COMPLEMENTO (2026-11-06): fecha os privilégios de anon que a 20261104120000 não cobriu.
--
-- POR QUE UMA MIGRATION NOVA: a 20261104120000 é adiada (manifesto de governança) e NÃO pode ser editada.
-- Como está, ela não passa em produção: public.perfis tem SELECT para anon e o bloco de prova aborta a migration.
-- Esta migration não depende do arquivo anterior nem do estado registrado em homologação: usa só REVOKE,
-- ALTER DEFAULT PRIVILEGES e ALTER VIEW, todos idempotentes, e termina com verificações que abortam se algo ficar aberto.
--
-- ESTADO DE PRODUÇÃO (lido em 2026-11-06): anon com privilégio em 63 tabelas, 12 views e 6 sequências de public;
-- default ACL de postgres concede rxtm a anon em tabelas novas e rwU em sequências novas.
-- ESTADO DE HOMOLOGAÇÃO (lido no mesmo dia): 0 tabelas e 0 views com privilégio para anon; 18 sequências com privilégio.
--
-- ESCOPO: privilégios de anon em relações e sequências de public, e DEFAULT PRIVILEGES do papel postgres.
-- FORA DO ESCOPO (ver PR): EXECUTE de funções (inclui registrar_lead_comercial, caminho legítimo do formulário
-- comercial); schemas de plataforma (net, storage, realtime, extensions, graphql_public), que pertencem a supabase_admin;
-- DEFAULT PRIVILEGES de supabase_admin.
-- authenticated NÃO é alterado em nenhuma linha desta migration.
--
-- ROLLBACK: backend/supabase/rollback/20261106150000_sec_anon_complemento_privilegios.rollback.sql

BEGIN;

-- 1) Relações de public (tabelas, views, materialized views e foreign tables). ALL TABLES cobre todas elas.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

-- 2) Sequências de public.
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- 3) Objetos criados no futuro pelo papel postgres em public não nascem com privilégio para anon.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;

-- 4) Views de public executam com os privilégios de quem consulta (RLS do chamador), não do dono.
--    Idempotente: só altera views que ainda não têm a opção. Em produção e homologação, nenhuma.
DO $views$
DECLARE
  v record;
BEGIN
  FOR v IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind = 'v'
       AND coalesce(c.reloptions::text, '') NOT LIKE '%security_invoker=true%'
       AND coalesce(c.reloptions::text, '') NOT LIKE '%security_invoker=on%'
  LOOP
    EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', v.relname);
  END LOOP;
END
$views$;

-- Prova: aborta a migration se qualquer garantia não valer.
DO $verify$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n
    FROM pg_class c
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname = 'public'
     AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
     AND CASE WHEN c.relkind IN ('r', 'p', 'v', 'm', 'f')
              THEN has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN')
              ELSE false END;
  IF n > 0 THEN
    RAISE EXCEPTION 'SEC_ANON_COMPL: anon ainda tem privilégio em % relação(ões) de public', n;
  END IF;

  SELECT count(*) INTO n
    FROM pg_class c
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname = 'public'
     AND c.relkind = 'S'
     AND CASE WHEN c.relkind = 'S'
              THEN has_sequence_privilege('anon', c.oid, 'USAGE,SELECT,UPDATE')
              ELSE false END;
  IF n > 0 THEN
    RAISE EXCEPTION 'SEC_ANON_COMPL: anon ainda tem privilégio em % sequência(s) de public', n;
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_default_acl d
     WHERE d.defaclrole = 'postgres'::regrole
       AND d.defaclnamespace = 'public'::regnamespace
       AND d.defaclobjtype IN ('r', 'S')
       AND EXISTS (SELECT 1 FROM aclexplode(d.defaclacl) a WHERE a.grantee = 'anon'::regrole)
  ) THEN
    RAISE EXCEPTION 'SEC_ANON_COMPL: default privileges de postgres em public ainda concedem a anon';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM pg_class c
      JOIN pg_namespace ns ON ns.oid = c.relnamespace
     WHERE ns.nspname = 'public'
       AND c.relkind = 'v'
       AND coalesce(c.reloptions::text, '') NOT LIKE '%security_invoker=true%'
       AND coalesce(c.reloptions::text, '') NOT LIKE '%security_invoker=on%'
  ) THEN
    RAISE EXCEPTION 'SEC_ANON_COMPL: existe view em public sem security_invoker';
  END IF;
END
$verify$;

COMMIT;
