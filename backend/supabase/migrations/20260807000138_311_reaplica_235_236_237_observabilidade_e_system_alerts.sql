-- Migration 311 — Reaplica as 235/236/237 (observabilidade visual do PDV e
-- system_alerts), que constam como aplicadas no ledger mas nunca foram
-- executadas em produção.
--
-- EVIDÊNCIA (produção, 2026-08-06):
--   schema_migrations contém 235, 236 e 237 (as três já no backup pré-repair
--   `_backup_schema_migrations_20260802`). Ainda assim:
--     - pdv_config.show_margin_visual   → ausente (235:28)
--     - pdv_config.show_preco_fonte     → ausente (235:29)
--     - pdv_config.show_stock_alerts    → ausente (235:30)
--     - pdv_config.alertas_leves_ativos → ausente (236)
--     - public.system_alerts            → ausente (236)
--     - public.registrar_system_alert   → ausente (237)
--
--   E `pdv_config_flags_visuais()` em produção NÃO é a definição de nenhuma
--   migration do repositório — é um stub feito à mão:
--
--       CREATE OR REPLACE FUNCTION public.pdv_config_flags_visuais()
--        RETURNS TABLE(alertas_leves_ativos boolean, show_margin_visual boolean,
--                      show_preco_fonte boolean, show_stock_alerts boolean)
--        LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
--       AS $function$ SELECT false, false, false, false; $function$
--
--   Ou seja: a função devolve `false` fixo para todas as flags, sem ler
--   `pdv_config`. É a única explicação para a 237 "existir" sem a 235 — alguém
--   aplicou um remendo direto no banco para a função não quebrar sem as colunas.
--   É uma violação de Single Source of Truth: a configuração do PDV existe na
--   tabela, mas nenhuma leitura chega até ela.
--
-- IMPACTO:
--   (1) As três flags visuais ficam permanentemente desligadas em produção,
--       independentemente do que estiver em `pdv_config`
--       (app/admin/layout.tsx, app/admin/dashboard/page.tsx).
--   (2) `registrarAlertasLevesVenda.ts:29` faz `if (!flags?.alertas_leves_ativos) return`,
--       então a detecção de anomalias nunca roda e `registrar_system_alert`
--       nunca é chamada — por isso a função parecia "código morto". Não é
--       código morto: é código órfão de uma migration que não rodou.
--   (3) `app/admin/auditoria/actions.ts:279` consulta `system_alerts`; como a
--       tabela não existe, o erro é engolido (`const rows = error ? [] : ...`,
--       linha 288) e a seção ALERTA da trilha de auditoria fica sempre vazia.
--
-- DECISÃO: reproduzir o estado que a reconstrução limpa produz (repositório é a
--   fonte de verdade), em vez de remover o código da aplicação — remover só o
--   código criaria um novo drift, porque as 235/236/237 continuam no repositório
--   e recriariam tudo no próximo rebuild.
--
--   Os defaults seguem o repositório: as três flags visuais nascem `false`
--   (235), portanto o comportamento visível do PDV não muda hoje; e
--   `alertas_leves_ativos` nasce `true` (236), que é o que habilita a trilha de
--   alertas. A escrita é append-only, best-effort e já vem embrulhada em
--   try/catch na aplicação (registrarAlertasLevesVenda.ts:26,80).
--
-- As triggers de detecção da 236 NÃO são recriadas: a 237 as removeu de
-- propósito ("Banco armazena. Backend decide. UI apenas exibe."). Esta migration
-- aplica o estado final 235→236→237, não os passos intermediários.

-- ═══════════════════════════════════════════════════════════════════════════
-- (1) Flags de observabilidade visual (235)
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.pdv_config
  ADD COLUMN IF NOT EXISTS show_margin_visual boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_preco_fonte   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS show_stock_alerts  boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.pdv_config.show_margin_visual IS
  'Exibe indicador visual de margem no PDV. Apenas exibição — não altera preço, '
  'desconto ou qualquer regra de venda.';
COMMENT ON COLUMN public.pdv_config.show_preco_fonte IS
  'Exibe a fonte do preço aplicado (varejo/atacado/promoção) no PDV. Apenas exibição.';
COMMENT ON COLUMN public.pdv_config.show_stock_alerts IS
  'Exibe alertas de estoque no PDV. Apenas exibição.';

-- ═══════════════════════════════════════════════════════════════════════════
-- (2) system_alerts — registro append-only de anomalias (236)
-- ═══════════════════════════════════════════════════════════════════════════
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
  'Registro leve e append-only de anomalias detectadas no momento da venda/estoque '
  '(margem negativa, preço fora do padrão histórico, estoque inconsistente). '
  'Apenas registro — nenhuma ação automática é disparada a partir desta tabela. '
  'Não é lida por nenhum fluxo crítico de venda ou estoque.';

ALTER TABLE public.system_alerts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.system_alerts FROM PUBLIC;
REVOKE ALL ON TABLE public.system_alerts FROM anon;
GRANT SELECT ON TABLE public.system_alerts TO authenticated;

DROP POLICY IF EXISTS system_alerts_select_authenticated ON public.system_alerts;
CREATE POLICY system_alerts_select_authenticated ON public.system_alerts
  FOR SELECT TO authenticated USING (true);

-- Kill switch único da detecção leve.
ALTER TABLE public.pdv_config
  ADD COLUMN IF NOT EXISTS alertas_leves_ativos boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.pdv_config.alertas_leves_ativos IS
  'Kill switch único para a detecção leve de anomalias em system_alerts. '
  'Com false, o backend retorna antes de registrar qualquer alerta — '
  'nenhum comportamento de venda ou estoque depende deste valor.';

-- ═══════════════════════════════════════════════════════════════════════════
-- (3) Escrita passiva (237) — sem trigger, decisão fica no backend
-- ═══════════════════════════════════════════════════════════════════════════
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
  'Escrita passiva em system_alerts. Não detecta nada e não avalia condição '
  'nenhuma — apenas grava o que o backend (registrarAlertasLevesVenda.ts) já '
  'decidiu registrar via "if" explícito na aplicação.';

REVOKE ALL ON FUNCTION public.registrar_system_alert(text, uuid, uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.registrar_system_alert(text, uuid, uuid, uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.registrar_system_alert(text, uuid, uuid, uuid, jsonb) TO authenticated;

-- Garantia de que as triggers reativas da 236 continuam ausentes (a 237 as
-- removeu de propósito). Necessário porque este arquivo aplica o estado final.
DROP TRIGGER IF EXISTS trg_itens_venda_anomalia ON public.itens_venda;
DROP TRIGGER IF EXISTS trg_estoque_anomalia ON public.estoque;
DROP FUNCTION IF EXISTS public.trg_detectar_anomalia_item_venda();
DROP FUNCTION IF EXISTS public.trg_detectar_anomalia_estoque();

-- ═══════════════════════════════════════════════════════════════════════════
-- (4) pdv_config_flags_visuais volta a LER pdv_config (fim do stub)
-- ═══════════════════════════════════════════════════════════════════════════
-- Definição idêntica à da 237, com os GRANTs consolidados pela 278:78-87
-- (`authenticated` preservado — 3 chamadas autenticadas no app).
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
  'Flags de exibição (observabilidade visual) do PDV: margem, fonte de preço, '
  'alertas de estoque, e o kill switch de alertas leves (system_alerts). '
  'Sem dados sensíveis.';

REVOKE ALL ON FUNCTION public.pdv_config_flags_visuais() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pdv_config_flags_visuais() FROM anon;
GRANT EXECUTE ON FUNCTION public.pdv_config_flags_visuais() TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- Prova viva
-- ═══════════════════════════════════════════════════════════════════════════
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

  -- O stub tinha corpo literal `SELECT false, false, false, false`; a definição
  -- correta lê pdv_config.
  SELECT p.prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'pdv_config_flags_visuais';
  IF v_src NOT ILIKE '%pdv_config%' THEN
    RAISE EXCEPTION 'MIGRATION_311: pdv_config_flags_visuais ainda não lê pdv_config (stub)';
  END IF;
END;
$verify_311$;

NOTIFY pgrst, 'reload schema';
