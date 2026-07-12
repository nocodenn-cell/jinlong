-- Capture: migration aplicada diretamente no DB em 2026-06-20.
-- Bloqueia overload completo de v3 com stub LEGACY_DISABLED_USE_V4.
-- Contexto: v3 é guard de transição ativo. Pode ser reabilitada removendo este stub
-- após validação de pré-condições de ativação no runtime.
-- Idempotente: CREATE OR REPLACE.
--
-- GUARD (2026-07-03): 123_revalidar_preco_commit_v3_e_revoke_v2.sql já define esta
-- assinatura de parâmetros com RETURNS TABLE de 6 colunas (sem event_id). Postgres
-- proíbe CREATE OR REPLACE mudar o row type de OUT params de uma função existente
-- (SQLSTATE 42P13 "cannot change return type of existing function") — este capture
-- original adicionava `event_id uuid` como 7ª coluna, o que só não quebrava no
-- remoto porque a ordem cronológica real de aplicação era outra (capture pós-fato).
-- Removida a coluna extra para casar com 123; 229_venda_eventos_rpc_hooks.sql (mais
-- adiante) faz DROP FUNCTION IF EXISTS por tipo (ignora return type) antes de
-- recriar com event_id — a corrente segue íntegra depois. Corpo é RAISE EXCEPTION
-- incondicional, então isso não muda nenhum comportamento.

CREATE OR REPLACE FUNCTION public.finalizar_venda_transacional_canonica_v3(
  p_venda_id uuid,
  p_caixa_id uuid,
  p_operador_id uuid,
  p_loja_id uuid,
  p_forma_pagamento text DEFAULT 'DINHEIRO',
  p_total_bruto numeric DEFAULT NULL,
  p_total_desconto numeric DEFAULT NULL,
  p_total_liquido numeric DEFAULT NULL,
  p_pagamentos jsonb DEFAULT NULL,
  p_itens jsonb DEFAULT '[]',
  p_desconto_gerente_token text DEFAULT NULL,
  p_desconto_gerente_percentual numeric DEFAULT NULL,
  p_strict_manager_discount_auth boolean DEFAULT false,
  p_fiscal_auto_enqueue boolean DEFAULT false,
  p_ip_address text DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_device_id text DEFAULT NULL,
  p_terminal_id text DEFAULT NULL
)
RETURNS TABLE(
  venda_id uuid,
  status text,
  mensagem text,
  dados_fiscais jsonb,
  itens_atualizados jsonb,
  estoque_baixado jsonb
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RAISE EXCEPTION 'LEGACY_DISABLED_USE_V4';
END;
$$;
