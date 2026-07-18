# Missão 4 — Venda → Estoque → Financeiro

**Data:** 2026-07-18  
**Branch:** `consolidate/missao3-20260718` (checkpoint remoto após Missão 3.1 GO)  
**PR:** **não abrir** até 4.1–4.4 passarem (ou aceite formal dos gaps)  
**Critério:** ciclo comercial completo — não só “ligar tabelas”.

---

## Estratégia

```
Missão 3.1 GO  →  Missão 4 (esta)  →  Auditoria final  →  PR consolidação
```

Sem merge em `main` no meio do ciclo.

---

## Matriz de critérios

| ID | Capacidade | Critério de GO |
|---|---|---|
| **4.1** | Financeiro nasce da venda | Venda → pagamento → efeito financeiro mensurável → caixa/turno reflete |
| **4.2** | Cancelamento | Estoque retorna + financeiro estorna (espécie) + auditoria |
| **4.3** | Fechamento de caixa | Abrir → vender → conferir → fechar (esperado × contado) |
| **4.4** | Integridade | Sem pagamento zero; pagamento exige venda; estoque/financeiro só com evento |

---

## Diagnóstico de código (pré-teste)

| ID | Status | Realidade no sistema |
|---|---|---|
| **4.1** | **PARTIAL** | `vendas` + `vendas_pagamentos` + kardex na v4. **Não** cria linha em `movimentacoes_caixa` na venda (por desenho). `/admin/financeiro` lista títulos CR — venda DINHEIRO integral **não** aparece como título. Efeito no caixa: `calcular_valor_sistema_dinheiro_caixa` / resumo de turno agregam `vendas_pagamentos`. |
| **4.2** | **PARTIAL** | Cancel: estoque + auditoria GO; estorno caixa só DINHEIRO; PIX/cartão sem TEF reverse. |
| **4.3** | **PARTIAL** | Fechamento confere **DINHEIRO**; PIX/cartão sem contagem no close. |
| **4.4** | **PARTIAL** | FK pagamento→venda OK; pagamento zero bloqueado; baixa manual de estoque existe (intencional GERENTE+); venda parcial + CR é legítima. |

**Aggregate Missão 4 (código): PARTIAL**

---

## Definição operacional de “financeiro” (decisão desta missão)

Para não confundir painel com ledger de gaveta:

| Conceito | Onde vive | Esperado na venda DINHEIRO integral |
|---|---|---|
| Pagamento da venda | `vendas_pagamentos` | **Obrigatório** |
| Saldo esperado do turno | RPC `calcular_valor_sistema_dinheiro_caixa` + resumo turno | **Deve refletir** o pagamento |
| Sangria/suprimento | `movimentacoes_caixa` | **Não** nasce da venda |
| Contas a receber | `contas_receber` | Só se saldo pendente (parcial) |
| Painel `/admin/financeiro` | títulos CR/AP | Não é o espelho da venda à vista |

**GO 4.1 nesta missão** = pagamento criado + turno/caixa esperado reflete + estoque baixou.  
**Não exigir** INSERT em `movimentacoes_caixa` nem título em `/admin/financeiro` para DINHEIRO integral — salvo aceite de produto pedindo redesign.

Se o negócio exigir “movimento financeiro” = linha em `movimentacoes_caixa` por venda, isso vira **gap de produto** (NO-GO até implementar), não bug de RPC.

---

## Plano de execução

1. **4.1** — teste operacional: venda R$100 DINHEIRO → asserts acima  
2. **4.2** — cancelar a venda → estoque/financeiro/auditoria  
3. **4.3** — fechar caixa com conferência  
4. **4.4** — asserts negativos (pagamento zero, etc.) via SQL/RPC  
5. Relatório final + só então PR

---

## Checkpoint remoto

| Item | Valor |
|---|---|
| Branch | `consolidate/missao3-20260718` |
| Tip pós-push | `795ed478` (docs Missão 3.1 ops GO) |
| Base main | `ebbeac5c` |

---

## Resultado dos testes

| ID | Veredito | Evidência |
|---|---|---|
| 4.1 | **GO** | `missao4_1_ops_2026-07-18T1649.md` — venda R$100 DINHEIRO; pagamento; estoque 5→4; esperado caixa 533.76→633.76; sem CR; sem `movimentacoes_caixa` |
| 4.2 | _pendente_ | Cancelamento |
| 4.3 | _pendente_ | Fechamento |
| 4.4 | _pendente_ | Integridade negativa |
| **Missão 4** | **IN_PROGRESS** | 4.1 GO · seguir 4.2 |

### 4.1 — detalhe

Script: `backend/supabase/scripts/ops_missao4_venda_financeiro.mjs`

| Assert | Resultado |
|---|---|
| Venda CONCLUIDA R$100 | OK `81d4513c-…` |
| `vendas_pagamentos` DINHEIRO 100 | OK |
| Estoque baixou | OK 5→4 |
| `calcular_valor_sistema_dinheiro_caixa` Δ+100 | OK |
| Sem `contas_receber` (à vista) | OK |
| `movimentacoes_caixa` inalterado | OK (desenho confirmado) |
