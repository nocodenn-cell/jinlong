-- 272_decision_snapshots.sql
-- Decision Intelligence Fase 1 — persistência do DecisionSnapshot (Core v1.0 intocado).
-- Append-oriented: o Engine Loop produz; esta tabela só armazena.

CREATE TABLE IF NOT EXISTS public.decision_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL REFERENCES public.lojas (id),
  snapshot_version text NOT NULL,
  schema_version integer NOT NULL DEFAULT 1
    CHECK (schema_version >= 1),
  requested_at timestamptz NOT NULL,
  persisted_at timestamptz NOT NULL DEFAULT now(),
  pipeline_fingerprint text,
  payload jsonb NOT NULL,
  CONSTRAINT decision_snapshots_payload_object
    CHECK (jsonb_typeof(payload) = 'object')
);

COMMENT ON TABLE public.decision_snapshots IS
  'Snapshots imutáveis do Engine Loop Decision Intelligence (di-core-v1.0+). '
  'Sem lógica de negócio — apenas persistência versionada do DecisionSnapshot.';

COMMENT ON COLUMN public.decision_snapshots.snapshot_version IS
  'Versão do core/contrato (ex.: di-core-v1.0).';

COMMENT ON COLUMN public.decision_snapshots.schema_version IS
  'Versão do envelope JSON em payload (codec da camada de integração).';

CREATE INDEX IF NOT EXISTS decision_snapshots_loja_requested_idx
  ON public.decision_snapshots (loja_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS decision_snapshots_loja_persisted_idx
  ON public.decision_snapshots (loja_id, persisted_at DESC);

CREATE INDEX IF NOT EXISTS decision_snapshots_version_idx
  ON public.decision_snapshots (snapshot_version);

ALTER TABLE public.decision_snapshots ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.decision_snapshots FROM PUBLIC;
REVOKE ALL ON TABLE public.decision_snapshots FROM anon;

-- Leitura: DONO/ADMIN qualquer loja; demais perfis só a própria loja.
DROP POLICY IF EXISTS decision_snapshots_select_scoped ON public.decision_snapshots;
CREATE POLICY decision_snapshots_select_scoped
  ON public.decision_snapshots
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = (SELECT auth.uid())
        AND (
          u.perfil IN ('DONO', 'ADMIN')
          OR u.loja_id = decision_snapshots.loja_id
        )
    )
  );

-- Insert: service role / jobs usam secret key (bypass RLS). Autenticado só na própria loja.
DROP POLICY IF EXISTS decision_snapshots_insert_scoped ON public.decision_snapshots;
CREATE POLICY decision_snapshots_insert_scoped
  ON public.decision_snapshots
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = (SELECT auth.uid())
        AND (
          u.perfil IN ('DONO', 'ADMIN')
          OR u.loja_id = decision_snapshots.loja_id
        )
    )
  );

GRANT SELECT, INSERT ON TABLE public.decision_snapshots TO authenticated;
