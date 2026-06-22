export const VENDA_EVENTS = {
  SALE_REGISTERED: 'SALE_REGISTERED',
  SALE_CANCELLED: 'SALE_CANCELLED',
} as const

export type VendaTraceContext = {
  venda_id?: string
  caixa_id?: string
  operador_id?: string
  loja_id?: string
  trace_id?: string
}

export type VendaBreadcrumb = {
  type: string
  category: string
  message: string
  data?: Record<string, unknown>
}
