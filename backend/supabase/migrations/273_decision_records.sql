-- 273_decision_records.sql
-- Decision Intelligence Fase 2 — ciclo de vida pós-Recommendation (Core intocado).
-- DecisionRecord ≠ o que aconteceu depois; não é uma segunda Recommendation.

CREATE TABLE IF NOT EXISTS public.decision_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL REFERENCES public.lojas (id),
  recommendation_id text NOT NULL,
  snapshot_id uuid REFERENCES public.decision_snapshots (id) ON DELETE SET NULL,
  status text NOT NULL
    CHECK (status IN ('accepted', 'rejected', 'deferred', 'executed')),
  decision_reason text NOT NULL
    CHECK (
      decision_reason IN (
        'HUMAN_OVERRIDE',
        'OUT_OF_STOCK',
        'BUSINESS_POLICY',
        'SEASONAL',
        'OTHER'
      )
    ),
  decision_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  review_date date,
  expected_outcome jsonb,
  actual_outcome jsonb,
  outcomes jsonb NOT NULL DEFAULT jsonb_build_object(
    'd30', jsonb_build_object('status', 'PENDING'),
    'd60', jsonb_build_object('status', 'PENDING'),
    'd90', jsonb_build_object('status', 'PENDING')
  ),
  action_plan_item_ids text[] NOT NULL DEFAULT '{}'::text[],
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT decision_records_expected_outcome_object
    CHECK (
      expected_outcome IS NULL
      OR jsonb_typeof(expected_outcome) = 'object'
    ),
  CONSTRAINT decision_records_actual_outcome_object
    CHECK (
      actual_outcome IS NULL
      OR jsonb_typeof(actual_outcome) = 'object'
    ),
  CONSTRAINT decision_records_outcomes_object
    CHECK (jsonb_typeof(outcomes) = 'object')
);

COMMENT ON TABLE public.decision_records IS
  'Ciclo de vida pós-Recommendation (accepted/rejected/deferred/executed). '
  'Inclui decisionReason, expected/actual outcome e slots 30/60/90d. '
  'Sem lógica de negócio — apenas registro.';

COMMENT ON COLUMN public.decision_records.decision_reason IS
  'Motivo da decisão: HUMAN_OVERRIDE | OUT_OF_STOCK | BUSINESS_POLICY | SEASONAL | OTHER.';

COMMENT ON COLUMN public.decision_records.expected_outcome IS
  'Meta mensurável no momento da decisão (ex.: margem +4%).';

COMMENT ON COLUMN public.decision_records.actual_outcome IS
  'Resultado observado agregado (ex.: +3.6%); detalhe temporal em outcomes.';

CREATE INDEX IF NOT EXISTS decision_records_loja_decision_idx
  ON public.decision_records (loja_id, decision_at DESC);

CREATE INDEX IF NOT EXISTS decision_records_recommendation_idx
  ON public.decision_records (recommendation_id);

CREATE INDEX IF NOT EXISTS decision_records_status_idx
  ON public.decision_records (loja_id, status);

CREATE INDEX IF NOT EXISTS decision_records_snapshot_idx
  ON public.decision_records (snapshot_id)
  WHERE snapshot_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.trg_decision_records_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS decision_records_set_updated_at ON public.decision_records;
CREATE TRIGGER decision_records_set_updated_at
  BEFORE UPDATE ON public.decision_records
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_decision_records_updated_at();

ALTER TABLE public.decision_records ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.decision_records FROM PUBLIC;
REVOKE ALL ON TABLE public.decision_records FROM anon;

DROP POLICY IF EXISTS decision_records_select_scoped ON public.decision_records;
CREATE POLICY decision_records_select_scoped
  ON public.decision_records
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = (SELECT auth.uid())
        AND (
          u.perfil IN ('DONO', 'ADMIN')
          OR u.loja_id = decision_records.loja_id
        )
    )
  );

DROP POLICY IF EXISTS decision_records_insert_scoped ON public.decision_records;
CREATE POLICY decision_records_insert_scoped
  ON public.decision_records
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = (SELECT auth.uid())
        AND (
          u.perfil IN ('DONO', 'ADMIN')
          OR u.loja_id = decision_records.loja_id
        )
    )
  );

DROP POLICY IF EXISTS decision_records_update_scoped ON public.decision_records;
CREATE POLICY decision_records_update_scoped
  ON public.decision_records
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = (SELECT auth.uid())
        AND (
          u.perfil IN ('DONO', 'ADMIN')
          OR u.loja_id = decision_records.loja_id
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = (SELECT auth.uid())
        AND (
          u.perfil IN ('DONO', 'ADMIN')
          OR u.loja_id = decision_records.loja_id
        )
    )
  );

GRANT SELECT, INSERT, UPDATE ON TABLE public.decision_records TO authenticated;
