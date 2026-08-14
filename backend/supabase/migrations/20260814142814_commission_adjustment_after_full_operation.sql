-- DB-05B: o ajuste de comissao passa a ser processado com a operacao pos-venda
-- COMPLETA, nao no primeiro item.
--
-- Achado DB05-F2 (P0), confirmado empiricamente:
--
--   venda com 2 itens, base R$200, taxa 5%  ->  comissao original R$10,00
--   uma operacao de devolucao com os 2 itens:
--     apos INSERT do item A  ->  ajuste R$5,00
--     apos INSERT do item B  ->  ajuste R$5,00   (correto: R$10,00)
--     liquido final          ->  R$5,00          (correto: R$0,00)
--
-- Numa venda integralmente devolvida o vendedor mantinha metade da comissao.
--
-- Causa raiz: `devolver_ou_trocar_venda` insere `venda_pos_venda_itens` dentro
-- de um `FOR ... LOOP`, uma instrucao por item. O trigger de DB-05 era
-- `AFTER INSERT ... FOR EACH STATEMENT`, entao disparava ja no primeiro item e
-- criava a chave `DEVOLUCAO:<operacao_id>`. Os itens seguintes caiam no retorno
-- antecipado de idempotencia e nunca eram considerados.
--
-- Correcao: o evento passa a ser avaliado no FIM da transacao, quando todos os
-- itens da operacao ja estao persistidos. Um CONSTRAINT TRIGGER
-- `DEFERRABLE INITIALLY DEFERRED` sobre `venda_pos_venda_operacoes` dispara no
-- commit -- momento em que a operacao pos-venda esta canonicamente completa.
--
-- Por que nao manter o trigger em `venda_pos_venda_itens`: qualquer gatilho
-- ligado ao item dispara no meio do loop. O fato canonico e a OPERACAO, e ela
-- so esta completa ao final da transacao que a criou.
--
-- A chave de idempotencia continua `DEVOLUCAO:<operacao_id>`: uma operacao
-- gera no maximo um ajuste, e operacoes distintas nao colidem. A diferenca e
-- que agora ela e avaliada uma unica vez, com o estado completo.
--
-- Nota para os testes: por ser deferido, o efeito so aparece apos COMMIT ou
-- `SET CONSTRAINTS ALL IMMEDIATE`. Os gates usam a segunda forma para
-- permanecer dentro de BEGIN/ROLLBACK.
--
-- ROLLBACK:
--   DROP TRIGGER trg_pos_venda_ajusta_comissao_deferido ON public.venda_pos_venda_operacoes;
--   e recriar o trigger de itens de 20260814114654.

BEGIN;

-- O gatilho por item sai de cena: ele disparava antes da operacao estar completa.
DROP TRIGGER IF EXISTS trg_pos_venda_ajusta_comissao ON public.venda_pos_venda_itens;

CREATE OR REPLACE FUNCTION public.trg_comissao_pos_venda()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  -- Deferido ate o commit: `venda_pos_venda_itens` da operacao ja esta completo.
  PERFORM public.processar_ajuste_comissao_venda(NEW.venda_id, 'DEVOLUCAO', NEW.id);
  RETURN NULL;
END;
$fn$;

REVOKE ALL ON FUNCTION public.trg_comissao_pos_venda() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_pos_venda_ajusta_comissao_deferido ON public.venda_pos_venda_operacoes;
CREATE CONSTRAINT TRIGGER trg_pos_venda_ajusta_comissao_deferido
  AFTER INSERT ON public.venda_pos_venda_operacoes
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_comissao_pos_venda();

COMMIT;
