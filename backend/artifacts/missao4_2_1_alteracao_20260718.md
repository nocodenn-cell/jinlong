# Missão 4.2.1 — Relatório da alteração (ADR-CAIXA-002)

**Branch:** `consolidate/missao3-20260718`  
**Ambiente:** jinlong (migração aplicada)  
**PR:** não aberto  
**Veredito ops:** **GO** — evidência `missao4_2_1_ops_2026-07-18T1751.md`

---

## 1. Onde estava a validação de saldo

Em `cancelar_venda_transacional` (paths split e DINHEIRO legado):

```sql
UPDATE caixas SET saldo_atual = saldo_atual - v_valor_estornado
WHERE ... AND (saldo_atual - estorno) >= 0;
IF NOT FOUND THEN RAISE EXCEPTION 'CANCELAR_VENDA_SALDO_CAIXA_INSUFICIENTE';
```

Bloqueava cancel quando `saldo_atual` não acompanhava a venda (A ≠ E).

---

## 2. Mudança implementada

| # | RPC | Alteração |
|---|---|---|
| 1 | `calcular_valor_sistema_dinheiro_caixa` | CTE `dev_din`: filtro `v.status = 'CONCLUIDA'` (**Modelo α**) |
| 2 | `cancelar_venda_transacional` | Remove RAISE `CANCELAR_VENDA_SALDO_CAIXA_INSUFICIENTE`; UPDATE `saldo_atual` **best-effort** |

**Não alterado:** `finalizar_venda_v4`, `devolver_ou_trocar_venda`, `fechar_caixa_*`, `movimentacoes_caixa`, PIX/cartão, apagar `vendas_pagamentos`.

---

## 3. Impacto confirmado

| Área | Efeito |
|---|---|
| **Devolução parcial** | Writers intactos; \(E\) continua \(-R\) (venda `CONCLUIDA` + `devolucoes`) |
| **Troca** | Idem |
| **Fechamento** | Continua lendo \(E(c)\); pós-cancel deixa de enviesar \(-2P\) |
| **Auditoria** | Mantém `devolucoes`, `vendas_canceladas_auditoria`, `registrar_venda_evento` |

---

## 4. Migrations / RPCs

| Artefato | Path |
|---|---|
| Migration | `backend/supabase/migrations/20260718184800_adr_caixa_002_modelo_alpha_e_cancel.sql` |
| RPC | `public.calcular_valor_sistema_dinheiro_caixa(uuid)` |
| RPC | `public.cancelar_venda_transacional(uuid, text, uuid)` |
| Ops script | `backend/supabase/scripts/ops_missao4_2_cancelamento.mjs` |
| ADR | `docs/adr/ADR-caixa-contrato-financeiro-pos-cancelamento.md` (status Aceito) |

---

## 5. Resultado ops (jinlong)

| Assert | Resultado |
|---|---|
| Venda R$100 DINHEIRO | OK `25d75078-…` |
| Estoque 10→9 | OK |
| E(c) Δ venda | **+100** (733.76→833.76) |
| Cancel GERENTE | OK CANCELADA |
| Estoque 9→10 | OK |
| VP preservado | OK |
| Auditoria + devolucao | OK |
| E(c) Δ cancel | **−100** |
| E(c) ciclo (pré=pós) | **0** |

**VERDICT: GO**

---

## 6. Dívida explícita (fora desta missão)

- `saldo_atual` ainda não sobe na venda (A stale); cancel só aplica decremento se houver saldo suficiente.
- Alinhar liquidez A (venda → `saldo_atual`) permanece ADR/missão à parte.
- `devolver_ou_trocar` ainda pode RAISE `DEVOLVER_VENDA_SALDO_CAIXA_INSUFICIENTE` — não tocado aqui.
