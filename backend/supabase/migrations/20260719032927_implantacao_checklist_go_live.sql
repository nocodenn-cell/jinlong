-- 272 — Checklist de implantação persistido (gate oficial de GO-LIVE por loja).
CREATE TABLE IF NOT EXISTS public.implantacao_checklists (
  loja_id uuid PRIMARY KEY REFERENCES public.lojas (id) ON DELETE CASCADE,
  go_autorizado boolean NOT NULL DEFAULT false,
  go_autorizado_em timestamptz,
  go_autorizado_por uuid REFERENCES auth.users (id),
  go_observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.implantacao_checklist_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loja_id uuid NOT NULL REFERENCES public.lojas (id) ON DELETE CASCADE,
  item_key text NOT NULL,
  status text NOT NULL DEFAULT 'PENDENTE'
    CHECK (status IN ('PENDENTE', 'CONCLUIDO', 'NA')),
  responsavel text,
  concluido_em timestamptz,
  observacoes text,
  updated_by uuid REFERENCES auth.users (id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT implantacao_checklist_itens_loja_key UNIQUE (loja_id, item_key)
);

CREATE INDEX IF NOT EXISTS idx_implantacao_itens_loja
  ON public.implantacao_checklist_itens (loja_id);

ALTER TABLE public.implantacao_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.implantacao_checklist_itens ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.auth_usuario_gerencial_loja(p_loja_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.usuarios u
    WHERE u.id = (SELECT auth.uid())
      AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
      AND (u.perfil = 'ADMIN' OR u.loja_id = p_loja_id)
  );
$$;

REVOKE ALL ON FUNCTION public.auth_usuario_gerencial_loja(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_usuario_gerencial_loja(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_usuario_gerencial_loja(uuid) TO service_role;

DROP POLICY IF EXISTS implantacao_checklists_select ON public.implantacao_checklists;
CREATE POLICY implantacao_checklists_select
  ON public.implantacao_checklists FOR SELECT
  USING (public.auth_usuario_gerencial_loja(loja_id));

DROP POLICY IF EXISTS implantacao_checklists_insert ON public.implantacao_checklists;
CREATE POLICY implantacao_checklists_insert
  ON public.implantacao_checklists FOR INSERT
  WITH CHECK (public.auth_usuario_gerencial_loja(loja_id));

DROP POLICY IF EXISTS implantacao_checklists_update ON public.implantacao_checklists;
CREATE POLICY implantacao_checklists_update
  ON public.implantacao_checklists FOR UPDATE
  USING (public.auth_usuario_gerencial_loja(loja_id))
  WITH CHECK (public.auth_usuario_gerencial_loja(loja_id));

DROP POLICY IF EXISTS implantacao_itens_select ON public.implantacao_checklist_itens;
CREATE POLICY implantacao_itens_select
  ON public.implantacao_checklist_itens FOR SELECT
  USING (public.auth_usuario_gerencial_loja(loja_id));

DROP POLICY IF EXISTS implantacao_itens_insert ON public.implantacao_checklist_itens;
CREATE POLICY implantacao_itens_insert
  ON public.implantacao_checklist_itens FOR INSERT
  WITH CHECK (public.auth_usuario_gerencial_loja(loja_id));

DROP POLICY IF EXISTS implantacao_itens_update ON public.implantacao_checklist_itens;
CREATE POLICY implantacao_itens_update
  ON public.implantacao_checklist_itens FOR UPDATE
  USING (public.auth_usuario_gerencial_loja(loja_id))
  WITH CHECK (public.auth_usuario_gerencial_loja(loja_id));

COMMENT ON TABLE public.implantacao_checklists IS
  'Gate GO-LIVE por loja — cabeçalho do checklist de implantação.';
COMMENT ON TABLE public.implantacao_checklist_itens IS
  'Itens do checklist de implantação (status, responsável, data, observações).';
