# Tickets Frente 5 — Trilha Operacional (somente validação)

> Gerado por Hermes. **Nenhuma falha confirmada nesta frente** — todos os itens abaixo
> são tickets de VALIDAÇÃO (teste controlado), não de correção. O objetivo é confirmar
> se cada evento grava trilha antes de abrir ticket de correção.

**Status de todos:** `OPEN` | **Tipo:** `VALIDACAO` (não correção)

**Regra:** um ticket de VALIDAÇÃO vira ticket de CORREÇÃO (🔴 FALHA CONFIRMADA) apenas
se, ao executar o cenário do `PLANO_VALIDACAO_F5_RUNTIME.md`, o evento rodar e não gerar
trilha. Até lá, não há trabalho de código a fazer no Claude Code para a Frente 5.

---

## TICKET F5-VAL-01
**Título:** Validar trilha de criação de produto (via UI/Server Action)
**Tipo:** VALIDACAO | **Estado atual:** ⚪ NÃO VALIDADO
**Cenário:** C1 (PLANO_VALIDACAO_F5_RUNTIME.md)
**Critério de falha:** criar produto via UI e não surgir registro de auditoria.
**Status:** OPEN

---

## TICKET F5-VAL-02
**Título:** Validar trilha de alteração de produto
**Tipo:** VALIDACAO | **Estado atual:** ⚪ NÃO VALIDADO
**Cenário:** C2
**Critério de falha:** editar produto e não gravar `antes/depois`.
**Status:** OPEN

---

## TICKET F5-VAL-03
**Título:** Validar trilha de exclusão de produto
**Tipo:** VALIDACAO | **Estado atual:** ⚪ NÃO VALIDADO
**Cenário:** C3
**Critério de falha:** excluir produto e não gravar registro.
**Status:** OPEN

---

## TICKET F5-VAL-04
**Título:** Validar gravação de histórico de preço
**Tipo:** VALIDACAO | **Estado atual:** ⚪ NÃO VALIDADO
**Cenário:** C4
**Critério de falha:** alterar preço e `historico_precos_produto` continuar vazio.
**Status:** OPEN

---

## TICKET F5-VAL-05
**Título:** Validar campos de saldo em movimentos de estoque
**Tipo:** VALIDACAO | **Estado atual:** 🟡 PARCIAL
**Cenário:** C5
**Critério de falha:** gravar movimento sem `saldo_anterior`/`saldo_resultante`.
**Status:** OPEN

---

## TICKET F5-VAL-06
**Título:** Validar trilha de inventário (contagem física)
**Tipo:** VALIDACAO | **Estado atual:** ⚪ NÃO VALIDADO
**Cenário:** C6
**Critério de falha:** executar inventário e não gravar.
**Status:** OPEN

---

## TICKET F5-VAL-07
**Título:** Validar trilha de lançamento financeiro
**Tipo:** VALIDACAO | **Estado atual:** ⚪ NÃO VALIDADO
**Cenário:** C7
**Critério de falha:** criar lançamento e não gravar trilha.
**Status:** OPEN

---

## TICKET F5-VAL-08
**Título:** Validar trilha de pagamento financeiro
**Tipo:** VALIDACAO | **Estado atual:** ⚪ NÃO VALIDADO
**Cenário:** C8
**Critério de falha:** registrar pagamento e não gravar trilha.
**Status:** OPEN

---

## TICKET F5-VAL-09
**Título:** Validar trilha de alteração financeira
**Tipo:** VALIDACAO | **Estado atual:** ⚪ NÃO VALIDADO
**Cenário:** C9
**Critério de falha:** alterar lançamento e não gravar `antes/depois`.
**Status:** OPEN

---

## TICKET F5-VAL-10
**Título:** Validar auditoria dedicada de abertura/fechamento de caixa
**Tipo:** VALIDACAO | **Estado atual:** 🟡 PARCIAL
**Cenário:** C10
**Critério de falha:** abrir/fechar caixa e não gravar auditoria dedicada.
**Status:** OPEN

---

## TICKET F5-VAL-11
**Título:** Validar justificativa/autorizador em divergência de caixa
**Tipo:** VALIDACAO | **Estado atual:** 🟡 PARCIAL
**Cenário:** C11
**Critério de falha:** divergência sem justificativa nem autorizador.
**Status:** OPEN

---

## TICKET F5-VAL-12
**Título:** Validar autorização de sangria/suprimento (movimentos_caixa)
**Tipo:** VALIDACAO | **Estado atual:** ⚪ NÃO VALIDADO
**Cenário:** C12
**Critério de falha:** sangria/suprimento e `movimentos_caixa` continuar vazio.
**Status:** OPEN

---

## TICKET F5-VAL-13
**Título:** Validar campo "loja_id" em desconto de venda
**Tipo:** VALIDACAO | **Estado atual:** 🟡 PARCIAL
**Cenário:** C14
**Critério de falha:** desconto gravado sem `loja_id`.
**Status:** OPEN

---

## TICKET F5-VAL-14
**Título:** Validar "valor anterior" em cancelamento de venda
**Tipo:** VALIDACAO | **Estado atual:** 🟡 PARCIAL
**Cenário:** C15
**Critério de falha:** cancelamento sem valor anterior.
**Status:** OPEN

---

## TICKET F5-VAL-15
**Título:** Validar trilha de devolução de venda
**Tipo:** VALIDACAO | **Estado atual:** ⚪ NÃO VALIDADO
**Cenário:** C16
**Critério de falha:** devolver e não gravar registro.
**Status:** OPEN

---

## RESUMO

| ID | Evento | Estado | Vira FALHA se |
|---|---|:--:|---|
| F5-VAL-01 | produto criado | ⚪ | não gravar |
| F5-VAL-02 | produto alterado | ⚪ | não gravar |
| F5-VAL-03 | produto excluído | ⚪ | não gravar |
| F5-VAL-04 | alteração preço | ⚪ | hist. vazio |
| F5-VAL-05 | estoque (saldo) | 🟡 | sem saldo_ant/result |
| F5-VAL-06 | inventário | ⚪ | não gravar |
| F5-VAL-07 | lançamento | ⚪ | não gravar |
| F5-VAL-08 | pagamento | ⚪ | não gravar |
| F5-VAL-09 | alt. financeira | ⚪ | não gravar |
| F5-VAL-10 | abertura/fech. | 🟡 | sem auditoria ded. |
| F5-VAL-11 | divergência | 🟡 | sem justif/autoriz |
| F5-VAL-12 | autorização | ⚪ | movimentos_caixa vazio |
| F5-VAL-13 | desconto (loja) | 🟡 | sem loja_id |
| F5-VAL-14 | cancelamento (ant) | 🟡 | sem valor anterior |
| F5-VAL-15 | devolução | ⚪ | não gravar |

**Total:** 15 tickets de validação · **0 tickets de correção (nenhuma falha confirmada)**.
