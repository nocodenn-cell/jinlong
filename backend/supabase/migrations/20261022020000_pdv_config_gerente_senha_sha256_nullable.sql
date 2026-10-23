-- Libera apenas a restrição NOT NULL de pdv_config.gerente_senha_sha256 (coluna LEGADA).
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
