-- Aplicação manual de 20261022020000_pdv_config_gerente_senha_sha256_nullable (PR #625) como NO-OP registrado.
-- Runbook: docs/runbooks/APLICAR_20261022020000_NOOP.md
--
-- Em produção a coluna pdv_config.gerente_senha_sha256 NÃO existe; o guard da migration (information_schema) faz
-- dela um no-op. Aplicar só registra a versão no ledger, alinhando main × produção (check migration-remote-drift).
-- Colar inteiro no SQL Editor do Supabase (ou `psql -v ON_ERROR_STOP=1 -f ops/aplicar_20261022020000.sql`).
-- Uma transação: recusa se a versão já existir; executa o conteúdo EXATO do arquivo; grava a versão real e o SQL em
-- `statements`. GERADO a partir do arquivo da migration — não editar à mão.

BEGIN;

DO $aplicar$
DECLARE
  v_sql text := $mig$-- Libera apenas a restrição NOT NULL de pdv_config.gerente_senha_sha256 (coluna LEGADA).
--
-- Causa: 005_mvp_pdv_config criou a coluna NOT NULL. A autenticação do gerente usa
-- gerente_senha_bcrypt (067_pdv_config_bcrypt_gerente) e não lê esta coluna. A função de
-- semeadura de empresa nova (20261022010000) já não a preenche, então toda empresa nova
-- violava a constraint. A 20261022010000 corrigiu a função, mas não a constraint.
--
-- Escopo: só DROP NOT NULL. Preserva a coluna, os valores existentes e a autenticação (bcrypt).
-- Idempotente: só altera se ainda estiver NOT NULL. Não usa valor fictício.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pdv_config'
      AND column_name = 'gerente_senha_sha256'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.pdv_config ALTER COLUMN gerente_senha_sha256 DROP NOT NULL;
  END IF;
END
$$;
$mig$;
BEGIN
  IF EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version = '20261022020000') THEN
    RAISE EXCEPTION '20261022020000 já consta em schema_migrations — nada a fazer';
  END IF;
  EXECUTE v_sql;
  INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
  VALUES ('20261022020000', 'pdv_config_gerente_senha_sha256_nullable', ARRAY[v_sql]);
END
$aplicar$;

COMMIT;
