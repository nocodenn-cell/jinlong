-- Rollback de 20261106100000 (D1): remove a trava de fechamento com venda em espera.
DROP TRIGGER IF EXISTS trg_caixas_bloqueia_fechamento_em_espera ON public.caixas;
DROP FUNCTION IF EXISTS internal.bloqueia_fechamento_com_venda_em_espera();
