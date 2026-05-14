-- Índices para consultas operacionais + coluna correlation_id separada de cupom_session_id.
-- Retenção / partição / MV p95: ver docs/RECONNECT_REPLAY_POLICY.md secção 9.

ALTER TABLE public.caixa_scan_telemetry_events
  ADD COLUMN IF NOT EXISTS correlation_id text;

COMMENT ON COLUMN public.caixa_scan_telemetry_events.correlation_id IS
  'Fluxo observável (ctx.correlationId). Separado de cupom_session_id: um cupom pode ter múltiplos fluxos no futuro.';

CREATE INDEX IF NOT EXISTS caixa_scan_telemetry_events_event_name_created_idx
  ON public.caixa_scan_telemetry_events (event_name, created_at DESC);

CREATE INDEX IF NOT EXISTS caixa_scan_telemetry_events_cupom_created_idx
  ON public.caixa_scan_telemetry_events (cupom_session_id, created_at DESC)
  WHERE cupom_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS caixa_scan_telemetry_events_correlation_created_idx
  ON public.caixa_scan_telemetry_events (correlation_id, created_at DESC)
  WHERE correlation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS caixa_scan_telemetry_events_schema_created_idx
  ON public.caixa_scan_telemetry_events (schema_version, created_at DESC);
