# SSoT — Contrato de saldo de caixa (SSOT-001 / SSOT-002)

Status: **contrato operacional (2026-10-07)** — remediação dos bloqueadores da auditoria.
Complementa [CONTRATO_CAIXA_C3.md](../contratos/CONTRATO_CAIXA_C3.md) e a decisão D-1.

## 1. Definição canônica do saldo esperado

Para um caixa \(C\): \(E(C) = \texttt{internal.valor\_sistema\_dinheiro}(C)\).

Exposta via `public.calcular_valor_sistema_dinheiro_caixa(C)` (autoriza e delega).

\(E(C)\) é o **único** valor permitido para fechamento, KPI `financeiro_painel.saldo_pdv` e guards de disponibilidade (cancel nesta remediação; devolver já em C3).

## 2. Eventos que compõem \(E(C)\)

| # | Componente | Sinal | Fonte canônica |
|---|------------|-------|----------------|
| 1 | Fundo de abertura | + | `caixas.valor_inicial` |
| 2 | Vendas dinheiro (split) | + | `vendas_pagamentos` + `vendas` `CONCLUIDA` |
| 3 | Vendas dinheiro (legado) | + | `vendas` `DINHEIRO` sem split |
| 4 | AR dinheiro / estorno | ± | `liquidacoes_receber` |
| 5 | Suprimento / sangria legado | ± | `movimentos_caixa` |
| 6 | Suprimento / sangria / estorno TX | ± | `movimentacoes_caixa` `aprovado` |
| 7 | Devoluções dinheiro | − | `devolucoes` (caixa desembolsador) |

## 3. Fonte canônica

Eventos nas tabelas acima. \(E(C)\) é função pura — sem ledger paralelo.

## 4. Papel de `caixas.saldo_atual`

**Projeção / materialização (cache) — não é source of truth.**

Nenhuma decisão financeira pode ler `saldo_atual`. Escrita preferida: `internal.sincronizar_saldo_cache`. Writers incrementais remanescentes são dívida do **mesmo** cache — não segunda verdade. Não criar sync bidirecional entre verdades concorrentes.

## 5. Papel de `financeiro_painel`

`saldo_pdv` = soma de \(E(c)\) dos caixas `ABERTO`. **Proibido:** `sum(saldo_atual)`.

## 6. Relação E / internal / public

| Símbolo | Papel |
|---------|-------|
| `internal.valor_sistema_dinheiro` | Autoridade |
| `public.calcular_valor_sistema_dinheiro_caixa` | Facade autorizada |
| \(E(c)\) | Conceito de negócio |

## 7. Operações

| Operação | \(E(C)\) | Cache / decisão |
|----------|----------|-----------------|
| Abertura | + fundo (`valor_inicial`) | init |
| Venda DINHEIRO | + pagamentos CONCLUIDA | trigger → `sincronizar_saldo_cache` |
| Recebimento AR DINHEIRO | + `liquidacoes_receber` | sync após fato (`20261007170000`) |
| Estorno AR DINHEIRO | − liquidação ESTORNO | guard E(c)≥0 pós-fato + sync |
| Suprimento / sangria / estorno mov | ± `movimentacoes_caixa` aprovado | guard E(c)+δ; sync após fato |
| Cancelamento | venda deixa de ser CONCLUIDA | guard E(c); sync |
| Devolução | − desembolsador | sync (C3) |
| Fechamento | lê E(c) no comprovante | cache não decide |
| Reabertura | novo caixa / novo \(E\) | novo |

## 8. Resposta explícita

> O que é `caixas.saldo_atual` depois da correção?

**Projeção / cache derivado de \(E(C)\)** — não fonte canônica, não legado com autoridade paralela.

- SoT do saldo esperado = `internal.valor_sistema_dinheiro` / `calcular_valor_sistema_dinheiro_caixa`.
- `financeiro_painel.saldo_pdv` e guards de disponibilidade usam \(E(C)\).
- Escrita preferida do cache: `internal.sincronizar_saldo_cache` (após o fato canônico).
- **Proibido** usar `saldo_atual` como decisão financeira (KPI, Contábil, Intelligence).