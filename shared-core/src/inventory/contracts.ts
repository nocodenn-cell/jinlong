/**
 * Contratos públicos do domínio inventory (ports).
 * Implementações de I/O ficam no adapter da app.
 *
 * Separação de leitura:
 * - `InventoryReader` — saldo pontual (`estoque`)
 * - `InventoryMovementReader` — kardex (`movimentos_estoque_log`)
 * - `InventoryQueryService` — listagem admin (RPC join produto+estoque)
 *
 * Escrita canônica (app inventory-led):
 * - `InventoryAdjustmentService` — ajuste manual → `ajustar_estoque_manual`
 * - `InventoryMovementWriter` — transferência / remessa / NF-e → RPCs existentes
 *
 * Sales-led (venda/cancel/devolução) permanece nos orquestradores sales (ADR-008).
 */

import type {
  InventoryItem,
  InventoryMovement,
  InventoryMovementType,
  InventoryStockListOrdem,
  InventoryStockListRow,
  InventoryStockListVisao,
  LojaId,
  ProductId,
} from './types'
import type { InventoryErrorCode, InventoryErrorParams } from './errorCodes'

// ─── Leitura pontual (saldo) ───────────────────────────────────────────────

export type InventoryBalanceResult =
  | { ok: true; item: InventoryItem }
  | { ok: false; error: string; code?: InventoryErrorCode; notFound?: boolean }

export type InventoryBalancesResult =
  | { ok: true; items: InventoryItem[] }
  | { ok: false; error: string; code?: InventoryErrorCode }

/**
 * Port de **saldo pontual** apenas.
 * Não lista grade admin, não lê kardex, não filtra por categoria.
 * Escopo de loja: borda/sessão (factory); resultado inclui `lojaId`.
 */
export type InventoryReader = {
  getBalance(productId: ProductId): Promise<InventoryBalanceResult>
  getBalances(productIds: readonly ProductId[]): Promise<InventoryBalancesResult>
}

// ─── Leitura kardex ────────────────────────────────────────────────────────

export type ListMovementsByProductQuery = {
  productId: ProductId
  /** Default na borda (ex.: 60 — alinhado a `obterKardexProduto`). */
  limit?: number
}

export type ListMovementsByProductResult =
  | { ok: true; movements: InventoryMovement[] }
  | { ok: false; error: string; code?: InventoryErrorCode }

/**
 * Port de **leitura** de movimentos (kardex).
 * Separado de `InventoryReader` — tabela e UI distintas.
 */
export type InventoryMovementReader = {
  listByProduct(
    query: ListMovementsByProductQuery,
  ): Promise<ListMovementsByProductResult>
}

// ─── Query admin (listagem) ────────────────────────────────────────────────

/**
 * Filtros da grade `/admin/estoque` — espelha `gerente_estoque_list_page`
 * sem concentrar outros casos de uso (etiquetas, PDV, transferência).
 */
export type InventoryStockListQuery = {
  lojaId: LojaId
  visao: InventoryStockListVisao
  busca?: string
  categoriaId?: string | null
  origem?: string
  ordem?: InventoryStockListOrdem
  dirAsc?: boolean
  limite?: number
  offset?: number
}

export type InventoryStockListResult =
  | { ok: true; total: number; rows: InventoryStockListRow[] }
  | { ok: false; error: string; code?: InventoryErrorCode }

/**
 * Serviço de consulta da **tela administrativa** de estoque.
 * Autoridade: RPC `gerente_estoque_list_page` (Postgres).
 */
export type InventoryQueryService = {
  listStockPage(query: InventoryStockListQuery): Promise<InventoryStockListResult>
}

// ─── Ajustes ───────────────────────────────────────────────────────────────

export type AdjustInventoryCommand = {
  productId: ProductId
  lojaId: LojaId
  quantity: number
  estoqueMinimo?: number
  reason: string
  observacao?: string | null
  atorId?: string | null
}

export type AdjustInventoryResult =
  | { ok: true; item: InventoryItem }
  | {
      ok: false
      error: string
      code?: InventoryErrorCode
      params?: InventoryErrorParams
      notFound?: boolean
    }

/**
 * Superfície canônica de **ajuste manual** (inventory-led).
 * Autoridade: RPC `ajustar_estoque_manual`.
 */
export type InventoryAdjustmentService = {
  adjustInventory(command: AdjustInventoryCommand): Promise<AdjustInventoryResult>
}

// ─── Escrita de movimentos (inventory-led) ─────────────────────────────────

/**
 * Comando genérico tipado — uso restrito; preferir métodos tipados do writer.
 * Não substitui orquestrações sales-led.
 */
export type RegisterMovementCommand = {
  productId: ProductId
  lojaId: LojaId
  type: InventoryMovementType
  quantity: number
  reason?: string | null
  atorId?: string | null
  vendaId?: string | null
}

export type RegisterMovementResult =
  | { ok: true; movement: InventoryMovement }
  | { ok: false; error: string; code?: InventoryErrorCode }

export type TransferStockCommand = {
  lojaOrigemId: LojaId
  lojaDestinoId: LojaId
  productId: ProductId
  quantity: number
  observacao?: string | null
  idempotencyKey: string
  /** Saldo esperado na origem (otimista) — espelho da action legada. */
  saldoEsperado: number
}

export type TransferStockResult =
  | { ok: true; transferenciaId: string }
  | { ok: false; error: string; code?: InventoryErrorCode }

export type ConfirmRemessaCommand = {
  remessaId: string
}

export type ConfirmRemessaResult =
  | { ok: true; remessaId: string }
  | { ok: false; error: string; code?: InventoryErrorCode }

export type RegistrarConferenciaRemessaCommand = {
  remessaId: string
  itens: ReadonlyArray<{ produtoId: string; quantidadeConferida: number }>
  divergenciaMotivo?: string | null
}

export type RegistrarConferenciaRemessaResult =
  | { ok: true; remessaId: string; status: string; itensDivergentes: number }
  | { ok: false; error: string; code?: InventoryErrorCode }

export type ReceiveOrdemCompraCommand = {
  ocId: string
  itens: ReadonlyArray<{ itemId: string; quantidadeRecebida: number }>
}

export type ReceiveOrdemCompraResult =
  | { ok: true; ocId: string }
  | { ok: false; error: string; code?: InventoryErrorCode }

/**
 * Payload da RPC `importar_nfe_transacao` — tipagem de borda; sem regra nova.
 *
 * FLX-05: a RPC deixou de creditar estoque/gerar contas_pagar nesta chamada —
 * só lê o XML, cadastra/vincula produto e grava os itens para conferência.
 * `importacaoId` no resultado é o que alimenta `registrarConferenciaNfe` e
 * `confirmarImportacaoNfe` a seguir.
 */
export type ImportNfeCommand = {
  chaveAcesso: string
  /** Espelho do payload legado — pode ser null. */
  numeroNf: string | null
  fornecedorCnpj: string
  fornecedorNome: string
  lojaId: LojaId
  itens: unknown
  atualizarCusto: boolean
  duplicatas?: unknown
}

export type ImportNfeResult =
  | {
      ok: true
      importacaoId: string
      itensProcessados: number
      produtosNovos: number
      produtosVinculados: number
      raw: unknown
    }
  | { ok: false; error: string; code?: InventoryErrorCode }

/**
 * FLX-05: registra a contagem física por item de uma importação de NF-e.
 * Etapa obrigatória antes de `confirmarImportacaoNfe` — sem ela a RPC recusa
 * mover saldo. Mesmo contrato de `registrarConferenciaRemessa`.
 */
export type RegistrarConferenciaNfeCommand = {
  importacaoId: string
  itens: ReadonlyArray<{
    itemId: string
    quantidadeConferida: number
    divergenciaObs?: string | null
  }>
}

export type RegistrarConferenciaNfeResult =
  | { ok: true; importacaoId: string; itensConferidos: number; itensDivergentes: number }
  | { ok: false; error: string; code?: InventoryErrorCode }

/**
 * FLX-05: credita estoque, atualiza custo e gera contas_pagar — só com base
 * na quantidade CONFERIDA (nunca a declarada na NF-e). Exige todos os itens
 * já conferidos; recusa se chamada de novo (importação já concluída).
 */
export type ConfirmarImportacaoNfeCommand = {
  importacaoId: string
}

export type ConfirmarImportacaoNfeResult =
  | { ok: true; importacaoId: string }
  | { ok: false; error: string; code?: InventoryErrorCode }

/**
 * Superfície canônica de escrita de movimentos **inventory-led**.
 * Cada método delega à RPC Postgres existente — sem segundo motor de saldo.
 *
 * Sales-led (venda/cancel/devolução/sync) **não** passam por aqui (ADR-008).
 */
export type InventoryMovementWriter = {
  /**
   * Registro genérico — só para tipos de ajuste mapeáveis via AdjustmentService.
   * Outros tipos: usar `transfer` / `confirmRemessaEntrada` / `importNfe`.
   */
  registerMovement(command: RegisterMovementCommand): Promise<RegisterMovementResult>
  transfer(command: TransferStockCommand): Promise<TransferStockResult>
  /**
   * Registra a contagem física (Onda B). Etapa obrigatória antes de
   * `confirmRemessaEntrada` — sem ela a RPC recusa mover saldo.
   */
  registrarConferenciaRemessa(
    command: RegistrarConferenciaRemessaCommand,
  ): Promise<RegistrarConferenciaRemessaResult>
  confirmRemessaEntrada(command: ConfirmRemessaCommand): Promise<ConfirmRemessaResult>
  importNfe(command: ImportNfeCommand): Promise<ImportNfeResult>
  /**
   * FLX-05: registra a contagem física por item de importação de NF-e.
   * Etapa obrigatória antes de `confirmarImportacaoNfe` — sem ela a RPC
   * recusa mover saldo.
   */
  registrarConferenciaNfe(
    command: RegistrarConferenciaNfeCommand,
  ): Promise<RegistrarConferenciaNfeResult>
  confirmarImportacaoNfe(
    command: ConfirmarImportacaoNfeCommand,
  ): Promise<ConfirmarImportacaoNfeResult>
  /**
   * Recebimento de ordem de compra — a terceira porta de ENTRADA de mercadoria.
   *
   * Estava fora do writer: `app/gerente/compras/actions.ts` chamava
   * `receber_ordem_compra` direto, então toda validação/telemetria adicionada
   * aqui não valia para a entrada por OC. Entrada de mercadoria tem uma única
   * autoridade de escrita — NF-e, remessa e OC passam por este port.
   */
  receiveOrdemCompra(
    command: ReceiveOrdemCompraCommand,
  ): Promise<ReceiveOrdemCompraResult>
}
