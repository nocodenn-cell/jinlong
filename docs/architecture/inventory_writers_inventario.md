# Inventory — inventário de writers (pré–consolidação)

| Campo | Valor |
|--------|--------|
| **Missão** | Inventory 4 — inventário obrigatório antes de alterar writers |
| **Data** | 2026-07-18 |
| **ADR** | [ADR-008](../adr/ADR-008-inventory-domain-boundary.md) |
| **Base** | [inventario_inventory_autoridade.md](./inventario_inventory_autoridade.md) |
| **Escopo** | Mapeamento factual — consolidação em adapters na mesma trilha |

---

## 1. Norma

Antes de criar `InventoryMovementWriter` / `InventoryAdjustmentService` em produção:

1. Listar todo local que grava `estoque` ou `movimentos_estoque_log`.
2. Não apagar writers legados.
3. Não quebrar callers.
4. Criar **caminho canônico** (adapter → RPC existente).

**Autoridade real permanece no Postgres.** Adapters só encapsulam.

---

## 2. Writers de produção (app / edge)

| # | Writer antigo (arquivo · função) | O que grava | Mecanismo | Autoridade |
|---|----------------------------------|-------------|-----------|------------|
| W1 | `gerente/estoque/actions.ts` · `atualizarEstoqueProduto` | saldo + kardex | RPC `ajustar_estoque_manual` | inventory-led |
| W2 | `gerente/estoque/actions.ts` · `garantirLinhaEstoque` | saldo (0/0), **sem** kardex | INSERT `estoque` | legado (D-I3) |
| W3 | `lib/adapters/.../criarProdutoComEstoqueInicialRpc.ts` | saldo (+ kardex se qty>0) | RPC `criar_produto_com_estoque_inicial` | products-led (ADR-007) |
| W4 | `admin/produtos/productWriter.ts` · `create` | mesmo W3 | via W3 | products-led |
| ~~W5~~ | ~~`caixa/.../caixaCadastroRelampago.impl.ts`~~ | **REMOVIDO (2026-07-30)** — o PDV não cadastra produto; ver `pdv_cadastro_removido.md` | — | — |
| W6 | `caixa/.../caixaVendas.impl.ts` · `finalizarVendaCaixaImpl` | saldo + `SAIDA_VENDA` | RPC `finalizar_venda_transacional_canonica_v4` → `decrementar_estoque_seguro` | **sales-led** |
| W7 | `caixa/.../caixaVendas.impl.ts` · `cancelarVendaImpl` | reposição saldo | RPC `cancelar_venda_transacional` | **sales-led** |
| W8 | `gerente/vendas/devolverOuTrocarVenda.impl.ts` | reposição saldo | RPC `devolver_ou_trocar_venda` | **sales-led** |
| W9 | `gerente/transferencias/actions.ts` · `executarTransferencia` | saldo + kardex (2 lojas) | RPC `transferir_estoque_seguro` | inventory-led |
| W10 | `gerente/recebimento/actions.ts` · `criarRemessaConferencia` | saldo + kardex | RPC `confirmar_remessa_entrada` (+ INSERT remessa) | inventory-led |
| W11 | `gerente/estoque/importar-nfe/actions.ts` · `executarImportacaoNfe` | saldo + kardex (+ products lateral) | RPC `importar_nfe_transacao` | inventory-led |
| W12 | `gerente/compras/actions.ts` · `registrarRecebimentoOC` | saldo + kardex | RPC `receber_ordem_compra` | inventory/compras-led |
| W13 | `admin/produtos/productExclusion.ts` · `deletePhysical` | DELETE `estoque` órfão | direto | products exclusion (cleanup) |
| W14 | `gerente/produtos/actions.ts` · CSV rollback | DELETE `estoque` | direto | legado products |
| W15 | `backend/.../sync-outbox` · `aplicarBaixaEstoquePorItem` | saldo + kardex | RPC `decrementar_estoque_seguro` | **sales/sync-led** |

**INSERT direto em `movimentos_estoque_log` na app:** nenhum.

---

## 3. Plano de consolidação (sem big-bang)

| Fluxo | Writer novo (canônico app) | Situação alvo |
|-------|----------------------------|---------------|
| Ajuste manual | `InventoryAdjustmentService` → RPC `ajustar_estoque_manual` | W1 delega ao adapter |
| Transferência | `InventoryMovementWriter.transfer` → RPC | W9 delega |
| Remessa (confirmação) | `InventoryMovementWriter.confirmRemessaEntrada` → RPC | W10: INSERT remessa na action; RPC via writer |
| NF-e | `InventoryMovementWriter.importNfe` → RPC | W11 delega |
| OC receive | documentado; wire opcional (P1) | W12 permanece até missão compras |
| Create + estoque inicial | permanece `ProductWriter` / RPC 270 | W3–W5 — **não** mover (ADR-007) |
| Venda / cancel / devolução | permanece sales-led RPC | W6–W8, W15 — **não** alterar Sales |
| `garantirLinhaEstoque` | legado — não padronizar | W2 dívida D-I3 |
| Cleanup delete estoque | products exclusion | W13–W14 — fora do write surface inventory |

---

## 4. GO desta etapa

| Critério | Status |
|----------|--------|
| Writers mapeados | OK |
| Sem INSERT kardex na app | OK |
| Plano canônico sem apagar legado | OK |
| Alterar writers sem este inventário | **NO-GO** (cumprido) |

**Próximo:** adapters + wire (Inventory 4+).
