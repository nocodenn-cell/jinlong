-- Hardening P0: senha de gerente deve usar hash forte (bcrypt) no servidor.
-- Mantemos `gerente_senha_sha256` apenas para fallback temporário controlado por env.

ALTER TABLE public.pdv_config
ADD COLUMN IF NOT EXISTS gerente_senha_bcrypt text;

COMMENT ON COLUMN public.pdv_config.gerente_senha_bcrypt IS
  'Hash bcrypt da senha do gerente usado pelo validar-gerente/sync-outbox (server-side).';

COMMENT ON COLUMN public.pdv_config.gerente_senha_sha256 IS
  'LEGADO: fallback temporário de validação. Planejado para remoção após migração completa para bcrypt.';
