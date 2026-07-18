/**
 * Tipos de domínio — inventory (saldo físico / kardex).
 * Missão Inventory 2 — scaffold. Sem I/O, sem React/Next, sem cálculo de saldo.
 *
 * Autoridade (ADR-008):
 * - Saldo → tabela `estoque` (Postgres)
 * - Histórico → `movimentos_estoque_log` (Postgres)
 * - UI/cache nunca são fonte de verdade
 */

/** Identificador do SKU (`produtos.id`) — identidade vem de products. */
export type ProductId = string

/** Identificador da loja (`lojas.id`). */
export type LojaId = string

/** Identificador do movimento de kardex (`movimentos_estoque_log.id`). */
export type MovementId = string

/**
 * Código de tipo de movimento (ex.: `SAIDA_VENDA`, `ENTRADA_AJUSTE`).
 * Catálogo canônico vive em `tipos_movimento_estoque` (Postgres) — sem enum TS paralelo.
 */
export type InventoryMovementType = string

/**
 * Saldo atual de estoque (leitura).
 * Sem regra de negócio: `available` é campo de representação; autoridade = Postgres.
 */
export type InventoryItem = {
  productId: ProductId
  lojaId: LojaId
  /** Saldo atual (`estoque.quantidade_atual`). */
  quantity: number
  /**
   * Quantidade disponível para consumo operacional.
   * Hoje ≈ `quantity` (sem reservas — ADR-008 / Inventory 0).
   * Adapter preenche; core não calcula.
   */
  available: number
}

/**
 * Evento de kardex (leitura / comando de registro).
 * Append-only na autoridade Postgres — core não apaga nem recalcula.
 */
export type InventoryMovement = {
  movementId: MovementId
  productId: ProductId
  type: InventoryMovementType
  /** Delta do movimento (pode ser negativo em saídas). */
  quantity: number
  reason: string | null
  createdAt: string
}
