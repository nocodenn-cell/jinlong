-- D5 (PLANO_LIBERACAO_PRIMEIRO_CLIENTE_2026-11-06, P0-5 / D-07 aprovado):
-- Venda com PIX, CARTAO_DEBITO ou CARTAO_CREDITO só é gravada se a loja tiver conta
-- financeira ativa vinculada àquela forma (financeiro_contas_forma + contas_financeiras).
-- Sem conta, a venda é recusada, em vez de gerar recebível PENDENTE sem destino.
--
-- Regra no banco (vendas_pagamentos), não na tela, para valer também para o sync.
-- A loja é obtida pela venda (vendas.caixa_id -> caixas.loja_id). A FK venda_id já garante
-- que a venda existe antes do INSERT do pagamento.
-- Não altera linhas existentes.
--
-- Pré-requisito de instalação: configurar contas e formas antes de vender PIX/cartão.
-- Rollback: backend/supabase/rollback/20261107110000_d5_pagamento_exige_conta_financeira.rollback.sql

CREATE OR REPLACE FUNCTION internal.valida_pagamento_exige_conta_financeira()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_loja uuid;
BEGIN
  IF NEW.forma_pagamento IN ('PIX', 'CARTAO_DEBITO', 'CARTAO_CREDITO') THEN
    SELECT c.loja_id INTO v_loja
    FROM public.vendas v
    JOIN public.caixas c ON c.id = v.caixa_id
    WHERE v.id = NEW.venda_id;

    IF v_loja IS NOT NULL AND internal.financeiro_conta_forma(v_loja, NEW.forma_pagamento) IS NULL THEN
      RAISE EXCEPTION 'PAGAMENTO_SEM_CONTA_FINANCEIRA'
        USING DETAIL = format('forma=%s loja=%s', NEW.forma_pagamento, v_loja),
              HINT = 'Configure a conta financeira desta forma de pagamento na loja antes de vender.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION internal.valida_pagamento_exige_conta_financeira() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_vendas_pagamentos_exige_conta ON public.vendas_pagamentos;
CREATE TRIGGER trg_vendas_pagamentos_exige_conta
  BEFORE INSERT ON public.vendas_pagamentos
  FOR EACH ROW EXECUTE FUNCTION internal.valida_pagamento_exige_conta_financeira();

COMMENT ON FUNCTION internal.valida_pagamento_exige_conta_financeira() IS
  'D-07: PIX/cartão exigem conta financeira ativa da forma na loja da venda (INSERT em vendas_pagamentos).';
