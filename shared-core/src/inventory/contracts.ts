/**
 * Contratos públicos do domínio inventory (ports).
 * Implementações de I/O ficam no adapter da app (Inventory 3+).
 *
 * ADR-008:
 * - Inventory é dono do saldo e dos movimentos
 * - Products nunca escreve estoque (exceto orquestrador RPC 270 documentado)
 * - Sales não altera estoque diretamente — solicita baixa/reversão via orquestração
 * - Cash não conhece estoque
 * - Baixa e reversão de venda = orquestrações futuras (não ports de UPDATE direto)
 *
 * Este scaffold **não implementa** writers — só tipa a superfície.
 */

import type {
  InventoryItem,
  InventoryMovement,
  InventoryMovementType,
  LojaId,
  ProductId,
} from './types'

// ─── Leitura ───────────────────────────────────────────────────────────────

export type InventoryBalanceResult =
  | { ok: true; item: InventoryItem }
  | { ok: false; error: string; notFound?: boolean }

export type InventoryBalancesResult =
  | { ok: true; items: InventoryItem[] }
  | { ok: false; error: string }

/**
 * Port de **consulta** de saldo.
 * Adapter (Inventory 3): lê `estoque` / RPCs de listagem — sem mutação.
 *
 * Escopo de loja: resolvido na borda (sessão); resultado inclui `lojaId`.
 */
export type InventoryReader = {
  getBalance(productId: ProductId): Promise<InventoryBalanceResult>
  getBalances(productIds: readonly ProductId[]): Promise<InventoryBalancesResult>
}

// ─── Movimentos (kardex) ───────────────────────────────────────────────────

/**
 * Comando para registrar movimento — tipagem apenas.
 * Autoridade real: RPCs Postgres (append em `movimentos_estoque_log`).
 * Baixa de venda / cancel **não** usam este port para UPDATE direto de saldo;
 * são orquestrações sales-led (ADR-008 §5).
 */
export type RegisterMovementCommand = {
  productId: ProductId
  lojaId: LojaId
  type: InventoryMovementType
  quantity: number
  reason?: string | null
  /** Ator da sessão — auditoria na borda/RPC. */
  atorId?: string | null
  /** Vínculo opcional (ex.: venda) — preenchido por orquestrações. */
  vendaId?: string | null
}

export type RegisterMovementResult =
  | { ok: true; movement: InventoryMovement }
  | { ok: false; error: string }

/**
 * Port de registro de movimento.
 * **Não implementar neste scaffold** — superfície para Inventory 4.
 */
export type InventoryMovementWriter = {
  registerMovement(command: RegisterMovementCommand): Promise<RegisterMovementResult>
}

// ─── Ajustes ───────────────────────────────────────────────────────────────

/**
 * Comando de ajuste manual — tipagem apenas.
 * Autoridade real: RPC `ajustar_estoque_manual` (motivo + alvo de quantidade).
 */
export type AdjustInventoryCommand = {
  productId: ProductId
  lojaId: LojaId
  /** Quantidade alvo (`estoque.quantidade_atual` após ajuste). */
  quantity: number
  /** Estoque mínimo alvo (opcional — alinhado à RPC). */
  estoqueMinimo?: number
  /** Motivo canônico (ex.: `ACERTO_INVENTARIO`, `COMPRA`, `PERDA`). */
  reason: string
  observacao?: string | null
  atorId?: string | null
}

export type AdjustInventoryResult =
  | { ok: true; item: InventoryItem }
  | { ok: false; error: string; notFound?: boolean }

/**
 * Contrato futuro para ajustes manuais / fluxos inventory-led.
 * **Sem lógica neste scaffold** — Inventory 5.
 */
export type InventoryAdjustmentService = {
  adjustInventory(command: AdjustInventoryCommand): Promise<AdjustInventoryResult>
}
