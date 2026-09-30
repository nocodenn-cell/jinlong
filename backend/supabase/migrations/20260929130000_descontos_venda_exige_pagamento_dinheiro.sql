-- Desconto de gerente sobre o total só existe em venda 100% DINHEIRO.
--
-- REGRA
-- -----
-- Se uma venda possui linha em `descontos_venda` (desconto de gerente sobre o
-- total), então `vendas.forma_pagamento` e TODAS as linhas de
-- `vendas_pagamentos` dessa venda devem ser DINHEIRO.
--
-- POR QUE UM TRIGGER (Opção D da revisão Fase 2A)
-- -----------------------------------------------
-- A regra já é aplicada na server action (schema zod) e na UI do caixa web, mas
-- `finalizar_venda_transacional_canonica_v4` é executável por `authenticated` e
-- não cruza desconto com forma de pagamento; `registrar_venda_com_itens` (sync
-- offline) idem. Em vez de reescrever o wrapper SEC-04 (e tocar o CORE
-- TRANSACIONAL congelado) ou o RPC offline, a invariante fica na tabela:
--   - nos dois RPCs, `vendas` e `vendas_pagamentos` são gravadas ANTES de
--     `descontos_venda` (web: PASSO de pagamentos antes do INSERT em
--     descontos_venda; offline: idem), e `descontos_venda` só recebe linha
--     quando há desconto de gerente;
--   - vale para qualquer caminho de escrita (RPC web, RPC offline, INSERT direto
--     permitido pela RLS a GERENTE/DONO) e sobrevive a um futuro
--     CREATE OR REPLACE dessas funções.
-- Falha => exceção => a transação inteira do RPC (estoque, token, venda) é
-- desfeita: nada é persistido.
--
-- ESCOPO / NÃO MUDA
-- -----------------
-- Nenhuma função existente é alterada. Cálculo de totais, arredondamento,
-- preço, troco, consumo do token, idempotência, crédito de caixa, fiscal,
-- estoque e autorização por loja permanecem intactos. Linhas históricas não são
-- alteradas (trigger só dispara em INSERT / UPDATE OF venda_id); as 2 vendas
-- históricas com desconto de gerente são DINHEIRO e sem `vendas_pagamentos`.
--
-- COMPARAÇÃO: `upper()` sem `trim`, igual à validação de forma de pagamento da
-- v4_unscoped. Forma escalar ausente/vazia conta como violação.
--
-- SECURITY DEFINER: a função lê `vendas`/`vendas_pagamentos` sob a identidade do
-- dono para que a RLS de quem insere (ex.: GERENTE/DONO direto) nunca esconda as
-- linhas e faça a checagem passar em falso.
--
-- ROLLBACK (manual; objetos novos, sem dependência):
--   DROP TRIGGER IF EXISTS trg_descontos_venda_exige_pagamento_dinheiro ON public.descontos_venda;
--   DROP FUNCTION IF EXISTS internal.trg_descontos_venda_exige_pagamento_dinheiro();

BEGIN;

CREATE OR REPLACE FUNCTION internal.trg_descontos_venda_exige_pagamento_dinheiro()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_forma text;
BEGIN
  SELECT v.forma_pagamento INTO v_forma
    FROM public.vendas v
   WHERE v.id = NEW.venda_id;

  -- Venda inexistente: a FK de descontos_venda.venda_id é quem rejeita.
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF upper(COALESCE(v_forma, '')) <> 'DINHEIRO'
     OR EXISTS (
       SELECT 1
         FROM public.vendas_pagamentos vp
        WHERE vp.venda_id = NEW.venda_id
          AND upper(COALESCE(vp.forma_pagamento, '')) <> 'DINHEIRO'
     ) THEN
    RAISE EXCEPTION 'DESCONTO_GERENTE_EXIGE_PAGAMENTO_DINHEIRO'
      USING DETAIL = format('venda_id=%s', NEW.venda_id),
            HINT = 'Desconto de gerente sobre o total só é permitido em venda paga 100% em dinheiro.';
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION internal.trg_descontos_venda_exige_pagamento_dinheiro() IS
  'Invariante: linha em descontos_venda (desconto de gerente sobre o total) exige vendas.forma_pagamento e todas as vendas_pagamentos = DINHEIRO (upper, sem trim). Erro: DESCONTO_GERENTE_EXIGE_PAGAMENTO_DINHEIRO.';

REVOKE ALL ON FUNCTION internal.trg_descontos_venda_exige_pagamento_dinheiro()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_descontos_venda_exige_pagamento_dinheiro ON public.descontos_venda;
CREATE TRIGGER trg_descontos_venda_exige_pagamento_dinheiro
  BEFORE INSERT OR UPDATE OF venda_id ON public.descontos_venda
  FOR EACH ROW
  EXECUTE FUNCTION internal.trg_descontos_venda_exige_pagamento_dinheiro();

DO $verify$
DECLARE
  v_fn regprocedure := 'internal.trg_descontos_venda_exige_pagamento_dinheiro()'::regprocedure;
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_trigger t
     WHERE t.tgrelid = 'public.descontos_venda'::regclass
       AND t.tgname = 'trg_descontos_venda_exige_pagamento_dinheiro'
       AND t.tgfoid = v_fn::oid
       AND t.tgenabled = 'O'
       AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'DESCONTO_DINHEIRO_TRIGGER_AUSENTE';
  END IF;
  IF has_function_privilege('anon', v_fn, 'EXECUTE')
     OR has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION 'DESCONTO_DINHEIRO_FUNCAO_EXPOSTA';
  END IF;
END
$verify$;

COMMIT;
