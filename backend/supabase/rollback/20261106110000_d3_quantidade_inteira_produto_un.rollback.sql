-- Rollback de 20261106110000 (D3): remove a trava de quantidade inteira para produto UN.
DROP TRIGGER IF EXISTS trg_itens_venda_quantidade_inteira_un ON public.itens_venda;
DROP FUNCTION IF EXISTS internal.valida_quantidade_inteira_produto_un();
