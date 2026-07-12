-- 236_system_alerts_log_leve.sql
--
-- Camada de observabilidade leve, 100% aditiva, sem ação automática:
--   - tabela `system_alerts`: apenas registro de anomalias (margem negativa,
--     preço fora do padrão histórico, estoque inconsistente).
--   - duas triggers AFTER (não bloqueantes, erros são engolidos) que alimentam
--     a tabela a partir de `itens_venda` e `estoque`.
--   - kill switch único em `pdv_config.alertas_leves_ativos`: com false, as
--     triggers não inserem nada e retornam imediatamente.
--
-- Não altera `finalizar_venda_transacional_canonica_v2/v3`, não altera
-- `decrementar_estoque_seguro`, não recalcula preço nem estoque, não dispara
-- nenhuma correção automática. Vendas antigas não são afetadas (a tabela só
-- recebe linhas novas a partir de agora).

-- ---------------------------------------------------------------------------
-- 1. Tabela de registro (append-only)
-- ---------------------------------------------------------------------------
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
GRANT SELECT ON TABLE public.system_alerts TO authenticated;

DROP POLICY IF EXISTS system_alerts_select_authenticated ON public.system_alerts;
CREATE POLICY system_alerts_select_authenticated ON public.system_alerts
  FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- 2. Kill switch único (pdv_config) — desliga toda a detecção sem deploy.
-- ---------------------------------------------------------------------------
ALTER TABLE public.pdv_config
  ADD COLUMN IF NOT EXISTS alertas_leves_ativos boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.pdv_config.alertas_leves_ativos IS
  'Kill switch único para a detecção leve de anomalias em system_alerts. '
  'Com false, as triggers de detecção retornam imediatamente sem inserir nada — '
  'nenhum comportamento de venda ou estoque depende deste valor.';

-- ---------------------------------------------------------------------------
-- 3. Trigger leve em itens_venda: margem negativa + preço fora do padrão.
--    AFTER INSERT, nunca bloqueia a venda (erros são engolidos).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_detectar_anomalia_item_venda()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ativo boolean;
  v_media_historica numeric;
  v_desvio numeric;
BEGIN
  SELECT alertas_leves_ativos INTO v_ativo FROM public.pdv_config WHERE id = 1;
  IF v_ativo IS DISTINCT FROM true THEN
    RETURN NEW;
  END IF;

  IF NEW.custo_unitario_snap IS NOT NULL AND NEW.preco_unitario < NEW.custo_unitario_snap THEN
    INSERT INTO public.system_alerts (tipo, produto_id, venda_id, detalhe)
    VALUES (
      'margem_negativa',
      NEW.produto_id,
      NEW.venda_id,
      jsonb_build_object(
        'item_id', NEW.id,
        'preco_unitario', NEW.preco_unitario,
        'custo_unitario_snap', NEW.custo_unitario_snap
      )
    );
  END IF;

  SELECT AVG(iv.preco_unitario) INTO v_media_historica
  FROM (
    SELECT preco_unitario
    FROM public.itens_venda
    WHERE produto_id = NEW.produto_id
      AND id <> NEW.id
    ORDER BY id DESC
    LIMIT 30
  ) iv;

  IF v_media_historica IS NOT NULL AND v_media_historica > 0 THEN
    v_desvio := ABS(NEW.preco_unitario - v_media_historica) / v_media_historica;
    IF v_desvio > 0.5 THEN
      INSERT INTO public.system_alerts (tipo, produto_id, venda_id, detalhe)
      VALUES (
        'preco_fora_padrao',
        NEW.produto_id,
        NEW.venda_id,
        jsonb_build_object(
          'item_id', NEW.id,
          'preco_unitario', NEW.preco_unitario,
          'media_historica', round(v_media_historica, 2),
          'desvio_percentual', round(v_desvio * 100, 1)
        )
      );
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Detecção é best-effort: qualquer erro aqui nunca pode impedir a venda.
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_itens_venda_anomalia ON public.itens_venda;
CREATE TRIGGER trg_itens_venda_anomalia
  AFTER INSERT ON public.itens_venda
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_detectar_anomalia_item_venda();

COMMENT ON TRIGGER trg_itens_venda_anomalia ON public.itens_venda IS
  'Detecção leve e não bloqueante de anomalias (margem negativa / preço fora do '
  'padrão). AFTER INSERT; erros são engolidos e nunca impedem a venda. '
  'Desligável via pdv_config.alertas_leves_ativos.';

-- ---------------------------------------------------------------------------
-- 4. Trigger leve em estoque: rede de segurança para estoque negativo.
--    O lock otimista de decrementar_estoque_seguro já impede isso na prática;
--    esta trigger só registra, nunca corrige.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_detectar_anomalia_estoque()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ativo boolean;
BEGIN
  SELECT alertas_leves_ativos INTO v_ativo FROM public.pdv_config WHERE id = 1;
  IF v_ativo IS DISTINCT FROM true THEN
    RETURN NEW;
  END IF;

  IF NEW.quantidade_atual < 0 THEN
    INSERT INTO public.system_alerts (tipo, produto_id, loja_id, detalhe)
    VALUES (
      'estoque_inconsistente',
      NEW.produto_id,
      NEW.loja_id,
      jsonb_build_object('quantidade_atual', NEW.quantidade_atual)
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_estoque_anomalia ON public.estoque;
CREATE TRIGGER trg_estoque_anomalia
  AFTER UPDATE OF quantidade_atual ON public.estoque
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_detectar_anomalia_estoque();

COMMENT ON TRIGGER trg_estoque_anomalia ON public.estoque IS
  'Rede de segurança: registra em system_alerts caso o estoque fique negativo. '
  'Não corrige, não bloqueia, apenas registra. '
  'Desligável via pdv_config.alertas_leves_ativos.';
