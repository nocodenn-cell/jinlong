# Missão 4.4 — Integridade Cross-Entity

**Veredito: GO**  
**Branch:** `consolidate/missao3-20260718`  
**Evidência ops:** `missao4_4_ops_2026-07-18T1808.md`  
**Script:** `backend/supabase/scripts/ops_missao4_4_integridade.mjs`  
**PR:** não aberto  
**Escopo:** validar invariantes existentes — sem novas regras / sem refatoração

---

## Matriz operacional

| # | Invariante | Resultado | Evidência |
|---|---|---|---|
| 1 | Venda sem pagamento (`p_pagamentos=[]`) | **OK** bloqueado | `FINALIZAR_VENDA_CANONICA_PAGAMENTOS_INVALIDOS` |
| 1b | Pagamento valor 0 | **OK** bloqueado | `FINALIZAR_VENDA_CANONICA_VALOR_PAGAMENTO_INVALIDO` |
| 1c | Estoque após negativos | **OK** | permanece 20 |
| 2 | Pagamento sem venda | **OK** bloqueado | FK `vendas_pagamentos_venda_id_fkey` |
| 3 | Cancelamento duplicado | **OK** bloqueado | `CANCELAR_VENDA_JA_CANCELADA` |
| 3b | Estoque no 2º cancel | **OK** | inalterado |
| 4 | Estoque ciclo completo (venda→cancel) | **OK** | 20→19→20 |
| 4b | E(c) ciclo (ADR α) | **OK** | Δ+100 / volta ao pré |
| 4c | VP preservado no cancel | **OK** | 1 linha |
| 5 | Auditoria cancel | **OK** | `vendas_canceladas_auditoria` estorno=100 |
| 5b | Evento `SALE_CANCELLED` | **OK** | `gerente_panel` |
| 5c | Evento `SALE_REGISTERED` | **OK** | presente na venda happy-path |

**IDs:** venda `4f9acadb-…` · caixa `9df5e3e0-…` · produto `7a7ab966-…`

---

## Bugs reais (≠ ajuste de teste)

### BUG-4.4-DIAG-01 (P1) — **corrigido** (pós-4.4)

**`verificar_consistencia_venda` falhava com `total_liquido` ambíguo**

- Causa: OUT param `RETURNS TABLE` × coluna homônima em SQL embutido.
- Fix: mig. `20260718181600_fix_verificar_consistencia_venda_total_liquido.sql` (aliases + `#variable_conflict use_column`).
- Evidência: `missao4_4_diag_fix_2026-07-18T1817.md` — **GO**.

---

## Ajustes de teste (não bug de produto)

| Item | Nota |
|---|---|
| `count` reposicao via `.select(..., { count:'exact', head:true })` | Retornou `null` no client; SQL direto confirma `count=1` |
| Códigos `*b` no script | Reservados a rejeições com mensagem inesperada — nenhum neste run |

---

## Migrations / RPCs

| Ação | Artefato |
|---|---|
| Nenhuma migration nova | — |
| Exercitadas | `finalizar_venda_transacional_canonica_v4`, `cancelar_venda_transacional`, `calcular_valor_sistema_dinheiro_caixa`, `verificar_consistencia_venda` (quebrada), `criar_produto_com_estoque_inicial` |

---

## Missão 4 agregada

| ID | Veredito |
|---|---|
| 4.1 | GO |
| 4.2.1 | GO |
| 4.3 | GO |
| **4.4** | **GO** (com dívida P1 no RPC de consistência) |
| **Missão 4** | **GO operacional** — PR consolidação ainda sob decisão |
