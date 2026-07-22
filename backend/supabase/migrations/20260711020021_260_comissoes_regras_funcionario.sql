-- Commission rules infrastructure
-- Stores employee-specific commission rules with full audit trail
-- Supports: padrao (default), por_produto, por_categoria, por_margem

-- ────────────────────────────────────────────────────────────────────────────
-- 1. Create comissoes_regras_funcionario table
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.comissoes_regras_funcionario (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  funcionario_id    uuid        NOT NULL REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  loja_id           uuid        NOT NULL REFERENCES public.lojas(id),
  tipo_regra        text        NOT NULL CHECK (tipo_regra IN ('padrao', 'por_produto', 'por_categoria', 'por_margem')),
  produto_id        uuid        REFERENCES public.produtos(id),
  categoria_id      uuid        REFERENCES public.categorias(id),
  margem_minima     numeric(10, 4),
  margem_maxima     numeric(10, 4),
  percentual        numeric(10, 4) NOT NULL CHECK (percentual >= 0),
  vigencia_inicio   date        NOT NULL DEFAULT CURRENT_DATE,
  vigencia_fim      date,
  ativo             boolean     NOT NULL DEFAULT true,
  created_by        uuid        NOT NULL REFERENCES public.usuarios(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  -- Constraints: ensure target fields match rule type
  CONSTRAINT regra_target_match CHECK (
    (tipo_regra = 'padrao' AND produto_id IS NULL AND categoria_id IS NULL AND margem_minima IS NULL AND margem_maxima IS NULL) OR
    (tipo_regra = 'por_produto' AND produto_id IS NOT NULL AND categoria_id IS NULL AND margem_minima IS NULL AND margem_maxima IS NULL) OR
    (tipo_regra = 'por_categoria' AND produto_id IS NULL AND categoria_id IS NOT NULL AND margem_minima IS NULL AND margem_maxima IS NULL) OR
    (tipo_regra = 'por_margem' AND produto_id IS NULL AND categoria_id IS NULL AND margem_minima IS NOT NULL AND margem_maxima IS NOT NULL)
  ),
  -- Margin range validation for margem rules
  CONSTRAINT margem_range_valid CHECK (margem_minima IS NULL OR margem_maxima IS NULL OR margem_minima <= margem_maxima)
);

COMMENT ON TABLE public.comissoes_regras_funcionario IS 'Employee-specific commission rules. More specific rules override less specific ones. Priority: product → category → margin → default.';
COMMENT ON COLUMN public.comissoes_regras_funcionario.percentual IS 'Commission rate as percentage (e.g., 5 = 5%)';
COMMENT ON COLUMN public.comissoes_regras_funcionario.vigencia_inicio IS 'Rule is active from this date (inclusive)';
COMMENT ON COLUMN public.comissoes_regras_funcionario.vigencia_fim IS 'Rule is active until this date (inclusive). NULL = ongoing.';
COMMENT ON COLUMN public.comissoes_regras_funcionario.ativo IS 'Soft delete flag. When false, rule is ignored but kept for audit trail.';

CREATE INDEX idx_comissoes_regras_funcionario_funcionario_ativo
  ON public.comissoes_regras_funcionario(funcionario_id, ativo);
CREATE INDEX idx_comissoes_regras_funcionario_vigencia
  ON public.comissoes_regras_funcionario(vigencia_inicio, vigencia_fim);
CREATE INDEX idx_comissoes_regras_funcionario_categoria
  ON public.comissoes_regras_funcionario(categoria_id) WHERE categoria_id IS NOT NULL;
CREATE INDEX idx_comissoes_regras_funcionario_produto
  ON public.comissoes_regras_funcionario(produto_id) WHERE produto_id IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 2. Create comissoes_regras_historico table (immutable audit trail)
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.comissoes_regras_historico (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  regra_id          uuid        NOT NULL REFERENCES public.comissoes_regras_funcionario(id) ON DELETE CASCADE,
  funcionario_id    uuid        NOT NULL REFERENCES public.funcionarios(id),
  acao              text        NOT NULL CHECK (acao IN ('criada', 'alterada', 'desativada')),
  dados_anteriores  jsonb,
  dados_novos       jsonb       NOT NULL,
  alterado_por      uuid        NOT NULL REFERENCES public.usuarios(id),
  alterado_em       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.comissoes_regras_historico IS 'Immutable audit trail for commission rule changes. Tracks who changed what and when.';
COMMENT ON COLUMN public.comissoes_regras_historico.dados_anteriores IS 'Full previous rule state (null if acao=criada)';
COMMENT ON COLUMN public.comissoes_regras_historico.dados_novos IS 'Full new/current rule state';

CREATE INDEX idx_comissoes_regras_historico_funcionario
  ON public.comissoes_regras_historico(funcionario_id, alterado_em DESC);
CREATE INDEX idx_comissoes_regras_historico_regra
  ON public.comissoes_regras_historico(regra_id);
CREATE INDEX idx_comissoes_regras_historico_por
  ON public.comissoes_regras_historico(alterado_por);

-- ────────────────────────────────────────────────────────────────────────────
-- 3. RLS Policies for comissoes_regras_funcionario
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.comissoes_regras_funcionario ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS comissoes_regras_select_loja ON public.comissoes_regras_funcionario;
CREATE POLICY comissoes_regras_select_loja
  ON public.comissoes_regras_funcionario FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
        AND (u.perfil = 'DONO' OR u.loja_id = comissoes_regras_funcionario.loja_id)
    )
  );

DROP POLICY IF EXISTS comissoes_regras_write_loja ON public.comissoes_regras_funcionario;
CREATE POLICY comissoes_regras_write_loja
  ON public.comissoes_regras_funcionario FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
        AND (u.perfil = 'DONO' OR u.loja_id = comissoes_regras_funcionario.loja_id)
    )
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 4. RLS Policies for comissoes_regras_historico (read-only)
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.comissoes_regras_historico ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS comissoes_regras_historico_select_loja ON public.comissoes_regras_historico;
CREATE POLICY comissoes_regras_historico_select_loja
  ON public.comissoes_regras_historico FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
        INNER JOIN public.comissoes_regras_funcionario crf
          ON crf.id = comissoes_regras_historico.regra_id
      WHERE u.id = auth.uid() AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
        AND (u.perfil = 'DONO' OR u.loja_id = crf.loja_id)
    )
  );
