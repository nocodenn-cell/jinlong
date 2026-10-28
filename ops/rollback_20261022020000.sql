-- Rollback de 20261022020000 aplicada por ops/aplicar_20261022020000.sql.
-- Em produção a aplicação é no-op (a coluna não existe), então o rollback só remove a versão do ledger.
-- Se em algum ambiente a coluna existir e tiver sido liberada, reverter o NOT NULL exige que não haja NULL:
--   ALTER TABLE public.pdv_config ALTER COLUMN gerente_senha_sha256 SET NOT NULL;  (não usar em produção)
BEGIN;
DELETE FROM supabase_migrations.schema_migrations WHERE version = '20261022020000';
COMMIT;
