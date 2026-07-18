# Missão 4.3 — Fechamento de caixa

**Veredito: GO**  
**Branch:** `consolidate/missao3-20260718`  
**Contrato:** ADR-CAIXA-002 — conferência e fechamento usam \(E(c)\) = `calcular_valor_sistema_dinheiro_caixa`  
**Evidência ops:** `missao4_3_ops_2026-07-18T1753.md`  
**Script:** `backend/supabase/scripts/ops_missao4_3_fechamento.mjs`  
**PR:** não aberto  

---

## Escopo

| Feito | Não feito |
|---|---|
| Abrir → venda DINHEIRO → conferir \(E\) → `fechar_caixa_atomico` | Alterar `saldo_atual` |
| Provar \(E\) = VI + venda no turno isolado | Criar mov de venda / novo ledger |
| Provar imutabilidade pós-FECHADO | PIX/cartão no close |

---

## Ciclo isolado (jinlong)

| Passo | Resultado |
|---|---|
| Precondição: fechar caixa legado | OK (`1b28f7bf-…` E=733.76) |
| Abertura VI=50 | OK `b5b929ab-…` · `saldo_atual=0` · **E=50** |
| Venda DINHEIRO R$100 | OK `26b0e0bf-…` · VP preservado · **saldo_atual inalterado** |
| E pós-venda | **50 → 150 (Δ +100)** |
| Conferência contado=E | **diff=0** |
| `fechar_caixa_atomico` | sistema=150 contado=150 **diff=0** · status **FECHADO** |
| Venda após fechar | **bloqueada** `VENDA_CAIXA_FECHADO` |

---

## Contrato ADR confirmado

- SSoT do esperado no fechamento = \(E(c)\), não `saldo_atual`.
- RPC de fechamento inalterada: já chama `calcular_valor_sistema_dinheiro_caixa` sob `FOR UPDATE`.
- Nenhuma migration nova nesta missão.

---

## RPCs usadas (somente leitura/execução)

| RPC | Papel |
|---|---|
| `criar_produto_com_estoque_inicial` | Setup produto |
| `finalizar_venda_transacional_canonica_v4` | Venda |
| `calcular_valor_sistema_dinheiro_caixa` | Conferência \(E(c)\) |
| `fechar_caixa_atomico` | Fechamento atômico |

---

## Bugs

_Nenhum P0._

---

## Próximo

Missão **4.4** — integridade negativa (pagamento zero, etc.).
