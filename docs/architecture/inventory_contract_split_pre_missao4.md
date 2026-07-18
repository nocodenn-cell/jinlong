# Inventory — split de contratos (pré–Missão 4)

| Campo | Valor |
|--------|--------|
| **Data** | 2026-07-18 |
| **Base** | Revisão arquitetural + ADR-008 |
| **Escopo** | Decisão de superfície de ports |
| **Status** | Superfícies implementadas — ver [inventory_100_audit.md](./inventory_100_audit.md) |

---

## Decisão

`InventoryReader` **não** é o contrato universal do domínio.

| Port | Responsabilidade | Não faz |
|------|------------------|---------|
| **`InventoryReader`** | Saldo pontual (`getBalance` / `getBalances`) | Grade admin, kardex, filtros |
| **`InventoryMovementReader`** | Kardex (`listByProduct`) | Mutação, saldo |
| **`InventoryQueryService`** | Grade `/admin/estoque` (`listStockPage`) | Saldo pontual PDV, kardex genérico |
| **`InventoryMovementWriter`** | Transferência / remessa / NF-e (inventory-led) | Substituir RPCs de venda/cancel |
| **`InventoryAdjustmentService`** | Ajuste manual | — |

DTO `InventoryItem`: `quantity`, `available` (abstração p/ reservas), **`minimum`** (`estoque_minimo`).

---

## Autoridade de escrita de movimentos — **fechada (Inventory 100)**

Ver [inventory_writers_inventario.md](./inventory_writers_inventario.md) e [inventory_100_audit.md](./inventory_100_audit.md).

| Superfície app | Port | RPCs |
|----------------|------|------|
| Ajuste manual | `InventoryAdjustmentService` | `ajustar_estoque_manual` |
| Transferência / remessa / NF-e | `InventoryMovementWriter` | `transferir_estoque_seguro`, `confirmar_remessa_entrada`, `importar_nfe_transacao` |
| Venda / cancel / devolução / sync | sales-led (ADR-008) | orquestradores existentes — **não** passam pelo writer app |

Append em `movimentos_estoque_log` continua **só nas RPCs**. A app não INSERT kardex.

---

## Fora de escopo

- Snapshot temporal / saldo as-of  
- `InventoryListReader` genérico (rejeitado — preferir `InventoryQueryService`)  
- Wire UI visual / colocation de pastas (fase 8 opcional)  
