-- Correção operacional crítica: `caixas.saldo_atual` nunca era creditado por vendas
-- em dinheiro (só sangria/suprimento/estorno o alteravam), e nunca era inicializado
-- com `valor_inicial` na abertura de turno (corrigido separadamente no app,
-- cashSession.ts). Efeito real: sangria e cancelamento/devolução de venda em dinheiro
-- falhavam com MOV_CAIXA_SALDO_INSUFICIENTE / CANCELAR_VENDA_SALDO_CAIXA_INSUFICIENTE
-- mesmo havendo caixa físico de sobra — porque o contador nunca refletia as vendas.
--
-- Correção: trigger em `vendas_pagamentos` (fonte única de forma de pagamento por
-- venda, tanto para pagamento simples quanto split — ver 274_bl2_promocao_rpc_e_
-- precedencia.sql) credita `caixas.saldo_atual` sempre que uma parcela em DINHEIRO é
-- inserida ou tem seu valor ajustado (caminho `ON CONFLICT ... DO UPDATE` do split).
--
-- Deliberadamente NÃO toca a RPC de finalização de venda (`finalizar_venda_transacional_
-- canonica_v4`, marcada "FREEZE: CORE TRANSACIONAL" no código chamador) — é aditivo e
-- isolado, dispara na mesma transação por já ser trigger de tabela, sem alterar
-- nenhuma função existente além das duas de movimentação corrigidas na migration
-- anterior. Como efeito colateral, corrige também o cancelamento/devolução de venda em
-- dinheiro (`cancelar_venda_transacional`/`devolver_ou_trocar_venda`, migration 248),
-- que já debitavam `saldo_atual` corretamente mas falhavam por falta de saldo nunca
-- creditado.

CREATE OR REPLACE FUNCTION public.trg_creditar_saldo_caixa_venda_dinheiro()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caixa_id uuid;
  v_delta numeric(10,2);
BEGIN
  IF upper(COALESCE(NEW.forma_pagamento, '')) <> 'DINHEIRO' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_delta := NEW.valor;
  ELSE
    v_delta := NEW.valor - OLD.valor;
  END IF;

  IF v_delta = 0 THEN
    RETURN NEW;
  END IF;

  SELECT v.caixa_id INTO v_caixa_id
  FROM public.vendas v
  WHERE v.id = NEW.venda_id
  FOR UPDATE;

  IF v_caixa_id IS NOT NULL THEN
    UPDATE public.caixas
    SET saldo_atual = ROUND(saldo_atual + v_delta, 2)
    WHERE id = v_caixa_id;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_creditar_saldo_caixa_venda_dinheiro() IS
  'Credita caixas.saldo_atual quando uma parcela em DINHEIRO é gravada/ajustada em vendas_pagamentos. Corrige saldo_atual nunca refletir vendas (achado de certificação Go-Live).';

DROP TRIGGER IF EXISTS trg_vendas_pagamentos_credita_caixa ON public.vendas_pagamentos;
CREATE TRIGGER trg_vendas_pagamentos_credita_caixa
  AFTER INSERT OR UPDATE OF valor, forma_pagamento ON public.vendas_pagamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_creditar_saldo_caixa_venda_dinheiro();
