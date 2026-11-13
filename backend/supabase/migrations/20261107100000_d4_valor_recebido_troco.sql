-- D4 (PLANO_LIBERACAO_PRIMEIRO_CLIENTE_2026-11-06, P0-7 / D-05 aprovado):
-- Persiste valor recebido e troco nas vendas em DINHEIRO.
--
-- Mecanismo idêntico ao de parcelas (20261021120000): o wrapper web valida e guarda
-- (venda_id, valor_recebido) num GUC LOCAL à transação; um trigger BEFORE INSERT em
-- vendas_pagamentos grava valor_recebido e troco na linha DINHEIRO daquela venda.
-- As funções grandes (internal.finalizar_venda_transacional_canonica_v4) não são reescritas.
--
-- Compatível: campo `valor_recebido` é OPCIONAL em cada item de p_pagamentos.
-- Sem o campo, as colunas ficam NULL (comportamento atual).
-- Só DINHEIRO aceita valor_recebido. Uma linha DINHEIRO por venda com valor_recebido.
-- Regra: valor_recebido >= valor (senão PAGAMENTO_VALOR_RECEBIDO_INVALIDO); troco = valor_recebido - valor.
-- O troco NÃO entra no saldo do caixa: caixa continua recebendo só o líquido (valor).
-- Rollback: backend/supabase/rollback/20261107100000_d4_valor_recebido_troco.rollback.sql

ALTER TABLE public.vendas_pagamentos ADD COLUMN IF NOT EXISTS valor_recebido numeric(10,2);
ALTER TABLE public.vendas_pagamentos ADD COLUMN IF NOT EXISTS troco numeric(10,2);
ALTER TABLE public.vendas_pagamentos DROP CONSTRAINT IF EXISTS vendas_pagamentos_troco_check;
ALTER TABLE public.vendas_pagamentos ADD CONSTRAINT vendas_pagamentos_troco_check CHECK (
  valor_recebido IS NULL
  OR (forma_pagamento = 'DINHEIRO' AND valor_recebido >= valor AND troco = ROUND(valor_recebido - valor, 2) AND troco >= 0)
);
COMMENT ON COLUMN public.vendas_pagamentos.valor_recebido IS
  'D4: valor entregue pelo cliente em DINHEIRO (NULL quando não informado). Só DINHEIRO.';
COMMENT ON COLUMN public.vendas_pagamentos.troco IS
  'D4: troco devolvido ao cliente = valor_recebido - valor. Não entra no saldo do caixa.';

CREATE OR REPLACE FUNCTION internal.fp_preparar_valor_recebido(p_venda_id uuid, p_pagamentos jsonb)
RETURNS boolean
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_pag jsonb;
  v_raw jsonb;
  v_valor numeric;
  v_recebido numeric;
  v_qtd int := 0;
BEGIN
  PERFORM set_config('fp.valor_recebido', '', true);
  IF p_pagamentos IS NULL OR jsonb_typeof(p_pagamentos) <> 'array' THEN
    RETURN true;
  END IF;
  FOR v_pag IN SELECT value FROM jsonb_array_elements(p_pagamentos)
  LOOP
    IF jsonb_typeof(v_pag) <> 'object' OR NOT (v_pag ? 'valor_recebido') OR jsonb_typeof(v_pag->'valor_recebido') = 'null' THEN
      CONTINUE;
    END IF;
    IF upper(COALESCE(v_pag->>'forma_pagamento', '')) <> 'DINHEIRO' THEN
      RAISE EXCEPTION 'PAGAMENTO_VALOR_RECEBIDO_INVALIDO' USING DETAIL = 'valor_recebido só para DINHEIRO';
    END IF;
    v_raw := v_pag->'valor_recebido';
    IF jsonb_typeof(v_raw) <> 'number' THEN
      RAISE EXCEPTION 'PAGAMENTO_VALOR_RECEBIDO_INVALIDO' USING DETAIL = 'valor_recebido não numérico';
    END IF;
    v_recebido := ROUND((v_raw::text)::numeric, 2);
    v_valor := ROUND(COALESCE((v_pag->>'valor')::numeric, 0), 2);
    IF v_recebido < v_valor THEN
      RAISE EXCEPTION 'PAGAMENTO_VALOR_RECEBIDO_INVALIDO' USING DETAIL = 'valor_recebido menor que o valor pago';
    END IF;
    v_qtd := v_qtd + 1;
    IF v_qtd > 1 THEN
      RAISE EXCEPTION 'PAGAMENTO_VALOR_RECEBIDO_INVALIDO' USING DETAIL = 'mais de uma linha DINHEIRO com valor_recebido';
    END IF;
    IF p_venda_id IS NOT NULL THEN
      PERFORM set_config('fp.valor_recebido', p_venda_id::text || ':' || v_recebido::text, true);
    END IF;
  END LOOP;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION internal.fp_preparar_valor_recebido(uuid, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION internal.trg_vendas_pagamentos_valor_recebido()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_cfg text := COALESCE(current_setting('fp.valor_recebido', true), '');
BEGIN
  IF NEW.forma_pagamento = 'DINHEIRO' AND v_cfg <> ''
     AND split_part(v_cfg, ':', 1) = NEW.venda_id::text THEN
    NEW.valor_recebido := split_part(v_cfg, ':', 2)::numeric(10,2);
    NEW.troco := ROUND(NEW.valor_recebido - NEW.valor, 2);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION internal.trg_vendas_pagamentos_valor_recebido() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_vendas_pagamentos_valor_recebido ON public.vendas_pagamentos;
CREATE TRIGGER trg_vendas_pagamentos_valor_recebido
  BEFORE INSERT ON public.vendas_pagamentos
  FOR EACH ROW EXECUTE FUNCTION internal.trg_vendas_pagamentos_valor_recebido();

-- Wrapper web: mesma assinatura, grants e search_path; só ganha a preparação do valor recebido.
CREATE OR REPLACE FUNCTION public.finalizar_venda_transacional_canonica_v4(p_venda_id uuid, p_caixa_id uuid, p_operador_id uuid, p_loja_id uuid, p_forma_pagamento text DEFAULT 'DINHEIRO'::text, p_total_bruto numeric DEFAULT NULL::numeric, p_total_desconto numeric DEFAULT NULL::numeric, p_total_liquido numeric DEFAULT NULL::numeric, p_pagamentos jsonb DEFAULT NULL::jsonb, p_itens jsonb DEFAULT '[]'::jsonb, p_desconto_gerente_token text DEFAULT NULL::text, p_desconto_gerente_percentual numeric DEFAULT NULL::numeric, p_strict_manager_discount_auth boolean DEFAULT false, p_fiscal_auto_enqueue boolean DEFAULT false, p_ip_address text DEFAULT NULL::text, p_user_agent text DEFAULT NULL::text, p_device_id text DEFAULT NULL::text, p_terminal_id text DEFAULT NULL::text, p_cliente_id uuid DEFAULT NULL::uuid, p_motivo_desconto motivo_desconto_enum_tipo DEFAULT 'NAO_ESPECIFICADO'::motivo_desconto_enum_tipo, p_motivo_descricao text DEFAULT NULL::text, p_limite_credito_gerente_token text DEFAULT NULL::text)
 RETURNS TABLE(venda_id uuid, status text, mensagem text, dados_fiscais jsonb, itens_atualizados jsonb, estoque_baixado jsonb, event_id uuid, contas_receber_id uuid)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$SELECT internal.fp_preparar_parcelas_credito(p_venda_id, p_pagamentos) AND internal.fp_preparar_valor_recebido(p_venda_id, p_pagamentos) AND public.fp_assert_loja(public.fp_loja_de('venda', p_venda_id), false, 'finalizar_venda_transacional_canonica_v4.p_venda_id') AND public.fp_assert_loja(public.fp_loja_de('caixa', p_caixa_id), false, 'finalizar_venda_transacional_canonica_v4.p_caixa_id') AND public.fp_assert_loja(public.fp_loja_de('usuario', p_operador_id), false, 'finalizar_venda_transacional_canonica_v4.p_operador_id') AND public.fp_assert_loja(p_loja_id, true, 'finalizar_venda_transacional_canonica_v4.p_loja_id');
SELECT * FROM internal.finalizar_venda_transacional_canonica_v4(p_venda_id => p_venda_id, p_caixa_id => p_caixa_id, p_operador_id => p_operador_id, p_loja_id => p_loja_id, p_forma_pagamento => p_forma_pagamento, p_total_bruto => p_total_bruto, p_total_desconto => p_total_desconto, p_total_liquido => p_total_liquido, p_pagamentos => p_pagamentos, p_itens => p_itens, p_desconto_gerente_token => p_desconto_gerente_token, p_desconto_gerente_percentual => p_desconto_gerente_percentual, p_strict_manager_discount_auth => p_strict_manager_discount_auth, p_fiscal_auto_enqueue => p_fiscal_auto_enqueue, p_ip_address => p_ip_address, p_user_agent => p_user_agent, p_device_id => p_device_id, p_terminal_id => p_terminal_id, p_cliente_id => p_cliente_id, p_motivo_desconto => p_motivo_desconto, p_motivo_descricao => p_motivo_descricao, p_limite_credito_gerente_token => p_limite_credito_gerente_token);$function$;
