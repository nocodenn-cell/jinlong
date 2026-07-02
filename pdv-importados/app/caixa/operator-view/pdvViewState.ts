import type { ItemCarrinho } from "@shared-core/src/stores/unifiedCartStore"

/**
 * Estados formais do PDV — contrato definido em docs/PDV_FASE3_STATE_MACHINE_SPEC.md (§1).
 * SALE_SUSPENDED está fora do domínio real e não existe aqui (ver Apêndice A daquele documento).
 */
export type PDVSaleState =
  | "IDLE"
  | "SALE_ACTIVE"
  | "PAYMENT_PENDING"
  | "PAYMENT_PROCESSING"
  | "COMPLETED"

export type PDVCaixaStatus = "ABERTO" | "FECHADO" | "ERRO"

export type PDVErrorClasse = "recuperavel" | "bloqueante" | "sessao"

export type PDVAction = {
  /** Um dos CMD_* do contrato COMMAND→STATE (docs/PDV_FASE3_STATE_MACHINE_SPEC.md §4). */
  command: string
  label: string
  enabled: boolean
  requiresConfirmation: boolean
}

export type PDVViewState = {
  saleState: PDVSaleState

  caixaStatus: PDVCaixaStatus
  suspensaoGlobal: {
    ativa: boolean
    motivo: string | null
    afetaOperadorAtual: boolean
  }

  items: ItemCarrinho[]
  total: {
    bruto: number
    desconto: number
    liquido: number
    descontoGerente: { percentual: number; token: string | null } | null
  }

  lastCompletedSale: {
    vendaId: string
    eventId: string
    documentoFiscal: "queued" | "pending" | "error" | null
  } | null

  activeError: { code: string; classe: PDVErrorClasse; mensagem: string } | null

  /** Já filtrada/priorizada pelo backend/seletor — a UI não decide isso. */
  allowedActions: PDVAction[]
  primaryAction: PDVAction | null
}
