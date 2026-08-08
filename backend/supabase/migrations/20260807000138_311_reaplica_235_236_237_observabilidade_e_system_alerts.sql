-- Backport Fase 1 (Git-only) from supabase_migrations.schema_migrations.statements
-- version: 20260807000138
-- name: 311_reaplica_235_236_237_observabilidade_e_system_alerts
-- source: production read-only export (schema_migrations)
-- Applied in production: yes (do NOT re-run on production).

ALTER TABLE public.pdv_config
  ADD COLUMN IF NOT EXISTS show_margin_visual boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_preco_fonte   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_stock_alerts  boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.pdv_config.show_margin_visual IS
  'Exibe indicador visual de margem no PDV. Apenas exibição — não altera preço, desconto ou qualquer regra de venda.';
COMMENT ON COLUMN public.pdv_config.show_preco_fonte IS
  'Exibe a fonte do preço aplicado (varejo/atacado/promoção) no PDV. Apenas exibição.';
COMMENT ON COLUMN public.pdv_config.show_stock_alerts IS
  'Exibe alertas de estoque no PDV. Apenas exibição.';

CREATE TABLE IF NOT EXISTS public.system_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('margem_negativa', 'preco_fora_padrao', 'estoque_inconsistente')),
  produto_id uuid REFERENCES public.produtos(id),
  venda_id uuid REFERENCES public.vendas(id),
  loja_id uuid REFERENCES public.lojas(id),
  detalhe jsonb,
  criado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_alerts_criado_em ON public.system_alerts (criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_system_alerts_tipo ON public.system_alerts (tipo);

COMMENT ON TABLE public.system_alerts IS
  'Registro leve e append-only de anomalias detectadas no momento da venda/estoque (margem negativa, preço fora do padrão histórico, estoque inconsistente). Apenas registro — nenhuma ação automática é disparada a partir desta tabela. Não é lida por nenhum fluxo crítico de venda ou estoque.';

ALTER TABLE public.system_alerts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.system_alerts FROM PUBLIC;
REVOKE ALL ON TABLE public.system_alerts FROM anon;
GRANT SELECT ON TABLE public.system_alerts TO authenticated;

DROP POLICY IF EXISTS system_alerts_select_authenticated ON public.system_alerts;
CREATE POLICY system_alerts_select_authenticated ON public.system_alerts
  FOR SELECT TO authenticated USING (true);

ALTER TABLE public.pdv_config
  ADD COLUMN IF NOT EXISTS alertas_leves_ativos boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.pdv_config.alertas_leves_ativos IS
  'Kill switch único para a detecção leve de anomalias em system_alerts. Com false, o backend retorna antes de registrar qualquer alerta — nenhum comportamento de venda ou estoque depende deste valor.';

CREATE OR REPLACE FUNCTION public.registrar_system_alert(
  p_tipo text,
  p_produto_id uuid DEFAULT NULL,
  p_venda_id uuid DEFAULT NULL,
  p_loja_id uuid DEFAULT NULL,
  p_detalhe jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.system_alerts (tipo, produto_id, venda_id, loja_id, detalhe)
  VALUES (p_tipo, p_produto_id, p_venda_id, p_loja_id, p_detalhe);
$$;

COMMENT ON FUNCTION public.registrar_system_alert(text, uuid, uuid, uuid, jsonb) IS
  'Escrita passiva em system_alerts. Não detecta nada e não avalia condição nenhuma — apenas grava o que o backend (registrarAlertasLevesVenda.ts) já decidiu registrar via "if" explícito na aplicação.';

REVOKE ALL ON FUNCTION public.registrar_system_alert(text, uuid, uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.registrar_system_alert(text, uuid, uuid, uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.registrar_system_alert(text, uuid, uuid, uuid, jsonb) TO authenticated;

DROP TRIGGER IF EXISTS trg_itens_venda_anomalia ON public.itens_venda;
DROP TRIGGER IF EXISTS trg_estoque_anomalia ON public.estoque;
DROP FUNCTION IF EXISTS public.trg_detectar_anomalia_item_venda();
DROP FUNCTION IF EXISTS public.trg_detectar_anomalia_estoque();

DROP FUNCTION IF EXISTS public.pdv_config_flags_visuais();

CREATE OR REPLACE FUNCTION public.pdv_config_flags_visuais()
RETURNS TABLE (
  show_margin_visual boolean,
  show_preco_fonte boolean,
  show_stock_alerts boolean,
  alertas_leves_ativos boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.show_margin_visual,
    p.show_preco_fonte,
    p.show_stock_alerts,
    p.alertas_leves_ativos
  FROM public.pdv_config p
  WHERE p.id = 1
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.pdv_config_flags_visuais() IS
  'Flags de exibição (observabilidade visual) do PDV: margem, fonte de preço, alertas de estoque, e o kill switch de alertas leves (system_alerts). Sem dados sensíveis.';

REVOKE ALL ON FUNCTION public.pdv_config_flags_visuais() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pdv_config_flags_visuais() FROM anon;
GRANT EXECUTE ON FUNCTION public.pdv_config_flags_visuais() TO authenticated, service_role;

DO $verify_311$
DECLARE
  v_cols int;
  v_tab  int;
  v_fn   int;
  v_src  text;
BEGIN
  SELECT count(*) INTO v_cols FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'pdv_config'
     AND column_name IN ('show_margin_visual','show_preco_fonte','show_stock_alerts','alertas_leves_ativos');
  IF v_cols <> 4 THEN
    RAISE EXCEPTION 'MIGRATION_311: esperadas 4 colunas de flag em pdv_config, encontradas %', v_cols;
  END IF;

  SELECT count(*) INTO v_tab FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relname = 'system_alerts' AND c.relrowsecurity;
  IF v_tab <> 1 THEN
    RAISE EXCEPTION 'MIGRATION_311: system_alerts ausente ou sem RLS habilitado';
  END IF;

  SELECT count(*) INTO v_fn FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'registrar_system_alert';
  IF v_fn <> 1 THEN
    RAISE EXCEPTION 'MIGRATION_311: registrar_system_alert ausente';
  END IF;

  IF has_table_privilege('anon', 'public.system_alerts', 'SELECT') THEN
    RAISE EXCEPTION 'MIGRATION_311: anon ainda enxerga system_alerts';
  END IF;

  SELECT p.prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'pdv_config_flags_visuais';
  IF v_src NOT ILIKE '%pdv_config%' THEN
    RAISE EXCEPTION 'MIGRATION_311: pdv_config_flags_visuais ainda não lê pdv_config (stub)';
  END IF;
END;
$verify_311$;

NOTIFY pgrst, 'reload schema';
