-- ============================================================
-- Migration 272 — CAPTURE de reconciliação (P0.1)
-- Versiona objetos aplicados em produção fora do repo (ledger:
-- 260_comissoes_regras_funcionario, 261_comissoes_vendedores_regra_e_congelamento).
-- Captura fiel de 2026-07-16. Idempotente, behavior-preserving.
-- Depende de public.funcionarios (migration 270).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.comissoes_regras_funcionario (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  funcionario_id uuid NOT NULL,
  loja_id uuid NOT NULL,
  tipo_regra text NOT NULL,
  produto_id uuid,
  categoria_id uuid,
  margem_minima numeric,
  margem_maxima numeric,
  percentual numeric NOT NULL,
  vigencia_inicio date NOT NULL DEFAULT CURRENT_DATE,
  vigencia_fim date,
  ativo boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comissoes_regras_funcionario_pkey PRIMARY KEY (id)
);
ALTER TABLE public.comissoes_regras_funcionario ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS comissoes_regras_select_loja ON public.comissoes_regras_funcionario;
CREATE POLICY comissoes_regras_select_loja ON public.comissoes_regras_funcionario FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid()
    AND u.perfil = ANY (ARRAY['GERENTE','DONO','ADMIN']) AND (u.perfil = 'DONO' OR u.loja_id = comissoes_regras_funcionario.loja_id)));
DROP POLICY IF EXISTS comissoes_regras_write_loja ON public.comissoes_regras_funcionario;
CREATE POLICY comissoes_regras_write_loja ON public.comissoes_regras_funcionario FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.usuarios u WHERE u.id = auth.uid()
    AND u.perfil = ANY (ARRAY['GERENTE','DONO','ADMIN']) AND (u.perfil = 'DONO' OR u.loja_id = comissoes_regras_funcionario.loja_id)));

CREATE TABLE IF NOT EXISTS public.comissoes_regras_historico (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  regra_id uuid NOT NULL,
  funcionario_id uuid NOT NULL,
  acao text NOT NULL,
  dados_anteriores jsonb,
  dados_novos jsonb NOT NULL,
  alterado_por uuid NOT NULL,
  alterado_em timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT comissoes_regras_historico_pkey PRIMARY KEY (id),
  CONSTRAINT comissoes_regras_historico_acao_check CHECK (acao = ANY (ARRAY['criada','alterada','desativada'])),
  CONSTRAINT comissoes_regras_historico_regra_id_fkey FOREIGN KEY (regra_id) REFERENCES public.comissoes_regras_funcionario (id) ON DELETE CASCADE,
  CONSTRAINT comissoes_regras_historico_funcionario_id_fkey FOREIGN KEY (funcionario_id) REFERENCES public.funcionarios (id),
  CONSTRAINT comissoes_regras_historico_alterado_por_fkey FOREIGN KEY (alterado_por) REFERENCES public.usuarios (id)
);
ALTER TABLE public.comissoes_regras_historico ENABLE ROW LEVEL SECURITY;
