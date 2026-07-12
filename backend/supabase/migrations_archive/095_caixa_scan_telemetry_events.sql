-- Eventos de telemetria do pipeline de leitura (caixa web): ingestão autenticada, sem leitura para o operador.

CREATE TABLE public.caixa_scan_telemetry_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  cupom_session_id text,
  scan_id text NOT NULL,
  sequence_number integer,
  event_name text NOT NULL,
  payload jsonb NOT NULL
);

CREATE INDEX caixa_scan_telemetry_events_created_at_idx
  ON public.caixa_scan_telemetry_events (created_at DESC);

CREATE INDEX caixa_scan_telemetry_events_user_created_idx
  ON public.caixa_scan_telemetry_events (user_id, created_at DESC);

COMMENT ON TABLE public.caixa_scan_telemetry_events IS
  'Telemetria humana do pipeline de bip (amostragem no cliente; correlacionar por cupom_session_id + scan_id).';

ALTER TABLE public.caixa_scan_telemetry_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY caixa_scan_telemetry_events_insert_own
  ON public.caixa_scan_telemetry_events
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

REVOKE ALL ON TABLE public.caixa_scan_telemetry_events FROM anon;
REVOKE SELECT ON TABLE public.caixa_scan_telemetry_events FROM authenticated;
GRANT INSERT ON TABLE public.caixa_scan_telemetry_events TO authenticated;
