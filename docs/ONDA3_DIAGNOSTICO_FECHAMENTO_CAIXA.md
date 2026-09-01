# Onda 3 — Diagnóstico: Fechamento de Caixa por Forma de Pagamento

**Data:** 2026-09-01  
**Escopo:** IDs 92, 100, 99, 199, 205, 206 (matriz `AUDITORIA_PRONTIDAO_CLIENTE_PAGANTE.md`)  
**Método:** Mapeamento de código real ponta a ponta (schema → RPC → server actions → UI → testes), sem implementação nesta etapa.  
**Status:** Diagnóstico apenas — NÃO implementado, NÃO iniciado.

---

## Achado Central

Dos 6 IDs mapeados, existem na prática **apenas 2 correções reais** (os outros 4 são o mesmo gap descrito por ângulos diferentes):

1. **Reconciliação/UI por forma de pagamento no fechamento** (IDs 92, 100, 199)
2. **Relatório histórico agregado de fechamentos/diferenças** (IDs 99, 205, 206)

---

## Schema Real (não os nomes conceituais da matriz)

| Conceito na matriz | Coluna/objeto real |
|---|---|
| `valor_esperado` | Não existe como coluna — calculado on-the-fly, nunca persistido |
| `valor_informado` | `caixas.valor_fechamento` (contado pelo operador) |
| `calcular_valor_sistema` | Nome real: **`calcular_valor_sistema_dinheiro_caixa`** — "dinheiro" já está no nome desde a criação |
| `caixas.diferenca` | `caixas.fechamento_diferenca` — única, agregada, **só dinheiro** |

`vendas_pagamentos` (migration 051): `forma_pagamento CHECK IN ('DINHEIRO','PIX','CARTAO_DEBITO','CARTAO_CREDITO','FIADO')` — os dados por forma **já existem e estão corretos no banco**; o gap é que nada no fluxo de fechamento os lê.

---

## O Gap Real (não é um bug — é escopo nunca implementado)

`calcular_valor_sistema_dinheiro_caixa` (def. vigente: `20260813234233_ar_receipts_reconciliation.sql:160-236`) filtra `forma_pagamento = 'DINHEIRO'` em toda CTE por **design intencional** — confirmado por teste adversarial dedicado: `financial-adversarial-gates.test.sql:200-217`, Gate 3, *"Formas não físicas não podem tocar a gaveta"*, que valida explicitamente que PIX/cartão não alteram `caixas.saldo_atual`.

**Isso está correto para o saldo físico da gaveta.** O problema é que **nunca foi construído um SSOT irmão para as formas não-físicas** — não é um erro na função existente.

`fechar_caixa_atomico` (`20260621002600_230_caixa_status_fechamento.sql:75-162`) recebe um único `p_valor_contado numeric` — sem qualquer parâmetro por forma. A UI (`CaixaPageClient.tsx:865-924`) tem um único campo numérico para "fechar caixa". O recibo de fechamento (`CaixaFechamentoReciboModal.tsx`) só imprime `valorSistemaDinheiro, valorContado, diferenca` — nenhum campo por forma, nem no papel.

**Risco financeiro concreto:** se um operador recebe R$500 em PIX e R$300 em dinheiro no turno, o fechamento de hoje só verifica os R$300 em dinheiro. Os R$500 de PIX existem em `vendas_pagamentos`, mas nada no fechamento os soma ou compara com o que a maquininha/PIX realmente recebeu. Uma venda registrada como PIX mas nunca paga (erro ou fraude) faz o caixa "fechar OK" — **não há mecanismo de detecção hoje**.

---

## Peça que já existe e ajuda (subaproveitada)

`relatorio_consistencia_vendas` (`20260818000000_reconcile_production_report_functions.sql:484-556`) já calcula `pagamentos_divergentes` (venda vs. soma de `vendas_pagamentos`) e `sem_pagamento` por período/caixa/loja — é essencialmente a lógica do ID 100. Mas foi deliberadamente deixada **sem consumidor** (`20260819230000_remove_funcoes_sem_consumidor.sql:17-22`, restrita a `service_role`, "para não ser alcançável pelo app"). Zero chamadas no frontend hoje.

---

## Matriz de Overlap

| ID | Requisito (matriz) | Realidade |
|---|---|---|
| 92 | Conferência por forma (P0, Alto, bloqueia) | Dinheiro: completo e correto. PIX/cartão: zero em RPC/adapter/UI |
| 100 | Integridade vendas×fechamento (P0, Médio) | Mesma correção de 92, ângulo "integridade" — `relatorio_consistencia_vendas` é 80% do SSOT, só falta expor |
| 199 | Vendas por forma pag (P1, Médio) | Dado bruto que 92 precisa para popular a tela — nenhuma agregação `GROUP BY forma_pagamento` existe hoje, nem backend nem frontend |
| 99 | Relatório diferenças (P1, Baixo) | Mesmo relatório que 205/206 — falta agregação por período sobre `caixas.fechamento_diferenca` |
| 205 | Fechamentos caixa (P1, Médio) | Mesmo relatório que 99/206 — nenhuma tela lista fechamentos históricos |
| 206 | Diferenças caixa (P1, Baixo) | Mesmo relatório que 99/205 |

---

## SSOT Proposto (pós-correção)

**Não alterar `calcular_valor_sistema_dinheiro_caixa`** — o Gate 3 depende dela continuar só-dinheiro para `saldo_atual`/gaveta física real. Em vez disso, generalizar ao lado:

1. **Nova função SQL** `calcular_valor_sistema_por_forma_caixa(p_caixa_id uuid) RETURNS TABLE(forma_pagamento text, valor_sistema numeric)` — reaproveita as CTEs já existentes na função atual (remove o filtro `= 'DINHEIRO'`, agrupa por forma). Vira o SSOT único de "quanto o sistema registrou, por forma" — usado tanto no fechamento em tempo real quanto nos relatórios.
2. **Estender `fechar_caixa_atomico`** para aceitar valores informados por forma (jsonb ou tabela), persistindo em nova tabela `caixas_fechamento_formas(caixa_id, forma_pagamento, valor_sistema, valor_informado, diferenca)`. `caixas.fechamento_diferenca` continua existindo como agregado dinheiro (compatibilidade com `saldo_atual`/Gate 3).
3. **UI de fechamento**: campo por forma ativa na loja, pré-populado com "esperado" via `calcular_valor_sistema_por_forma_caixa`.
4. **Relatório novo**: sobre `caixas` + `caixas_fechamento_formas`, agregando diferença por período/operador/loja — resolve 99/205/206 juntos.

---

## Menor Sequência de Implementação

1. **Schema**: `CREATE TABLE caixas_fechamento_formas` (nova, sem alteração destrutiva em `caixas`/`vendas_pagamentos`)
2. **RPC**:
   a. `calcular_valor_sistema_por_forma_caixa` — nova função, reaproveita SQL de `20260813234233_ar_receipts_reconciliation.sql:181-229`, sem tocar a versão dinheiro-only
   b. Estender `fechar_caixa_atomico` para aceitar payload por forma + persistir em `caixas_fechamento_formas` (mantendo `p_valor_contado`/`fechamento_diferenca` agregado por compatibilidade)
   c. Expor `relatorio_consistencia_vendas` via wrapper RPC autorizado (GERENTE/ADMIN) — resolve ID 100
3. **UI**:
   a. Formulário de fechamento com campo por forma, consumindo (2a) para mostrar "esperado" — resolve 92
   b. Tela de relatório de fechamentos históricos com diferença agregada, consumindo `caixas` + `caixas_fechamento_formas` — resolve 99/205/206
   c. Aba "vendas por forma de pagamento" por período, reaproveitando a query de (3b) — resolve 199

---

## Testes Existentes (contrato atual, referência)

- `financial-adversarial-gates.test.sql` Gate 3 (linha 200-217) e Gate 4 (linha 193-197): validam reconciliação dinheiro-only — **não tocar**, são a garantia de que `saldo_atual` continua correto
- `caixa-fase6-reconciliacao.spec.ts`: **não é sobre Onda 3** — testa Fase 6 (fiado/crédito no resumo de turno), tema adjacente mas distinto; mock puro, sem chamada real a API/DB/UI

---

## Não Fazer (fora de escopo desta investigação)

- ❌ Não alterar `calcular_valor_sistema_dinheiro_caixa` — quebraria Gate 3
- ❌ Não implementar nada ainda — este é só o diagnóstico
- ❌ Não confundir com Fase 6 (fiado/crédito) — tema adjacente, `caixa-fase6-reconciliacao.spec.ts` não serve de referência de contrato para Onda 3

---

## Primeira PR Recomendada

**Escopo mínimo e testável isoladamente:** apenas o passo 2a (nova função `calcular_valor_sistema_por_forma_caixa`) + testes SQL equivalentes ao Gate 3/4 mas para PIX/cartão, comprovando que a nova função:
1. Soma corretamente vendas por forma (split payment incluído)
2. Não interfere em `saldo_atual`/`calcular_valor_sistema_dinheiro_caixa` (regressão zero)
3. Não é ainda consumida por nenhuma RPC de escrita (só leitura, sem risco financeiro)

Isso entrega o SSOT de forma isolada, testável, sem tocar UI nem `fechar_caixa_atomico` — permite validar o cálculo antes de expor qualquer superfície de escrita/persistência. Passos 2b/2c/3 ficam para PRs subsequentes, cada um também testável isoladamente.

---

**Preparado por:** Claude Code (investigação via Explore agent)  
**Não implementado. Aguardando priorização.**
