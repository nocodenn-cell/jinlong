-- Rate limit/lockout para validar-gerente.

CREATE TABLE IF NOT EXISTS public.gerente_auth_attempts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  failed_count integer NOT NULL DEFAULT 0,
  lock_until timestamptz NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.gerente_auth_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.gerente_auth_attempts FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON TABLE public.gerente_auth_attempts TO service_role;
