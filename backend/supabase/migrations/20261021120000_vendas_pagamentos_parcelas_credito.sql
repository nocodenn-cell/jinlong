-- Parcelamento do crédito registrado na venda (PDV web e desktop), sem TEF/gateway.
--
-- Compatível por construção:
--   * `vendas_pagamentos.parcelas smallint NOT NULL DEFAULT 1` — linhas existentes e todo chamador atual ficam 1x.
--   * Campo OPCIONAL `parcelas` dentro de cada item de `p_pagamentos` (jsonb). Assinaturas inalteradas:
--     o PDV instalado / edge atual que não enviam o campo continuam idênticos (1x).
--   * Só CARTAO_CREDITO aceita parcelas > 1 (1..24). Item malformado => PAGAMENTO_PARCELAS_INVALIDAS (antes de gravar).
--   * Mecanismo: o wrapper valida e guarda (venda_id, n) num GUC LOCAL à transação; um trigger BEFORE INSERT em
--     vendas_pagamentos aplica n só à linha CARTAO_CREDITO DAQUELA venda. As funções grandes
--     (internal.finalizar_venda_transacional_canonica_v4 / registrar_venda_com_itens) não são reescritas.
--   * Desktop/outbox: nova `registrar_venda_com_itens_v2` (mesmos argumentos, service_role) = prepara + chama a v1.
--     A edge só chama a v2 quando há parcelas > 1, então edge nova + banco antigo continua funcionando para 1x.
--   * Replay idempotente da mesma venda não altera parcelas já gravadas (a RPC retorna antes do INSERT).
-- Rollback: backend/supabase/rollback/20261021120000_vendas_pagamentos_parcelas_credito.rollback.sql

ALTER TABLE public.vendas_pagamentos ADD COLUMN IF NOT EXISTS parcelas smallint NOT NULL DEFAULT 1;
ALTER TABLE public.vendas_pagamentos DROP CONSTRAINT IF EXISTS vendas_pagamentos_parcelas_check;
ALTER TABLE public.vendas_pagamentos ADD CONSTRAINT vendas_pagamentos_parcelas_check
  CHECK (parcelas BETWEEN 1 AND 24 AND (parcelas = 1 OR forma_pagamento = 'CARTAO_CREDITO'));
COMMENT ON COLUMN public.vendas_pagamentos.parcelas IS
  'Nº de parcelas declarado no PDV (só CARTAO_CREDITO > 1). Liquidação/previsão continuam no financeiro (CONFIGURAR_RECEBIVEL).';

CREATE OR REPLACE FUNCTION internal.fp_preparar_parcelas_credito(p_venda_id uuid, p_pagamentos jsonb)
RETURNS boolean
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_pag jsonb;
  v_raw jsonb;
  v_n int;
  v_credito int;
BEGIN
  PERFORM set_config('fp.parcelas_credito', '', true);
  IF p_pagamentos IS NULL OR jsonb_typeof(p_pagamentos) <> 'array' THEN
    RETURN true; -- validação de formato continua na RPC chamada em seguida
  END IF;
  FOR v_pag IN SELECT value FROM jsonb_array_elements(p_pagamentos)
  LOOP
    IF jsonb_typeof(v_pag) <> 'object' OR NOT (v_pag ? 'parcelas') OR jsonb_typeof(v_pag->'parcelas') = 'null' THEN
      CONTINUE;
    END IF;
    v_raw := v_pag->'parcelas';
    IF jsonb_typeof(v_raw) <> 'number' OR (v_raw::text)::numeric <> trunc((v_raw::text)::numeric)
       OR (v_raw::text)::numeric NOT BETWEEN 1 AND 24 THEN
      RAISE EXCEPTION 'PAGAMENTO_PARCELAS_INVALIDAS';
    END IF;
    v_n := (v_raw::text)::int;
    IF v_n > 1 AND upper(COALESCE(v_pag->>'forma_pagamento', '')) <> 'CARTAO_CREDITO' THEN
      RAISE EXCEPTION 'PAGAMENTO_PARCELAS_INVALIDAS';
    END IF;
    IF upper(COALESCE(v_pag->>'forma_pagamento', '')) = 'CARTAO_CREDITO' THEN
      IF v_credito IS NOT NULL AND v_credito <> v_n THEN
        RAISE EXCEPTION 'PAGAMENTO_PARCELAS_INVALIDAS'; -- uma linha de crédito por venda (UNIQUE venda_id, forma)
      END IF;
      v_credito := v_n;
    END IF;
  END LOOP;
  IF v_credito IS NOT NULL AND v_credito > 1 AND p_venda_id IS NOT NULL THEN
    PERFORM set_config('fp.parcelas_credito', p_venda_id::text || ':' || v_credito::text, true);
  END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION internal.fp_preparar_parcelas_credito(uuid, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION internal.trg_vendas_pagamentos_parcelas()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_cfg text := COALESCE(current_setting('fp.parcelas_credito', true), '');
BEGIN
  IF NEW.forma_pagamento = 'CARTAO_CREDITO' AND v_cfg <> ''
     AND split_part(v_cfg, ':', 1) = NEW.venda_id::text THEN
    NEW.parcelas := split_part(v_cfg, ':', 2)::smallint;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION internal.trg_vendas_pagamentos_parcelas() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_vendas_pagamentos_parcelas ON public.vendas_pagamentos;
CREATE TRIGGER trg_vendas_pagamentos_parcelas
  BEFORE INSERT ON public.vendas_pagamentos
  FOR EACH ROW EXECUTE FUNCTION internal.trg_vendas_pagamentos_parcelas();

-- Wrapper web (assinatura, SECURITY DEFINER, search_path e grants inalterados; só ganha a preparação à frente).
CREATE OR REPLACE FUNCTION public.finalizar_venda_transacional_canonica_v4(p_venda_id uuid, p_caixa_id uuid, p_operador_id uuid, p_loja_id uuid, p_forma_pagamento text DEFAULT 'DINHEIRO'::text, p_total_bruto numeric DEFAULT NULL::numeric, p_total_desconto numeric DEFAULT NULL::numeric, p_total_liquido numeric DEFAULT NULL::numeric, p_pagamentos jsonb DEFAULT NULL::jsonb, p_itens jsonb DEFAULT '[]'::jsonb, p_desconto_gerente_token text DEFAULT NULL::text, p_desconto_gerente_percentual numeric DEFAULT NULL::numeric, p_strict_manager_discount_auth boolean DEFAULT false, p_fiscal_auto_enqueue boolean DEFAULT false, p_ip_address text DEFAULT NULL::text, p_user_agent text DEFAULT NULL::text, p_device_id text DEFAULT NULL::text, p_terminal_id text DEFAULT NULL::text, p_cliente_id uuid DEFAULT NULL::uuid, p_motivo_desconto motivo_desconto_enum_tipo DEFAULT 'NAO_ESPECIFICADO'::motivo_desconto_enum_tipo, p_motivo_descricao text DEFAULT NULL::text, p_limite_credito_gerente_token text DEFAULT NULL::text)
 RETURNS TABLE(venda_id uuid, status text, mensagem text, dados_fiscais jsonb, itens_atualizados jsonb, estoque_baixado jsonb, event_id uuid, contas_receber_id uuid)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$SELECT internal.fp_preparar_parcelas_credito(p_venda_id, p_pagamentos) AND public.fp_assert_loja(public.fp_loja_de('venda', p_venda_id), false, 'finalizar_venda_transacional_canonica_v4.p_venda_id') AND public.fp_assert_loja(public.fp_loja_de('caixa', p_caixa_id), false, 'finalizar_venda_transacional_canonica_v4.p_caixa_id') AND public.fp_assert_loja(public.fp_loja_de('usuario', p_operador_id), false, 'finalizar_venda_transacional_canonica_v4.p_operador_id') AND public.fp_assert_loja(p_loja_id, true, 'finalizar_venda_transacional_canonica_v4.p_loja_id');
SELECT * FROM internal.finalizar_venda_transacional_canonica_v4(p_venda_id => p_venda_id, p_caixa_id => p_caixa_id, p_operador_id => p_operador_id, p_loja_id => p_loja_id, p_forma_pagamento => p_forma_pagamento, p_total_bruto => p_total_bruto, p_total_desconto => p_total_desconto, p_total_liquido => p_total_liquido, p_pagamentos => p_pagamentos, p_itens => p_itens, p_desconto_gerente_token => p_desconto_gerente_token, p_desconto_gerente_percentual => p_desconto_gerente_percentual, p_strict_manager_discount_auth => p_strict_manager_discount_auth, p_fiscal_auto_enqueue => p_fiscal_auto_enqueue, p_ip_address => p_ip_address, p_user_agent => p_user_agent, p_device_id => p_device_id, p_terminal_id => p_terminal_id, p_cliente_id => p_cliente_id, p_motivo_desconto => p_motivo_desconto, p_motivo_descricao => p_motivo_descricao, p_limite_credito_gerente_token => p_limite_credito_gerente_token);$function$;

-- Desktop/outbox: mesma assinatura da v1, só service_role (como a v1).
CREATE OR REPLACE FUNCTION public.registrar_venda_com_itens_v2(
  p_venda_id uuid, p_caixa_id uuid, p_operador_id uuid, p_forma_pagamento text, p_total_bruto numeric,
  p_total_desconto numeric, p_total_liquido numeric, p_itens jsonb,
  p_desconto_gerente_percentual numeric DEFAULT NULL::numeric, p_desconto_gerente_valor numeric DEFAULT NULL::numeric,
  p_gerente_id text DEFAULT NULL::text, p_pagamentos jsonb DEFAULT NULL::jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  PERFORM internal.fp_preparar_parcelas_credito(p_venda_id, p_pagamentos);
  PERFORM public.registrar_venda_com_itens(p_venda_id, p_caixa_id, p_operador_id, p_forma_pagamento, p_total_bruto,
    p_total_desconto, p_total_liquido, p_itens, p_desconto_gerente_percentual, p_desconto_gerente_valor,
    p_gerente_id, p_pagamentos);
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_venda_com_itens_v2(uuid,uuid,uuid,text,numeric,numeric,numeric,jsonb,numeric,numeric,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_venda_com_itens_v2(uuid,uuid,uuid,text,numeric,numeric,numeric,jsonb,numeric,numeric,text,jsonb) TO service_role;
