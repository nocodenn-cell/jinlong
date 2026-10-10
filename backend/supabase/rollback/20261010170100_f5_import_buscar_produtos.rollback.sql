-- ROLLBACK de 20261010170100_f5_import_buscar_produtos.sql (somente leitura; sem perda de dados).
BEGIN;
DROP FUNCTION IF EXISTS public.import_buscar_produtos(text, uuid[]);
COMMIT;
