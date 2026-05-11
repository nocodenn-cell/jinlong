-- Parâmetros globais editáveis pelo painel gerencial (GERENTE/DONO/ADMIN).
-- Operador lê subconjunto apenas via RPC SECURITY DEFINER (caixa web).

CREATE TABLE public.configuracoes_gerais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave text NOT NULL UNIQUE,
  valor text NOT NULL,
  tipo_dado text NOT NULL CHECK (tipo_dado IN ('percent', 'money', 'integer', 'text')),
  descricao text,
  atualizado_por uuid REFERENCES public.usuarios (id),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  criado_em timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.configuracoes_gerais IS
  'Chave/valor tipado para regras de negócio globais; edição só perfil gerencial.';

CREATE INDEX IF NOT EXISTS idx_configuracoes_gerais_chave ON public.configuracoes_gerais (chave);

ALTER TABLE public.configuracoes_gerais ENABLE ROW LEVEL SECURITY;

-- Leitura e atualização apenas para perfis de painel gerencial (sem SELECT aberto a OPERADOR).
CREATE POLICY configuracoes_gerais_select_gerencial
  ON public.configuracoes_gerais
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  );

CREATE POLICY configuracoes_gerais_update_gerencial
  ON public.configuracoes_gerais
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  );

-- INSERT/DELETE: apenas migrações/service_role (sem policy para authenticated).

GRANT SELECT, UPDATE ON public.configuracoes_gerais TO authenticated;

INSERT INTO public.configuracoes_gerais (chave, valor, tipo_dado, descricao)
VALUES
  ('comissao_padrao_percentual', '5.00', 'percent', 'Comissão padrão para vendedores (%)'),
  ('desconto_maximo_operador_percentual', '10.00', 'percent', 'Desconto máximo na venda sem validação de gerente (somatório linhas, %)'),
  ('cancelamento_maximo_valor_sem_gerente', '500.00', 'money', 'Reservado: limite de cancelamento de venda sem gerente (R$)'),
  ('lead_time_min_dias', '30', 'integer', 'Lead time mínimo de importação (dias)'),
  ('lead_time_max_dias', '60', 'integer', 'Lead time máximo de importação (dias)'),
  ('estoque_minimo_padrao', '10', 'integer', 'Estoque mínimo padrão ao criar linha de estoque para novo produto')
ON CONFLICT (chave) DO NOTHING;

CREATE OR REPLACE FUNCTION public.configuracoes_para_caixa_web()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT jsonb_object_agg(c.chave, to_jsonb(c.valor))
      FROM public.configuracoes_gerais c
      WHERE c.chave IN (
        'desconto_maximo_operador_percentual',
        'cancelamento_maximo_valor_sem_gerente',
        'lead_time_min_dias',
        'lead_time_max_dias'
      )
    ),
    '{}'::jsonb
  );
$$;

COMMENT ON FUNCTION public.configuracoes_para_caixa_web() IS
  'Subconjunto de configuracoes_gerais para o caixa web (JSONB chave -> valor texto).';

REVOKE ALL ON FUNCTION public.configuracoes_para_caixa_web() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.configuracoes_para_caixa_web() TO authenticated;
GRANT EXECUTE ON FUNCTION public.configuracoes_para_caixa_web() TO service_role;
