-- Fase 3 — Inteligência de cadastro: cache GTIN + telemetria de duração.

CREATE TABLE IF NOT EXISTS public.gtin_lookup_cache (
  gtin text PRIMARY KEY,
  fonte text NOT NULL CHECK (fonte IN ('openfoodfacts', 'interno', 'manual')),
  nome text,
  ncm text,
  marca text,
  categoria_externa text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS gtin_lookup_cache_expires_idx
  ON public.gtin_lookup_cache (expires_at);

COMMENT ON TABLE public.gtin_lookup_cache IS
  'Cache de enriquecimento GTIN (Open Food Facts / interno). Chave global por dígitos normalizados.';

ALTER TABLE public.gtin_lookup_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gtin_lookup_cache_select_auth ON public.gtin_lookup_cache;
-- Cache global de enriquecimento: qualquer sessão autenticada lê/escreve
-- (sem dado sensível de loja). Sem DELETE para evitar wipe acidental.
CREATE POLICY gtin_lookup_cache_select_auth
  ON public.gtin_lookup_cache FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS gtin_lookup_cache_upsert_auth ON public.gtin_lookup_cache;
CREATE POLICY gtin_lookup_cache_upsert_auth
  ON public.gtin_lookup_cache FOR INSERT
  TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS gtin_lookup_cache_update_auth ON public.gtin_lookup_cache;
CREATE POLICY gtin_lookup_cache_update_auth
  ON public.gtin_lookup_cache FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.gtin_lookup_cache FROM anon;
REVOKE ALL ON TABLE public.gtin_lookup_cache FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.gtin_lookup_cache TO authenticated;

-- Telemetria de tempo de cadastro (critério <8s conhecido / <15s manual).
CREATE TABLE IF NOT EXISTS public.cadastro_produto_telemetry_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  loja_id uuid,
  event_name text NOT NULL,
  surface text NOT NULL,
  duration_ms integer,
  known_suggestion boolean,
  meta_ok boolean,
  fonte_sugestao text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS cadastro_produto_telemetry_created_idx
  ON public.cadastro_produto_telemetry_events (created_at DESC);

CREATE INDEX IF NOT EXISTS cadastro_produto_telemetry_user_idx
  ON public.cadastro_produto_telemetry_events (user_id, created_at DESC);

COMMENT ON TABLE public.cadastro_produto_telemetry_events IS
  'Duração e meta do cadastro rápido/catálogo (Fase 3). Insert-only por usuário autenticado.';

ALTER TABLE public.cadastro_produto_telemetry_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cadastro_produto_telemetry_insert_own ON public.cadastro_produto_telemetry_events;
-- Espelha caixa_scan_telemetry: insert-only do próprio user; wrap auth.uid() (initplan).
CREATE POLICY cadastro_produto_telemetry_insert_own
  ON public.cadastro_produto_telemetry_events FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.cadastro_produto_telemetry_events FROM anon;
REVOKE ALL ON TABLE public.cadastro_produto_telemetry_events FROM authenticated;
GRANT INSERT ON TABLE public.cadastro_produto_telemetry_events TO authenticated;
