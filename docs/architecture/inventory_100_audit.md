# Inventory 100% — auditoria final (piloto)

| Campo | Valor |
|--------|--------|
| **Missão** | Inventory 4–100 — Fechamento do domínio |
| **Data** | 2026-07-18 |
| **ADR** | [ADR-008](../adr/ADR-008-inventory-domain-boundary.md) |
| **Template** | [template_dominio_internacionalizado.md](./template_dominio_internacionalizado.md) |
| **Writers pré-wire** | [inventory_writers_inventario.md](./inventory_writers_inventario.md) |
| **Pré-requisitos** | Inventory 0–3.1 · Customers 100 · Products 100 |

---

## 1. Arquitetura final

```
UI (/admin/estoque/* + facades gerente)
  ↓
actions (gerente/estoque · recebimento · transferencias · importar-nfe)
  auth + validação Zod + revalidate + i18n borda
  ↓
adapters admin/estoque/
  InventoryReader | InventoryMovementReader | InventoryQueryService
  InventoryAdjustmentService | InventoryMovementWriter
  ↓
@fastproduct/shared-core/inventory
  types · contracts · policies · errorCodes
  ↓
Postgres (única autoridade de saldo / kardex)
  ajustar_estoque_manual · transferir_estoque_seguro
  confirmar_remessa_entrada · importar_nfe_transacao
  gerente_estoque_list_page · SELECT estoque / movimentos_estoque_log
```

**Sales-led (fora do write surface inventory app):**

```
PDV / sync-outbox
  → finalizar_venda_* / cancelar_venda_* / devolver_ou_trocar / decrementar_estoque_seguro
  → efeito inventory dentro da RPC (ADR-008)
```

**Products-led (estoque inicial):**

```
ProductWriter → criar_produto_com_estoque_inicial (RPC 270)
```

---

## 2. Fluxos até o Postgres

| Fluxo | Caminho app | RPC / mecanismo |
|-------|-------------|-----------------|
| **Ajuste manual** | UI `AjusteSaldoModal` → `atualizarEstoqueProduto` → `InventoryAdjustmentService` | `ajustar_estoque_manual` |
| **Inventário (piloto)** | mesmo ajuste com motivo `ACERTO_INVENTARIO` | `ajustar_estoque_manual` |
| **Venda** | `finalizarVendaCaixa` → RPC sales | `finalizar_venda_transacional_canonica_v4` → `decrementar_estoque_seguro` |
| **Entrada remessa** | `criarRemessaConferencia` → INSERT remessa → `InventoryMovementWriter.confirmRemessaEntrada` | `confirmar_remessa_entrada` |
| **Entrada NF-e** | `executarImportacaoNfe` → `InventoryMovementWriter.importNfe` | `importar_nfe_transacao` |
| **Transferência** | `executarTransferencia` → `InventoryMovementWriter.transfer` | `transferir_estoque_seguro` |
| **Kardex (read)** | `obterKardexProduto` → `InventoryMovementReader` | SELECT `movimentos_estoque_log` |
| **Grade admin (read)** | `obterListaEstoqueGerente` → `InventoryQueryService` | `gerente_estoque_list_page` |
| **Saldo pontual (read)** | `InventoryReader` | SELECT `estoque` |

---

## 3. Writers encontrados

| Writer antigo | Writer novo | Situação | Autoridade |
|---------------|-------------|----------|------------|
| `atualizarEstoqueProduto` → RPC direta | `InventoryAdjustmentService` | **Migrado** — action delega | Postgres `ajustar_estoque_manual` |
| `executarTransferencia` → RPC direta | `InventoryMovementWriter.transfer` | **Migrado** | Postgres `transferir_estoque_seguro` |
| `criarRemessaConferencia` → RPC direta | `InventoryMovementWriter.confirmRemessaEntrada` | **Migrado** (INSERT remessa permanece na action) | Postgres `confirmar_remessa_entrada` |
| `executarImportacaoNfe` → RPC direta | `InventoryMovementWriter.importNfe` | **Migrado** | Postgres `importar_nfe_transacao` |
| `finalizarVenda*` / cancel / devolver | — (sales-led) | **Documentado** — não alterado | Orquestradores sales |
| sync-outbox `decrementar_estoque_seguro` | — (sales/sync-led) | **Documentado** | Postgres |
| `ProductWriter` / RPC 270 | — (products-led) | **Documentado** — ADR-007 | Postgres |
| `garantirLinhaEstoque` INSERT | — legado | **Dívida D-I3** — não padronizado | App INSERT (sem kardex) |
| `receber_ordem_compra` | — | **P1** — wire opcional | Postgres |
| Exclusion/CSV `estoque.delete` | — products cleanup | **Fora** do write surface inventory | App DELETE |

---

## 4. Readers

| Reader | Port | Fonte | Status |
|--------|------|-------|--------|
| Saldo pontual | `InventoryReader` | SELECT `estoque` | OK |
| Kardex | `InventoryMovementReader` | SELECT `movimentos_estoque_log` | OK (wire `obterKardexProduto`) |
| Grade admin | `InventoryQueryService` | RPC `gerente_estoque_list_page` | OK (wire listagem) |

---

## 5. i18n

| Camada | Estado |
|--------|--------|
| Policies shared-core | Só codes (`INVENTORY_*`) |
| Adapters | Codes + `localizeInventoryFailure` / `resolveInventoryMessage` |
| Catálogo | `pt.json` / `zh.json` namespace `estoque.err_*` |
| Fallback | en-US → pt-BR (catalogAdapter) |
| Legado | `mensagemErroAjusteEstoqueManual` permanece para paths products-create |

---

## 6. Dívidas restantes

### P0 — bloqueiam piloto inventory

*Nenhuma.* Contagem física formal **não** é requisito do piloto (motivo `ACERTO_INVENTARIO` suficiente — D-I2 aceito).

### P1 — importantes, não bloqueiam

| ID | Item | Por que existe |
|----|------|----------------|
| D-I3 | `garantirLinhaEstoque` INSERT sem kardex | Legado pré-RPC; eliminar em missão dedicada sem quebrar callers |
| D-I-OC | `receber_ordem_compra` ainda não passa pelo MovementWriter | Fluxo compras satélite; wire em missão compras/inventory |
| D-I4 | Dual-layer `gerente/*` ↔ `admin/estoque` | Facade UI; colocation opcional (fase 8 do template) |

### P2 — melhoria futura

| ID | Item | Por que existe |
|----|------|----------------|
| D-I2 | Inventário físico formal (sessão de contagem) | Produto; piloto usa acerto manual |
| D-I6 | Reservas de estoque | Não modelado; venda em espera não segura saldo |
| D-I7 | Lote / validade / custo médio | Fora do piloto importados |
| D-I10 | Kardex UI sem paginação/export | Limite 60 linhas aceitável no piloto |

---

## 7. Checklist piloto

- [x] Leitura canônica: Reader + MovementReader + QueryService
- [x] Escrita inventory-led canônica: AdjustmentService + MovementWriter
- [x] Ajuste / transferência / remessa / NF-e delegam aos adapters (RPC intacta)
- [x] Sem novo caminho paralelo de INSERT/UPDATE saldo na app
- [x] Sales-led / products-led documentados (não reinventados)
- [x] shared-core puro (policies + codes; sem Supabase)
- [x] i18n codes → catálogo → locale
- [x] testes shared-core + adapters verdes
- [x] typecheck + `guard:domain`

---

## 8. GO / NO-GO

| Critério | Resultado |
|----------|-----------|
| Superfície canônica de leitura | **GO** |
| Superfície canônica de escrita inventory-led | **GO** |
| Autoridade permanece no Postgres | **GO** |
| Sem segundo motor de saldo em TS | **GO** |
| Pronto para piloto comercial (estoque operacional) | **GO** |

**Decisão: Inventory 100% fechado para piloto** — com dívidas P1/P2 documentadas (não bloqueadoras).

**Veredito operacional:** **GO** — Inventory pronto para piloto.
