# Onda A — ledger de estoque

Escopo fechado. Referência: [AUDITORIA_ARQUITETURA_EVENTOS_JINLONG.md §6.1](./AUDITORIA_ARQUITETURA_EVENTOS_JINLONG.md).

## O que a medição mostrou

Refeita tratando ausência de movimento como soma zero (linha zerada sem movimento **é**
consistente):

| Situação | Linhas | Divergentes |
|---|---|---|
| sem movimento, saldo zero | 75 | 0 |
| sem movimento, saldo ≠ 0 | 10 | 10 |
| com movimento, saldo ≠ 0 | 24 | 11 |
| com movimento, saldo zero | 1 | 1 |
| **total** | **110** | **22 (20%)** |

## O que foi entregue

**1. `criar_produto_com_estoque_inicial` já registra movimento.** Não precisou de alteração:
a RPC delega a `ajustar_estoque_manual` ([270, linha 192](../backend/supabase/migrations/270_criar_produto_com_estoque_inicial.sql)),
que grava o delta em `movimentos_estoque_log` na mesma transação
([269, linhas 79-110](../backend/supabase/migrations/269_ajustar_estoque_manual_service_ator.sql)).
O `INSERT` direto que ela faz em `estoque` é a linha zerada `(0, 0)` — consistente por definição.
Coberto por teste de contrato para não regredir.

**2. `DELETE` direto em `estoque` — não convertido, por impedimento técnico.**
`movimentos_estoque_log.produto_id` é FK para `produtos`. Gerar movimento de saída antes de
apagar o produto criaria linha órfã e violaria a constraint. Os dois `DELETE` existentes já são
seguros:

| Local | Por que não destrói histórico |
|---|---|
| [`productExclusion.ts:160`](../pdv-importados/app/admin/produtos/productExclusion.ts) | a exclusão é bloqueada quando `temMovimentosEstoque` — só roda para produto sem movimento |
| [`produtos/actions.ts:408`](../pdv-importados/app/gerente/produtos/actions.ts) | compensação de importação em lote que falhou; ver TODO-1 |

**3. View de diagnóstico** —
[`20260801090000_v_estoque_ledger_divergencia.sql`](../backend/supabase/migrations/20260801090000_v_estoque_ledger_divergencia.sql).
Aditiva, `security_invoker = true`. Vazia = ledger fecha.

```sql
select * from public.v_estoque_ledger_divergencia;
```

**4. Seis testes de invariante** — [`tests/onda-a-ledger-estoque.test.ts`](../pdv-importados/tests/onda-a-ledger-estoque.test.ts).
O principal é a **allowlist de escrita direta em `estoque`**: qualquer arquivo novo que escreva na
tabela quebra o teste. É por aí que divergência nova entraria.

## Fora de escopo — TODO

**TODO-1 — rollback de importação em lote pode falhar silenciosamente.**
[`produtos/actions.ts:405-410`](../pdv-importados/app/gerente/produtos/actions.ts) desfaz um lote
apagando `estoque` e depois `produtos`, sem checar o erro. Se algum produto do lote foi criado
**com saldo inicial**, existe movimento em `movimentos_estoque_log` apontando para ele, e o
`DELETE` em `produtos` viola a FK. O rollback falha, o erro é descartado e o lote fica pela metade.
Correção provável: apagar o movimento antes, ou trocar a compensação por inativação.
Não entrou nesta onda: muda comportamento funcional.

**TODO-2 — backfill das 22 linhas divergentes.**
Exige decidir, caso a caso, qual número está certo: o saldo ou a soma dos movimentos. Não é
mecânico e não deve ser feito por migration cega. A view existe justamente para trabalhar essa
lista com o cliente.

**TODO-3 — origem das 10 linhas com saldo ≠ 0 e nenhum movimento.**
Provavelmente carga inicial ou seed anterior ao log. Não investigado.
