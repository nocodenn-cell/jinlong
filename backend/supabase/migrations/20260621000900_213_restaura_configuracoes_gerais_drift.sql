-- Restaura configuracoes_gerais + configuracoes_para_caixa_web (drift).
--
-- Contexto:
--   As migrations 087 (configuracoes_gerais) e 105 (chaves de suspensão + versão nova
--   da RPC) constam APLICADAS em supabase_migrations.schema_migrations, mas seus objetos
--   NUNCA materializaram no prod (SEU-PROJECT-REF) — mesmo padrão de drift do
--   movimentos_caixa (corrigido na 212). Verificado em 2026-06-01:
--     - to_regclass('public.configuracoes_gerais') IS NULL
--     - função configuracoes_para_caixa_web() ausente
--     - finalizar_venda_transacional_canonica_v3 do prod é a linhagem 089 (não lê
--       configuracoes_gerais nem tem guard 'vendas_suspensas'), confirmando que a 105
--       não rodou.
--
-- Efeito do drift:
--   - gerente/configuracoes e gerente/suspensao (actions.ts) leem/escrevem a tabela => quebram.
--   - caixa lê via RPC com fallback gracioso (obterMapaConfiguracoesParaCaixaWeb -> {}),
--     então o caixa não crasha, mas perde os parâmetros (limites de desconto, suspensão).
--
-- Escopo: SOMENTE o bloco de configuracoes_gerais (sem phantom-schema, sem alterar dados
--   existentes). Idempotente. NÃO toca em vendas/fiscal. A versão da RPC é a da 105
--   (superset de chaves). NÃO redefine o v3 aqui (a linhagem corrente do v3 passou por
--   118/123 e merece reconciliação própria).

-- ── Tabela ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.configuracoes_gerais (
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

DROP POLICY IF EXISTS configuracoes_gerais_select_gerencial ON public.configuracoes_gerais;
CREATE POLICY configuracoes_gerais_select_gerencial
  ON public.configuracoes_gerais
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  );

DROP POLICY IF EXISTS configuracoes_gerais_update_gerencial ON public.configuracoes_gerais;
CREATE POLICY configuracoes_gerais_update_gerencial
  ON public.configuracoes_gerais
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.usuarios u
      WHERE u.id = auth.uid()
        AND u.perfil IN ('GERENTE', 'DONO', 'ADMIN')
    )
  );

GRANT SELECT, UPDATE ON public.configuracoes_gerais TO authenticated;

-- ── Seed de chaves (087 + 105) ────────────────────────────────────────────────
INSERT INTO public.configuracoes_gerais (chave, valor, tipo_dado, descricao)
VALUES
  ('comissao_padrao_percentual', '5.00', 'percent', 'Comissão padrão para vendedores (%)'),
  ('desconto_maximo_operador_percentual', '10.00', 'percent', 'Desconto máximo na venda sem validação de gerente (somatório linhas, %)'),
  ('cancelamento_maximo_valor_sem_gerente', '500.00', 'money', 'Reservado: limite de cancelamento de venda sem gerente (R$)'),
  ('lead_time_min_dias', '30', 'integer', 'Lead time mínimo de importação (dias)'),
  ('lead_time_max_dias', '60', 'integer', 'Lead time máximo de importação (dias)'),
  ('estoque_minimo_padrao', '10', 'integer', 'Estoque mínimo padrão ao criar linha de estoque para novo produto'),
  ('vendas_suspensas', 'false', 'text', 'Se true, todas as vendas estão suspensas no caixa'),
  ('motivo_suspensao', '', 'text', 'Motivo exibido ao operador quando as vendas estão suspensas')
ON CONFLICT (chave) DO NOTHING;

-- ── RPC subconjunto p/ caixa web (versão 105: superset de chaves) ──────────────
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
        'lead_time_max_dias',
        'vendas_suspensas',
        'motivo_suspensao'
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
