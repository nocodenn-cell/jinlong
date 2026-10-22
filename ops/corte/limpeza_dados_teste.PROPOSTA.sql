-- PROPOSTA — NÃO EXECUTAR sem aprovação. Contagens 2026-10-21: vendas 260 (CONCLUIDA 250, CANCELADA 10),
-- itens_venda 265, vendas_pagamentos 108, estoque_baixas 259, comissoes_itens 75, devolucoes 9,
-- documentos_fiscais_pendentes 42, caixas 56, movimentos_estoque_log 290. Usuário informou 158 vendas de teste: CONFIRMAR o filtro.
begin;
create temp table _v as select id from public.vendas where data < :'corte_ts'; -- definir corte/filtro aprovado
-- apagar dependentes primeiro (tabelas com venda_id), depois vendas; estoque deve ser recontado após.
-- delete from public.<tabela_dependente> where venda_id in (select id from _v);  -- para cada uma das 19 tabelas
-- delete from public.vendas where id in (select id from _v);
rollback; -- trocar por commit só após aprovação e backup (pg_dump)
