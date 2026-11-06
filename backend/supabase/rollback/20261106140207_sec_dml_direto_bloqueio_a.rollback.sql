-- ROLLBACK de 20261106140207_sec_dml_direto_bloqueio_a.sql.
-- Restaura exatamente o estado anterior: authenticated volta a ter INSERT, UPDATE e DELETE nas 5 tabelas.
-- Os demais privilégios (SELECT, TRIGGER, REFERENCES, MAINTAIN) não foram alterados pela migration.
BEGIN;
GRANT INSERT, UPDATE, DELETE ON public.vendas, public.itens_venda, public.vendas_pagamentos TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.venda_eventos, public.descontos_venda TO authenticated;
COMMIT;
