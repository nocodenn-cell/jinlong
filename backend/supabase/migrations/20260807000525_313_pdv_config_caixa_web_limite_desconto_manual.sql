-- Migration 313 — `pdv_config_para_caixa_web()` passa a devolver também
-- `max_desconto_manual_item_percentual`.
--
-- MOTIVO (violação de Single Source of Truth, com evidência):
--   O limite de desconto manual por item já existe e já é aplicado no servidor:
--     - coluna:  pdv_config.max_desconto_manual_item_percentual (122:26, default 15.00)
--     - trigger: trg_fn_itens_venda_limite_desconto, que lê
--                COALESCE(max_desconto_manual_item_percentual, 15.00) (122:66, 274:144)
--
--   Mas o cliente reimplementa o mesmo teto com um literal:
--     shared-core/src/stores/unifiedCartStore.ts:373
--       const maxPermitido = 15 // Default limit for non-ATACADO
--
--   Consequência: mudar o limite em `pdv_config` altera o comportamento do
--   servidor e NÃO altera o do PDV. O operador continua bloqueado (ou liberado)
--   em 15% na tela, e só descobre a divergência quando o trigger recusa a venda.
--
-- CORREÇÃO: expor o valor pela RPC que o caixa web já consome, para o cliente
--   ler a configuração em vez de reafirmá-la. O banco continua sendo a
--   autoridade — a checagem do cliente é apenas pré-validação de UX; a recusa
--   final permanece no trigger.
--
-- O campo não é sensível: é o mesmo teto que já aparece na mensagem de erro
--   mostrada ao operador. Nenhuma coluna de credencial entra no retorno
--   (a 058 criou esta RPC exatamente para manter gerente_senha_* fora do alcance
--   de `authenticated`).
--
-- DROP necessário: acrescenta coluna ao RETURNS TABLE — CREATE OR REPLACE não
-- permite mudar o tipo de retorno de uma função existente.

DROP FUNCTION IF EXISTS public.pdv_config_para_caixa_web();

CREATE OR REPLACE FUNCTION public.pdv_config_para_caixa_web()
RETURNS TABLE (
  quantidade_minima_atacado_padrao numeric,
  blind_closure boolean,
  max_desconto_manual_item_percentual numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.quantidade_minima_atacado_padrao,
    p.blind_closure,
    COALESCE(p.max_desconto_manual_item_percentual, 15.00)
  FROM public.pdv_config p
  WHERE p.id = 1
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.pdv_config_para_caixa_web() IS
  'Campos não sensíveis do PDV para o caixa web (sem gerente_senha_sha256 / gerente_id). '
  'Inclui max_desconto_manual_item_percentual para que o cliente leia o teto de '
  'desconto manual em vez de reimplementá-lo — a autoridade continua sendo o '
  'trigger trg_fn_itens_venda_limite_desconto.';

REVOKE ALL ON FUNCTION public.pdv_config_para_caixa_web() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pdv_config_para_caixa_web() FROM anon;
GRANT EXECUTE ON FUNCTION public.pdv_config_para_caixa_web() TO authenticated;

DO $verify_313$
DECLARE
  v_ret text;
  v_val numeric;
BEGIN
  SELECT pg_get_function_result(p.oid) INTO v_ret
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'pdv_config_para_caixa_web';

  IF v_ret NOT ILIKE '%max_desconto_manual_item_percentual%' THEN
    RAISE EXCEPTION 'MIGRATION_313: RETURNS TABLE sem max_desconto_manual_item_percentual (%)', v_ret;
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.pdv_config_para_caixa_web()', 'EXECUTE') THEN
    RAISE EXCEPTION 'MIGRATION_313: authenticated perdeu EXECUTE — caixa web quebraria';
  END IF;

  IF has_function_privilege('anon', 'public.pdv_config_para_caixa_web()', 'EXECUTE') THEN
    RAISE EXCEPTION 'MIGRATION_313: anon não pode executar esta RPC';
  END IF;

  -- O valor tem de sair não-nulo mesmo se a coluna estiver NULL (COALESCE).
  SELECT max_desconto_manual_item_percentual INTO v_val FROM public.pdv_config_para_caixa_web();
  IF v_val IS NULL THEN
    RAISE EXCEPTION 'MIGRATION_313: max_desconto_manual_item_percentual saiu NULL';
  END IF;
END;
$verify_313$;

NOTIFY pgrst, 'reload schema';
