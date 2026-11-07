-- Regressão da migration 20261106150000_sec_anon_complemento_privilegios.sql.
-- Roda no stack local do CI depois do db reset (todas as migrations aplicadas). Falha com RAISE EXCEPTION se algo não bater.
--
-- Cobre:
--   A. anon sem nenhum privilégio em relações (tabelas, views) e sequências de public, inclusive public.perfis;
--   B. DEFAULT PRIVILEGES de postgres em public sem nenhuma concessão a anon;
--   C. todas as views de public com security_invoker;
--   D. anon executa a RPC do formulário comercial e não tem privilégio direto em commercial_leads (se existirem);
--   E. authenticated preserva o SELECT nas tabelas de uso (se existirem), sem alteração desta migration;
--   F. comportamento real: SET ROLE anon não lê vendas (42501).

DO $sec_anon_compl$
DECLARE
  n integer;
  alvo text;
  leu boolean;
  -- Tabelas em que authenticated tem SELECT em produção e em homologação (lido em 2026-11-06).
  -- produtos NÃO entra: authenticated não tem SELECT direto (o catálogo é lido por RPC).
  tabelas_auth text[] := ARRAY[
    'vendas','itens_venda','vendas_pagamentos','estoque','caixas','lojas','usuarios','clientes','precos_atacado'
  ];
  verificadas integer := 0;
BEGIN
  -- A. relações e sequências
  SELECT count(*) INTO n
    FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname = 'public'
     AND CASE WHEN c.relkind IN ('r', 'p', 'v', 'm', 'f')
              THEN has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN')
              ELSE false END;
  IF n > 0 THEN
    RAISE EXCEPTION 'SEC_ANON_COMPL A: anon com privilégio em % relação(ões) de public', n;
  END IF;

  SELECT count(*) INTO n
    FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname = 'public'
     AND CASE WHEN c.relkind = 'S'
              THEN has_sequence_privilege('anon', c.oid, 'USAGE,SELECT,UPDATE')
              ELSE false END;
  IF n > 0 THEN
    RAISE EXCEPTION 'SEC_ANON_COMPL A: anon com privilégio em % sequência(s) de public', n;
  END IF;

  IF to_regclass('public.perfis') IS NOT NULL
     AND has_table_privilege('anon', 'public.perfis', 'SELECT') THEN
    RAISE EXCEPTION 'SEC_ANON_COMPL A: anon lê public.perfis';
  END IF;

  -- B. default privileges
  IF EXISTS (
    SELECT 1 FROM pg_default_acl d
     WHERE d.defaclrole = 'postgres'::regrole AND d.defaclnamespace = 'public'::regnamespace
       AND d.defaclobjtype IN ('r', 'S')
       AND EXISTS (SELECT 1 FROM aclexplode(d.defaclacl) a WHERE a.grantee = 'anon'::regrole)
  ) THEN
    RAISE EXCEPTION 'SEC_ANON_COMPL B: default privileges de postgres em public concedem a anon';
  END IF;

  -- C. views com security_invoker
  SELECT count(*) INTO n
    FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
   WHERE ns.nspname = 'public' AND c.relkind = 'v'
     AND coalesce(c.reloptions::text, '') NOT LIKE '%security_invoker=true%'
     AND coalesce(c.reloptions::text, '') NOT LIKE '%security_invoker=on%';
  IF n > 0 THEN
    RAISE EXCEPTION 'SEC_ANON_COMPL C: % view(s) de public sem security_invoker', n;
  END IF;

  -- D. formulário comercial: caminho legítimo é a RPC, sem privilégio direto na tabela
  IF to_regprocedure('public.registrar_lead_comercial(text,text,text,text,text,text,text,text,text,text,text,text)') IS NOT NULL THEN
    IF NOT has_function_privilege('anon',
         'public.registrar_lead_comercial(text,text,text,text,text,text,text,text,text,text,text,text)', 'EXECUTE') THEN
      RAISE EXCEPTION 'SEC_ANON_COMPL D: anon sem EXECUTE em registrar_lead_comercial (formulário quebrado)';
    END IF;
  END IF;
  IF to_regclass('public.commercial_leads') IS NOT NULL
     AND has_table_privilege('anon', 'public.commercial_leads', 'SELECT,INSERT,UPDATE,DELETE') THEN
    RAISE EXCEPTION 'SEC_ANON_COMPL D: anon com privilégio direto em commercial_leads';
  END IF;

  -- E. authenticated preservado nas tabelas de uso
  FOREACH alvo IN ARRAY tabelas_auth LOOP
    IF to_regclass('public.' || alvo) IS NOT NULL THEN
      verificadas := verificadas + 1;
      IF NOT has_table_privilege('authenticated', 'public.' || alvo, 'SELECT') THEN
        RAISE EXCEPTION 'SEC_ANON_COMPL E: authenticated perdeu SELECT em public.%', alvo;
      END IF;
    END IF;
  END LOOP;
  IF verificadas = 0 THEN
    RAISE EXCEPTION 'SEC_ANON_COMPL E: nenhuma tabela de uso encontrada para verificar authenticated';
  END IF;

  -- F. comportamento real como anon
  EXECUTE 'SET ROLE anon';
  BEGIN
    PERFORM 1 FROM public.vendas LIMIT 1;
    leu := true;
  EXCEPTION WHEN insufficient_privilege THEN
    leu := false;
  END;
  EXECUTE 'RESET ROLE';
  IF leu THEN
    RAISE EXCEPTION 'SEC_ANON_COMPL F: anon conseguiu ler public.vendas';
  END IF;

  RAISE NOTICE 'SEC_ANON_COMPL: OK (A-F; authenticated verificado em % tabela(s))', verificadas;
END
$sec_anon_compl$;
