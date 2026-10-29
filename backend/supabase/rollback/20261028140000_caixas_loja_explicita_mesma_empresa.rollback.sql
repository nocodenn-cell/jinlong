-- Rollback de 20261028140000. Remove só o trigger/função. NÃO recoloca o default da loja piloto
-- (isso reabriria o bug de caixa sem loja indo para a piloto); se for mesmo preciso, ver o rollback de 20261010120000.
DROP TRIGGER IF EXISTS trg_caixas_loja_mesma_empresa ON public.caixas;
DROP FUNCTION IF EXISTS internal.tg_caixas_loja_mesma_empresa();
