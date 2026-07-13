export type SaleEventItem = {
  produtoId: string
  nome: string | null
  quantidade: number
  precoUnitario: number
  total: number
}

export type SaleEventType = 'SALE_REGISTERED' | 'SALE_CANCELLED' | 'SALE_PARTIAL_RETURN'

export type SaleEventSource = 'web_caixa' | 'sync_outbox' | 'backfill' | 'gerente_panel'

export type SaleEvent = {
  eventId: string
  saleId: string
  eventType: SaleEventType
  caixaId: string
  operadorId: string
  items: SaleEventItem[]
  total: number
  totalBruto: number | null
  formaPagamento: string | null
  timestamp: string
  source: SaleEventSource
}
