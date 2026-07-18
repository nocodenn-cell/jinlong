/**
 * Tipos de domínio — inventory (saldo físico / kardex).
 * Missão Inventory 2–3.1 / ADR-008.
 * Sem I/O, sem React/Next, sem cálculo de saldo.
 *
 * Autoridade:
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
 * Saldo pontual de estoque (leitura).
 * Sem regra de negócio no core — adapter só mapeia colunas Postgres.
 */
export type InventoryItem = {
  productId: ProductId
  lojaId: LojaId
  /** Saldo atual (`estoque.quantidade_atual`). */
  quantity: number
  /**
   * Quantidade disponível para consumo operacional.
   * Hoje ≈ `quantity` (sem reservas). Preservado como abstração para reservas futuras.
   * Adapter preenche; core não calcula.
   */
  available: number
  /** Estoque mínimo (`estoque.estoque_minimo`) — alerta / UI PDV. */
  minimum: number
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

/**
 * Linha da listagem administrativa de estoque (join produto + saldo).
 * Não é o mesmo que `InventoryItem` — inclui atributos de catálogo para a grade.
 * Autoridade de saldo permanece em `estoque`; nome/código vêm de products (read-through).
 */
export type InventoryStockListRow = {
  productId: ProductId
  nome: string
  codigoBarras: string | null
  unidadeMedida: string
  origem: string
  categoriaId: string | null
  /** Id da linha `estoque`, se existir. */
  estoqueId: string | null
  quantity: number | null
  minimum: number | null
  /** max(minimum - quantity, 0) quando há linha; senão null. */
  deficit: number | null
}

/** Visão da listagem admin (alinhada a `gerente_estoque_list_page`). */
export type InventoryStockListVisao = 'geral' | 'critico'

export type InventoryStockListOrdem =
  | 'nome'
  | 'quantidade_atual'
  | 'estoque_minimo'
  | 'codigo_barras'
  | 'deficit'
