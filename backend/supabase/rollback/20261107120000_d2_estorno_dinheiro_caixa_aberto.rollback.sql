-- Rollback de 20261107120000 (D2): remove a atribuição de estorno ao caixa aberto.
DROP TRIGGER IF EXISTS trg_devolucoes_caixa_desembolso_ai ON public.devolucoes;
DROP TRIGGER IF EXISTS trg_devolucoes_caixa_desembolso_bi ON public.devolucoes;
DROP FUNCTION IF EXISTS internal.devolucao_dinheiro_sincroniza_saldo();
DROP FUNCTION IF EXISTS internal.devolucao_dinheiro_caixa_desembolso();
