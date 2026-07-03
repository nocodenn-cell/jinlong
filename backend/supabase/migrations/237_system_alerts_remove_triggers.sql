-- 237_system_alerts_remove_triggers.sql
--
-- Correção de arquitetura: remove toda a detecção reativa em SQL adicionada
-- pela migration 236. `system_alerts` passa a ser 100% passiva — só recebe
-- linhas via uma RPC de escrita simples, chamada explicitamente pelo backend
-- (fluxo de finalização de venda já existente), nunca por trigger.
--
-- "Banco armazena. Backend decide. UI apenas exibe."

-- ---------------------------------------------------------------------------
-- 1. Remove as triggers e as funções de detecção (lógica reativa no banco).
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_itens_venda_anomalia ON public.itens_venda;
DROP TRIGGER IF EXISTS trg_estoque_anomalia ON public.estoque;
DROP FUNCTION IF EXISTS public.trg_detectar_anomalia_item_venda();
DROP FUNCTION IF EXISTS public.trg_detectar_anomalia_estoque();

-- ---------------------------------------------------------------------------
-- 2. RPC de escrita passiva: apenas insere a linha que o backend já decidiu
--    registrar. Não avalia condição alguma — a decisão (if direto) acontece
--    inteiramente no código da aplicação, dentro do fluxo de finalização de
--    venda / atualização de estoque já existente.
-- ---------------------------------------------------------------------------
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
  'nenhuma — apenas grava o que o backend (fluxo de venda/estoque já existente) '
  'já decidiu registrar via "if" explícito na aplicação.';

REVOKE ALL ON FUNCTION public.registrar_system_alert(text, uuid, uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_system_alert(text, uuid, uuid, uuid, jsonb) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. Estende a RPC de flags visuais (235) para incluir o kill switch de
--    alertas leves — o backend lê este valor antes de decidir se registra.
--    DROP necessário: adiciona alertas_leves_ativos ao RETURNS TABLE da 235 —
--    CREATE OR REPLACE não permite mudar o tipo de retorno de uma função existente.
-- ---------------------------------------------------------------------------
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
GRANT EXECUTE ON FUNCTION public.pdv_config_flags_visuais() TO authenticated;
