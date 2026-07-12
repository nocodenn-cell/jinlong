-- Versão do contrato de payload (telemetria) para queries e migrações futuras.

ALTER TABLE public.caixa_scan_telemetry_events
  ADD COLUMN IF NOT EXISTS schema_version integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.caixa_scan_telemetry_events.schema_version IS
  'Réplica indexável de payload.schemaVersion (revisão do contrato no cliente; ver shared-core HUMAN_TELEMETRY_SCHEMA_VERSION).';

COMMENT ON TABLE public.caixa_scan_telemetry_events IS
  'Telemetria do pipeline de bip (ingestão autenticada). Planear: retenção/partição por data, dashboards p95, agregação off-line e sampling adaptivo antes de escalar volume. Ingestão HTTP síncrona adequada na fase inicial; volume alto ⇒ fila, edge ingestion ou worker assíncrono.';
