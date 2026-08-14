-- P0-2: remove `recalcular_saldo_caixa`, writer legado e inseguro do contador físico.
--
-- Problema comprovado: `SECURITY DEFINER` com `GRANT EXECUTE TO authenticated` e
-- nenhuma validação — não chama `auth.uid()`, não checa usuário ativo, perfil nem
-- loja. Executada por um cliente `authenticated` sem JWT algum:
--
--   ANTES   contador 160.00  E(c) 160.00   (abertura 100 + venda dinheiro 50 + suprimento 10)
--   DEPOIS  contador 110.00  E(c) 160.00   -> R$ 50,00 destruídos
--
-- A fórmula (`valor_inicial + Σ movimentacoes_caixa`) é concorrente e incompleta
-- frente à autoridade vigente `calcular_valor_sistema_dinheiro_caixa`: omite vendas
-- em dinheiro, liquidações AR em espécie, devoluções e o ledger legado
-- `movimentos_caixa`. Qualquer execução sobre um caixa que vendeu apaga a venda do
-- contador.
--
-- Código morto comprovado:
--   - nenhum caller em `pdv-importados/`, `dev-tools/` ou Edge Functions;
--   - nenhuma outra função do catálogo referencia o nome (pg_proc.prosrc);
--   - única menção era `database.types.ts` (arquivo gerado) e
--     `backend/scripts/test-rls-scope.mjs`, que asseverava a própria falha como
--     comportamento esperado — invertido no mesmo commit.
--
-- ROLLBACK: restaurar o corpo original de 045_caixa_movimentacoes_transacionais.sql.
-- Não recomendado: a função não tem consumidor e concorre com E(c).

BEGIN;

DROP FUNCTION IF EXISTS public.recalcular_saldo_caixa(uuid);

COMMIT;
