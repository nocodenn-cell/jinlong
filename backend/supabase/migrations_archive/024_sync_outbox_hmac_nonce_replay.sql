-- Anti-replay para sync-outbox:
-- armazena nonce assinado para impedir reuso de requisições.

CREATE TABLE IF NOT EXISTS public.sync_request_nonces (
  nonce text PRIMARY KEY,
  device_fingerprint text NOT NULL,
  request_ts bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sync_request_nonces_expires_at
  ON public.sync_request_nonces(expires_at);

ALTER TABLE public.sync_request_nonces ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.sync_request_nonces FROM PUBLIC;
REVOKE ALL ON TABLE public.sync_request_nonces FROM anon;
REVOKE ALL ON TABLE public.sync_request_nonces FROM authenticated;

GRANT SELECT, INSERT, DELETE ON TABLE public.sync_request_nonces TO service_role;

