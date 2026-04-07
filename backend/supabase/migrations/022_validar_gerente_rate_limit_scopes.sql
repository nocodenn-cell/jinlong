-- Rate-limit robusto para validar-gerente com escopos:
-- - USER (auth.uid)
-- - IP (x-forwarded-for/cf-connecting-ip)
-- - DEVICE (x-device-fingerprint)
-- - GLOBAL (janela geral da função)

CREATE TABLE IF NOT EXISTS public.gerente_auth_rate_limits (
  scope text NOT NULL CHECK (scope IN ('USER', 'IP', 'DEVICE', 'GLOBAL')),
  identifier text NOT NULL,
  failed_count integer NOT NULL DEFAULT 0,
  first_attempt_at timestamptz NOT NULL DEFAULT now(),
  lock_until timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (scope, identifier)
);

ALTER TABLE public.gerente_auth_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.gerente_auth_rate_limits FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.gerente_auth_rate_limits TO service_role;

CREATE INDEX IF NOT EXISTS idx_gerente_auth_rate_limits_lock
  ON public.gerente_auth_rate_limits (scope, lock_until);
