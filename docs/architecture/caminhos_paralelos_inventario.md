# Inventário de caminhos paralelos (fechamento comercial)

| Campo | Valor |
|--------|--------|
| **Data** | 2026-07-18 |
| **Regra** | Eliminar só com equivalência comprovada; nunca quebrar compatibilidade |

---

## Por domínio

### Customers — 100%

| Item | Situação |
|------|----------|
| Writers paralelos create/update | Migrados → CustomerWriter/Updater |
| Facades gerente | Mantidos (contrato UI) |

### Products — 100%

| Item | Situação |
|------|----------|
| Create paths | Único → ProductWriter / RPC 270 |
| NF-e create | Exceção ADR-007 — documentada |

### Inventory — 100%

| Item | Situação |
|------|----------|
| Ajuste/transfer/remessa/NF-e | Canônicos via Adjustment/MovementWriter |
| Sales-led baixa | Documentada — não paralelismo inventory |
| `garantirLinhaEstoque` | Dívida D-I3 — **não** eliminar nesta missão |

### Cash — GO piloto

| Item | Situação | Ação |
|------|----------|------|
| Abrir/fechar/status | Via CashSession* | Migrado |
| Registrar mov | Via CashMovementWriter | Migrado |
| Aprovar/cancelar/estornar mov | Ainda no impl | P1 — wire futuro |
| `recalcular_saldo_caixa` | Sem consumer PDV | **Não** introduzir |

### Financial — GO piloto

| Item | Situação | Ação |
|------|----------|------|
| Criar/liquidar AR | Via Receivable* | Migrado |
| Pagar/cancelar AP | Via PayablePayment | Migrado |
| `criarCliente` financeiro | Legado entity-ssot | **Não** remover sem UI equivalente (D-F1) |
| Comissões / fiscal enqueue | Satélites | Fora do núcleo AR/AP |

---

## Eliminações nesta missão

| Eliminado | Motivo |
|-----------|--------|
| Validação AR duplicada em `actions.validation` (lógica) | Equivalente → policy shared-core (facade mantém API) |
| RPC direta criar/liquidar AR / pagar AP / abrir-fechar-registrar caixa nos hot paths | Equivalente → adapters |

**Não eliminado (sem equivalência segura):** `criarCliente` financeiro, `garantirLinhaEstoque`, movs approve/cancel/estornar (ainda não no writer).
