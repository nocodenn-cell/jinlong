-- 274_decision_governed_memory.sql
-- Onda 4 — Memory governada a partir de DecisionRecord (Core intocado).
-- Append-only: outcomes humanos sem alterar regras automaticamente.

CREATE TABLE IF NOT EXISTS public.decision_governed_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL REFERENCES public.lojas (id),
  decision_id uuid NOT NULL REFERENCES public.decision_records (id) ON DELETE CASCADE,
  recommendation_id text NOT NULL,
  event_kind text NOT NULL
    CHECK (
      event_kind IN (
        'DECISION_RECORDED',
        'OUTCOME_RECORDED',
        'TIMED_OUTCOME_RECORDED'
      )
    ),
  decision_status text NOT NULL
    CHECK (decision_status IN ('accepted', 'rejected', 'deferred', 'executed')),
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
  note_codes text[] NOT NULL DEFAULT '{}'::text[],
  metric_code text,
  expected_value numeric,
  actual_value numeric,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  actor_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.decision_governed_memory IS
  'Memory governada: registra outcomes humanos de DecisionRecord. '
  'Sem IA, sem aprendizado implícito, sem alteração automática de regras.';

CREATE INDEX IF NOT EXISTS decision_governed_memory_loja_idx
  ON public.decision_governed_memory (loja_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS decision_governed_memory_decision_idx
  ON public.decision_governed_memory (decision_id);

ALTER TABLE public.decision_governed_memory ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.decision_governed_memory FROM PUBLIC;
REVOKE ALL ON TABLE public.decision_governed_memory FROM anon;

DROP POLICY IF EXISTS decision_governed_memory_select_scoped ON public.decision_governed_memory;
CREATE POLICY decision_governed_memory_select_scoped
  ON public.decision_governed_memory
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = (SELECT auth.uid())
        AND (
          u.perfil IN ('DONO', 'ADMIN')
          OR u.loja_id = decision_governed_memory.loja_id
        )
    )
  );

DROP POLICY IF EXISTS decision_governed_memory_insert_scoped ON public.decision_governed_memory;
CREATE POLICY decision_governed_memory_insert_scoped
  ON public.decision_governed_memory
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = (SELECT auth.uid())
        AND (
          u.perfil IN ('DONO', 'ADMIN')
          OR u.loja_id = decision_governed_memory.loja_id
        )
    )
  );

GRANT SELECT, INSERT ON TABLE public.decision_governed_memory TO authenticated;
