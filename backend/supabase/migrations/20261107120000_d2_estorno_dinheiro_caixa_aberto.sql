-- D2 (PLANO_LIBERACAO_PRIMEIRO_CLIENTE_2026-11-06, P0-9 / D-09 aprovado; S9b e S12):
-- Estorno em DINHEIRO de venda de caixa FECHADO sai do caixa ABERTO da loja.
--
-- Problema: cancelar_venda_transacional grava devolucoes sem caixa_desembolso_id. Pelo
-- legado (internal.valor_sistema_dinheiro), a devolução é debitada do caixa da VENDA, que
-- já está FECHADO: o saldo do caixa fechado muda, e a gaveta aberta não perde o dinheiro.
-- Além disso, a checagem de saldo suficiente só roda se o caixa da venda está ABERTO.
--
-- Solução mínima, sem reescrever a RPC de cancelamento (SSoT: a regra fica no banco):
--   * BEFORE INSERT em devolucoes: se DINHEIRO e sem caixa_desembolso_id, e a venda pertence
--     a caixa FECHADO, atribui o caixa ABERTO da loja. Casos:
--       - nenhum caixa aberto            -> CANCELAR_VENDA_CAIXA_FECHADO_SEM_CAIXA_ABERTO
--       - mais de um caixa aberto        -> CANCELAR_VENDA_CAIXA_ABERTO_AMBIGUO
--       - saldo do caixa aberto < valor  -> CANCELAR_VENDA_SALDO_CAIXA_INSUFICIENTE
--     Venda de caixa ABERTO: não muda nada (continua como antes).
--   * AFTER INSERT em devolucoes: sincroniza o cache de saldo do caixa de desembolso (se ABERTO).
-- Não altera linhas existentes. Não muda assinatura de nenhuma RPC.
-- Limitação conhecida: com dois caixas abertos e venda de caixa fechado, o cancelamento é
-- recusado até existir escolha explícita do caixa (parâmetro novo, PR separado).
-- Rollback: backend/supabase/rollback/20261107120000_d2_estorno_dinheiro_caixa_aberto.rollback.sql

CREATE OR REPLACE FUNCTION internal.devolucao_dinheiro_caixa_desembolso()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_caixa_venda uuid;
  v_status_venda_caixa text;
  v_loja uuid;
  v_qtd int;
  v_aberto uuid;
  v_saldo numeric;
BEGIN
  IF NEW.forma_pagamento IS DISTINCT FROM 'DINHEIRO' OR NEW.caixa_desembolso_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT v.caixa_id, c.status, c.loja_id
    INTO v_caixa_venda, v_status_venda_caixa, v_loja
    FROM public.vendas v
    LEFT JOIN public.caixas c ON c.id = v.caixa_id
   WHERE v.id = NEW.venda_id;

  -- Venda de caixa aberto (ou sem caixa): comportamento inalterado.
  IF v_caixa_venda IS NULL OR v_status_venda_caixa IS DISTINCT FROM 'FECHADO' THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*)::int INTO v_qtd
    FROM public.caixas c
   WHERE c.loja_id = v_loja AND c.status = 'ABERTO';

  IF v_qtd = 0 THEN
    RAISE EXCEPTION 'CANCELAR_VENDA_CAIXA_FECHADO_SEM_CAIXA_ABERTO'
      USING HINT = 'Abra um caixa na loja antes de estornar dinheiro de venda de caixa fechado.';
  ELSIF v_qtd > 1 THEN
    RAISE EXCEPTION 'CANCELAR_VENDA_CAIXA_ABERTO_AMBIGUO'
      USING HINT = 'Mais de um caixa aberto: feche os caixas extras antes do estorno.';
  END IF;

  SELECT c.id INTO v_aberto
    FROM public.caixas c
   WHERE c.loja_id = v_loja AND c.status = 'ABERTO'
   LIMIT 1;

  v_saldo := internal.valor_sistema_dinheiro(v_aberto);
  IF v_saldo < NEW.valor THEN
    RAISE EXCEPTION 'CANCELAR_VENDA_SALDO_CAIXA_INSUFICIENTE'
      USING DETAIL = format('valor_sistema=%s estorno_dinheiro=%s', v_saldo, NEW.valor);
  END IF;

  NEW.caixa_desembolso_id := v_aberto;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION internal.devolucao_dinheiro_caixa_desembolso() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION internal.devolucao_dinheiro_sincroniza_saldo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.forma_pagamento = 'DINHEIRO' AND NEW.caixa_desembolso_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.caixas c WHERE c.id = NEW.caixa_desembolso_id AND c.status = 'ABERTO') THEN
    PERFORM internal.sincronizar_saldo_cache(NEW.caixa_desembolso_id);
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION internal.devolucao_dinheiro_sincroniza_saldo() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_devolucoes_caixa_desembolso_bi ON public.devolucoes;
CREATE TRIGGER trg_devolucoes_caixa_desembolso_bi
  BEFORE INSERT ON public.devolucoes
  FOR EACH ROW EXECUTE FUNCTION internal.devolucao_dinheiro_caixa_desembolso();

DROP TRIGGER IF EXISTS trg_devolucoes_caixa_desembolso_ai ON public.devolucoes;
CREATE TRIGGER trg_devolucoes_caixa_desembolso_ai
  AFTER INSERT ON public.devolucoes
  FOR EACH ROW EXECUTE FUNCTION internal.devolucao_dinheiro_sincroniza_saldo();
